import { Hono } from "hono";
import {
  type AppBindings,
  newInviteCode,
  newUserId,
  normalizeInviteCode,
  requireUser,
  safeEqual,
  signToken,
} from "./auth";
import type { Context } from "hono";
import { PERSONA_BY_ID, TOPIC_BY_ID } from "./data";
import { buildPersonaList } from "./personaView";
import { processPost, recoverStuckPosts } from "./processPost";
import type { TopicWeight } from "./types";

const app = new Hono<AppBindings>();

app.get("/healthz", (c) => c.json({ ok: true }));

// ---------- 登録(招待コード+匿名ログイン) ----------
// 個人情報は取らない。ニックネームは任意。端末にはトークンだけを保存する。
app.post("/v1/auth/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "invalid_body" }, 400);
  const { inviteCode, nickname } = body as { inviteCode?: unknown; nickname?: unknown };

  if (typeof inviteCode !== "string" || inviteCode.trim() === "") {
    return c.json({ error: "invite_required" }, 400);
  }
  let name = "ななしさん";
  if (nickname !== undefined) {
    if (typeof nickname !== "string") return c.json({ error: "invalid_nickname" }, 400);
    const trimmed = nickname.trim();
    if (trimmed.length < 1 || [...trimmed].length > 20) return c.json({ error: "invalid_nickname" }, 400);
    name = trimmed;
  }

  const code = normalizeInviteCode(inviteCode);
  // 使用回数の確認と加算を1文で行い、同時登録でも上限を超えない
  const upd = await c.env.DB.prepare(
    "UPDATE invites SET used_count = used_count + 1 WHERE code = ? AND disabled = 0 AND used_count < max_uses",
  )
    .bind(code)
    .run();
  if (upd.meta.changes !== 1) return c.json({ error: "invalid_invite" }, 403);

  const userId = newUserId();
  await c.env.DB.prepare("INSERT INTO users (id, nickname, invite_code, created_at) VALUES (?, ?, ?, ?)")
    .bind(userId, name, code, Date.now())
    .run();
  const token = await signToken(userId, c.env.TOKEN_SECRET);
  return c.json({ userId, token, nickname: name }, 201);
});

// ---------- 自分 ----------
app.get("/v1/me", requireUser, async (c) => {
  const row = await c.env.DB.prepare("SELECT id, nickname, created_at FROM users WHERE id = ?")
    .bind(c.var.userId)
    .first<{ id: string; nickname: string; created_at: number }>();
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM relations WHERE user_id = ? AND followed_at <= ?")
    .bind(c.var.userId, Date.now())
    .first<{ n: number }>();
  return c.json({
    userId: row!.id,
    nickname: row!.nickname,
    createdAt: row!.created_at,
    followerCount: n?.n ?? 0,
  });
});

// データ削除(アカウントと、そのユーザーの全データ)
app.delete("/v1/me", requireUser, async (c) => {
  const id = c.var.userId;
  const db = c.env.DB;
  await db.batch([
    db.prepare("DELETE FROM notifications WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM reactions WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM posts WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM relations WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(id),
  ]);
  return c.body(null, 204);
});

// ---------- フォロワー一覧(20枠。未フォローは「???」) ----------
// フォローは時間差で「予約」される。表示時刻(followed_at)を過ぎた人だけが見える
app.get("/v1/personas", requireUser, async (c) => {
  const rows = await c.env.DB.prepare("SELECT persona_id, followed_at FROM relations WHERE user_id = ? AND followed_at <= ?")
    .bind(c.var.userId, Date.now())
    .all<{ persona_id: string; followed_at: number }>();
  const followed = new Map(rows.results.map((r) => [r.persona_id, r.followed_at]));
  return c.json({ personas: buildPersonaList(followed) });
});

/**
 * 裏で動かす処理の実行。
 * - REPLY_MODE=sync(テスト・デバッグ)なら完了まで待つ
 * - それ以外は waitUntil で、レスポンスを返した後も処理を続ける
 * 失敗してもレスポンスは壊さない(投稿は 'processing' のまま残り、後で縮退運転で救済される)
 */
async function runBackground(c: Context<AppBindings>, job: Promise<unknown>): Promise<void> {
  const guarded = job.catch((err) => console.error("background job failed", err));
  if (c.env.REPLY_MODE === "sync") {
    await guarded;
    return;
  }
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // 実行コンテキストが無い環境(単体テスト等)ではそのまま走らせる
    void guarded;
  }
}

/** 処理中のまま止まった投稿を救済する(読み出しのたびに確認) */
async function rescueStuck(c: Context<AppBindings>): Promise<void> {
  const jobs = await recoverStuckPosts(c.env, c.var.userId);
  for (const j of jobs) await runBackground(c, j);
}

// ---------- つぶやき投稿 ----------
// 投稿はすぐ保存して返す。話題解析・フォロー判定・返信生成は裏で行い、結果は
// GET /v1/posts(リアクション)・GET /v1/notifications・GET /v1/personas で、表示時刻になったものから見える
const MAX_POST_CHARS = 140;
const DAY_MS = 24 * 60 * 60 * 1000;

const labelTopics = (topics: TopicWeight[]) =>
  topics.map((t) => ({ tag: t.tag, label: TOPIC_BY_ID.get(t.tag)?.label ?? t.tag, weight: t.weight }));

app.post("/v1/posts", requireUser, async (c) => {
  const userId = c.var.userId;
  const db = c.env.DB;

  const input = await c.req.json().catch(() => null);
  const raw = input && typeof input === "object" ? (input as { body?: unknown }).body : undefined;
  if (typeof raw !== "string") return c.json({ error: "invalid_body" }, 400);
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > MAX_POST_CHARS) return c.json({ error: "invalid_length", max: MAX_POST_CHARS }, 400);

  // 1ユーザーの投稿上限(コスト暴走防止)
  const limit = Number.parseInt(c.env.DAILY_POST_LIMIT ?? "10", 10) || 10;
  const now = Date.now();
  const recent = await db
    .prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND created_at >= ?")
    .bind(userId, now - DAY_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= limit) return c.json({ error: "daily_limit", limit }, 429);

  const postId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO posts (id, user_id, body, created_at, status, process_started_at) VALUES (?, ?, ?, ?, 'processing', ?)")
    .bind(postId, userId, text, now, now)
    .run();

  await runBackground(c, processPost(c.env, postId));
  return c.json({ post: { id: postId, body: text, createdAt: now } }, 201);
});

// 自分のつぶやき一覧(新しい順)
app.get("/v1/posts", requireUser, async (c) => {
  await rescueStuck(c);
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") ?? "20", 10) || 20));
  const before = Number.parseInt(c.req.query("before") ?? "", 10);
  const rows = await c.env.DB.prepare(
    "SELECT id, body, topics, status, created_at FROM posts WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(c.var.userId, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER, limit)
    .all<{ id: string; body: string; topics: string | null; status: string; created_at: number }>();
  // 表示時刻(visible_at)を過ぎたリアクションだけを返す
  const ids = rows.results.map((r) => r.id);
  const byPost = new Map<string, unknown[]>();
  if (ids.length > 0) {
    const marks = ids.map(() => "?").join(",");
    const rs = await c.env.DB.prepare(
      `SELECT id, post_id, persona_id, type, text, visible_at FROM reactions WHERE user_id = ? AND visible_at <= ? AND post_id IN (${marks}) ORDER BY visible_at ASC`,
    )
      .bind(c.var.userId, Date.now(), ...ids)
      .all<{ id: string; post_id: string; persona_id: string; type: string; text: string | null; visible_at: number }>();
    for (const r of rs.results) {
      const persona = PERSONA_BY_ID.get(r.persona_id);
      if (!persona) continue;
      const list = byPost.get(r.post_id) ?? [];
      list.push({
        id: r.id,
        type: r.type,
        text: r.text,
        visibleAt: r.visible_at,
        persona: { id: persona.id, name: persona.name, handle: persona.handle },
      });
      byPost.set(r.post_id, list);
    }
  }
  return c.json({
    posts: rows.results.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      // processing: 解析・返信を準備中 / done: 完了(リアクションは表示時刻になったものから見える)
      status: r.status,
      topics: labelTopics(r.topics ? (JSON.parse(r.topics) as TopicWeight[]) : []),
      reactions: byPost.get(r.id) ?? [],
    })),
  });
});

// ---------- 通知(新規フォロー・いいね・返信) ----------
// 表示時刻を過ぎたものだけ。新しい順。before(表示時刻のms)で続きを取る
app.get("/v1/notifications", requireUser, async (c) => {
  await rescueStuck(c);
  const userId = c.var.userId;
  const now = Date.now();
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query("limit") ?? "30", 10) || 30));
  const before = Number.parseInt(c.req.query("before") ?? "", 10);

  const rows = await c.env.DB.prepare(
    `SELECT n.id, n.type, n.ref_id, n.read, n.visible_at, r.post_id AS post_id, r.persona_id AS reaction_persona, r.text AS text
     FROM notifications n
     LEFT JOIN reactions r ON r.id = n.ref_id AND r.user_id = n.user_id AND n.type IN ('like', 'reply')
     WHERE n.user_id = ? AND n.visible_at <= ? AND n.visible_at < ?
     ORDER BY n.visible_at DESC, n.id DESC LIMIT ?`,
  )
    .bind(userId, now, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER, limit)
    .all<{
      id: string;
      type: string;
      ref_id: string;
      read: number;
      visible_at: number;
      post_id: string | null;
      reaction_persona: string | null;
      text: string | null;
    }>();

  const unread = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0 AND visible_at <= ?")
    .bind(userId, now)
    .first<{ n: number }>();

  const notifications = rows.results.flatMap((r) => {
    const persona = PERSONA_BY_ID.get(r.type === "follow" ? r.ref_id : (r.reaction_persona ?? ""));
    if (!persona) return [];
    return [
      {
        id: r.id,
        type: r.type,
        createdAt: r.visible_at,
        read: r.read === 1,
        persona: { id: persona.id, name: persona.name, handle: persona.handle },
        ...(r.post_id ? { postId: r.post_id } : {}),
        ...(r.type === "reply" && r.text ? { text: r.text } : {}),
      },
    ];
  });
  return c.json({ notifications, unreadCount: unread?.n ?? 0 });
});

// 既読にする。{ ids: [...] }(最大100件)または { all: true }。まだ表示時刻になっていない通知は対象外
app.post("/v1/notifications/read", requireUser, async (c) => {
  const userId = c.var.userId;
  const now = Date.now();
  const body = ((await c.req.json().catch(() => null)) ?? {}) as { ids?: unknown; all?: unknown };

  if (body.all === true) {
    await c.env.DB.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND visible_at <= ?").bind(userId, now).run();
  } else if (Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100 && body.ids.every((x) => typeof x === "string")) {
    const marks = body.ids.map(() => "?").join(",");
    await c.env.DB.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND visible_at <= ? AND id IN (${marks})`)
      .bind(userId, now, ...(body.ids as string[]))
      .run();
  } else {
    return c.json({ error: "invalid_body" }, 400);
  }
  const unread = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0 AND visible_at <= ?")
    .bind(userId, now)
    .first<{ n: number }>();
  return c.json({ unreadCount: unread?.n ?? 0 });
});

// ---------- 管理: 招待コード発行 ----------
app.post("/admin/invites", async (c) => {
  const adminKey = c.env.ADMIN_KEY;
  if (!adminKey) return c.json({ error: "not_found" }, 404);
  const given = c.req.header("x-admin-key") ?? "";
  if (!(await safeEqual(given, adminKey))) return c.json({ error: "unauthorized" }, 401);

  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { maxUses?: unknown; note?: unknown };
  const maxUses = typeof body.maxUses === "number" && Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : 1;
  const note = typeof body.note === "string" ? body.note.slice(0, 100) : null;
  const code = newInviteCode();
  await c.env.DB.prepare("INSERT INTO invites (code, max_uses, note, created_at) VALUES (?, ?, ?, ?)")
    .bind(code, maxUses, note, Date.now())
    .run();
  return c.json({ code, maxUses }, 201);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error" }, 500);
});

export default app;

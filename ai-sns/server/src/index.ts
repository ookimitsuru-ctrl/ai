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
import { processThreadMessage, recoverStuckThreadMessages } from "./thread";
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
    db.prepare("DELETE FROM thread_messages WHERE user_id = ?").bind(id),
    db.prepare("DELETE FROM reaction_likes WHERE user_id = ?").bind(id),
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
  const jobs = [...(await recoverStuckPosts(c.env, c.var.userId)), ...(await recoverStuckThreadMessages(c.env, c.var.userId))];
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
    // 自分がいいねした返信 / スレッドの発言(表示時刻を過ぎたもの)。投稿に紐づけて引く(D1は1回の問い合わせに渡せる値が100個まで)
    const likedRows = await c.env.DB.prepare(
      `SELECT l.reaction_id FROM reaction_likes l JOIN reactions r ON r.id = l.reaction_id WHERE l.user_id = ? AND r.post_id IN (${marks})`,
    )
      .bind(c.var.userId, ...ids)
      .all<{ reaction_id: string }>();
    const liked = new Set(likedRows.results.map((l) => l.reaction_id));
    const msgRows = await c.env.DB.prepare(
      `SELECT m.id, m.reaction_id, m.role, m.text, m.status, m.visible_at FROM thread_messages m JOIN reactions r ON r.id = m.reaction_id WHERE m.user_id = ? AND r.post_id IN (${marks}) AND (m.visible_at <= ? OR m.role = 'user') ORDER BY m.created_at ASC`,
    )
      .bind(c.var.userId, ...ids, Date.now())
      .all<{ id: string; reaction_id: string; role: string; text: string; status: string; visible_at: number }>();
    const threads = new Map<string, { id: string; role: string; text: string; createdAt: number }[]>();
    const replying = new Set<string>();
    for (const m of msgRows.results) {
      threads.set(m.reaction_id, [...(threads.get(m.reaction_id) ?? []), { id: m.id, role: m.role, text: m.text, createdAt: m.visible_at }]);
      if (m.role === "user" && m.status === "processing") replying.add(m.reaction_id);
    }
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
        // いいね・スレッドは、返信(本文のあるもの)にだけ付く
        ...(r.type === "reply" ? { liked: liked.has(r.id), thread: threads.get(r.id) ?? [], replying: replying.has(r.id) } : {}),
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
    `SELECT n.id, n.type, n.ref_id, n.read, n.visible_at,
            COALESCE(r.id, tm.reaction_id) AS reaction_id,
            COALESCE(r.post_id, r2.post_id) AS post_id,
            COALESCE(r.persona_id, tm.persona_id) AS reaction_persona,
            COALESCE(r.text, tm.text) AS text
     FROM notifications n
     LEFT JOIN reactions r ON r.id = n.ref_id AND r.user_id = n.user_id AND n.type IN ('like', 'reply')
     LEFT JOIN thread_messages tm ON tm.id = n.ref_id AND tm.user_id = n.user_id AND n.type = 'thread_reply'
     LEFT JOIN reactions r2 ON r2.id = tm.reaction_id AND r2.user_id = n.user_id
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
      reaction_id: string | null;
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
        // スレッドでの返事も、アプリでは「返信」として扱う
        type: r.type === "thread_reply" ? "reply" : r.type,
        createdAt: r.visible_at,
        read: r.read === 1,
        persona: { id: persona.id, name: persona.name, handle: persona.handle },
        ...(r.post_id ? { postId: r.post_id } : {}),
        // どのスレッドの通知か(アプリが、その会話を開くのに使う)
        ...(r.reaction_id ? { reactionId: r.reaction_id } : {}),
        ...((r.type === "reply" || r.type === "thread_reply") && r.text ? { text: r.text } : {}),
      },
    ];
  });
  return c.json({ notifications, unreadCount: unread?.n ?? 0 });
});

// ---------- フォロワーの返信へのいいね・スレッド(返信への返信) ----------
/** 自分宛てで、すでに表示されていて、本文のある返信だけが対象(他人の・未表示の・いいねだけのリアクションは対象外) */
async function findOwnReply(c: Context<AppBindings>, reactionId: string) {
  return c.env.DB.prepare(
    "SELECT id, persona_id FROM reactions WHERE id = ? AND user_id = ? AND type = 'reply' AND text IS NOT NULL AND visible_at <= ?",
  )
    .bind(reactionId, c.var.userId, Date.now())
    .first<{ id: string; persona_id: string }>();
}

app.put("/v1/reactions/:id/like", requireUser, async (c) => {
  const reaction = await findOwnReply(c, c.req.param("id"));
  if (!reaction) return c.json({ error: "not_found" }, 404);
  const ins = await c.env.DB.prepare("INSERT OR IGNORE INTO reaction_likes (user_id, reaction_id, created_at) VALUES (?, ?, ?)")
    .bind(c.var.userId, reaction.id, Date.now())
    .run();
  // 初めていいねしたときだけ、そのフォロワーとの親しさを少し上げる
  if (ins.meta.changes === 1) {
    await c.env.DB.prepare("UPDATE relations SET intimacy = intimacy + 1 WHERE user_id = ? AND persona_id = ?")
      .bind(c.var.userId, reaction.persona_id)
      .run();
  }
  return c.json({ liked: true });
});

app.delete("/v1/reactions/:id/like", requireUser, async (c) => {
  const reaction = await findOwnReply(c, c.req.param("id"));
  if (!reaction) return c.json({ error: "not_found" }, 404);
  await c.env.DB.prepare("DELETE FROM reaction_likes WHERE user_id = ? AND reaction_id = ?").bind(c.var.userId, reaction.id).run();
  return c.json({ liked: false });
});

const MAX_THREAD_USER_MESSAGES = 20;

// スレッドに発言する。フォロワーの返事は裏で作られ、数秒〜数十秒後に現れる
app.post("/v1/reactions/:id/messages", requireUser, async (c) => {
  const userId = c.var.userId;
  const db = c.env.DB;
  const input = await c.req.json().catch(() => null);
  const raw = input && typeof input === "object" ? (input as { body?: unknown }).body : undefined;
  if (typeof raw !== "string") return c.json({ error: "invalid_body" }, 400);
  const text = raw.trim();
  const length = [...text].length;
  if (length < 1 || length > MAX_POST_CHARS) return c.json({ error: "invalid_length", max: MAX_POST_CHARS }, 400);

  const reaction = await findOwnReply(c, c.req.param("id"));
  if (!reaction) return c.json({ error: "not_found" }, 404);

  // コスト暴走防止: 1ユーザーの24時間あたり上限と、1スレッドの長さの上限。返事待ちの間は次を送れない(連打防止)
  const now = Date.now();
  const limit = Number.parseInt(c.env.THREAD_DAILY_LIMIT ?? "30", 10) || 30;
  const day = await db
    .prepare("SELECT COUNT(*) AS n FROM thread_messages WHERE user_id = ? AND role = 'user' AND created_at >= ?")
    .bind(userId, now - DAY_MS)
    .first<{ n: number }>();
  if ((day?.n ?? 0) >= limit) return c.json({ error: "daily_limit", limit }, 429);
  const thread = await db
    .prepare("SELECT COUNT(*) AS n, SUM(status = 'processing') AS pending FROM thread_messages WHERE user_id = ? AND reaction_id = ? AND role = 'user'")
    .bind(userId, reaction.id)
    .first<{ n: number; pending: number | null }>();
  if ((thread?.pending ?? 0) > 0) return c.json({ error: "reply_pending" }, 409);
  if ((thread?.n ?? 0) >= MAX_THREAD_USER_MESSAGES) return c.json({ error: "thread_limit", limit: MAX_THREAD_USER_MESSAGES }, 429);

  const msgId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO thread_messages (id, user_id, reaction_id, role, persona_id, text, status, process_started_at, visible_at, created_at) VALUES (?, ?, ?, 'user', ?, ?, 'processing', ?, ?, ?)",
    )
    .bind(msgId, userId, reaction.id, reaction.persona_id, text, now, now, now)
    .run();
  await runBackground(c, processThreadMessage(c.env, msgId));
  return c.json({ message: { id: msgId, role: "user", text, createdAt: now } }, 201);
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

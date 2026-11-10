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
import { PERSONAS, PERSONA_BY_ID, TOPIC_BY_ID } from "./data";
import { decideFollows } from "./follow";
import { createLlmProvider } from "./llm";
import { buildPersonaList, toPublic } from "./personaView";
import { randomFor } from "./rng";
import { analyzeByKeywords } from "./topics";
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
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM relations WHERE user_id = ?")
    .bind(c.var.userId)
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
app.get("/v1/personas", requireUser, async (c) => {
  const rows = await c.env.DB.prepare("SELECT persona_id, followed_at FROM relations WHERE user_id = ?")
    .bind(c.var.userId)
    .all<{ persona_id: string; followed_at: number }>();
  const followed = new Map(rows.results.map((r) => [r.persona_id, r.followed_at]));
  return c.json({ personas: buildPersonaList(followed) });
});

// ---------- つぶやき投稿 → 話題解析 → フォロー判定 (M2) ----------
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

  // 話題解析。LLM が失敗してもキーワード一致で続行する(縮退運転)
  let topics: TopicWeight[];
  try {
    topics = await createLlmProvider(c.env).analyzeTopics(text);
  } catch (err) {
    console.error("analyzeTopics failed; fallback to keywords", err);
    topics = analyzeByKeywords(text);
  }

  // フォロー判定(このユーザーの未フォローだけが対象。他ユーザーの状況は見ない)
  const followedRows = await db
    .prepare("SELECT persona_id FROM relations WHERE user_id = ?")
    .bind(userId)
    .all<{ persona_id: string }>();
  const followed = new Set(followedRows.results.map((r) => r.persona_id));
  const postId = crypto.randomUUID();
  const decisions = decideFollows({
    candidates: PERSONAS.filter((p) => !followed.has(p.id)),
    topics,
    currentFollowerCount: followed.size,
    randFor: (personaId) => randomFor(postId, personaId),
  });

  // 保存(まとめて1回。フォローと通知は同時に走った投稿と重なっても二重にならない)
  const stmts = [
    db
      .prepare("INSERT INTO posts (id, user_id, body, topics, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(postId, userId, text, JSON.stringify(topics), now),
  ];
  for (const d of decisions) {
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO relations (user_id, persona_id, followed_at, trigger_post_id, affinity_at_follow) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(userId, d.personaId, now, postId, d.affinity),
      db
        .prepare(
          "INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, 'follow', ?, ?, ?)",
        )
        .bind(`follow:${userId}:${d.personaId}`, userId, d.personaId, now, now),
    );
  }
  await db.batch(stmts);

  // 親和度や確率などの内部値は返さない
  const newFollowers = decisions.map((d) => {
    const p = PERSONA_BY_ID.get(d.personaId)!;
    return toPublic(p, PERSONAS.indexOf(p) + 1, now);
  });
  return c.json(
    {
      post: { id: postId, body: text, createdAt: now, topics: labelTopics(topics) },
      newFollowers,
      followerCount: followed.size + newFollowers.length,
    },
    201,
  );
});

// 自分のつぶやき一覧(新しい順)
app.get("/v1/posts", requireUser, async (c) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") ?? "20", 10) || 20));
  const before = Number.parseInt(c.req.query("before") ?? "", 10);
  const rows = await c.env.DB.prepare(
    "SELECT id, body, topics, created_at FROM posts WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(c.var.userId, Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER, limit)
    .all<{ id: string; body: string; topics: string | null; created_at: number }>();
  return c.json({
    posts: rows.results.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      topics: labelTopics(r.topics ? (JSON.parse(r.topics) as TopicWeight[]) : []),
    })),
  });
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

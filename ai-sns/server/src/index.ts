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
import { buildPersonaList } from "./personaView";

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

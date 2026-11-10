import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

type Worker = { fetch(req: Request): Promise<Response> };
export const worker = (exports as unknown as { default: Worker }).default;
export const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://localhost${path}`, init));
export const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
export const bearer = (token: string): RequestInit => ({ headers: { authorization: `Bearer ${token}` } });

export async function makeInvite(maxUses = 1): Promise<string> {
  const res = await call("/admin/invites", {
    ...json({ maxUses }),
    headers: { "content-type": "application/json", "x-admin-key": "test-admin-key" },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

export async function register(nickname = "テスト"): Promise<{ userId: string; token: string }> {
  const code = await makeInvite();
  const res = await call("/v1/auth/register", json({ inviteCode: code, nickname }));
  expect(res.status).toBe(201);
  return (await res.json()) as { userId: string; token: string };
}

export async function follow(userId: string, personaId: string) {
  await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, ?)")
    .bind(userId, personaId, 1000)
    .run();
}


/** 全テーブルを空にする */
export async function resetDb() {
  for (const t of ["notifications", "thread_messages", "reaction_likes", "reactions", "posts", "relations", "users", "invites", "news_items", "news_tags", "lookup_cache"]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
}

export const authed = (token: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/**
 * 表示済みの「フォロワーの返信」を直接用意する(確率に左右されないように)。
 * ユーザーのつぶやき + そのフォロワーの返信 + フォロー関係を作って、返信(reaction)のIDを返す。
 */
export async function seedReply(
  userId: string,
  personaId = "kenji_run",
  opts: { type?: "reply" | "like"; visibleAt?: number; text?: string; postBody?: string } = {},
): Promise<string> {
  const now = Date.now();
  const postId = `post-${crypto.randomUUID()}`;
  const reactionId = `${postId}:${personaId}`;
  await env.DB.prepare("INSERT OR IGNORE INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, 1000)").bind(userId, personaId).run();
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, topics, status, created_at) VALUES (?, ?, ?, '[]', 'done', ?)")
    .bind(postId, userId, opts.postBody ?? "朝ランした", now - 60_000)
    .run();
  const type = opts.type ?? "reply";
  await env.DB.prepare("INSERT INTO reactions (id, user_id, post_id, persona_id, type, text, visible_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(reactionId, userId, postId, personaId, type, type === "reply" ? (opts.text ?? "朝活えらいっす!") : null, opts.visibleAt ?? now - 1000, now - 30_000)
    .run();
  return reactionId;
}

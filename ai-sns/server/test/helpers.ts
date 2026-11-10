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
  for (const t of ["notifications", "reactions", "posts", "relations", "users", "invites"]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
}

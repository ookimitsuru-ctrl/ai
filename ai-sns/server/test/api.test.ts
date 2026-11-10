import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../src/auth";

type Worker = { fetch(req: Request): Promise<Response> };
const worker = (exports as unknown as { default: Worker }).default;
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://localhost${path}`, init));
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const bearer = (token: string): RequestInit => ({ headers: { authorization: `Bearer ${token}` } });

async function makeInvite(maxUses = 1): Promise<string> {
  const res = await call("/admin/invites", {
    ...json({ maxUses }),
    headers: { "content-type": "application/json", "x-admin-key": "test-admin-key" },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

async function register(nickname = "テスト"): Promise<{ userId: string; token: string }> {
  const code = await makeInvite();
  const res = await call("/v1/auth/register", json({ inviteCode: code, nickname }));
  expect(res.status).toBe(201);
  return (await res.json()) as { userId: string; token: string };
}

async function follow(userId: string, personaId: string) {
  await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, ?)")
    .bind(userId, personaId, 1000)
    .run();
}

beforeEach(async () => {
  for (const t of ["notifications", "reactions", "posts", "relations", "users", "invites"]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
});

describe("トークン", () => {
  it("署名したトークンは検証でき、改ざんすると無効", async () => {
    const t = await signToken("user1", "secret");
    expect(await verifyToken(t, "secret")).toBe("user1");
    expect(await verifyToken(t, "other-secret")).toBeNull();
    expect(await verifyToken(t.replace("user1", "user2"), "secret")).toBeNull();
    expect(await verifyToken("garbage", "secret")).toBeNull();
  });
});

describe("招待コードと登録", () => {
  it("招待コードなし/不正なコードでは登録できない", async () => {
    expect((await call("/v1/auth/register", json({}))).status).toBe(400);
    expect((await call("/v1/auth/register", json({ inviteCode: "NOPE1234" }))).status).toBe(403);
  });

  it("管理キーが違うと招待コードを発行できない", async () => {
    const res = await call("/admin/invites", { ...json({}), headers: { "x-admin-key": "wrong" } });
    expect(res.status).toBe(401);
  });

  it("1回限りのコードは2回目で使えない", async () => {
    const code = await makeInvite(1);
    expect((await call("/v1/auth/register", json({ inviteCode: code }))).status).toBe(201);
    expect((await call("/v1/auth/register", json({ inviteCode: code }))).status).toBe(403);
  });

  it("コードは大文字小文字・ハイフン・空白を無視する", async () => {
    const code = await makeInvite(1);
    const sloppy = ` ${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()} `;
    expect((await call("/v1/auth/register", json({ inviteCode: sloppy }))).status).toBe(201);
  });

  it("複数回使えるコードは上限まで", async () => {
    const code = await makeInvite(2);
    expect((await call("/v1/auth/register", json({ inviteCode: code }))).status).toBe(201);
    expect((await call("/v1/auth/register", json({ inviteCode: code }))).status).toBe(201);
    expect((await call("/v1/auth/register", json({ inviteCode: code }))).status).toBe(403);
  });

  it("ニックネームが長すぎると拒否", async () => {
    const code = await makeInvite();
    const res = await call("/v1/auth/register", json({ inviteCode: code, nickname: "あ".repeat(21) }));
    expect(res.status).toBe(400);
  });
});

describe("認証", () => {
  it("トークンなし・不正トークンは401", async () => {
    expect((await call("/v1/me")).status).toBe(401);
    expect((await call("/v1/me", bearer("v1.x.y"))).status).toBe(401);
  });

  it("自分の情報が取れる", async () => {
    const { token, userId } = await register("みつる");
    const res = await call("/v1/me", bearer(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId, nickname: "みつる", followerCount: 0 });
  });
});

describe("フォロワー一覧とユーザー間の隔離", () => {
  it("最初は20枠すべて「???」で、名前もIDも出ない", async () => {
    const { token } = await register();
    const body = (await (await call("/v1/personas", bearer(token))).json()) as { personas: Record<string, unknown>[] };
    expect(body.personas).toHaveLength(20);
    expect(body.personas.every((p) => p.locked === true)).toBe(true);
    expect(JSON.stringify(body)).not.toContain("kenji_run");
  });

  it("フォロー済みは詳細が見え、内部設定(interests/theta/speech/samples)は出ない", async () => {
    const { token, userId } = await register();
    await follow(userId, "kenji_run");
    const text = await (await call("/v1/personas", bearer(token))).text();
    const body = JSON.parse(text) as { personas: Record<string, unknown>[] };
    const first = body.personas[0]!;
    expect(first).toMatchObject({ locked: false, id: "kenji_run", name: "田中ケンジ", slot: 1 });
    expect(body.personas.filter((p) => !p.locked)).toHaveLength(1);
    for (const secret of ["interests", "theta", "speech", "samples", "reaction", "forbidden"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("Aさんのフォローは、Bさんの画面にもAPIにも一切現れない", async () => {
    const a = await register("A");
    const b = await register("B");
    await follow(a.userId, "kenji_run");
    await follow(a.userId, "miyu_cafe");

    const aList = (await (await call("/v1/personas", bearer(a.token))).json()) as { personas: { locked: boolean }[] };
    const bText = await (await call("/v1/personas", bearer(b.token))).text();
    const bList = JSON.parse(bText) as { personas: { locked: boolean }[] };

    expect(aList.personas.filter((p) => !p.locked)).toHaveLength(2);
    expect(bList.personas.every((p) => p.locked)).toBe(true);
    expect(bText).not.toContain("kenji_run");
    expect(bText).not.toContain(a.userId);

    // 自分の情報にも他人の手がかり(人数など)は含まれない
    const meB = (await (await call("/v1/me", bearer(b.token))).json()) as Record<string, unknown>;
    expect(meB.followerCount).toBe(0);
    expect(Object.keys(meB).sort()).toEqual(["createdAt", "followerCount", "nickname", "userId"]);
  });
});

describe("データ削除", () => {
  it("削除するとそのユーザーの全データが消え、トークンも無効になる。他ユーザーは無傷", async () => {
    const a = await register("A");
    const b = await register("B");
    await follow(a.userId, "kenji_run");
    await follow(b.userId, "miyu_cafe");

    expect((await call("/v1/me", { method: "DELETE", ...bearer(a.token) })).status).toBe(204);
    expect((await call("/v1/me", bearer(a.token))).status).toBe(401);

    const rel = await env.DB.prepare("SELECT user_id FROM relations").all<{ user_id: string }>();
    expect(rel.results.map((r) => r.user_id)).toEqual([b.userId]);
    expect((await call("/v1/me", bearer(b.token))).status).toBe(200);
  });
});

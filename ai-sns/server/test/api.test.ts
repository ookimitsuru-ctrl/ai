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

describe("つぶやき投稿とフォロー (M2)", () => {
  const post = (token: string, body: unknown) =>
    call("/v1/posts", { ...json({ body }), headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });

  it("未ログインは投稿できない", async () => {
    expect((await call("/v1/posts", json({ body: "こんにちは" }))).status).toBe(401);
  });

  it("空・長すぎ・文字列以外は拒否(140字ちょうどはOK)", async () => {
    const { token } = await register();
    expect((await post(token, "   ")).status).toBe(400);
    expect((await post(token, "あ".repeat(141))).status).toBe(400);
    expect((await post(token, 123)).status).toBe(400);
    expect((await post(token, "あ".repeat(140))).status).toBe(201);
  });

  it("投稿すると話題が付き、一覧に出る。内部値(親和度・確率)は返さない", async () => {
    const { token } = await register();
    const res = await post(token, "朝ランで10km走ってきた!");
    expect(res.status).toBe(201);
    const text = await res.text();
    const body = JSON.parse(text) as {
      post: { id: string; topics: { tag: string; label: string }[] };
      newFollowers: unknown[];
      followerCount: number;
    };
    expect(body.post.topics.map((t) => t.tag)).toContain("running");
    expect(body.post.topics.find((t) => t.tag === "running")!.label).toBe("ランニング");
    for (const secret of ["affinity", "probability", "theta", "interests"]) expect(text).not.toContain(secret);

    const list = (await (await call("/v1/posts", bearer(token))).json()) as { posts: { id: string; body: string }[] };
    expect(list.posts.map((p) => p.id)).toEqual([body.post.id]);
    expect(list.posts[0]!.body).toBe("朝ランで10km走ってきた!");
  });

  it("フォロワーが増えると、一覧・自分の情報・通知に反映され、二度と外れない", async () => {
    const { token, userId } = await register();
    let followers = 0;
    // 走る話題を繰り返せばケンジが(ほぼ確実に)フォローしてくる
    for (let i = 0; i < 5 && followers === 0; i++) {
      const r = (await (await post(token, "朝ランした。ジョギングは最高")).json()) as { followerCount: number };
      followers = r.followerCount;
    }
    expect(followers).toBeGreaterThan(0);

    const me = (await (await call("/v1/me", bearer(token))).json()) as { followerCount: number };
    expect(me.followerCount).toBe(followers);
    const list = (await (await call("/v1/personas", bearer(token))).json()) as { personas: { locked: boolean }[] };
    expect(list.personas.filter((p) => !p.locked)).toHaveLength(followers);

    const notes = await env.DB.prepare("SELECT type, ref_id FROM notifications WHERE user_id = ?")
      .bind(userId)
      .all<{ type: string; ref_id: string }>();
    expect(notes.results).toHaveLength(followers);
    expect(notes.results.every((n) => n.type === "follow")).toBe(true);

    // 関係のない話題や愚痴を投稿しても、フォロワーは減らない
    await post(token, "最悪、もう無理、愚痴");
    const after = (await (await call("/v1/me", bearer(token))).json()) as { followerCount: number };
    expect(after.followerCount).toBeGreaterThanOrEqual(followers);
  });

  it("フォローは話題に合った人だけ(走る話題で猫好き・美容の人は来ない)", async () => {
    const { token } = await register();
    const followed = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = (await (await post(token, "今日は走った。筋トレもした")).json()) as { newFollowers: { id: string }[] };
      r.newFollowers.forEach((f) => followed.add(f.id));
    }
    for (const id of followed) {
      expect(["kenji_run", "take_sports", "sho_diy", "sakura_cook", "yuki_night", "yuta_fin"]).toContain(id);
    }
    expect(followed.has("nozomi_pets")).toBe(false);
    expect(followed.has("akari_beauty")).toBe(false);
  });

  it("1日の投稿上限(テスト設定は5回)を超えると429", async () => {
    const { token } = await register();
    for (let i = 0; i < 5; i++) expect((await post(token, `投稿${i}`)).status).toBe(201);
    const res = await post(token, "6回目");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "daily_limit", limit: 5 });
  });

  it("上限は人ごと。Aさんが上限でもBさんは投稿できる", async () => {
    const a = await register("A");
    const b = await register("B");
    for (let i = 0; i < 5; i++) await post(a.token, `a${i}`);
    expect((await post(a.token, "もう1回")).status).toBe(429);
    expect((await post(b.token, "はじめまして")).status).toBe(201);
  });

  it("他のユーザーのつぶやきは一覧に出ない(隔離)", async () => {
    const a = await register("A");
    const b = await register("B");
    await post(a.token, "Aだけの秘密のつぶやき");
    await post(b.token, "Bのつぶやき");
    const bList = await (await call("/v1/posts", bearer(b.token))).text();
    expect(bList).toContain("Bのつぶやき");
    expect(bList).not.toContain("Aだけの秘密");
  });

  it("Aさんの全フォローはBさんに影響しない(Bのフォロー数はBの投稿だけで決まる)", async () => {
    const a = await register("A");
    const b = await register("B");
    for (let i = 0; i < 4; i++) await post(a.token, "朝ランした。ジョギング最高。筋トレも");
    const meB = (await (await call("/v1/me", bearer(b.token))).json()) as { followerCount: number };
    expect(meB.followerCount).toBe(0);
  });

  it("同じ人を二重にフォローしたり、通知を二重に作ったりしない", async () => {
    const { token, userId } = await register();
    for (let i = 0; i < 5; i++) await post(token, "走った走った。ランニング");
    const rel = await env.DB.prepare("SELECT persona_id FROM relations WHERE user_id = ?").bind(userId).all<{ persona_id: string }>();
    const ids = rel.results.map((r) => r.persona_id);
    expect(new Set(ids).size).toBe(ids.length);
    const notes = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?").bind(userId).first<{ n: number }>();
    expect(notes!.n).toBe(ids.length);
  });
});

import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { bearer, call, follow, register, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- ヘルパー ----------
const authed = (token: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const post = (token: string, body: unknown) => call("/v1/posts", authed(token, "POST", { body }));

type Reaction = { id: string; type: string; text: string | null; persona: { id: string; name: string } };
type PostView = { id: string; body: string; status: string; topics: { tag: string; label: string }[]; reactions: Reaction[] };
const timeline = async (token: string) => ((await (await call("/v1/posts", bearer(token))).json()) as { posts: PostView[] }).posts;
const followedIds = async (token: string) =>
  ((await (await call("/v1/personas", bearer(token))).json()) as { personas: { locked: boolean; id?: string }[] }).personas
    .filter((p) => !p.locked)
    .map((p) => p.id!);
const me = async (token: string) => (await (await call("/v1/me", bearer(token))).json()) as { followerCount: number };

/** 環境変数を上書きして、実行コンテキスト付きでアプリを呼ぶ(waitUntil の完了も待つ) */
async function callWith(overrides: Record<string, string>, path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`http://localhost${path}`, init), { ...env, ...overrides }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** 新規フォロワーが出るまで投稿する。出たら、その人たちのIDを返す */
async function postUntilFollowed(token: string, text: string, max = 12): Promise<string[]> {
  for (let i = 0; i < max; i++) {
    const before = new Set(await followedIds(token));
    expect((await post(token, text)).status).toBe(201);
    const added = (await followedIds(token)).filter((id) => !before.has(id));
    if (added.length > 0) return added;
  }
  throw new Error("フォロワーが増えませんでした");
}

// ---------- 投稿 ----------
describe("つぶやき投稿", () => {
  it("未ログインは投稿できない", async () => {
    expect((await call("/v1/posts", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
  });

  it("空・長すぎ・文字列以外は拒否(140字ちょうどはOK)", async () => {
    const { token } = await register();
    expect((await post(token, "   ")).status).toBe(400);
    expect((await post(token, "あ".repeat(141))).status).toBe(400);
    expect((await post(token, 123)).status).toBe(400);
    expect((await post(token, "あ".repeat(140))).status).toBe(201);
  });

  it("投稿の返り値は最小限(解析結果・フォロー・内部値を含まない)。話題は一覧で見える", async () => {
    const { token } = await register();
    const res = await post(token, "朝ランで10km走ってきた!");
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(Object.keys((JSON.parse(text) as { post: object }).post).sort()).toEqual(["body", "createdAt", "id"]);
    for (const secret of ["affinity", "probability", "theta", "interests", "newFollowers", "topics"]) expect(text).not.toContain(secret);

    const [p] = await timeline(token);
    expect(p!.status).toBe("done");
    expect(p!.topics.find((t) => t.tag === "running")?.label).toBe("ランニング");
    expect(p!.body).toBe("朝ランで10km走ってきた!");
  });

  it("フォロワーが増えると、一覧・自分の情報・通知に反映され、二度と外れない", async () => {
    const { token } = await register();
    const added = await postUntilFollowed(token, "朝ランした。ジョギングは最高");
    expect((await me(token)).followerCount).toBe(added.length);

    const notes = (await (await call("/v1/notifications", bearer(token))).json()) as { notifications: { type: string; persona: { id: string } }[] };
    for (const id of added) expect(notes.notifications.some((n) => n.type === "follow" && n.persona.id === id)).toBe(true);

    // 愚痴やむちゃくちゃな投稿をしても、フォロワーは減らない
    await post(token, "最悪、もう無理、愚痴");
    expect((await followedIds(token)).length).toBeGreaterThanOrEqual(added.length);
  });

  it("フォローは話題に合った人だけ(走る話題で猫好き・美容の人は来ない)", async () => {
    const { token } = await register();
    for (let i = 0; i < 4; i++) await post(token, "今日は走った。筋トレもした");
    const followed = await followedIds(token);
    for (const id of followed) {
      expect(["kenji_run", "take_sports", "sho_diy", "sakura_cook", "yuki_night", "yuta_fin"]).toContain(id);
    }
    expect(followed).not.toContain("nozomi_pets");
    expect(followed).not.toContain("akari_beauty");
  });

  it("1日の投稿上限(テスト設定は12回)を超えると429。上限は人ごと", async () => {
    const a = await register("A");
    const b = await register("B");
    for (let i = 0; i < 12; i++) expect((await post(a.token, `投稿${i}`)).status).toBe(201);
    const res = await post(a.token, "13回目");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "daily_limit", limit: 12 });
    expect((await post(b.token, "はじめまして")).status).toBe(201);
  });

  it("他のユーザーのつぶやき・リアクション・フォローは見えない(隔離)", async () => {
    const a = await register("A");
    const b = await register("B");
    await follow(a.userId, "kenji_run");
    for (let i = 0; i < 8; i++) await post(a.token, "朝ランした。ジョギング最高 Aだけの秘密");
    // ケンジが関心を持たない話題(哲学・読書)にする。日常の雑談だと、ケンジが弱い関心(約3%)でフォローし得て、テストが偶然落ちる
    await post(b.token, "哲学の本を読んだ。Bのつぶやき");

    const bText = JSON.stringify(await timeline(b.token));
    expect(bText).toContain("Bのつぶやき");
    for (const leak of ["Aだけの秘密", "kenji_run"]) expect(bText).not.toContain(leak);
    // Bさん自身の投稿(日常のつぶやき)でフォローされることはあるが、Aさんのフォロワー(ケンジ)は含まれない
    expect(await followedIds(b.token)).not.toContain("kenji_run");
    const bNotes = await (await call("/v1/notifications", bearer(b.token))).text();
    expect(bNotes).not.toContain("kenji_run");

    const aText = JSON.stringify(await timeline(a.token));
    expect(aText).toContain("reply");
    for (const secret of ["affinity", "theta", "interests", "isNewFollower"]) expect(aText).not.toContain(secret);
  });

  it("同じ人を二重にフォローしたり、通知を二重に作ったりしない", async () => {
    const { token, userId } = await register();
    for (let i = 0; i < 6; i++) await post(token, "走った走った。ランニング");
    const rel = await env.DB.prepare("SELECT persona_id FROM relations WHERE user_id = ?").bind(userId).all<{ persona_id: string }>();
    const ids = rel.results.map((r) => r.persona_id);
    expect(new Set(ids).size).toBe(ids.length);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'follow'").bind(userId).first<{ n: number }>();
    expect(n!.n).toBe(ids.length);
  });
});

// ---------- リアクション ----------
describe("リアクション", () => {
  it("新規フォロワーには必ず返信が付き、自分のつぶやきの下に表示される", async () => {
    const { token } = await register();
    const added = await postUntilFollowed(token, "朝ランした。ジョギング最高");
    const reactions = (await timeline(token)).flatMap((p) => p.reactions);
    const reply = reactions.find((r) => r.persona.id === added[0] && r.type === "reply");
    expect(reply?.text).toContain("フォローしました"); // mock は新規フォロワーにこの一言を付ける
  });

  it("表示時刻(visible_at)前のリアクションは、一覧にも出ない", async () => {
    const { token, userId } = await register();
    await follow(userId, "kenji_run");
    for (let i = 0; i < 10; i++) {
      await post(token, "朝ランした。ジョギング最高");
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?").bind(userId).first<{ n: number }>();
      if (n!.n > 0) break;
    }
    await env.DB.prepare("UPDATE reactions SET visible_at = ? WHERE user_id = ?").bind(Date.now() + 60_000, userId).run();
    expect((await timeline(token)).every((p) => p.reactions.length === 0)).toBe(true);
    await env.DB.prepare("UPDATE reactions SET visible_at = ? WHERE user_id = ?").bind(Date.now() - 1, userId).run();
    expect((await timeline(token)).some((p) => p.reactions.length > 0)).toBe(true);
  });

  it("LLMの設定ミスでも投稿は完了し、セリフ例で返信が付く(縮退運転)", async () => {
    const { token, userId } = await register();
    await follow(userId, "kenji_run");
    // local なのにモデル名が無い=設定ミス
    for (let i = 0; i < 8; i++) {
      const res = await callWith({ LLM_PROVIDER: "local" }, "/v1/posts", authed(token, "POST", { body: "朝ランした。ジョギング最高" }));
      expect(res.status).toBe(201);
    }
    const posts = await timeline(token);
    expect(posts.every((p) => p.status === "done")).toBe(true);
    const texts = posts.flatMap((p) => p.reactions).filter((r) => r.type === "reply").map((r) => r.text);
    expect(texts.length).toBeGreaterThan(0);
  });

  it("リアクションの通知(like/reply)が作られ、二重にならない", async () => {
    const { token, userId } = await register();
    await follow(userId, "kenji_run");
    for (let i = 0; i < 8; i++) await post(token, "朝ランした。ジョギング最高");
    const rx = await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ?").bind(userId).first<{ n: number }>();
    const nt = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type IN ('like','reply')").bind(userId).first<{ n: number }>();
    expect(rx!.n).toBeGreaterThan(0);
    expect(nt!.n).toBe(rx!.n);
  });
});

// ---------- 非同期処理 (M4) ----------
describe("非同期処理", () => {
  /** 話題解析の応答を、こちらが許可するまで止めておけるニセのローカルLLM */
  function fakeLocalLlm() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const name = body.response_format.json_schema.name as string;
      calls.push(name);
      await gate;
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "running", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "いいですね、走ってきたんですね" })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch);
    return { release, calls };
  }
  const asyncEnv = { REPLY_MODE: "async", LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1" };

  it("投稿はAIの完了を待たずに返り、処理中の間はリアクションもフォローも出ない。完了すると反映される", async () => {
    const { token } = await register();
    const llm = fakeLocalLlm();

    const ctx = createExecutionContext();
    const t0 = Date.now();
    const res = await app.fetch(new Request("http://localhost/v1/posts", authed(token, "POST", { body: "朝ランで10km走ってきた!" })), { ...env, ...asyncEnv }, ctx);
    expect(res.status).toBe(201);
    expect(Date.now() - t0).toBeLessThan(2000); // LLM はまだ止まっている

    const during = await timeline(token);
    expect(during[0]!.status).toBe("processing");
    expect(during[0]!.topics).toEqual([]);
    expect(during[0]!.reactions).toEqual([]);
    expect(await followedIds(token)).toEqual([]);

    llm.release();
    await waitOnExecutionContext(ctx);
    const after = await timeline(token);
    expect(after[0]!.status).toBe("done");
    expect(after[0]!.topics.map((t) => t.tag)).toEqual(["running"]); // LLM の解析結果が裏で反映された
    expect(llm.calls[0]).toBe("topics_result");
  });

  it("処理が止まったままの投稿は、一定時間後の読み出しで、AIなしで完了させる", async () => {
    const { token, userId } = await register();
    const stuckId = "stuck-1";
    const old = Date.now() - 10 * 60_000;
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, created_at, status, process_started_at) VALUES (?, ?, ?, ?, 'processing', ?)")
      .bind(stuckId, userId, "朝ランで10km走ってきた!", old, old)
      .run();
    const [p] = await timeline(token); // 読み出しが救済を起動する
    expect(p!.status).toBe("done");
    expect(p!.topics.map((t) => t.tag)).toContain("running"); // キーワード一致の縮退運転

    // 二重に走っても結果は増えない
    await timeline(token);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE post_id = ?").bind(stuckId).first<{ n: number }>();
    const ids = await env.DB.prepare("SELECT id FROM reactions WHERE post_id = ?").bind(stuckId).all<{ id: string }>();
    expect(new Set(ids.results.map((r) => r.id)).size).toBe(n!.n);
  });

  it("まだ時間がたっていない処理中の投稿は、救済しない", async () => {
    const { token, userId } = await register();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, created_at, status, process_started_at) VALUES ('fresh', ?, 'x', ?, 'processing', ?)")
      .bind(userId, now, now)
      .run();
    expect((await timeline(token))[0]!.status).toBe("processing");
  });

  it("フォローは時間差で現れる(予約中は一覧にも人数にも通知にも出ない)", async () => {
    const { token, userId } = await register();
    const slow = { REACTION_DELAY_MAX_MS: "180000" };
    let scheduled = 0;
    for (let i = 0; i < 12 && scheduled === 0; i++) {
      const res = await callWith(slow, "/v1/posts", authed(token, "POST", { body: "朝ランした。ジョギングは最高" }));
      expect(res.status).toBe(201);
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM relations WHERE user_id = ?").bind(userId).first<{ n: number }>();
      scheduled = r!.n;
    }
    expect(scheduled).toBeGreaterThan(0);

    // 予約された(DBにはあるが、表示時刻は未来)
    const future = await env.DB.prepare("SELECT MIN(followed_at) AS t FROM relations WHERE user_id = ?").bind(userId).first<{ t: number }>();
    expect(future!.t).toBeGreaterThan(Date.now());
    expect((await me(token)).followerCount).toBe(0);
    expect(await followedIds(token)).toEqual([]);
    const notes = (await (await call("/v1/notifications", bearer(token))).json()) as { notifications: unknown[]; unreadCount: number };
    expect(notes.notifications).toEqual([]);
    expect(notes.unreadCount).toBe(0);

    // 表示時刻が来たら、フォロー・通知・返信が同時に現れる
    const past = Date.now() - 1;
    await env.DB.prepare("UPDATE relations SET followed_at = ? WHERE user_id = ?").bind(past, userId).run();
    await env.DB.prepare("UPDATE notifications SET visible_at = ? WHERE user_id = ?").bind(past, userId).run();
    await env.DB.prepare("UPDATE reactions SET visible_at = ? WHERE user_id = ?").bind(past, userId).run();
    expect((await me(token)).followerCount).toBe(scheduled);
    expect((await followedIds(token)).length).toBe(scheduled);
    expect(((await (await call("/v1/notifications", bearer(token))).json()) as { unreadCount: number }).unreadCount).toBeGreaterThan(0);
  });

  it("予約中のフォロワーは、次の投稿でも二重にフォローされず、まだ反応もしない", async () => {
    const { token, userId } = await register();
    const slow = { REACTION_DELAY_MAX_MS: "180000" };
    let first: { persona_id: string }[] = [];
    for (let i = 0; i < 12 && first.length === 0; i++) {
      await callWith(slow, "/v1/posts", authed(token, "POST", { body: "朝ランした。ジョギングは最高" }));
      first = (await env.DB.prepare("SELECT persona_id FROM relations WHERE user_id = ?").bind(userId).all<{ persona_id: string }>()).results;
    }
    expect(first.length).toBeGreaterThan(0);
    const reactionsBefore = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ? AND persona_id IN (" + first.map(() => "?").join(",") + ")").bind(userId, ...first.map((f) => f.persona_id)).first<{ n: number }>())!.n;
    await callWith(slow, "/v1/posts", authed(token, "POST", { body: "朝ランした。ジョギングは最高" }));
    const rows = (await env.DB.prepare("SELECT persona_id FROM relations WHERE user_id = ?").bind(userId).all<{ persona_id: string }>()).results.map((r) => r.persona_id);
    expect(new Set(rows).size).toBe(rows.length);
    // 予約中の人は、まだフォロワーではないので2回目の投稿には反応しない(新規フォローの1件目の返信だけ)
    const reactionsAfter = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE user_id = ? AND persona_id IN (" + first.map(() => "?").join(",") + ")").bind(userId, ...first.map((f) => f.persona_id)).first<{ n: number }>())!.n;
    expect(reactionsAfter).toBe(reactionsBefore);
  });
});

// ---------- 通知API ----------
describe("通知API", () => {
  async function seedNotification(userId: string, id: string, type: "follow" | "reply" | "like", at: number, personaId = "kenji_run", text: string | null = null) {
    if (type === "follow") {
      await env.DB.prepare("INSERT INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, 'follow', ?, ?, ?)").bind(id, userId, personaId, at, at).run();
      return;
    }
    const postId = `post-${id}`;
    await env.DB.prepare("INSERT INTO posts (id, user_id, body, created_at) VALUES (?, ?, 'つぶやき', ?)").bind(postId, userId, at).run();
    await env.DB.prepare("INSERT INTO reactions (id, user_id, post_id, persona_id, type, text, visible_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`rx-${id}`, userId, postId, personaId, type, text, at, at)
      .run();
    await env.DB.prepare("INSERT INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, userId, type, `rx-${id}`, at, at).run();
  }
  type Note = { id: string; type: string; createdAt: number; read: boolean; persona: { id: string; name: string }; postId?: string; text?: string };
  const list = async (token: string, qs = "") => (await (await call(`/v1/notifications${qs}`, bearer(token))).json()) as { notifications: Note[]; unreadCount: number };

  it("認証が必要", async () => {
    expect((await call("/v1/notifications")).status).toBe(401);
    expect((await call("/v1/notifications/read", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("新しい順に返り、種類ごとに必要な情報が付く。表示時刻前のものは出ない", async () => {
    const { token, userId } = await register();
    const now = Date.now();
    await seedNotification(userId, "n1", "follow", now - 3000, "miyu_cafe");
    await seedNotification(userId, "n2", "reply", now - 2000, "kenji_run", "最高っす!");
    await seedNotification(userId, "n3", "like", now - 1000, "sou_music");
    await seedNotification(userId, "n4", "reply", now + 60_000, "hana_books", "未来の返信");
    const r = await list(token);
    expect(r.notifications.map((n) => n.id)).toEqual(["n3", "n2", "n1"]);
    expect(r.unreadCount).toBe(3);
    expect(r.notifications[1]).toMatchObject({ type: "reply", text: "最高っす!", persona: { id: "kenji_run", name: "田中ケンジ" }, read: false });
    expect(r.notifications[1]!.postId).toBe("post-n2");
    expect(r.notifications[0]!.text).toBeUndefined(); // いいねに本文はない
    expect(r.notifications[2]).toMatchObject({ type: "follow", persona: { id: "miyu_cafe" } });
    expect(JSON.stringify(r)).not.toContain("未来の返信");
  });

  it("limit と before で続きを取れる", async () => {
    const { token, userId } = await register();
    const now = Date.now();
    for (let i = 1; i <= 5; i++) await seedNotification(userId, `n${i}`, "follow", now - (6 - i) * 1000, "miyu_cafe");
    const page1 = await list(token, "?limit=2");
    expect(page1.notifications.map((n) => n.id)).toEqual(["n5", "n4"]);
    const page2 = await list(token, `?limit=2&before=${page1.notifications[1]!.createdAt}`);
    expect(page2.notifications.map((n) => n.id)).toEqual(["n3", "n2"]);
  });

  it("既読にできる(ids / all)。未来の通知は既読にならない。不正な指定は400", async () => {
    const { token, userId } = await register();
    const now = Date.now();
    await seedNotification(userId, "a", "follow", now - 3000);
    await seedNotification(userId, "b", "follow", now - 2000);
    await seedNotification(userId, "c", "follow", now - 1000);
    await seedNotification(userId, "future", "follow", now + 60_000);

    let res = await call("/v1/notifications/read", authed(token, "POST", { ids: ["a"] }));
    expect(await res.json()).toEqual({ unreadCount: 2 });
    expect((await list(token)).notifications.find((n) => n.id === "a")!.read).toBe(true);

    await call("/v1/notifications/read", authed(token, "POST", { ids: ["future"] }));
    const f = await env.DB.prepare("SELECT read FROM notifications WHERE id = 'future'").first<{ read: number }>();
    expect(f!.read).toBe(0);

    res = await call("/v1/notifications/read", authed(token, "POST", { all: true }));
    expect(await res.json()).toEqual({ unreadCount: 0 });
    const f2 = await env.DB.prepare("SELECT read FROM notifications WHERE id = 'future'").first<{ read: number }>();
    expect(f2!.read).toBe(0);

    for (const bad of [{}, { ids: [] }, { ids: [1] }, { ids: Array(101).fill("x") }]) {
      expect((await call("/v1/notifications/read", authed(token, "POST", bad))).status).toBe(400);
    }
  });

  it("他のユーザーの通知は見えず、既読にもできない", async () => {
    const a = await register("A");
    const b = await register("B");
    await seedNotification(a.userId, "a-note", "reply", Date.now() - 1000, "kenji_run", "Aへの返信");
    expect(JSON.stringify(await list(b.token))).not.toContain("Aへの返信");
    expect((await list(b.token)).notifications).toEqual([]);
    await call("/v1/notifications/read", authed(b.token, "POST", { ids: ["a-note"] }));
    const row = await env.DB.prepare("SELECT read FROM notifications WHERE id = 'a-note'").first<{ read: number }>();
    expect(row!.read).toBe(0);
    await call("/v1/notifications/read", authed(b.token, "POST", { all: true }));
    expect((await env.DB.prepare("SELECT read FROM notifications WHERE id = 'a-note'").first<{ read: number }>())!.read).toBe(0);
  });
});

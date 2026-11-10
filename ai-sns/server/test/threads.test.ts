import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { authed, bearer, call, register, resetDb, seedReply } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

type ThreadMsg = { id: string; role: string; text: string };
type Rx = { id: string; type: string; liked?: boolean; thread?: ThreadMsg[]; replying?: boolean; text: string | null };
const timeline = async (token: string) =>
  ((await (await call("/v1/posts", bearer(token))).json()) as { posts: { id: string; reactions: Rx[] }[] }).posts;
const reactionOf = async (token: string, id: string) => (await timeline(token)).flatMap((p) => p.reactions).find((r) => r.id === id);
const like = (token: string, id: string) => call(`/v1/reactions/${encodeURIComponent(id)}/like`, authed(token, "PUT"));
const unlike = (token: string, id: string) => call(`/v1/reactions/${encodeURIComponent(id)}/like`, authed(token, "DELETE"));
const say = (token: string, id: string, body: unknown) => call(`/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body }));

async function callWith(overrides: Record<string, string>, path: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`http://localhost${path}`, init), { ...env, ...overrides }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

// ---------- いいね ----------
describe("フォロワーの返信へのいいね", () => {
  it("認証が必要", async () => {
    expect((await call("/v1/reactions/x/like", { method: "PUT" })).status).toBe(401);
  });

  it("いいねすると一覧に反映され、何度押しても1回分。取り消せる", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    expect((await reactionOf(token, id))!.liked).toBe(false);

    expect(await (await like(token, id)).json()).toEqual({ liked: true });
    expect((await like(token, id)).status).toBe(200); // 連打しても壊れない
    expect((await reactionOf(token, id))!.liked).toBe(true);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM reaction_likes WHERE user_id = ?").bind(userId).first<{ n: number }>();
    expect(n!.n).toBe(1);

    expect(await (await unlike(token, id)).json()).toEqual({ liked: false });
    expect((await reactionOf(token, id))!.liked).toBe(false);
  });

  it("初めていいねしたときだけ、そのフォロワーとの親しさが上がる", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId, "kenji_run");
    await like(token, id);
    await like(token, id);
    const r = await env.DB.prepare("SELECT intimacy FROM relations WHERE user_id = ? AND persona_id = 'kenji_run'").bind(userId).first<{ intimacy: number }>();
    expect(r!.intimacy).toBe(1);
  });

  it("他人の返信・存在しない返信・いいねだけのリアクション・まだ表示されていない返信には付けられない", async () => {
    const a = await register("A");
    const b = await register("B");
    const aReply = await seedReply(a.userId);
    const aLike = await seedReply(a.userId, "miyu_cafe", { type: "like" });
    const future = await seedReply(a.userId, "sou_music", { visibleAt: Date.now() + 60_000 });

    expect((await like(b.token, aReply)).status).toBe(404); // 他のユーザーの返信
    expect((await like(a.token, "no-such")).status).toBe(404);
    expect((await like(a.token, aLike)).status).toBe(404);
    expect((await like(a.token, future)).status).toBe(404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM reaction_likes").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("他のユーザーのいいねは見えず、取り消すこともできない", async () => {
    const a = await register("A");
    const b = await register("B");
    const id = await seedReply(a.userId);
    await like(a.token, id);
    expect((await unlike(b.token, id)).status).toBe(404);
    expect((await reactionOf(a.token, id))!.liked).toBe(true);
  });
});

// ---------- スレッド ----------
describe("スレッド(返信への返信)", () => {
  it("返信すると、同じフォロワーが続きの返事をする(スレッドに両方の発言が並ぶ)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId, "kenji_run", { text: "朝活えらいっす!" });
    const res = await say(token, id, "ありがとう!明日も走るよ");
    expect(res.status).toBe(201);
    const body = (await res.json()) as { message: { id: string; role: string; text: string } };
    expect(body.message).toMatchObject({ role: "user", text: "ありがとう!明日も走るよ" });

    const r = (await reactionOf(token, id))!;
    expect(r.thread!.map((m) => m.role)).toEqual(["user", "persona"]);
    expect(r.thread![0]!.text).toBe("ありがとう!明日も走るよ");
    expect(r.thread![1]!.text.length).toBeGreaterThan(0);
    expect(r.replying).toBe(false);
  });

  it("続けて何度でも会話できる(順番どおりに並ぶ)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    await say(token, id, "1つ目");
    await say(token, id, "2つ目");
    const r = (await reactionOf(token, id))!;
    expect(r.thread!.map((m) => m.role)).toEqual(["user", "persona", "user", "persona"]);
    expect(r.thread!.filter((m) => m.role === "user").map((m) => m.text)).toEqual(["1つ目", "2つ目"]);
  });

  it("空・長すぎ・文字列以外は拒否(140字ちょうどはOK)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    expect((await say(token, id, "  ")).status).toBe(400);
    expect((await say(token, id, "あ".repeat(141))).status).toBe(400);
    expect((await say(token, id, 5)).status).toBe(400);
    expect((await say(token, id, "あ".repeat(140))).status).toBe(201);
  });

  it("他人の返信・いいねだけ・まだ表示されていない返信には返信できない", async () => {
    const a = await register("A");
    const b = await register("B");
    const aReply = await seedReply(a.userId);
    const aLike = await seedReply(a.userId, "miyu_cafe", { type: "like" });
    const future = await seedReply(a.userId, "sou_music", { visibleAt: Date.now() + 60_000 });
    expect((await say(b.token, aReply, "のぞき見")).status).toBe(404);
    expect((await say(a.token, aLike, "x")).status).toBe(404);
    expect((await say(a.token, future, "x")).status).toBe(404);
    expect((await say(a.token, "no-such", "x")).status).toBe(404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM thread_messages").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("他のユーザーのスレッドは見えない(隔離)", async () => {
    const a = await register("A");
    const b = await register("B");
    const id = await seedReply(a.userId);
    await say(a.token, id, "Aだけの秘密の会話");
    await seedReply(b.userId);
    const bText = JSON.stringify(await timeline(b.token));
    expect(bText).not.toContain("Aだけの秘密の会話");
    expect(await (await call("/v1/notifications", bearer(b.token))).text()).not.toContain(id);
  });

  it("1日の発言上限を超えると429(上限は人ごと)", async () => {
    const a = await register("A");
    const b = await register("B");
    const ida = await seedReply(a.userId);
    const idb = await seedReply(b.userId);
    const lim = { THREAD_DAILY_LIMIT: "2" };
    const send = (t: string, id: string) => callWith(lim, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(t, "POST", { body: "こんにちは" }));
    expect((await send(a.token, ida)).status).toBe(201);
    expect((await send(a.token, ida)).status).toBe(201);
    const third = await send(a.token, ida);
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ error: "daily_limit", limit: 2 });
    expect((await send(b.token, idb)).status).toBe(201);
  });

  it("1つのスレッドは20回まで", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare("INSERT INTO thread_messages (id, user_id, reaction_id, role, persona_id, text, status, visible_at, created_at) VALUES (?, ?, ?, 'user', 'kenji_run', 'x', 'done', 1, ?)")
        .bind(`m${i}`, userId, id, i + 1)
        .run();
    }
    const res = await callWith({ THREAD_DAILY_LIMIT: "100" }, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body: "21回目" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "thread_limit" });
  });

  it("返事を待っている間は、次を送れない(連打して費用が膨らむのを防ぐ)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    const now = Date.now();
    await env.DB.prepare("INSERT INTO thread_messages (id, user_id, reaction_id, role, persona_id, text, status, process_started_at, visible_at, created_at) VALUES ('p1', ?, ?, 'user', 'kenji_run', '待ち', 'processing', ?, ?, ?)")
      .bind(userId, id, now, now, now)
      .run();
    const res = await say(token, id, "もう1回");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "reply_pending" });
    expect((await reactionOf(token, id))!.replying).toBe(true);
  });

  it("フォロワーの返事は、時間差で現れる(ユーザーの発言はすぐ見える)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    await callWith({ REACTION_DELAY_MAX_MS: "180000" }, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body: "こんにちは" }));
    let r = (await reactionOf(token, id))!;
    expect(r.thread!.map((m) => m.role)).toEqual(["user"]); // 返事はまだ
    expect((await (await call("/v1/notifications", bearer(token))).json() as { notifications: unknown[] }).notifications).toEqual([]);

    await env.DB.prepare("UPDATE thread_messages SET visible_at = ? WHERE role = 'persona'").bind(Date.now() - 1).run();
    await env.DB.prepare("UPDATE notifications SET visible_at = ?").bind(Date.now() - 1).run();
    r = (await reactionOf(token, id))!;
    expect(r.thread!.map((m) => m.role)).toEqual(["user", "persona"]);
  });

  it("返事の通知が、どのスレッドか(reactionId)付きで届く", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId, "miyu_cafe");
    await say(token, id, "こんにちは");
    const notes = (await (await call("/v1/notifications", bearer(token))).json()) as {
      notifications: { type: string; reactionId?: string; postId?: string; text?: string; persona: { id: string } }[];
    };
    const n = notes.notifications.find((x) => x.reactionId === id && x.persona.id === "miyu_cafe")!;
    expect(n.type).toBe("reply");
    expect(n.text).toBeTruthy();
    expect(n.postId).toBeTruthy();
  });

  it("返事の生成が止まったままのスレッドは、一定時間後の読み出しで、AIなしで完了させる", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    const old = Date.now() - 10 * 60_000;
    await env.DB.prepare("INSERT INTO thread_messages (id, user_id, reaction_id, role, persona_id, text, status, process_started_at, visible_at, created_at) VALUES ('stuck', ?, ?, 'user', 'kenji_run', 'こんにちは', 'processing', ?, ?, ?)")
      .bind(userId, id, old, old, old)
      .run();
    const r = (await reactionOf(token, id))!; // 読み出しが救済を起動する
    expect(r.thread!.map((m) => m.role)).toEqual(["user", "persona"]);
    expect(r.replying).toBe(false);
  });

  it("アカウントを削除すると、いいねとスレッドも全部消える", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    await like(token, id);
    await say(token, id, "こんにちは");
    expect((await call("/v1/me", { method: "DELETE", ...bearer(token) })).status).toBe(204);
    for (const t of ["reaction_likes", "thread_messages"]) {
      const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ?`).bind(userId).first<{ n: number }>();
      expect(n!.n).toBe(0);
    }
  });
});

// ---------- 非同期・会話の文脈 ----------
describe("スレッドの非同期処理と会話の文脈", () => {
  /** 送られたプロンプトを記録するニセのローカルLLM。release するまで応答を止められる */
  function fakeLocalLlm(hold = false) {
    let release!: () => void;
    const gate = hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    const prompts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      prompts.push(body.messages[1].content as string);
      await gate;
      const ids = [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => m[1]);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ replies: ids.map((id) => ({ personaId: id, text: "いいですね、続きを聞かせてください" })) }) } }] }), {
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch);
    return { release: () => release?.(), prompts };
  }
  const llmEnv = { LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1" };

  it("送信はすぐ返り、返事を作っている間は replying が立つ。できると消える", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId);
    const llm = fakeLocalLlm(true);

    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://localhost/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body: "こんにちは" })), { ...env, ...llmEnv, REPLY_MODE: "async" }, ctx);
    expect(res.status).toBe(201);
    let r = (await reactionOf(token, id))!;
    expect(r.replying).toBe(true);
    expect(r.thread!.map((m) => m.role)).toEqual(["user"]);

    llm.release();
    await waitOnExecutionContext(ctx);
    r = (await reactionOf(token, id))!;
    expect(r.replying).toBe(false);
    expect(r.thread!.map((m) => m.role)).toEqual(["user", "persona"]);
    expect(r.thread![1]!.text).toBe("いいですね、続きを聞かせてください");
  });

  it("LLMには、元のつぶやき・最初の返信・これまでの会話が渡る。他のスレッドや他ユーザーの内容は渡らない", async () => {
    const a = await register("A");
    const b = await register("B");
    const id = await seedReply(a.userId, "kenji_run", { postBody: "朝ランで10km走った", text: "朝活えらいっす!" });
    const other = await seedReply(a.userId, "miyu_cafe", { postBody: "カフェで読書した", text: "素敵ですぅ" });
    const bId = await seedReply(b.userId, "kenji_run", { postBody: "Bの秘密のつぶやき", text: "Bへの返信" });
    await say(b.token, bId, "Bの秘密の発言");
    await say(a.token, other, "別スレッドの発言");

    const llm = fakeLocalLlm();
    const send = (body: string) => callWith(llmEnv, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(a.token, "POST", { body }));
    await send("最初の発言です");
    await send("2回目の発言です");

    const second = llm.prompts.at(-1)!;
    for (const must of ["朝ランで10km走った", "朝活えらいっす!", "最初の発言です", "2回目の発言です", "田中ケンジ"]) expect(second).toContain(must);
    for (const leak of ["Bの秘密", "別スレッドの発言", "カフェで読書した", "miyu_cafe"]) expect(second).not.toContain(leak);
    expect(second).toContain("会話の続き"); // スレッド用の指示
  });
});

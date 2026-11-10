import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { PERSONAS } from "../src/data";
import { REPLIES_SYSTEM, repliesUser } from "../src/llm/prompts";
import { ROLES, assignRoles, looksLikeRequest } from "../src/roles";
import { authed, register, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("質問・頼みごとかの判定", () => {
  it("質問・頼みごと・相談は true", () => {
    for (const t of [
      "来週ドライブで紅葉を見に行くけど、どこが見頃かな",
      "明日の昭島市の天気どうだろう",
      "面白いゲームないかな",
      "おすすめの本教えて",
      "最近眠れない。どうしたらいい?",
      "転職で悩んでます",
      "これって普通?",
      "何がいいと思う？",
    ]) {
      expect(looksLikeRequest(t), t).toBe(true);
    }
  });

  it("報告・感想・独り言は false", () => {
    for (const t of ["朝ランで10km走ってきた", "猫が可愛すぎる", "なんとなくぼーっとしてた", "今日のラテ最高だった", "新しいキーボード買った。打鍵感が最高"]) {
      expect(looksLikeRequest(t), t).toBe(false);
    }
  });
});

describe("役割の割り当て", () => {
  it("近い順に、答える→具体例→補足→質問→共感。1人だけなら、その人が答える", () => {
    const m = assignRoles(["a", "b", "c", "d", "e"]);
    expect([...m.values()]).toEqual(ROLES.map((r) => r.text));
    expect(m.get("a")).toContain("要点を具体的に答える");
    expect([...assignRoles(["only"]).values()]).toEqual([ROLES[0]!.text]);
  });

  it("人数が役割より多くても、全員に割り当てる(余りは共感)", () => {
    const m = assignRoles(["a", "b", "c", "d", "e", "f", "g"]);
    expect(m.size).toBe(7);
    expect(m.get("g")).toBe(ROLES[4]!.text);
  });

  it("役割の指示がプロンプトに入る。全員で1つの答えを分担する決まりも入っている", () => {
    const t = { persona: PERSONAS[0]!, isNewFollower: false, recentExchanges: [], role: ROLES[0]!.text };
    expect(repliesUser({ post: { id: "p", body: "どこがいい?" }, topics: [], targets: [t] })).toContain(`今回の役割: ${ROLES[0]!.text}`);
    for (const must of ["全員で、ひとつの答えを作る", "同じことを言い直さず", "作り話をしない"]) expect(REPLIES_SYSTEM).toContain(must);
  });
});

describe("質問への返信で、役割が分担される(統合)", () => {
  function fakeLlm() {
    const prompts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (_u: string | Request, init?: RequestInit) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const name = body.response_format.json_schema.name as string;
      prompts.push(body.messages[1].content as string);
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "travel", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "いいですね、気になります" })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch);
    return prompts;
  }
  const llm = { LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1" };
  async function post(token: string, text: string) {
    const ctx = createExecutionContext();
    await app.fetch(new Request("http://localhost/v1/posts", authed(token, "POST", { body: text })), { ...env, ...llm }, ctx);
    await waitOnExecutionContext(ctx);
  }
  async function followMany(userId: string) {
    for (const id of ["erika_trip", "sho_diy", "midori_garden", "masao_dummy", "kenji_run", "take_sports"].filter((x) => x !== "masao_dummy")) {
      await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, 1000)").bind(userId, id).run();
    }
  }

  it("質問のとき、返信するキャラに、重ならない役割が1人ずつ指定される", async () => {
    const { token, userId } = await register();
    await followMany(userId);
    const prompts = fakeLlm();
    for (let i = 0; i < 6; i++) await post(token, "来週ドライブで紅葉を見に行くけど、どこが見頃かな");
    const reply = prompts.filter((p) => p.includes("personaId:") && p.includes("今回の役割"));
    expect(reply.length).toBeGreaterThan(0);
    // 同じ呼び出しの中で、役割が重ならない(2人以上のとき)
    const multi = reply.find((p) => (p.match(/今回の役割/g) ?? []).length >= 2)!;
    expect(multi).toBeTruthy();
    const roles = [...multi.matchAll(/今回の役割: (.+)/g)].map((m) => m[1]);
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles.some((r) => r!.includes("要点を具体的に答える"))).toBe(true); // 話題にいちばん近い人が「答える」を担当する
    expect(multi).not.toContain("今回の切り口"); // 役割があるときは、切り口は使わない
  });

  it("ふつうのつぶやきには、役割は付かず、これまでどおり切り口が付く", async () => {
    const { token, userId } = await register();
    await followMany(userId);
    const prompts = fakeLlm();
    for (let i = 0; i < 6; i++) await post(token, "来週ドライブで紅葉を見に行く。楽しみ");
    const reply = prompts.filter((p) => p.includes("personaId:"));
    expect(reply.length).toBeGreaterThan(0);
    expect(reply.join("")).not.toContain("今回の役割");
    expect(reply.join("")).toContain("今回の切り口");
  });
});

import { describe, expect, it } from "vitest";
import { PERSONAS } from "../src/data";
import { createLlmProvider } from "../src/llm";

describe("LlmProvider (mock)", () => {
  it("既定は mock", () => {
    expect(createLlmProvider({}).name).toBe("mock");
  });

  it("設定が足りないと、何が足りないか分かるエラー", () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: "local" })).toThrow(/LLM_MODEL/);
    expect(() => createLlmProvider({ LLM_PROVIDER: "ollama" })).toThrow(/LLM_MODEL/);
    expect(() => createLlmProvider({ LLM_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => createLlmProvider({ LLM_PROVIDER: "local", LLM_MODEL: "m", LLM_EXTRA_BODY: "{bad" })).toThrow(/JSON/);
    expect(() => createLlmProvider({ LLM_PROVIDER: "foo" })).toThrow(/未知/);
  });

  it("local / anthropic はそれぞれ作れる", () => {
    expect(createLlmProvider({ LLM_PROVIDER: "local", LLM_MODEL: "qwen" }).name).toBe("local(qwen)");
    expect(createLlmProvider({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).name).toBe("anthropic(claude-haiku-5-5)");
  });

  it("各ペルソナのセリフ例から、毎回同じ返信を返す", async () => {
    const llm = createLlmProvider({});
    const targets = PERSONAS.slice(0, 3).map((persona) => ({ persona, isNewFollower: false, recentExchanges: [] }));
    const req = { post: { id: "post-1", body: "朝ランした" }, topics: [{ tag: "running", weight: 1 }], targets };
    const a = await llm.generateReplies(req);
    const b = await llm.generateReplies(req);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    a.forEach((r, i) => expect(PERSONAS[i]!.samples).toContain(r.text));
  });

  it("新規フォロワーにはフォローの一言が付く", async () => {
    const llm = createLlmProvider({});
    const [r] = await llm.generateReplies({
      post: { id: "p", body: "x" },
      topics: [],
      targets: [{ persona: PERSONAS[0]!, isNewFollower: true, recentExchanges: [] }],
    });
    expect(r!.text.startsWith("フォローしました")).toBe(true);
  });
});

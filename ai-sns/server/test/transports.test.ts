import { describe, expect, it } from "vitest";
import { AnthropicTransport } from "../src/llm/anthropic";
import { extractJson } from "../src/llm/json";
import { OpenAiCompatTransport } from "../src/llm/openaiCompat";
import { LlmRefusalError } from "../src/llm/transport";

const req = { system: "sys", user: "usr", schema: { type: "object" }, schemaName: "x", maxTokens: 100 };
const okJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("extractJson", () => {
  it("素のJSON・フェンス付き・前後に説明文がある場合を読める", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('はい、どうぞ。\n{"a":1}\n以上です')).toEqual({ a: 1 });
  });
  it("Qwen3 の <think> ブロックを無視する(閉じ忘れも)", () => {
    expect(extractJson('<think>うーん {"b":2} かな</think>\n{"a":1}')).toEqual({ a: 1 });
    expect(() => extractJson('<think>考え中で{"a":1}')).toThrow(); // 閉じタグなし=思考の途中で打ち切られた
  });
  it("JSONが無ければ例外", () => {
    expect(() => extractJson("こんにちは")).toThrow();
  });
});

describe("OpenAiCompatTransport", () => {
  it("正しいURL・ヘッダ・ボディで送り、追加ボディが反映される", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const t = new OpenAiCompatTransport({
      baseUrl: "http://localhost:1234/v1/",
      model: "qwen",
      apiKey: "secret",
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init };
        return okJson({ choices: [{ message: { content: '{"ok":true}' } }] });
      }) as unknown as typeof fetch,
    });
    expect(await t.completeJson(req)).toEqual({ ok: true });
    expect(seen!.url).toBe("http://localhost:1234/v1/chat/completions");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    const body = JSON.parse(seen!.init.body as string);
    expect(body.model).toBe("qwen");
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("<think> 付きの応答からでもJSONを取れる", async () => {
    const t = new OpenAiCompatTransport({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: (async () => okJson({ choices: [{ message: { content: '<think>...</think>{"a":1}' } }] })) as unknown as typeof fetch,
    });
    expect(await t.completeJson(req)).toEqual({ a: 1 });
  });

  it("HTTPエラー・空応答は分かるエラーにする", async () => {
    const mk = (res: () => Response) =>
      new OpenAiCompatTransport({ baseUrl: "http://x/v1", model: "m", fetchImpl: (async () => res()) as unknown as typeof fetch });
    await expect(mk(() => new Response("model not found", { status: 404 })).completeJson(req)).rejects.toThrow(/404/);
    await expect(mk(() => okJson({ choices: [{ message: { content: "" } }] })).completeJson(req)).rejects.toThrow(/空/);
  });
});

describe("AnthropicTransport (Haiku 5.5)", () => {
  const msg = (over: Record<string, unknown>) =>
    okJson({
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5",
      content: [{ type: "text", text: '{"a":1}' }],
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      ...over,
    });

  it("モデル・effort・JSONスキーマを指定して送り、サンプリング指定は送らない", async () => {
    let body: Record<string, unknown> = {};
    let apiKey = "";
    const t = new AnthropicTransport({
      apiKey: "sk-test",
      fetchImpl: (async (_u: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        const h = init.headers as unknown;
        const headers = h instanceof Headers ? h : new Headers(h as Record<string, string>);
        // SDK 1.7 は Authorization: Bearer <key>(旧: x-api-key)。どちらの形でも鍵が渡っていることを確認する
        apiKey = headers.get("x-api-key") ?? headers.get("authorization") ?? "";
        return msg({});
      }) as unknown as typeof fetch,
    });
    expect(await t.completeJson(req)).toEqual({ a: 1 });
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: { type: "object" } } });
    for (const k of ["temperature", "top_p", "top_k", "thinking"]) expect(body).not.toHaveProperty(k);
    expect(apiKey).toContain("sk-test");
  });

  it("安全判定での拒否は LlmRefusalError", async () => {
    const t = new AnthropicTransport({ apiKey: "k", fetchImpl: (async () => msg({ stop_reason: "refusal", content: [] })) as unknown as typeof fetch });
    await expect(t.completeJson(req)).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("max_tokens で途切れたら例外", async () => {
    const t = new AnthropicTransport({ apiKey: "k", fetchImpl: (async () => msg({ stop_reason: "max_tokens" })) as unknown as typeof fetch });
    await expect(t.completeJson(req)).rejects.toThrow(/max_tokens/);
  });
});

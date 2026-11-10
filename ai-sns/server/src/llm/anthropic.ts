import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./json";
import { type JsonRequest, type JsonTransport, LlmRefusalError } from "./transport";

export interface AnthropicOptions {
  apiKey: string;
  /** 既定 claude-haiku-5-5(現行Haiku。最安クラス) */
  model?: string;
  fetchImpl?: typeof fetch;
}

/** Claude(既定は Haiku 5.5)に話すトランスポート。キーはサーバー側のシークレットとして持つ */
export class AnthropicTransport implements JsonTransport {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(o: AnthropicOptions) {
    this.model = o.model ?? "claude-haiku-5-5";
    this.name = `anthropic(${this.model})`;
    this.client = new Anthropic({ apiKey: o.apiKey, maxRetries: 1, timeout: 60_000, ...(o.fetchImpl ? { fetch: o.fetchImpl } : {}) });
  }

  async completeJson(req: JsonRequest): Promise<unknown> {
    // Haiku 5.5: temperature 等のサンプリング指定は 400 になるので送らない。
    // 思考は effort=low で最小限にして出力トークン(=費用)を抑える。
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
    });
    // Haiku 5.5 は安全判定で拒否することがあり、サーバー側の自動フォールバックは無い。呼び出し側で縮退する
    if (res.stop_reason === "refusal") throw new LlmRefusalError();
    if (res.stop_reason === "max_tokens") throw new Error("Claude の出力が max_tokens で途切れました");
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (!text) throw new Error("Claude の応答にテキストがありません");
    return extractJson(text);
  }
}

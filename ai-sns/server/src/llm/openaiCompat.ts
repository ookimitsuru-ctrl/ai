import { extractJson } from "./json";
import type { JsonRequest, JsonTransport } from "./transport";

export interface OpenAiCompatOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** リクエストにそのまま足すフィールド(例: Qwen3 の思考オフ) */
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * OpenAI 互換の /chat/completions に話すトランスポート。
 * Ollama(http://localhost:11434/v1)、LM Studio、llama.cpp server、mlx-lm、vLLM など、
 * ローカルLLMサーバーの大半がこの形式に対応している。
 */
export class OpenAiCompatTransport implements JsonTransport {
  readonly name: string;
  constructor(private readonly o: OpenAiCompatOptions) {
    this.name = `local(${o.model})`;
  }

  async completeJson(req: JsonRequest): Promise<unknown> {
    const f = this.o.fetchImpl ?? fetch;
    const url = `${this.o.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.o.apiKey) headers.authorization = `Bearer ${this.o.apiKey}`;

    const body = {
      model: this.o.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      max_tokens: req.maxTokens,
      stream: false,
      // 対応サーバーでは出力がスキーマに沿うよう強制される。非対応でもプロンプトで JSON を要求しているので読める
      response_format: {
        type: "json_schema",
        json_schema: { name: req.schemaName, schema: req.schema, strict: true },
      },
      ...this.o.extraBody,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 120_000);
    try {
      const res = await f(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`ローカルLLM が HTTP ${res.status} を返しました: ${detail}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
      const choice = data.choices?.[0];
      const text = choice?.message?.content;
      if (!text) throw new Error("ローカルLLM の応答が空です(思考で max_tokens を使い切った可能性。LLM_EXTRA_BODY で思考オフを試してください)");
      return extractJson(text);
    } finally {
      clearTimeout(timer);
    }
  }
}

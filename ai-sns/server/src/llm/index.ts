import type { Env } from "../types";
import { AnthropicTransport } from "./anthropic";
import { MockLlmProvider } from "./mock";
import { OpenAiCompatTransport } from "./openaiCompat";
import { PromptedLlmProvider } from "./prompted";
import type { LlmProvider } from "./provider";

export type { LlmProvider } from "./provider";

type LlmEnv = Pick<
  Env,
  "LLM_PROVIDER" | "LLM_BASE_URL" | "LLM_MODEL" | "LLM_API_KEY" | "LLM_EXTRA_BODY" | "LLM_TIMEOUT_MS" | "ANTHROPIC_API_KEY"
>;

/** 環境変数 LLM_PROVIDER でプロバイダを切り替える(既定は mock)。設定ミスは分かりやすいエラーにする */
export function createLlmProvider(env: LlmEnv, fetchImpl?: typeof fetch): LlmProvider {
  const name = (env.LLM_PROVIDER ?? "mock").toLowerCase();
  switch (name) {
    case "mock":
      return new MockLlmProvider();

    // ローカルLLM。OpenAI互換APIを話すサーバーなら何でも使える(Ollama / LM Studio / llama.cpp / mlx-lm / vLLM …)
    case "local":
    case "ollama":
    case "lmstudio":
    case "openai-compat": {
      if (!env.LLM_MODEL) throw new Error(`LLM_PROVIDER=${name} には LLM_MODEL(モデル名)が必要です`);
      let extraBody: Record<string, unknown> | undefined;
      if (env.LLM_EXTRA_BODY) {
        try {
          extraBody = JSON.parse(env.LLM_EXTRA_BODY) as Record<string, unknown>;
        } catch {
          throw new Error("LLM_EXTRA_BODY が正しいJSONではありません");
        }
      }
      return new PromptedLlmProvider(
        new OpenAiCompatTransport({
          baseUrl: env.LLM_BASE_URL ?? "http://localhost:11434/v1",
          model: env.LLM_MODEL,
          apiKey: env.LLM_API_KEY,
          extraBody,
          timeoutMs: env.LLM_TIMEOUT_MS ? Number.parseInt(env.LLM_TIMEOUT_MS, 10) : undefined,
          fetchImpl,
        }),
      );
    }

    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=anthropic には ANTHROPIC_API_KEY が必要です");
      return new PromptedLlmProvider(
        new AnthropicTransport({ apiKey: env.ANTHROPIC_API_KEY, model: env.LLM_MODEL, fetchImpl }),
      );

    default:
      throw new Error(`未知の LLM_PROVIDER: ${name}`);
  }
}

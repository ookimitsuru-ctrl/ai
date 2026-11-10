import type { Env } from "../types";
import { MockLlmProvider } from "./mock";
import type { LlmProvider } from "./provider";

export type { LlmProvider } from "./provider";

/** 環境変数 LLM_PROVIDER でプロバイダを切り替える(既定は mock) */
export function createLlmProvider(env: Pick<Env, "LLM_PROVIDER">): LlmProvider {
  const name = env.LLM_PROVIDER ?? "mock";
  switch (name) {
    case "mock":
      return new MockLlmProvider();
    case "ollama":
    case "anthropic":
      throw new Error(`LLM_PROVIDER=${name} は未実装です(M3 で追加予定)。mock を使ってください`);
    default:
      throw new Error(`未知の LLM_PROVIDER: ${name}`);
  }
}

/**
 * LLM との通信だけを担当する層。プロンプトの中身や検証は知らない。
 * 実装を差し替えるだけで、ローカルLLM / Haiku を切り替えられる。
 */
export interface JsonRequest {
  system: string;
  user: string;
  /** 出力JSONのスキーマ */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
}

export interface JsonTransport {
  readonly name: string;
  /** JSON を返す。安全上の拒否・通信失敗・JSONでない出力は例外にする */
  completeJson(req: JsonRequest): Promise<unknown>;
}

export class LlmRefusalError extends Error {
  constructor(message = "LLM が安全上の理由で応答を拒否しました") {
    super(message);
    this.name = "LlmRefusalError";
  }
}

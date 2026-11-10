import type { Persona, TopicWeight } from "../types";

export interface ReplyTarget {
  persona: Persona;
  /** 今回の投稿でフォローしてきたか(フォローのお礼コメントを求める) */
  isNewFollower: boolean;
  /** このユーザーとの直近のやりとり(他ユーザーのデータは絶対に含めない) */
  recentExchanges: { userText: string; replyText: string }[];
}

export interface ReplyRequest {
  post: { id: string; body: string };
  topics: TopicWeight[];
  targets: ReplyTarget[];
}

export interface GeneratedReply {
  personaId: string;
  text: string;
  mood?: string;
}

/**
 * LLM の窓口。サーバーは必ずこのインターフェース越しに LLM を使う(SPEC §7.4)。
 * 実装: mock(M1) / ollama・anthropic(M3 で追加)
 */
export interface LlmProvider {
  readonly name: string;
  /** つぶやきから話題タグと重みを抽出する */
  analyzeTopics(body: string): Promise<TopicWeight[]>;
  /** 返信するペルソナ分の返信をまとめて生成する */
  generateReplies(req: ReplyRequest): Promise<GeneratedReply[]>;
}

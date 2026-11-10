import type { Persona, TopicWeight } from "../types";

export interface ReplyTarget {
  persona: Persona;
  /** 今回の投稿でフォローしてきたか(フォローのお礼コメントを求める) */
  isNewFollower: boolean;
  /** このユーザーとの直近のやりとり(他ユーザーのデータは絶対に含めない) */
  recentExchanges: { userText: string; replyText: string }[];
  /** 今回の返信の切り口(共感・質問・豆知識など)。毎回同じ調子にならないよう、返信ごとに変える */
  angle?: string;
  /** 最近のニュースの見出し。自然に触れられるときだけ、ひと言触れる(任意) */
  newsHint?: string;
  /** 相手に頼まれて、ネットで調べた結果(例: 人気のゲーム)。好みに合うものを選んで、自然に話す */
  lookup?: { label: string; items: string[] };
}

export interface ReplyRequest {
  /** post: ユーザーのつぶやきへの返信 / thread: ユーザーがフォロワーの返信に返信したことへの返事 */
  kind?: "post" | "thread";
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

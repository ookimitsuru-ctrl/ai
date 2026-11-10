import type { D1Migration } from "@cloudflare/vitest-plugin";

export interface Env {
  DB: D1Database;
  /** トークン署名用シークレット(必須) */
  TOKEN_SECRET: string;
  /** 管理API(招待コード発行)用。未設定なら管理APIは無効 */
  ADMIN_KEY?: string;
  /** mock | ollama | anthropic */
  LLM_PROVIDER?: string;
  /** テスト用 */
  TEST_MIGRATIONS?: D1Migration[];
}

/** topics.json の1件 */
export interface Topic {
  id: string;
  label: string;
  keywords: string[];
}

export type InterestLevel = "strong" | "mid" | "weak" | "dislike";
export type ReplyLength = "short" | "medium" | "long";

/** personas.json の1件(全ユーザー共通のマスタ) */
export interface Persona {
  id: string;
  name: string;
  handle: string;
  age: number;
  occupation: string;
  bio: string;
  personality: string[];
  interests: Record<InterestLevel, string[]>;
  theta: number;
  reaction: { likeRate: number; replyRate: number; replyLength: ReplyLength };
  speech: {
    firstPerson: string;
    formality: "casual" | "polite" | "mixed";
    dialect: string | null;
    endings: string[];
    catchphrases: string[];
    emoji: "none" | "low" | "mid" | "high";
    forbidden: string[];
    notes: string;
  };
  samples: string[];
}

export interface TopicWeight {
  tag: string;
  weight: number;
}

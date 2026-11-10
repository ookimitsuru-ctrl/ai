import type { D1Migration } from "@cloudflare/vitest-plugin";

export interface Env {
  DB: D1Database;
  /** トークン署名用シークレット(必須) */
  TOKEN_SECRET: string;
  /** 管理API(招待コード発行)用。未設定なら管理APIは無効 */
  ADMIN_KEY?: string;
  /** 1ユーザーの24時間あたり投稿上限(既定10) */
  DAILY_POST_LIMIT?: string;
  /** mock | local(ollama / lmstudio / openai-compat も同じ) | anthropic */
  LLM_PROVIDER?: string;
  /** local: OpenAI互換APIのベースURL(既定 http://localhost:11434/v1 = Ollama) */
  LLM_BASE_URL?: string;
  /** local: モデル名(必須) / anthropic: 既定 claude-haiku-5-5 */
  LLM_MODEL?: string;
  /** local: APIキーが必要なサーバー用(任意) */
  LLM_API_KEY?: string;
  /** local: リクエストに足す追加フィールドのJSON。例 {"chat_template_kwargs":{"enable_thinking":false}} */
  LLM_EXTRA_BODY?: string;
  /** local: 1リクエストのタイムアウト(ms、既定 120000) */
  LLM_TIMEOUT_MS?: string;
  /** anthropic: APIキー(シークレット。アプリには入れない) */
  ANTHROPIC_API_KEY?: string;
  /** async(既定): 投稿はすぐ返し、解析と返信生成は裏で行う / sync: 完了まで待つ(テスト・デバッグ用) */
  REPLY_MODE?: string;
  /** 処理中のまま、この時間(ms、既定 90000)を過ぎた投稿は、AI を使わない縮退運転で完了させる */
  STUCK_POST_MS?: string;
  /** true なら、会話で「おすすめ」「ないかな」と聞かれたとき、ネットで人気のものを調べて返事に使う(既定 false) */
  LOOKUP_ENABLED?: string;
  /** true なら、ニュースの見出しを取ってきて、返信の話題に使う(既定 false) */
  NEWS_ENABLED?: string;
  /** ニュースRSSのURL。{q} が検索語に置き換わる。既定は Google ニュースの検索RSS(日本語) */
  NEWS_RSS_URL?: string;
  /** ニュースを返信に使う確率(既定 0.35) */
  NEWS_USE_RATE?: string;
  /** 1ユーザーの24時間あたりスレッド発言上限(既定 30) */
  THREAD_DAILY_LIMIT?: string;
  /** リアクションが表示されるまでの最大遅延(ms、既定 180000。0なら即時) */
  REACTION_DELAY_MAX_MS?: string;
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

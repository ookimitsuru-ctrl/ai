import { analyzeByKeywords } from "../topics";
import type { TopicWeight } from "../types";
import type { GeneratedReply, LlmProvider, ReplyRequest } from "./provider";

/** 文字列→0以上の整数(同じ入力なら必ず同じ値。テストが毎回同じ結果になる) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * LLM を使わず、キーワード一致とペルソナのセリフ例だけで動くプロバイダ。
 * 無料・高速・結果が再現する。画面やフォロー判定の開発、自動テスト用。
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async analyzeTopics(body: string): Promise<TopicWeight[]> {
    return analyzeByKeywords(body);
  }

  async generateReplies(req: ReplyRequest): Promise<GeneratedReply[]> {
    return req.targets.map(({ persona, isNewFollower }) => {
      const sample = persona.samples[hash(`${req.post.id}:${persona.id}`) % persona.samples.length]!;
      const text = isNewFollower
        ? `フォローしました。${sample}`
        : sample;
      return { personaId: persona.id, text, mood: "mock" };
    });
  }
}

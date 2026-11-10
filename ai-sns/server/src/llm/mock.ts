import { hashString } from "../rng";
import { analyzeByKeywords } from "../topics";
import type { TopicWeight } from "../types";
import type { GeneratedReply, LlmProvider, ReplyRequest } from "./provider";

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
      const sample = persona.samples[hashString(`${req.post.id}:${persona.id}`) % persona.samples.length]!;
      const text = isNewFollower
        ? `フォローしました。${sample}`
        : sample;
      return { personaId: persona.id, text, mood: "mock" };
    });
  }
}

import { TOPIC_BY_ID } from "../data";
import { analyzeByKeywords } from "../topics";
import type { TopicWeight } from "../types";
import { REPLIES_SCHEMA_NAME, TOPICS_SCHEMA_NAME, repliesSchema, topicsSchema } from "./schemas";
import { REPLIES_SYSTEM, TOPICS_SYSTEM, repliesUser, topicsUser } from "./prompts";
import type { GeneratedReply, LlmProvider, ReplyRequest, ReplyTarget } from "./provider";
import type { JsonTransport } from "./transport";
import { isVerbatimSample, verifyReply } from "./verify";

/** 返信が基準を満たさないときの再生成回数(SPEC §5.5: 最大2回) */
const MAX_RETRIES = 2;

export interface ReplyDiagnostics {
  personaId: string;
  attempts: number;
  /** 最終的に採用した返信の由来 */
  source: "llm" | "sample";
  /** 却下された試行の理由(調整・デバッグ用) */
  rejected: string[];
}

/**
 * プロンプトと検証を担当する LlmProvider。通信は JsonTransport(ローカルLLM / Claude)に任せる。
 */
export class PromptedLlmProvider implements LlmProvider {
  readonly name: string;
  /** 直近の generateReplies の診断情報(try-llm スクリプトや調整用) */
  lastDiagnostics: ReplyDiagnostics[] = [];

  constructor(private readonly transport: JsonTransport) {
    this.name = transport.name;
  }

  async analyzeTopics(body: string): Promise<TopicWeight[]> {
    const raw = await this.transport.completeJson({
      system: TOPICS_SYSTEM,
      user: topicsUser(body),
      schema: topicsSchema(),
      schemaName: TOPICS_SCHEMA_NAME,
      maxTokens: 2000,
    });
    const parsed = parseTopics(raw);
    // 空・不正ならキーワード一致で補う(話題が取れないことでフォロー判定が止まらないように)
    return parsed.length > 0 ? parsed : analyzeByKeywords(body);
  }

  async generateReplies(req: ReplyRequest): Promise<GeneratedReply[]> {
    const done = new Map<string, GeneratedReply>();
    const diag = new Map<string, ReplyDiagnostics>(
      req.targets.map((t) => [t.persona.id, { personaId: t.persona.id, attempts: 0, source: "llm", rejected: [] }]),
    );
    let pending: ReplyTarget[] = req.targets;

    for (let attempt = 0; attempt <= MAX_RETRIES && pending.length > 0; attempt++) {
      const raw = await this.transport.completeJson({
        system: REPLIES_SYSTEM,
        user: repliesUser({ ...req, targets: pending }),
        schema: repliesSchema(pending.map((t) => t.persona.id)),
        schemaName: REPLIES_SCHEMA_NAME,
        maxTokens: 4000,
      });
      const got = parseReplies(raw);
      const next: ReplyTarget[] = [];
      for (const target of pending) {
        const d = diag.get(target.persona.id)!;
        d.attempts += 1;
        const text = got.get(target.persona.id)?.trim();
        const problem = text
          ? (verifyReply(target.persona, text, req.post.body) ??
            (isVerbatimSample(target.persona, text) ? "セリフ例の丸写し" : null))
          : "返信が返ってこなかった";
        if (!problem && text) {
          done.set(target.persona.id, { personaId: target.persona.id, text });
        } else {
          d.rejected.push(problem ?? "不明");
          next.push(target);
        }
      }
      pending = next;
    }

    // それでも基準を満たさない人は、キャラのセリフ例で代用する(返信ゼロにはしない)
    for (const target of pending) {
      const d = diag.get(target.persona.id)!;
      d.source = "sample";
      const sample = target.persona.samples[0]!;
      done.set(target.persona.id, {
        personaId: target.persona.id,
        text: target.isNewFollower ? `フォローしました。${sample}` : sample,
        mood: "fallback",
      });
    }

    this.lastDiagnostics = req.targets.map((t) => diag.get(t.persona.id)!);
    return req.targets.map((t) => done.get(t.persona.id)!);
  }
}

function parseTopics(raw: unknown): TopicWeight[] {
  const list = (raw as { topics?: unknown })?.topics;
  if (!Array.isArray(list)) return [];
  const merged = new Map<string, number>();
  for (const item of list) {
    const tag = (item as { tag?: unknown })?.tag;
    const weight = Number((item as { weight?: unknown })?.weight);
    if (typeof tag === "string" && TOPIC_BY_ID.has(tag) && Number.isFinite(weight) && weight > 0) {
      merged.set(tag, (merged.get(tag) ?? 0) + weight);
    }
  }
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const total = top.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return [];
  return top.map(([tag, w]) => ({ tag, weight: Math.round((w / total) * 100) / 100 }));
}

function parseReplies(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const list = (raw as { replies?: unknown })?.replies;
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    const id = (item as { personaId?: unknown })?.personaId;
    const text = (item as { text?: unknown })?.text;
    if (typeof id === "string" && typeof text === "string" && !out.has(id)) out.set(id, text);
  }
  return out;
}

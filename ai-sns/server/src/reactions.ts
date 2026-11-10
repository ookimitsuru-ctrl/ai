import { DEFAULT_FOLLOW_CONFIG, computeAffinity } from "./follow";
import type { Persona, TopicWeight } from "./types";

export interface ReactionConfig {
  /** 親和度がこの値で「返信/いいねの確率が最大(各ペルソナの率どおり)」になる */
  replyAffinityFull: number;
  likeAffinityFull: number;
  /** ひとめぼれ(strongが中心)のときの返信確率 */
  hookReplyProbability: number;
  hookWeight: number;
  /** 1投稿あたりの返信の最大数(画面とLLM費用を抑える) */
  maxReplies: number;
}

export const DEFAULT_REACTION_CONFIG: ReactionConfig = {
  replyAffinityFull: 0.8,
  likeAffinityFull: 0.5,
  hookReplyProbability: 0.9,
  hookWeight: 0.5,
  maxReplies: 5,
};

export type ReactionKind = "reply" | "like";
export interface ReactionDecision {
  personaId: string;
  kind: ReactionKind;
  isNewFollower: boolean;
  affinity: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * フォロー済みの全員(今回の新規フォロワー含む)について 無視 / いいね / 返信 を決める(SPEC §5.4)。
 * - 親和度が0以下なら反応しない(フォロワーが外れることはない)
 * - 新規フォロワーは必ず返信する(フォローの一言)
 * - 返信は親和度の高い順に最大 maxReplies 件。あふれた分はいいねに落とす
 * - 乱数は randFor(キー) をシード付きで渡す(再現性)
 */
export function decideReactions(args: {
  followers: { persona: Persona; isNewFollower: boolean }[];
  topics: TopicWeight[];
  randFor: (key: string) => number;
  cfg?: ReactionConfig;
}): ReactionDecision[] {
  const cfg = args.cfg ?? DEFAULT_REACTION_CONFIG;
  const picked: ReactionDecision[] = [];

  for (const { persona, isNewFollower } of args.followers) {
    const affinity = computeAffinity(persona, args.topics, DEFAULT_FOLLOW_CONFIG);
    if (isNewFollower) {
      picked.push({ personaId: persona.id, kind: "reply", isNewFollower, affinity });
      continue;
    }
    if (affinity <= 0) continue;

    const strongWeight = args.topics.reduce((s, t) => s + (persona.interests.strong.includes(t.tag) ? t.weight : 0), 0);
    let replyP = persona.reaction.replyRate * clamp01(affinity / cfg.replyAffinityFull);
    if (strongWeight >= cfg.hookWeight) replyP = Math.max(replyP, cfg.hookReplyProbability);
    const likeP = persona.reaction.likeRate * clamp01(affinity / cfg.likeAffinityFull);

    if (args.randFor(`reply:${persona.id}`) < replyP) {
      picked.push({ personaId: persona.id, kind: "reply", isNewFollower, affinity });
    } else if (args.randFor(`like:${persona.id}`) < likeP) {
      picked.push({ personaId: persona.id, kind: "like", isNewFollower, affinity });
    }
  }

  // 返信の上限。新規フォロワーを優先し、次に親和度の高い順。あふれた分はいいね
  const replies = picked
    .filter((d) => d.kind === "reply")
    .sort((a, b) => Number(b.isNewFollower) - Number(a.isNewFollower) || b.affinity - a.affinity);
  const overflow = new Set(replies.slice(cfg.maxReplies).map((d) => d.personaId));
  return picked.map((d) => (overflow.has(d.personaId) ? { ...d, kind: "like" as const } : d));
}

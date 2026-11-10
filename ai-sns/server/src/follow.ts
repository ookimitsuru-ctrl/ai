import type { InterestLevel, Persona, TopicWeight } from "./types";

/**
 * フォロー判定のパラメータ(SPEC §5.3)。増え方の調整はここだけ触ればよい。
 * `npm run sim` で、変更した結果を AI を使わずに確認できる。
 */
export interface FollowConfig {
  /** シグモイドの急さ。大きいほど「θを超えるか」で白黒がはっきりする */
  slope: number;
  /** θに足す下駄。大きいほど「少し興味がある」程度ではフォローしにくくなる */
  thresholdShift: number;
  /** 関心レベルごとの値 */
  interestValue: Record<InterestLevel, number>;
  /** strong な話題が重みこの値以上で含まれたら「ひとめぼれ」扱い */
  hookWeight: number;
  /** ひとめぼれのときの最低フォロー確率(ペース係数をかけた後の実効値) */
  hookProbability: number;
  /** 全体のペース係数(1未満にすると全体的にゆっくり増える。合っていても最大でこの確率) */
  pace: number;
  /** 現在のフォロワー1人あたりの上乗せ(人気の人にはフォローしやすい演出) */
  popularityPerFollower: number;
  /** 上乗せの上限 */
  popularityMax: number;
  /** フォロー確率の上限(どんなに合っても確定にはしない) */
  maxProbability: number;
  /** 1投稿で増える人数の上限 */
  maxPerPost: number;
}

export const DEFAULT_FOLLOW_CONFIG: FollowConfig = {
  slope: 10,
  thresholdShift: 0.2,
  interestValue: { strong: 1.0, mid: 0.5, weak: 0.2, dislike: -0.5 },
  hookWeight: 0.5,
  hookProbability: 0.55,
  pace: 0.6,
  popularityPerFollower: 0.01,
  popularityMax: 0.1,
  maxProbability: 0.95,
  maxPerPost: 3,
};

export interface FollowDecision {
  personaId: string;
  affinity: number;
  probability: number;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

function levelOf(p: Persona, tag: string): InterestLevel | null {
  for (const level of ["strong", "mid", "weak", "dislike"] as const) {
    if (p.interests[level].includes(tag)) return level;
  }
  return null;
}

/** 親和度 = Σ(投稿の話題の重み × そのペルソナの関心値)。未設定の話題は0 */
export function computeAffinity(p: Persona, topics: TopicWeight[], cfg: FollowConfig = DEFAULT_FOLLOW_CONFIG): number {
  let sum = 0;
  for (const t of topics) {
    const level = levelOf(p, t.tag);
    if (level) sum += t.weight * cfg.interestValue[level];
  }
  return sum;
}

/** フォロー確率。親和度が0以下(関心なし・苦手)なら必ず0 */
export function followProbability(
  p: Persona,
  topics: TopicWeight[],
  currentFollowerCount: number,
  cfg: FollowConfig = DEFAULT_FOLLOW_CONFIG,
): { affinity: number; probability: number } {
  const affinity = computeAffinity(p, topics, cfg);
  if (affinity <= 0) return { affinity, probability: 0 };

  let prob = cfg.pace * sigmoid(cfg.slope * (affinity - (p.theta + cfg.thresholdShift)));
  const strongWeight = topics.reduce((s, t) => s + (levelOf(p, t.tag) === "strong" ? t.weight : 0), 0);
  if (strongWeight >= cfg.hookWeight) prob = Math.max(prob, cfg.hookProbability);
  prob += Math.min(cfg.popularityMax, cfg.popularityPerFollower * currentFollowerCount);
  return { affinity, probability: Math.min(cfg.maxProbability, prob) };
}

/**
 * 未フォローのペルソナの中から、今回の投稿でフォローしてくる人を決める。
 * - 各候補を確率で当落判定し、当選者のうち親和度が高い順に最大 maxPerPost 人
 * - randFor(personaId) は呼び出し側がシード付きで渡す(投稿ID+ペルソナIDから決まる値にすると、
 *   同じ投稿なら同じ結果になり、他の人が既にフォロー済みでも各人の当落は変わらない)
 * - 他ユーザーの状況は一切参照しない(SPEC §3.6)
 */
export function decideFollows(args: {
  candidates: Persona[];
  topics: TopicWeight[];
  currentFollowerCount: number;
  randFor: (personaId: string) => number;
  cfg?: FollowConfig;
}): FollowDecision[] {
  const cfg = args.cfg ?? DEFAULT_FOLLOW_CONFIG;
  const winners: FollowDecision[] = [];
  for (const p of args.candidates) {
    const { affinity, probability } = followProbability(p, args.topics, args.currentFollowerCount, cfg);
    const r = args.randFor(p.id);
    if (probability > 0 && r < probability) winners.push({ personaId: p.id, affinity, probability });
  }
  winners.sort((a, b) => b.affinity - a.affinity);
  return winners.slice(0, cfg.maxPerPost);
}

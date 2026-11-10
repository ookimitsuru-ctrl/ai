import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID, PERSONAS } from "../src/data";
import { computeAffinity, DEFAULT_FOLLOW_CONFIG, decideFollows, followProbability } from "../src/follow";
import { randomFor } from "../src/rng";

const p = (id: string) => PERSONA_BY_ID.get(id)!;

describe("親和度", () => {
  it("話題の重み × 関心値の合計になる", () => {
    // ケンジ: running=strong(1.0), sleep=mid(0.5)
    const a = computeAffinity(p("kenji_run"), [
      { tag: "running", weight: 0.6 },
      { tag: "sleep", weight: 0.4 },
    ]);
    expect(a).toBeCloseTo(0.6 * 1.0 + 0.4 * 0.5);
  });

  it("苦手(dislike)な話題は親和度を下げ、関心のない話題は0", () => {
    expect(computeAffinity(p("kenji_run"), [{ tag: "complaint", weight: 1 }])).toBeCloseTo(-0.5);
    expect(computeAffinity(p("kenji_run"), [{ tag: "philosophy", weight: 1 }])).toBe(0);
  });
});

describe("フォロー確率", () => {
  it("親和度が0以下なら、フォロワーが何人いても確率0", () => {
    expect(followProbability(p("kenji_run"), [{ tag: "philosophy", weight: 1 }], 19).probability).toBe(0);
    expect(followProbability(p("kenji_run"), [{ tag: "complaint", weight: 1 }], 19).probability).toBe(0);
  });

  it("strong の話題が中心ならひとめぼれ(高確率)、weak だけなら低確率", () => {
    const hook = followProbability(p("kenji_run"), [{ tag: "running", weight: 1 }], 0).probability;
    const weak = followProbability(p("kenji_run"), [{ tag: "travel", weight: 1 }], 0).probability;
    expect(hook).toBeGreaterThanOrEqual(DEFAULT_FOLLOW_CONFIG.hookProbability - 1e-9);
    expect(weak).toBeLessThan(0.1);
    expect(hook).toBeGreaterThan(weak);
  });

  it("気難しい(θが高い)人ほど、同じ話題でもフォローしにくい", () => {
    // 同じ mid 関心(0.5)の話題で比較: トオル(θ0.55) < リク(θ0.25)
    const topics = [{ tag: "anime", weight: 1 }]; // リク: mid
    const toru = { ...p("toru_philo"), interests: { ...p("toru_philo").interests, strong: [], mid: ["anime"] } };
    const riku = p("riku_game");
    expect(followProbability(toru, topics, 0).probability).toBeLessThan(followProbability(riku, topics, 0).probability);
  });

  it("フォロワーが多いほど少しだけ上がるが、上限を超えない", () => {
    const t = [{ tag: "travel", weight: 1 }];
    const few = followProbability(p("kenji_run"), t, 0).probability;
    const many = followProbability(p("kenji_run"), t, 15).probability;
    expect(many).toBeGreaterThan(few);
    expect(many - few).toBeLessThanOrEqual(DEFAULT_FOLLOW_CONFIG.popularityMax + 1e-9);
    expect(followProbability(p("kenji_run"), [{ tag: "running", weight: 1 }], 50).probability).toBeLessThanOrEqual(
      DEFAULT_FOLLOW_CONFIG.maxProbability,
    );
  });
});

describe("フォロー判定", () => {
  const topics = [{ tag: "running", weight: 1 }];

  it("同じ投稿IDなら同じ結果(再現できる)", () => {
    const run = () =>
      decideFollows({ candidates: PERSONAS, topics, currentFollowerCount: 0, randFor: (id) => randomFor("post-A", id) });
    expect(run()).toEqual(run());
  });

  it("乱数が最小(必ず当選)でも、関心のない人はフォローしない", () => {
    const r = decideFollows({ candidates: PERSONAS, topics, currentFollowerCount: 0, randFor: () => 0 });
    const ids = r.map((d) => d.personaId);
    expect(ids).toContain("kenji_run");
    expect(ids).not.toContain("miyu_cafe"); // running に関心なし
    expect(ids).not.toContain("toru_philo");
  });

  it("1投稿で増えるのは最大3人。親和度の高い順に採用", () => {
    // どの話題でも当選させ、関心のある人が3人超いる話題で確認
    const many = [
      { tag: "running", weight: 0.3 },
      { tag: "workout", weight: 0.3 },
      { tag: "health", weight: 0.4 },
    ];
    const r = decideFollows({ candidates: PERSONAS, topics: many, currentFollowerCount: 0, randFor: () => 0 });
    expect(r.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.affinity).toBeGreaterThanOrEqual(r[i]!.affinity);
  });

  it("乱数が最大(1未満)なら誰もフォローしない", () => {
    const r = decideFollows({ candidates: PERSONAS, topics, currentFollowerCount: 0, randFor: () => 0.999999 });
    expect(r).toEqual([]);
  });

  it("他の人が既にフォロー済みでも、残りの人の当落は変わらない", () => {
    const all = decideFollows({ candidates: PERSONAS, topics, currentFollowerCount: 0, randFor: (id) => randomFor("p1", id) });
    const without = decideFollows({
      candidates: PERSONAS.filter((x) => x.id !== "kenji_run"),
      topics,
      currentFollowerCount: 0,
      randFor: (id) => randomFor("p1", id),
    });
    expect(all.filter((d) => d.personaId !== "kenji_run")).toEqual(without);
  });
});

import { describe, expect, it } from "vitest";
import { ANGLES, angleFor, assignAngles } from "../src/angles";
import { PERSONAS } from "../src/data";
import { repliesUser } from "../src/llm/prompts";

describe("返信の切り口", () => {
  it("同じ投稿・同じ人なら同じ切り口(やり直しても変わらない)", () => {
    expect(angleFor("p1", "kenji_run")).toBe(angleFor("p1", "kenji_run"));
    expect(assignAngles("p1", ["a", "b", "c"])).toEqual(assignAngles("p1", ["a", "b", "c"]));
  });

  it("同時に返信する人には、できるだけ別々の切り口を割り当てる(8人まで全員別)", () => {
    for (const post of ["p1", "p2", "p3", "p4", "p5"]) {
      const ids = PERSONAS.slice(0, ANGLES.length).map((p) => p.id);
      const m = assignAngles(post, ids);
      expect(new Set(m.values()).size).toBe(ids.length);
    }
  });

  it("人数が切り口より多くても、割り当てられる(重複は許す)", () => {
    const m = assignAngles("p1", PERSONAS.map((p) => p.id));
    expect(m.size).toBe(PERSONAS.length);
  });

  it("投稿が変わると、同じ人でも切り口が変わる(毎回同じ調子にならない)", () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => angleFor(`post-${i}`, "kenji_run")));
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });

  it("切り口・ニュース見出しがプロンプトに入る。無ければ入らない", () => {
    const base = { post: { id: "p", body: "走った" }, topics: [] };
    const withBoth = repliesUser({ ...base, targets: [{ persona: PERSONAS[0]!, isNewFollower: false, recentExchanges: [], angle: "ひとつ、相手に質問を返す", newsHint: "マラソン大会が開催へ" }] });
    expect(withBoth).toContain("今回の切り口: ひとつ、相手に質問を返す");
    expect(withBoth).toContain("最近のニュース見出し(任意): 「マラソン大会が開催へ」");
    const without = repliesUser({ ...base, targets: [{ persona: PERSONAS[0]!, isNewFollower: false, recentExchanges: [] }] });
    expect(without).not.toContain("今回の切り口");
    expect(without).not.toContain("ニュース見出し");
  });
});

describe("調べた結果のプロンプト", () => {
  it("調べた結果と使い方の指示が入る。結果が空なら入らない", () => {
    const t = { persona: PERSONAS[0]!, isNewFollower: false, recentExchanges: [] };
    const base = { post: { id: "p", body: "面白いゲームないかな" }, topics: [] };
    const u = repliesUser({ ...base, targets: [{ ...t, lookup: { label: "いま人気のゲーム(Steamの売れ筋)", items: ["A", "B", "C"] } }] });
    expect(u).toContain("調べた結果(いま人気のゲーム(Steamの売れ筋)): A / B / C");
    expect(repliesUser({ ...base, targets: [{ ...t, lookup: { label: "x", items: [] } }] })).not.toContain("調べた結果");
  });
});

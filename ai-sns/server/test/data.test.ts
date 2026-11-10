import { describe, expect, it } from "vitest";
import { PERSONAS, TOPICS } from "../src/data";
import { analyzeByKeywords } from "../src/topics";
import { validateMasterData } from "../src/validate";

describe("マスタデータ", () => {
  it("personas.json / topics.json の整合性に問題がない", () => {
    expect(validateMasterData(PERSONAS, TOPICS)).toEqual([]);
  });

  it("validate が不整合を検出できる(壊したデータで確認)", () => {
    const broken = structuredClone(PERSONAS);
    broken[0]!.interests.strong = ["no_such_tag"];
    broken[1]!.samples = ["1つだけ"];
    const errors = validateMasterData(broken, TOPICS);
    expect(errors.some((e) => e.includes("no_such_tag"))).toBe(true);
    expect(errors.some((e) => e.includes("samples"))).toBe(true);
  });
});

describe("キーワード話題解析(縮退運転)", () => {
  it("料理と節約の話題を拾い、重みの合計が約1になる", () => {
    const r = analyzeByKeywords("今日は節約レシピで自炊した");
    const tags = r.map((x) => x.tag);
    expect(tags).toContain("saving");
    expect(tags).toContain("cooking");
    expect(r.reduce((s, x) => s + x.weight, 0)).toBeGreaterThan(0.95);
    expect(r.reduce((s, x) => s + x.weight, 0)).toBeLessThan(1.05);
  });

  it("何も当たらなければ「日常の雑談」", () => {
    expect(analyzeByKeywords("あ")).toEqual([{ tag: "daily", weight: 1 }]);
  });

  it("最大3件まで", () => {
    expect(analyzeByKeywords("走って筋トレして料理して猫と散歩して映画を観た").length).toBeLessThanOrEqual(3);
  });
});

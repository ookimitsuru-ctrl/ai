import { describe, expect, it } from "vitest";
import { PERSONAS, PERSONA_BY_ID } from "../src/data";
import { decideReactions } from "../src/reactions";
import { randomFor } from "../src/rng";

const f = (id: string, isNewFollower = false) => ({ persona: PERSONA_BY_ID.get(id)!, isNewFollower });
const run = (followers: ReturnType<typeof f>[], topics: { tag: string; weight: number }[], r = (k: string) => randomFor("post", k)) =>
  decideReactions({ followers, topics, randFor: r });

describe("リアクション判定", () => {
  const running = [{ tag: "running", weight: 1 }];

  it("関心のない話題には反応しない(フォロワーは外れないが、無視はする)", () => {
    expect(run([f("miyu_cafe")], running, () => 0)).toEqual([]);
    expect(run([f("kenji_run")], [{ tag: "complaint", weight: 1 }], () => 0)).toEqual([]);
  });

  it("strong が中心の話題はほぼ確実に返信、乱数が大きければ無視/いいねに落ちる", () => {
    expect(run([f("kenji_run")], running, () => 0.5).map((d) => d.kind)).toEqual(["reply"]);
    expect(run([f("kenji_run")], running, () => 0.999999)).toEqual([]);
  });

  it("新規フォロワーは話題や乱数に関係なく必ず返信する", () => {
    const r = run([f("miyu_cafe", true)], running, () => 0.999999);
    expect(r).toEqual([expect.objectContaining({ personaId: "miyu_cafe", kind: "reply", isNewFollower: true })]);
  });

  it("返信は最大5件。新規フォロワー優先、あふれた分はいいねになる", () => {
    const many = [f("kenji_run"), f("take_sports"), f("sho_diy"), f("sakura_cook"), f("yuki_night"), f("yuta_fin"), f("miyu_cafe", true)];
    const topics = [{ tag: "running", weight: 0.3 }, { tag: "health", weight: 0.3 }, { tag: "cooking", weight: 0.2 }, { tag: "sleep", weight: 0.2 }];
    const r = run(many, topics, () => 0);
    const replies = r.filter((d) => d.kind === "reply");
    expect(replies.length).toBeLessThanOrEqual(5);
    expect(replies.some((d) => d.personaId === "miyu_cafe")).toBe(true); // 新規は必ず残る
    expect(r.length).toBe(new Set(r.map((d) => d.personaId)).size); // 1人1反応
  });

  it("同じ投稿IDなら同じ結果", () => {
    const all = PERSONAS.map((p) => ({ persona: p, isNewFollower: false }));
    const a = run(all, running);
    expect(run(all, running)).toEqual(a);
  });
});

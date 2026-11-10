import { describe, expect, it } from "vitest";
import { PERSONA_BY_ID, PERSONAS } from "../src/data";
import { verifyReply } from "../src/llm/verify";

const p = (id: string) => PERSONA_BY_ID.get(id)!;

describe("返信の検証", () => {
  it("20人全員のセリフ例は、自分の検証を通る(検証が厳しすぎないことの確認)", () => {
    for (const persona of PERSONAS) {
      for (const s of persona.samples) expect(verifyReply(persona, s), `${persona.id}: ${s}`).toBeNull();
    }
  });

  it("空・長すぎる返信は不可(短文キャラは短く)", () => {
    expect(verifyReply(p("sho_diy"), "   ")).toMatch(/空/);
    expect(verifyReply(p("sho_diy"), "あ".repeat(71))).toMatch(/長すぎ/);
    expect(verifyReply(p("toru_philo"), "あ".repeat(71))).toBeNull(); // 長文キャラは許容
  });

  it("絵文字を使わないキャラの絵文字は不可", () => {
    expect(verifyReply(p("oyaji_masao"), "いいなあ😊")).toMatch(/絵文字/);
    expect(verifyReply(p("miyu_cafe"), "素敵ですぅ☕✨")).toBeNull();
  });

  it("一人称の取り違えを検出する(私/わたしは同じ扱い)", () => {
    expect(verifyReply(p("kenji_run"), "僕も走りたいっす")).toMatch(/一人称/); // ケンジは「俺」
    expect(verifyReply(p("kenji_run"), "俺も走りたいっす")).toBeNull();
    expect(verifyReply(p("miyu_cafe"), "私も好きですぅ")).toBeNull(); // わたし≡私
    expect(verifyReply(p("hana_books"), "俺は好きです")).toMatch(/一人称/);
  });

  it("キャラ崩れ(AI言及)と他ユーザーへの言及を検出する", () => {
    expect(verifyReply(p("hana_books"), "AIとしてお答えします")).toMatch(/キャラを崩す/);
    expect(verifyReply(p("hana_books"), "他の人もそう言っていました")).toMatch(/他のユーザー/);
  });

  it("つぶやき自体がAIの話題なら、AIという語は許容する", () => {
    expect(verifyReply(p("dai_dev"), "AIの話、気になるな", "最近AIの勉強をしてる")).toBeNull();
  });
});

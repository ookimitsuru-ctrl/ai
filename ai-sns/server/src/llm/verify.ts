import type { Persona, ReplyLength } from "../types";

const MAX_CHARS: Record<ReplyLength, number> = { short: 70, medium: 140, long: 240 };

// 一人称の同義グループ。ペルソナと違うグループが混ざったらキャラ崩れ(私/わたし、俺/おれ、僕/ぼく は同じ扱い)
const FIRST_PERSON_GROUPS: string[][] = [["私", "わたし"], ["俺", "おれ"], ["僕", "ぼく"], ["あたし"], ["わたくし"]];

// キャラ崩れ(AI言及)。つぶやき本文にその語があるときは話題として自然なので対象外にする
const META_TERMS = ["AI", "人工知能", "言語モデル", "LLM", "ChatGPT", "Claude", "プロンプト", "システムプロンプト", "キャラ設定"];
// 他ユーザーへの言及(SPEC §3.6)
const OTHER_USER = /(他|ほか)の(人|ユーザー|方々?|フォロワー)|別のユーザー|他のみんな|他の皆/;
// 現実で会う・一緒に何かする誘い(フォロワーは「SNSで見かけただけのよく知らない人」。リアルの友達ではない)
const MEETUP =
  /会おう|会いましょう|会いたい|会えたら|遊ぼう|遊びましょう|オフ会|一緒に(行こう|行きましょう|行きたい|やろう|やりましょう|飲もう|飲みましょう|食べよう|食べに|考えよう|考えたい|考えましょう|セッション)|今度(会|遊|飲|ご飯|一緒|セッション|やろ|行こ)/;
const EMOJI = /\p{Extended_Pictographic}/u;

function ownGroup(p: Persona): string[] | undefined {
  return FIRST_PERSON_GROUPS.find((g) => g.includes(p.speech.firstPerson));
}

/** 問題があれば人が読める理由を返す。問題なければ null。再生成の判断に使う */
export function verifyReply(persona: Persona, text: string, postBody = ""): string | null {
  const t = text.trim();
  if (t.length === 0) return "空の返信";
  const limit = MAX_CHARS[persona.reaction.replyLength];
  const len = [...t].length;
  if (len > limit) return `長すぎる(${len}字 > ${limit}字)`;

  if (persona.speech.emoji === "none" && EMOJI.test(t)) return "絵文字を使わないキャラが絵文字を使っている";

  const own = ownGroup(persona);
  if (own) {
    for (const g of FIRST_PERSON_GROUPS) {
      if (g === own) continue;
      const hit = g.find((w) => t.includes(w));
      // 「僕」を含む「ぼくたち」など他グループ語の誤検出を避けるため、自分の語が含まれていれば許容
      if (hit && !own.some((w) => t.includes(w))) return `一人称が違う(「${hit}」。本来は「${persona.speech.firstPerson}」)`;
    }
  }

  const meta = META_TERMS.find((w) => t.includes(w) && !postBody.includes(w));
  if (meta) return `キャラを崩す語「${meta}」が含まれている`;
  if (OTHER_USER.test(t)) return "他のユーザーに言及している";
  if (MEETUP.test(t)) return "現実で会う誘いをしている(よく知らない人との距離感に合わない)";
  return null;
}

/** 句読点・記号・空白を除いて比べるための正規化 */
const normalize = (t: string) => t.replace(/[\s、。,.!?!?~〜…・「」]/gu, "");

/**
 * 返信がセリフ例の完全な丸写しか。口癖の一部を使うのは許容し、文全体が同じ場合だけ true。
 * (毎回同じ文が出ると、すぐ飽きられるため。再生成の対象にする)
 */
export function isVerbatimSample(persona: Persona, text: string): boolean {
  const t = normalize(text);
  return t.length > 0 && persona.samples.some((s) => normalize(s) === t);
}

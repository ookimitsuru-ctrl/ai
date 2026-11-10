import { hashString } from "./rng";

/**
 * 返信の「切り口」。同じつぶやきに何人もが返信しても、毎回同じ調子(「いいですね!〜」)にならないよう、
 * 返信ごとに別の切り口を指定する。投稿ID+ペルソナIDから決まるので、やり直しても同じ。
 */
export const ANGLES = [
  "共感して、相手の気持ちを受け止める",
  "ひとつ、相手に質問を返す",
  "自分の体験や好みを、ひと言添える",
  "関連するちょっとした豆知識や雑学を添える",
  "軽くツッコミや冗談を入れる",
  "励ましや応援の言葉をかける",
  "具体的な提案や、ゆるい誘いをする",
  "素直な感想や驚きを伝える",
] as const;

export function angleFor(postId: string, personaId: string): string {
  return ANGLES[hashString(`angle:${postId}:${personaId}`) % ANGLES.length]!;
}

/** 同時に返信する複数人に、できるだけ別々の切り口を割り当てる(同じ切り口が重なりにくくする) */
export function assignAngles(postId: string, personaIds: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const id of personaIds) {
    const start = hashString(`angle:${postId}:${id}`) % ANGLES.length;
    let pick = ANGLES[start]!;
    for (let i = 0; i < ANGLES.length; i++) {
      const cand = ANGLES[(start + i) % ANGLES.length]!;
      if (!used.has(cand)) {
        pick = cand;
        break;
      }
    }
    used.add(pick);
    out.set(id, pick);
  }
  return out;
}

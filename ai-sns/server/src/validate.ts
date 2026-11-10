import type { Persona, Topic } from "./types";

/**
 * マスタ(personas.json / topics.json)の整合性チェック。
 * 問題があれば人が読めるエラー文字列の配列を返す(空なら正常)。
 */
export function validateMasterData(personas: Persona[], topics: Topic[]): string[] {
  const errors: string[] = [];
  const topicIds = new Set(topics.map((t) => t.id));

  if (topicIds.size !== topics.length) errors.push("topics: id が重複しています");
  if (personas.length !== 20) errors.push(`personas: 20人のはずが ${personas.length} 人です`);

  const ids = new Set<string>();
  const handles = new Set<string>();
  for (const p of personas) {
    if (ids.has(p.id)) errors.push(`${p.id}: id が重複しています`);
    if (handles.has(p.handle)) errors.push(`${p.id}: handle が重複しています`);
    ids.add(p.id);
    handles.add(p.handle);

    if (p.samples.length < 3 || p.samples.length > 5) {
      errors.push(`${p.id}: samples は3〜5個(現在 ${p.samples.length})`);
    }
    if (p.interests.strong.length === 0) errors.push(`${p.id}: strong が空です`);
    if (!(p.theta >= 0 && p.theta <= 1)) errors.push(`${p.id}: theta は0〜1`);
    for (const [k, v] of Object.entries(p.reaction)) {
      if (typeof v === "number" && !(v >= 0 && v <= 1)) errors.push(`${p.id}: reaction.${k} は0〜1`);
    }
    const seen = new Set<string>();
    for (const level of ["strong", "mid", "weak", "dislike"] as const) {
      for (const tag of p.interests[level]) {
        if (!topicIds.has(tag)) errors.push(`${p.id}: 未定義の話題タグ "${tag}" (${level})`);
        if (seen.has(tag)) errors.push(`${p.id}: タグ "${tag}" が複数レベルに重複`);
        seen.add(tag);
      }
    }
  }

  // どの話題を書き込んでも、誰かが strong/mid で拾えること(誰にも届かない話題を作らない)
  for (const t of topics) {
    const covered = personas.some(
      (p) => p.interests.strong.includes(t.id) || p.interests.mid.includes(t.id),
    );
    if (!covered) errors.push(`topics: "${t.id}" を strong/mid に持つペルソナがいません`);
  }
  return errors;
}

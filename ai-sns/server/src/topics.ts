import { TOPICS } from "./data";
import type { Topic, TopicWeight } from "./types";

/**
 * キーワード一致による話題解析。
 * LLM が使えないとき(mock・障害・予算超過)の縮退運転として使う(SPEC §5.2)。
 * 重みは合計1になるよう正規化し、上位3件までに絞る。何も当たらなければ「日常の雑談」。
 */
export function analyzeByKeywords(body: string, topics: Topic[] = TOPICS): TopicWeight[] {
  const scores: TopicWeight[] = [];
  for (const t of topics) {
    let hits = 0;
    for (const kw of t.keywords) {
      if (kw && body.includes(kw)) hits += 1;
    }
    if (hits > 0) scores.push({ tag: t.id, weight: hits });
  }
  if (scores.length === 0) return [{ tag: "daily", weight: 1 }];

  scores.sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag));
  const top = scores.slice(0, 3);
  const total = top.reduce((s, x) => s + x.weight, 0);
  return top.map((x) => ({ tag: x.tag, weight: Math.round((x.weight / total) * 100) / 100 }));
}

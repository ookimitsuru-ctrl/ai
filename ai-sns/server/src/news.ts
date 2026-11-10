import { TOPIC_BY_ID } from "./data";
import type { Env, Persona, TopicWeight } from "./types";

/**
 * ニュース見出しを使った「話題の幅」。
 *
 * - 取りに行く検索語は話題タグ(ランニング、カフェ…)だけ。**ユーザーのつぶやきや個人情報は外に送らない**
 * - 使うのは見出しの短い文字列だけ(本文は取らない)。返信でひと言軽く触れる程度
 * - 暗い話題(事件・事故・災害など)は見出しの段階で捨てる
 * - 取得に失敗しても、普通の返信になるだけ(アプリは止めない)
 */

/** ニュースを探しても意味が薄い・不適切なタグ */
const NO_NEWS_TAGS = new Set(["daily", "loneliness", "late_night", "complaint", "mental", "sleep", "healing", "haiku"]);

/** 取得した見出しをキャッシュしておく時間 */
export const NEWS_TTL_MS = 6 * 60 * 60_000;
/** 取得に失敗したとき、次に再挑戦するまでの時間 */
const RETRY_AFTER_FAIL_MS = 15 * 60_000;
/** 返信に使ってよい見出しの古さ */
const MAX_AGE_MS = 48 * 60 * 60_000;
const MAX_TAGS_PER_REFRESH = 4;
const MAX_ITEMS_PER_TAG = 8;
const FETCH_TIMEOUT_MS = 4_000;

export const DEFAULT_NEWS_RSS_URL = "https://news.google.com/rss/search?q={q}&hl=ja&gl=JP&ceid=JP:ja";

// 暗い・センシティブな見出しは使わない(キャラが軽い調子で触れてよい話題ではない)
const BLOCKED =
  /死亡|死去|死者|死傷|殺|遺体|逮捕|容疑|事件|事故|災害|地震|津波|噴火|台風|戦争|侵攻|攻撃|テロ|自殺|感染|ウイルス|被害|火災|行方不明|暴行|虐待|裁判|訴訟|不祥事|炎上|謝罪|疑惑|薬物|詐欺|倒産|破産|不適切|差別|性的|わいせつ/;

export interface NewsItem {
  title: string;
  source: string | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** RSS 2.0 の <item> から見出しと媒体名を取り出す(Workers に DOMParser は無いので正規表現) */
export function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1]!;
    const rawTitle = /<title>([\s\S]*?)<\/title>/.exec(body)?.[1];
    if (!rawTitle) continue;
    let title = decodeEntities(rawTitle).replace(/\s+/g, " ").trim();
    const rawSource = /<source[^>]*>([\s\S]*?)<\/source>/.exec(body)?.[1];
    const source = rawSource ? decodeEntities(rawSource).trim() : null;
    // Google ニュースは「見出し - 媒体名」の形。媒体名は取り除く
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    items.push({ title, source });
  }
  return items;
}

/** 返信に使ってよい見出しか(短すぎ・長すぎ・暗い話題・広告は除く) */
export function isUsableHeadline(title: string): boolean {
  const n = [...title].length;
  if (n < 6 || n > 60) return false;
  if (BLOCKED.test(title)) return false;
  if (/^【?PR】?/.test(title) || title.includes("PR:")) return false;
  return true;
}

/** 話題タグ → ニュース検索語。ニュースを探さないタグは null */
export function newsQueryFor(tag: string): string | null {
  if (NO_NEWS_TAGS.has(tag)) return null;
  return TOPIC_BY_ID.get(tag)?.label ?? null;
}

export function newsEnabled(env: Pick<Env, "NEWS_ENABLED">): boolean {
  return env.NEWS_ENABLED === "true";
}

async function fetchTag(env: Env, tag: string, fetchImpl: typeof fetch): Promise<NewsItem[]> {
  const q = newsQueryFor(tag);
  if (!q) return [];
  const url = (env.NEWS_RSS_URL ?? DEFAULT_NEWS_RSS_URL).replace("{q}", encodeURIComponent(q));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { "user-agent": "hitorigoto/0.1" } });
    if (!res.ok) throw new Error(`news HTTP ${res.status}`);
    const items = parseRssItems(await res.text()).filter((i) => isUsableHeadline(i.title));
    const seen = new Set<string>();
    return items.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true))).slice(0, MAX_ITEMS_PER_TAG);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 指定した話題タグの見出しが古ければ取り直す(最大4タグ)。新しければ何もしない。
 * 失敗してもエラーにしない(次の15分後に再挑戦できるよう記録するだけ)。
 */
export async function refreshNewsForTags(
  env: Env,
  tags: string[],
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<void> {
  const db = env.DB;
  const targets = [...new Set(tags)].filter((t) => newsQueryFor(t) !== null).slice(0, MAX_TAGS_PER_REFRESH);
  await Promise.all(
    targets.map(async (tag) => {
      const row = await db.prepare("SELECT fetched_at FROM news_tags WHERE tag = ?").bind(tag).first<{ fetched_at: number }>();
      if (row && now - row.fetched_at < NEWS_TTL_MS) return; // まだ新しい
      try {
        const items = await fetchTag(env, tag, fetchImpl);
        await db.batch([
          db.prepare("DELETE FROM news_items WHERE tag = ?").bind(tag),
          ...items.map((i) => db.prepare("INSERT OR IGNORE INTO news_items (tag, title, fetched_at) VALUES (?, ?, ?)").bind(tag, i.title, now)),
          db.prepare("INSERT OR REPLACE INTO news_tags (tag, fetched_at) VALUES (?, ?)").bind(tag, now),
        ]);
      } catch (err) {
        console.error("news refresh failed", tag, err);
        // 失敗: 15分後にまた取りに行けるようにする(既存の見出しは残す)
        await db
          .prepare("INSERT OR REPLACE INTO news_tags (tag, fetched_at) VALUES (?, ?)")
          .bind(tag, now - NEWS_TTL_MS + RETRY_AFTER_FAIL_MS)
          .run();
      }
    }),
  );
}

/** 指定タグの、使える見出し(48時間以内に取得したもの) */
export async function loadHeadlines(db: D1Database, tags: string[], now: number = Date.now()): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const list = [...new Set(tags)];
  if (list.length === 0) return out;
  const marks = list.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT tag, title FROM news_items WHERE tag IN (${marks}) AND fetched_at > ? ORDER BY fetched_at DESC, title`)
    .bind(...list, now - MAX_AGE_MS)
    .all<{ tag: string; title: string }>();
  for (const r of rows.results) out.set(r.tag, [...(out.get(r.tag) ?? []), r.title]);
  return out;
}

/**
 * そのキャラが触れてよさそうな見出しを1つ選ぶ。
 * つぶやきの話題に合うタグを優先し、なければそのキャラの強い関心(strong)のタグから。
 */
export function pickHeadline(
  persona: Persona,
  postTopics: TopicWeight[],
  headlines: Map<string, string[]>,
  rand: () => number,
): string | null {
  const own = new Set([...persona.interests.strong, ...persona.interests.mid]);
  const fromPost = postTopics.map((t) => t.tag).filter((t) => own.has(t));
  const order = [...fromPost, ...persona.interests.strong.filter((t) => !fromPost.includes(t))];
  for (const tag of order) {
    const list = headlines.get(tag);
    if (list && list.length > 0) return list[Math.floor(rand() * list.length)]!;
  }
  return null;
}

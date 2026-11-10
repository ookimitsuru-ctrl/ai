import { analyzeByKeywords } from "./topics";
import type { Env, TopicWeight } from "./types";

/**
 * 会話の中の「調べもの」。
 * 相手が「面白いゲームないかな」のように聞いてきたとき、ネットで人気のものを調べて、返事に組み込む。
 *
 * プライバシー: **ユーザーの言葉は外に一切送らない。** 調べ先は話題ごとに決まった公開APIで、
 * 送るのは固定のリクエストだけ(ゲームなら「Steamの売れ筋」を取りに行くだけ)。
 * 取れなくても、普通の返事になるだけ(アプリは止めない)。
 */

export interface LookupResult {
  tag: string;
  /** 「いま人気のゲーム(Steamの売れ筋)」のような、結果の説明 */
  label: string;
  items: string[];
}

interface Adapter {
  label: string;
  fetch: (f: typeof fetch) => Promise<string[]>;
}

const UA = { "user-agent": "hitorigoto/0.1" };
const MAX_ITEMS = 6;
const FETCH_TIMEOUT_MS = 4_000;
export const LOOKUP_TTL_MS = 3 * 60 * 60_000;
const RETRY_AFTER_FAIL_MS = 10 * 60_000;

async function getJson(f: typeof fetch, url: string, init: RequestInit = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await f(url, { ...init, signal: ctrl.signal, headers: { ...UA, ...(init.headers as Record<string, string> | undefined) } });
    if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const clean = (xs: unknown[]): string[] => {
  const out: string[] = [];
  for (const x of xs) {
    if (typeof x !== "string") continue;
    const t = x.replace(/\s+/g, " ").trim();
    if (t.length >= 1 && t.length <= 60 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, MAX_ITEMS);
};

/** ゲーム: Steam の売れ筋(日本向け) */
export async function steamTopSellers(f: typeof fetch): Promise<string[]> {
  const j = (await getJson(f, "https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese")) as {
    top_sellers?: { items?: { name?: unknown }[] };
  };
  return clean((j.top_sellers?.items ?? []).map((i) => i.name));
}

/** アニメ・漫画: AniList の「いま話題(トレンド)」。成人向けは除く */
export function anilist(type: "ANIME" | "MANGA") {
  return async (f: typeof fetch): Promise<string[]> => {
    const query = "query($type: MediaType){ Page(perPage: 10){ media(sort: TRENDING_DESC, type: $type, isAdult: false){ title{ native romaji } } } }";
    const j = (await getJson(f, "https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: { type } }),
    })) as { data?: { Page?: { media?: { title?: { native?: unknown; romaji?: unknown } }[] } } };
    return clean((j.data?.Page?.media ?? []).map((m) => m.title?.native ?? m.title?.romaji));
  };
}

/** 音楽: Apple Music の再生ランキング(日本) */
export async function appleTopSongs(f: typeof fetch): Promise<string[]> {
  const j = (await getJson(f, "https://rss.applemarketingtools.com/api/v2/jp/music/most-played/10/songs.json")) as {
    feed?: { results?: { name?: unknown; artistName?: unknown }[] };
  };
  return clean((j.feed?.results ?? []).map((r) => (typeof r.name === "string" ? (typeof r.artistName === "string" ? `${r.name}(${r.artistName})` : r.name) : null)));
}

/** 話題タグ → 調べ先。ここに無い話題では調べない */
export const ADAPTERS: Record<string, Adapter> = {
  game: { label: "いま人気のゲーム(Steamの売れ筋)", fetch: steamTopSellers },
  anime: { label: "いま話題のアニメ(AniListのトレンド)", fetch: anilist("ANIME") },
  manga: { label: "いま話題の漫画(AniListのトレンド)", fetch: anilist("MANGA") },
  music: { label: "いま人気の曲(Apple Musicの再生ランキング)", fetch: appleTopSongs },
};

// 「教えて・おすすめ・ないかな」のような、知りたい・探しているときの言い方
const REQUEST_RE =
  /おすすめ|オススメ|お勧め|ないかな|ないかなぁ|ない[?？]|ないの[?？]?|ないですか|ありませんか|あるかな|ある[?？]|あるの[?？]|あったら教えて|教えて|教えてほしい|何(か)?(が|を|か)?(いい|良い|面白い|おもしろい|楽しい)|なにか面白|探して|探してる|知りたい|どれが|何(を|に)(しよう|したら|しようかな)|人気の|流行|はやり|話題の|新作|最新|ランキング/;

/**
 * 調べるべき話題タグを返す(調べない会話なら null)。
 * 「ゲームした」のような報告では調べず、「面白いゲームないかな」のような頼み・質問のときだけ調べる。
 */
export function detectLookup(text: string, topics: TopicWeight[]): string | null {
  if (!REQUEST_RE.test(text)) return null;
  const fromTopics = topics.map((t) => t.tag).find((t) => ADAPTERS[t]);
  if (fromTopics) return fromTopics;
  return analyzeByKeywords(text).map((t) => t.tag).find((t) => ADAPTERS[t]) ?? null;
}

export function lookupEnabled(env: Pick<Env, "LOOKUP_ENABLED">): boolean {
  return env.LOOKUP_ENABLED === "true";
}

/**
 * 会話の文から、必要なら調べものをして結果を返す。結果は3時間キャッシュ(全ユーザー共通)。
 * 失敗・無効・調べる必要なしのときは null。例外は投げない。
 */
export async function lookupForText(
  env: Env,
  text: string,
  topics: TopicWeight[],
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<LookupResult | null> {
  if (!lookupEnabled(env)) return null;
  const tag = detectLookup(text, topics);
  if (!tag) return null;
  const adapter = ADAPTERS[tag]!;
  try {
    const row = await env.DB.prepare("SELECT items, fetched_at FROM lookup_cache WHERE tag = ?").bind(tag).first<{ items: string; fetched_at: number }>();
    if (row && now - row.fetched_at < LOOKUP_TTL_MS) {
      const items = JSON.parse(row.items) as string[];
      return items.length > 0 ? { tag, label: adapter.label, items } : null;
    }
    try {
      const items = await adapter.fetch(fetchImpl);
      await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)").bind(tag, JSON.stringify(items), now).run();
      return items.length > 0 ? { tag, label: adapter.label, items } : null;
    } catch (err) {
      console.error("lookup failed", tag, err);
      // 失敗: 古い結果があればそれを使い、10分後にまた挑戦できるようにする
      const stale = row ? (JSON.parse(row.items) as string[]) : [];
      await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)")
        .bind(tag, JSON.stringify(stale), now - LOOKUP_TTL_MS + RETRY_AFTER_FAIL_MS)
        .run();
      return stale.length > 0 ? { tag, label: adapter.label, items: stale } : null;
    }
  } catch (err) {
    console.error("lookupForText failed", err);
    return null;
  }
}

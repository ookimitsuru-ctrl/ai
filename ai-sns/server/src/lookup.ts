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
  /** recommend: おすすめの候補(好みで選んで話す) / fact: 天気のような事実(数字をそのまま使って答える) */
  kind?: "recommend" | "fact";
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

async function getJson(f: typeof fetch, url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await f(url, { ...init, signal: ctrl.signal, headers: { ...UA, ...(init.headers as Record<string, string> | undefined) } });
    if (!res.ok) throw new Error(`lookup HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const clean = (xs: unknown[], max = MAX_ITEMS): string[] => {
  const out: string[] = [];
  for (const x of xs) {
    if (typeof x !== "string") continue;
    const t = x.replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
    if (t.length >= 1 && t.length <= 60 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, max);
};

/** 「作品名」と「作品名 第2期」のような続編の重複を、先に出てきた1つにまとめる(順番が逆でも同じ作品として扱う) */
export function dropSequels(titles: string[]): string[] {
  const SEQUEL = /^[\s　:：-]*(第.{1,3}期|season\s*\d|シーズン|\d+期|part\s*\d|[IVX]+\b)/i;
  const sequelOf = (t: string, base: string) => t.startsWith(base) && t.length > base.length && SEQUEL.test(t.slice(base.length));
  const kept: string[] = [];
  for (const t of titles) {
    if (!kept.some((p) => sequelOf(t, p) || sequelOf(p, t))) kept.push(t);
  }
  return kept;
}

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
    // 日本の作品(countryOfOrigin: JP)だけ。韓国・中国の作品は、原語(ハングル・漢字)のタイトルで返ってきて日本語の会話に合わない
    const query = "query($type: MediaType){ Page(perPage: 15){ media(sort: TRENDING_DESC, type: $type, isAdult: false, countryOfOrigin: JP){ title{ native romaji } } } }";
    const j = (await getJson(f, "https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query, variables: { type } }),
    })) as { data?: { Page?: { media?: { title?: { native?: unknown; romaji?: unknown } }[] } } };
    return dropSequels(clean((j.data?.Page?.media ?? []).map((m) => m.title?.native ?? m.title?.romaji), 15)).slice(0, MAX_ITEMS);
  };
}

/** 音楽: Apple Music の再生ランキング(日本)。新しい形式のURLで取れなければ、旧形式のURLを試す */
export async function appleTopSongs(f: typeof fetch): Promise<string[]> {
  const fromV2 = async () => {
    const j = (await getJson(f, "https://rss.applemarketingtools.com/api/v2/jp/music/most-played/10/songs.json", {}, 3_000)) as {
      feed?: { results?: { name?: unknown; artistName?: unknown }[] };
    };
    return clean((j.feed?.results ?? []).map((r) => (typeof r.name === "string" ? (typeof r.artistName === "string" ? `${r.name}(${r.artistName})` : r.name) : null)));
  };
  const fromLegacy = async () => {
    const j = (await getJson(f, "https://itunes.apple.com/jp/rss/topsongs/limit=10/json", {}, 3_000)) as {
      feed?: { entry?: { "im:name"?: { label?: unknown }; "im:artist"?: { label?: unknown } }[] };
    };
    return clean((j.feed?.entry ?? []).map((e) => {
      const name = e["im:name"]?.label;
      const artist = e["im:artist"]?.label;
      return typeof name === "string" ? (typeof artist === "string" ? `${name}(${artist})` : name) : null;
    }));
  };
  try {
    const items = await fromV2();
    if (items.length > 0) return items;
  } catch {
    // 次の URL を試す
  }
  return fromLegacy();
}

// ---------------------------------------------------------------------------------------------
// 天気(Open-Meteo。キー不要)。
// 場所を調べるため、つぶやきの中の**地名だけ**を外に送る(つぶやき全文・ユーザーを特定する情報は送らない)
// ---------------------------------------------------------------------------------------------

const WEATHER_TOPIC_RE = /天気|気温|降水|雨|雪|傘|晴れ|曇り|台風|暑い|寒い|予報/;
const WEATHER_ASK_RE = /どう|だろう|かな|ですか|教えて|知りたい|予報|[?？]|ありそう|降る|大丈夫|必要/;

// 接尾辞の無い主な都市名(「東京の天気」「大阪は?」)
const CITIES = ["札幌", "仙台", "東京", "横浜", "名古屋", "京都", "大阪", "神戸", "広島", "福岡", "那覇", "新潟", "金沢", "静岡", "岡山", "熊本", "鹿児島", "長崎", "松山", "高松", "さいたま", "千葉", "川崎", "奈良", "大分", "宮崎", "佐賀", "松江", "鳥取", "山口", "徳島", "高知", "和歌山", "津", "岐阜", "名古屋", "福井", "富山", "甲府", "長野", "前橋", "宇都宮", "水戸", "福島", "山形", "秋田", "盛岡", "青森"];
const TIME_WORDS = /^(今日|明日|明後日|来週|今週|週末|今夜|今朝|明朝|昨日|あさって|あした|きょう)/;

/** つぶやきから、天気を調べたい場所を取り出す。市区町村があればそれを、なければ都道府県、主な都市名の順 */
export function extractPlace(text: string): string | null {
  const found: string[] = [];
  for (const m of text.matchAll(/[一-龥々ヶァ-ヶー]{1,7}?(?:都|道|府|県|市|区|町|村)/g)) {
    let c = m[0];
    // 「明日昭島市」「来週栃木県」のように時の言葉が前に付いていたら取り除く
    for (let i = 0; i < 3; i++) c = c.replace(TIME_WORDS, "");
    if (c.length >= 2) found.push(c);
  }
  const municipal = found.find((c) => /(市|区|町|村)$/.test(c));
  if (municipal) return municipal;
  if (found[0]) return found[0];
  return CITIES.find((c) => text.includes(c)) ?? null;
}

export interface WeatherAsk {
  place: string;
  /** 知りたい日(0=今日, 1=明日, 2=明後日) */
  days: number[];
}

/** 天気を聞かれているか。「今日は雨だった」のような報告では調べず、「明日の昭島市の天気どうだろう」のような質問のときだけ */
export function detectWeather(text: string): WeatherAsk | null {
  if (!WEATHER_TOPIC_RE.test(text) || !WEATHER_ASK_RE.test(text)) return null;
  const place = extractPlace(text);
  if (!place) return null; // 場所が分からないときは調べない(キャラが「どこの天気?」と聞き返せる)
  const days: number[] = [];
  if (/明後日|あさって/.test(text)) days.push(2);
  else if (/明日|あした|明朝/.test(text)) days.push(1);
  else if (/今日|今夜|今朝|きょう|これから|いま/.test(text)) days.push(0);
  return { place, days: days.length > 0 ? days : [0, 1] };
}

/** WMO の天気コード → 日本語 */
export function weatherCodeText(code: number): string {
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "薄曇り";
  if (code === 3) return "曇り";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "にわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code >= 95) return "雷雨";
  return "不明";
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const dayLabel = (iso: string, offset: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${["今日", "明日", "明後日"][offset] ?? ""}(${m}/${d}・${wd})`;
};

/** 地名 → 緯度経度(Open-Meteo のジオコーディング)。「昭島市」で見つからなければ「昭島」でも試す */
async function geocode(f: typeof fetch, place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const names = [...new Set([place, place.replace(/(都|道|府|県|市|区|町|村)$/, "")].filter((n) => n.length >= 1))];
  for (const name of names) {
    const j = (await getJson(f, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ja&format=json&countryCode=JP`)) as {
      results?: { latitude?: number; longitude?: number; name?: string }[];
    };
    const r = j.results?.[0];
    if (r && typeof r.latitude === "number" && typeof r.longitude === "number") return { lat: r.latitude, lon: r.longitude, name: r.name ?? name };
  }
  return null;
}

/** 予報を「今日・明日・明後日・その次」の4日分の文にする(日付はJST) */
export async function fetchWeatherDays(f: typeof fetch, place: string): Promise<string[]> {
  const g = await geocode(f, place);
  if (!g) return [];
  const j = (await getJson(
    f,
    `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=4`,
  )) as {
    daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] };
  };
  const d = j.daily;
  if (!d?.time || !d.weather_code) return [];
  return d.time.map((iso, i) => {
    const parts = [weatherCodeText(d.weather_code![i]!)];
    const hi = d.temperature_2m_max?.[i];
    const lo = d.temperature_2m_min?.[i];
    if (typeof hi === "number" && typeof lo === "number") parts.push(`気温 ${Math.round(lo)}〜${Math.round(hi)}℃`);
    const pop = d.precipitation_probability_max?.[i];
    if (typeof pop === "number") parts.push(`降水確率 ${Math.round(pop)}%`);
    return `${dayLabel(iso, i)}: ${parts.join("、")}`;
  });
}

export const WEATHER_TTL_MS = 60 * 60_000;

async function lookupWeather(env: Env, ask: WeatherAsk, f: typeof fetch, now: number): Promise<LookupResult | null> {
  const today = new Date(now + 9 * 3600_000).toISOString().slice(0, 10); // JSTの日付
  const key = `weather:${ask.place}:${today}`;
  const label = `${ask.place}の天気予報(Open-Meteo)`;
  const pick = (days: string[]) => ask.days.map((i) => days[i]).filter((x): x is string => !!x);
  const row = await env.DB.prepare("SELECT items, fetched_at FROM lookup_cache WHERE tag = ?").bind(key).first<{ items: string; fetched_at: number }>();
  if (row && now - row.fetched_at < WEATHER_TTL_MS) {
    const items = pick(JSON.parse(row.items) as string[]);
    return items.length > 0 ? { tag: "weather", label, items, kind: "fact" } : null;
  }
  try {
    const days = await fetchWeatherDays(f, ask.place);
    await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)").bind(key, JSON.stringify(days), now).run();
    const items = pick(days);
    return items.length > 0 ? { tag: "weather", label, items, kind: "fact" } : null;
  } catch (err) {
    console.error("weather lookup failed", ask.place, err);
    await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)")
      .bind(key, row?.items ?? "[]", now - WEATHER_TTL_MS + RETRY_AFTER_FAIL_MS)
      .run();
    const stale = row ? pick(JSON.parse(row.items) as string[]) : [];
    return stale.length > 0 ? { tag: "weather", label, items: stale, kind: "fact" } : null;
  }
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
  try {
    // 天気を聞かれたら、場所の天気を調べる(おすすめ探しより先に判定)
    const weather = detectWeather(text);
    if (weather) return await lookupWeather(env, weather, fetchImpl, now);
  } catch (err) {
    console.error("lookupWeather failed", err);
    return null;
  }
  const tag = detectLookup(text, topics);
  if (!tag) return null;
  const adapter = ADAPTERS[tag]!;
  try {
    const row = await env.DB.prepare("SELECT items, fetched_at FROM lookup_cache WHERE tag = ?").bind(tag).first<{ items: string; fetched_at: number }>();
    if (row && now - row.fetched_at < LOOKUP_TTL_MS) {
      const items = JSON.parse(row.items) as string[];
      return items.length > 0 ? { tag, label: adapter.label, items, kind: "recommend" as const } : null;
    }
    try {
      const items = await adapter.fetch(fetchImpl);
      await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)").bind(tag, JSON.stringify(items), now).run();
      return items.length > 0 ? { tag, label: adapter.label, items, kind: "recommend" as const } : null;
    } catch (err) {
      console.error("lookup failed", tag, err);
      // 失敗: 古い結果があればそれを使い、10分後にまた挑戦できるようにする
      const stale = row ? (JSON.parse(row.items) as string[]) : [];
      await env.DB.prepare("INSERT OR REPLACE INTO lookup_cache (tag, items, fetched_at) VALUES (?, ?, ?)")
        .bind(tag, JSON.stringify(stale), now - LOOKUP_TTL_MS + RETRY_AFTER_FAIL_MS)
        .run();
      return stale.length > 0 ? { tag, label: adapter.label, items: stale, kind: "recommend" as const } : null;
    }
  } catch (err) {
    console.error("lookupForText failed", err);
    return null;
  }
}

import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { REPLIES_SYSTEM } from "../src/llm/prompts";
import { WEATHER_TTL_MS, detectWeather, extractPlace, fetchWeatherDays, lookupForText, weatherCodeText } from "../src/lookup";
import { authed, register, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Open-Meteo の応答の形を模した見本(実際の応答の確認は、お手元で `npm run try-lookup` を実行して行う)
const GEO = { results: [{ id: 1, name: "昭島市", latitude: 35.7058, longitude: 139.3541, country_code: "JP", admin1: "東京都" }] };
const FORECAST = {
  timezone: "Asia/Tokyo",
  daily: {
    time: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"],
    weather_code: [3, 61, 0, 80],
    temperature_2m_max: [15.2, 13.1, 17.8, 12.0],
    temperature_2m_min: [6.4, 9.0, 5.5, 7.2],
    precipitation_probability_max: [10, 80, 0, null],
  },
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const asFetch = (f: unknown) => f as typeof fetch;
const meteo = (urls: string[] = []) =>
  vi.fn(async (url: string) => {
    urls.push(url);
    if (url.startsWith("https://geocoding-api.open-meteo.com/")) return json(GEO);
    if (url.startsWith("https://api.open-meteo.com/")) return json(FORECAST);
    throw new Error(`想定外のURL: ${url}`);
  });

describe("天気を聞かれたかの判定", () => {
  it("場所と日付を読み取る", () => {
    expect(detectWeather("明日の昭島市の天気どうだろう")).toEqual({ place: "昭島市", days: [1] });
    expect(detectWeather("東京の今日の天気教えて")).toEqual({ place: "東京", days: [0] });
    expect(detectWeather("明後日、大阪は雨降るかな")).toEqual({ place: "大阪", days: [2] });
    expect(detectWeather("来週栃木県は寒いかな")).toEqual({ place: "栃木県", days: [0, 1] }); // 日付が無ければ今日と明日
  });

  it("天気の報告・感想では調べない。場所が分からないときも調べない", () => {
    for (const t of ["今日は雨だった", "いい天気だなあ", "傘忘れた", "昭島市は寒い", "明日の天気どうだろう"]) {
      expect(detectWeather(t), t).toBeNull();
    }
  });

  it("場所の取り出し: 市区町村を優先し、時の言葉は取り除く", () => {
    expect(extractPlace("明日昭島市でお出かけ")).toBe("昭島市");
    expect(extractPlace("神奈川県の横浜市は?")).toBe("横浜市");
    expect(extractPlace("東京都の天気")).toBe("東京都");
    expect(extractPlace("福岡って暖かい?")).toBe("福岡");
    expect(extractPlace("どこかな")).toBeNull();
  });

  it("天気コードを日本語にする", () => {
    expect([0, 1, 2, 3, 45, 53, 63, 73, 81, 86, 95, 999].map(weatherCodeText)).toEqual(["快晴", "晴れ", "薄曇り", "曇り", "霧", "霧雨", "雨", "雪", "にわか雨", "にわか雪", "雷雨", "雷雨"]);
    expect(weatherCodeText(-1)).toBe("不明");
  });
});

describe("天気の取得", () => {
  it("予報を日ごとの文にする(日付と曜日つき、降水確率が無い日は省く)", async () => {
    const days = await fetchWeatherDays(asFetch(meteo()), "昭島市");
    expect(days).toEqual([
      "今日(11/10・火): 曇り、気温 6〜15℃、降水確率 10%",
      "明日(11/11・水): 雨、気温 9〜13℃、降水確率 80%",
      "明後日(11/12・木): 快晴、気温 6〜18℃、降水確率 0%",
      "(11/13・金): にわか雨、気温 7〜12℃",
    ]);
  });

  it("外に送るのは、地名と、その緯度経度だけ", async () => {
    const urls: string[] = [];
    await fetchWeatherDays(asFetch(meteo(urls)), "昭島市");
    expect(urls[0]).toBe(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent("昭島市")}&count=1&language=ja&format=json&countryCode=JP`);
    expect(urls[1]).toContain("latitude=35.7058&longitude=139.3541");
    expect(urls[1]).toContain("timezone=Asia%2FTokyo");
  });

  it("「昭島市」で見つからなければ「昭島」でも試す。どちらも無ければ空", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("geocoding") && url.includes(encodeURIComponent("昭島市"))) return json({});
      if (url.includes("geocoding")) return json(GEO);
      return json(FORECAST);
    });
    expect((await fetchWeatherDays(asFetch(f), "昭島市")).length).toBe(4);
    expect(urls.filter((u) => u.includes("geocoding"))).toHaveLength(2);
    expect(await fetchWeatherDays(asFetch(async () => json({})), "存在しない市")).toEqual([]);
  });

  it("形が違う・HTTPエラーのとき、空または例外", async () => {
    const f = vi.fn(async (url: string) => (url.includes("geocoding") ? json(GEO) : json({ nothing: true })));
    expect(await fetchWeatherDays(asFetch(f), "昭島市")).toEqual([]);
    await expect(fetchWeatherDays(asFetch(async () => json({}, 503)), "昭島市")).rejects.toThrow(/503/);
  });
});

describe("会話での天気の調べもの", () => {
  const on = () => ({ ...env, LOOKUP_ENABLED: "true" });
  const t0 = Date.parse("2026-11-10T01:00:00Z");

  it("聞かれた日の予報を、事実として返す(kind=fact)", async () => {
    const r = await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(meteo()), t0);
    expect(r).toEqual({ tag: "weather", kind: "fact", label: "昭島市の天気予報(Open-Meteo)", items: ["明日(11/11・水): 雨、気温 9〜13℃、降水確率 80%"] });
  });

  it("無効(既定)・天気の報告・場所なしでは通信しない", async () => {
    const f = meteo();
    expect(await lookupForText({ ...env }, "明日の昭島市の天気どうだろう", [], asFetch(f), t0)).toBeNull();
    expect(await lookupForText(on(), "今日は雨だった", [], asFetch(f), t0)).toBeNull();
    expect(await lookupForText(on(), "明日の天気どうだろう", [], asFetch(f), t0)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("つぶやき全文や名前は外に出ない(出るのは地名だけ)", async () => {
    const urls: string[] = [];
    await lookupForText(on(), "田中太郎です。090-1234-5678。明日の昭島市の天気どうだろう", [], asFetch(meteo(urls)), t0);
    expect(urls.length).toBe(2);
    const all = decodeURIComponent(urls.join("\n"));
    for (const leak of ["田中", "090", "太郎", "どうだろう", "明日"]) expect(all).not.toContain(leak);
    expect(all).toContain("昭島");
  });

  it("1時間は使い回す(場所と日付ごとのキャッシュ)。過ぎたら取り直す", async () => {
    const f = meteo();
    await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(f), t0);
    await lookupForText(on(), "今日の昭島市の天気教えて", [], asFetch(f), t0 + WEATHER_TTL_MS - 1000);
    expect(f).toHaveBeenCalledTimes(2); // 取得は1回分(地名→予報の2通信)
    await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(f), t0 + WEATHER_TTL_MS + 1000);
    expect(f).toHaveBeenCalledTimes(4);
    // 別の場所は別に取る
    await lookupForText(on(), "明日の東京の天気どうだろう", [], asFetch(f), t0 + WEATHER_TTL_MS + 2000);
    expect(f).toHaveBeenCalledTimes(6);
  });

  it("失敗しても例外にしない。古い予報があれば使い、10分後に再挑戦する", async () => {
    await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(meteo()), t0);
    const down = vi.fn(async () => json({}, 503));
    const t1 = t0 + WEATHER_TTL_MS + 1000;
    const r = await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(down), t1);
    expect(r!.items[0]).toContain("雨"); // 古い予報で答える
    expect(down).toHaveBeenCalledTimes(1);
    await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(down), t1 + 5 * 60_000);
    expect(down).toHaveBeenCalledTimes(1);
    await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(down), t1 + 11 * 60_000);
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("初めての取得に失敗したら null(普通に返事する)", async () => {
    const f = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await lookupForText(on(), "明日の昭島市の天気どうだろう", [], asFetch(f), t0)).toBeNull();
  });

  it("プロンプトに、天気は事実として正確に使う指示がある", () => {
    expect(REPLIES_SYSTEM).toContain("天気のような事実");
  });
});

describe("天気の統合(つぶやき・スレッド)", () => {
  function fakeNetwork() {
    const external: string[] = [];
    const prompts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.includes("open-meteo.com")) {
        external.push(decodeURIComponent(u));
        return u.includes("geocoding") ? json(GEO) : json(FORECAST);
      }
      const body = JSON.parse(init!.body as string);
      const name = body.response_format.json_schema.name as string;
      prompts.push(body.messages[1].content as string);
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "daily", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "明日は雨みたいだよ、傘を持っていってね" })) };
      return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    }) as unknown as typeof fetch);
    return { external, prompts };
  }
  const base = { LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1", LOOKUP_ENABLED: "true" };

  async function withEnv(path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://localhost${path}`, init), { ...env, ...base }, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("「明日の昭島市の天気どうだろう」とつぶやくと、予報を調べて、返信するキャラへの指示に入る", async () => {
    const { token, userId } = await register();
    for (const id of ["kazu_lonely", "yuki_night", "sou_music"]) {
      await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, 1000)").bind(userId, id).run();
    }
    const net = fakeNetwork();
    for (let i = 0; i < 4; i++) await withEnv("/v1/posts", authed(token, "POST", { body: "田中です。明日の昭島市の天気どうだろう" }));

    const replyPrompts = net.prompts.filter((p) => p.includes("personaId:"));
    expect(replyPrompts.length).toBeGreaterThan(0);
    expect(replyPrompts.some((p) => p.includes("調べた結果(昭島市の天気予報(Open-Meteo)): 明日(11/11・水): 雨、気温 9〜13℃、降水確率 80%"))).toBe(true);
    expect(net.external.join("\n")).not.toContain("田中");
    expect(net.external.join("\n")).toContain("昭島");
  });
});

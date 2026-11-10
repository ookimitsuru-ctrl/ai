import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { PERSONA_BY_ID } from "../src/data";
import { NEWS_TTL_MS, isUsableHeadline, loadHeadlines, newsQueryFor, parseRssItems, pickHeadline, refreshNewsForTags } from "../src/news";
import { authed, bearer, call, register, resetDb, seedReply } from "./helpers";
import { NEWS_RSS } from "./fixtures/newsRss";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const rss = (body = NEWS_RSS, status = 200) => new Response(body, { status, headers: { "content-type": "application/rss+xml" } });

describe("RSSの読み取り", () => {
  it("見出しと媒体名を取り出し、媒体名の付け足しとXML記号を直す", () => {
    const items = parseRssItems(NEWS_RSS);
    expect(items).toHaveLength(6);
    expect(items[0]).toEqual({ title: "東京マラソン、ボランティアの募集を開始", source: "スポーツ新報" });
    expect(items[1]!.title).toBe("初心者向けランニングシューズ特集 & 選び方"); // CDATA と &amp; を展開
  });

  it("壊れたXMLや空でも落ちない", () => {
    expect(parseRssItems("")).toEqual([]);
    expect(parseRssItems("<rss><channel><item><title>あ")).toEqual([]);
  });
});

describe("使ってよい見出しの判定", () => {
  it("暗い話題(事故・事件・災害など)・短すぎ・長すぎ・広告は除く", () => {
    expect(isUsableHeadline("東京マラソン、ボランティアの募集を開始")).toBe(true);
    expect(isUsableHeadline("マラソン大会で転倒事故、複数人が搬送")).toBe(false);
    expect(isUsableHeadline("男を逮捕 容疑を認める")).toBe(false);
    expect(isUsableHeadline("大きな地震が発生しました")).toBe(false);
    expect(isUsableHeadline("短い")).toBe(false);
    expect(isUsableHeadline("あ".repeat(61))).toBe(false);
    expect(isUsableHeadline("【PR】今すぐ買える最新ランニングウォッチ")).toBe(false);
  });

  it("検索語は話題タグの名前だけ。ニュースを探さないタグ(日常・孤独・愚痴など)はnull", () => {
    expect(newsQueryFor("running")).toBe("ランニング");
    for (const t of ["daily", "loneliness", "late_night", "complaint", "mental", "sleep", "healing"]) expect(newsQueryFor(t)).toBeNull();
    expect(newsQueryFor("no-such-tag")).toBeNull();
  });
});

describe("取得とキャッシュ", () => {
  const e = () => ({ ...env, NEWS_RSS_URL: "http://news.example.invalid/rss?q={q}" });

  it("使える見出しだけを保存する(重複・暗い話題・短い・広告は除く)", async () => {
    const f = vi.fn(async () => rss());
    await refreshNewsForTags(e(), ["running"], f as unknown as typeof fetch);
    const h = await loadHeadlines(env.DB, ["running"]);
    expect(h.get("running")!.sort()).toEqual(["初心者向けランニングシューズ特集 & 選び方", "東京マラソン、ボランティアの募集を開始"]);
  });

  it("検索語は話題タグの名前だけ(URLに出るのはタグ名のみ)", async () => {
    const f = vi.fn(async () => rss());
    await refreshNewsForTags(e(), ["running", "cafe"], f as unknown as typeof fetch);
    const urls = f.mock.calls.map((c) => (c as unknown[])[0] as string).sort();
    expect(urls).toEqual([
      `http://news.example.invalid/rss?q=${encodeURIComponent("カフェ")}`,
      `http://news.example.invalid/rss?q=${encodeURIComponent("ランニング")}`,
    ]);
  });

  it("新しい間は取り直さない。6時間たつと取り直す", async () => {
    const f = vi.fn(async () => rss());
    const t0 = 1_800_000_000_000;
    await refreshNewsForTags(e(), ["running"], f as unknown as typeof fetch, t0);
    await refreshNewsForTags(e(), ["running"], f as unknown as typeof fetch, t0 + NEWS_TTL_MS - 1000);
    expect(f).toHaveBeenCalledTimes(1);
    await refreshNewsForTags(e(), ["running"], f as unknown as typeof fetch, t0 + NEWS_TTL_MS + 1000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("ニュースを探さないタグ・未知のタグでは通信しない。1回で最大4タグ", async () => {
    const f = vi.fn(async () => rss());
    await refreshNewsForTags(e(), ["daily", "loneliness", "no-such"], f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
    await refreshNewsForTags(e(), ["running", "cafe", "movie", "anime", "game", "music"], f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("取得に失敗しても例外にしない。15分後に再挑戦でき、それまでは再挑戦しない。前の見出しは残る", async () => {
    const t0 = 1_800_000_000_000;
    await refreshNewsForTags(e(), ["running"], (async () => rss()) as unknown as typeof fetch, t0);
    const fail = vi.fn(async () => rss("", 503));
    // 6時間後: 取り直しに行くが失敗
    const t1 = t0 + NEWS_TTL_MS + 1000;
    await expect(refreshNewsForTags(e(), ["running"], fail as unknown as typeof fetch, t1)).resolves.toBeUndefined();
    expect(fail).toHaveBeenCalledTimes(1);
    expect((await loadHeadlines(env.DB, ["running"], t1)).get("running")).toBeTruthy(); // 前の見出しは残っている
    await refreshNewsForTags(e(), ["running"], fail as unknown as typeof fetch, t1 + 5 * 60_000); // 5分後: まだ
    expect(fail).toHaveBeenCalledTimes(1);
    await refreshNewsForTags(e(), ["running"], fail as unknown as typeof fetch, t1 + 16 * 60_000); // 16分後: 再挑戦
    expect(fail).toHaveBeenCalledTimes(2);
  });

  it("通信が途中で止まる・例外でも、投稿の処理は止まらない", async () => {
    const f = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(refreshNewsForTags(e(), ["running"], f as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it("48時間より古い見出しは使わない", async () => {
    const t0 = 1_800_000_000_000;
    await refreshNewsForTags(e(), ["running"], (async () => rss()) as unknown as typeof fetch, t0);
    expect((await loadHeadlines(env.DB, ["running"], t0 + 47 * 3600_000)).get("running")).toBeTruthy();
    expect((await loadHeadlines(env.DB, ["running"], t0 + 49 * 3600_000)).get("running")).toBeUndefined();
  });
});

describe("見出しの選び方", () => {
  const map = new Map([["running", ["マラソン見出し"]], ["cafe", ["カフェ見出し"]]]);

  it("つぶやきの話題に合うものを優先し、なければそのキャラの強い関心から選ぶ", () => {
    const kenji = PERSONA_BY_ID.get("kenji_run")!; // strong: running...
    expect(pickHeadline(kenji, [{ tag: "running", weight: 1 }], map, () => 0)).toBe("マラソン見出し");
    expect(pickHeadline(kenji, [{ tag: "cafe", weight: 1 }], map, () => 0)).toBe("マラソン見出し"); // カフェはケンジの関心外 → 強い関心から
  });

  it("そのキャラに合う見出しが無ければ null", () => {
    const toru = PERSONA_BY_ID.get("toru_philo")!;
    expect(pickHeadline(toru, [{ tag: "cafe", weight: 1 }], map, () => 0)).toBeNull();
  });
});

describe("返信への組み込み(統合)", () => {
  /** ニュースRSSとローカルLLMの両方に答えるニセの通信 */
  function fakeNetwork() {
    const rssUrls: string[] = [];
    const prompts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.startsWith("http://news.example.invalid/")) {
        rssUrls.push(u);
        return rss();
      }
      const body = JSON.parse((init as RequestInit).body as string);
      const name = body.response_format.json_schema.name as string;
      prompts.push(body.messages[1].content as string);
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "running", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "いいですね、走ってきたんですね" })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch);
    return { rssUrls, prompts };
  }
  const base = { LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1", NEWS_RSS_URL: "http://news.example.invalid/rss?q={q}" };

  async function postWith(overrides: Record<string, string>, token: string, text: string) {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request("http://localhost/v1/posts", authed(token, "POST", { body: text })), { ...env, ...base, ...overrides }, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("有効なとき、返信のプロンプトにニュース見出しが入る。外に出る検索語はタグ名だけで、つぶやきは出ない", async () => {
    const { token, userId } = await register();
    await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, 'kenji_run', 1000)").bind(userId).run();
    const net = fakeNetwork();
    const secret = "朝ランで10km走ってきた!私の秘密の計画は誰にも内緒";
    for (let i = 0; i < 6; i++) await postWith({ NEWS_ENABLED: "true", NEWS_USE_RATE: "1" }, token, secret);

    expect(net.rssUrls.length).toBeGreaterThan(0);
    for (const u of net.rssUrls) {
      expect(u).not.toContain(encodeURIComponent("秘密"));
      expect(u).not.toContain(encodeURIComponent("10km"));
      expect(decodeURIComponent(u.split("q=")[1]!)).toMatch(/^[぀-ヿ一-鿿]+$/); // タグ名(日本語)だけ
    }
    const replyPrompts = net.prompts.filter((p) => p.includes("personaId:"));
    expect(replyPrompts.some((p) => p.includes("最近のニュース見出し(任意): 「東京マラソン、ボランティアの募集を開始」") || p.includes("初心者向けランニングシューズ特集 & 選び方"))).toBe(true);
    expect(replyPrompts.join("")).not.toContain("マラソン大会で転倒事故"); // 暗い見出しは渡らない
  });

  it("無効(既定)のときは、ニュースを取りに行かず、プロンプトにも入らない", async () => {
    const { token, userId } = await register();
    await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, 'kenji_run', 1000)").bind(userId).run();
    const net = fakeNetwork();
    for (let i = 0; i < 4; i++) await postWith({ NEWS_USE_RATE: "1" }, token, "朝ラン最高");
    expect(net.rssUrls).toEqual([]);
    expect(net.prompts.join("")).not.toContain("ニュース見出し");
  });

  it("使う確率が0なら、有効でも取りに行かない", async () => {
    const { token, userId } = await register();
    await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, 'kenji_run', 1000)").bind(userId).run();
    const net = fakeNetwork();
    for (let i = 0; i < 4; i++) await postWith({ NEWS_ENABLED: "true", NEWS_USE_RATE: "0" }, token, "朝ラン最高");
    expect(net.rssUrls).toEqual([]);
  });

  it("ニュースの取得に失敗しても、返信は普通に付く(投稿は止まらない)", async () => {
    const { token, userId } = await register();
    await seedReply(userId, "kenji_run");
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.startsWith("http://news.example.invalid/")) throw new Error("news down");
      const body = JSON.parse((init as RequestInit).body as string);
      const name = body.response_format.json_schema.name as string;
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "running", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "いいですね、走ってきたんですね" })) };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch);
    for (let i = 0; i < 6; i++) expect((await postWith({ NEWS_ENABLED: "true", NEWS_USE_RATE: "1" }, token, "朝ランした。ジョギング最高")).status).toBe(201);
    const posts = ((await (await call("/v1/posts", bearer(token))).json()) as { posts: { status: string; reactions: { type: string }[] }[] }).posts;
    expect(posts.every((p) => p.status === "done")).toBe(true);
    expect(posts.some((p) => p.reactions.some((r) => r.type === "reply"))).toBe(true);
  });
});

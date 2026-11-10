import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { ADAPTERS, LOOKUP_TTL_MS, appleTopSongs, anilist, detectLookup, lookupForText, steamTopSellers } from "../src/lookup";
import { authed, bearer, call, register, resetDb, seedReply } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// 各サービスの公開APIの形を模した見本(実際の応答の確認は、お手元で `npm run try-lookup` を実行して行う)
const STEAM = { top_sellers: { id: "cat_topsellers", name: "売れ筋", items: [{ id: 1, name: "Counter-Strike 2" }, { id: 2, name: "モンスターハンターワイルズ" }, { id: 3, name: "Baldur's Gate 3" }, { name: "  モンスターハンターワイルズ  " }, { id: 5 }, { id: 6, name: "Palworld / パルワールド" }] } };
const ANILIST = { data: { Page: { media: [{ title: { native: "葬送のフリーレン", romaji: "Sousou no Frieren" } }, { title: { native: null, romaji: "Dandadan" } }, { title: {} }] } } };
const APPLE = { feed: { results: [{ name: "ライラック", artistName: "Mrs. GREEN APPLE" }, { name: "Subtitle", artistName: "Official髭男dism" }, { name: "曲だけ" }] } };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const asFetch = (f: unknown) => f as typeof fetch;

describe("調べものの要否の判定", () => {
  const game = [{ tag: "game", weight: 1 }];
  it("知りたい・探している言い方で、対応する話題のときだけ調べる", () => {
    for (const t of ["面白いゲームないかな", "おすすめのゲーム教えて", "最近人気のゲームって何?", "何か面白いのやりたい。新作ゲームとか", "ゲーム探してる", "他にも面白いゲームない?", "面白いゲームない?", "なんかゲームある?", "ゲームない?"]) {
      expect(detectLookup(t, game), t).toBe("game");
    }
  });

  it("報告や感想(頼んでいない)では調べない", () => {
    for (const t of ["ゲームした", "昨日のゲーム楽しかった", "今日は朝ランした", "ゲームのガチャ爆死した", "ゲームした?", "ゲームしてて時間がない。もう寝る"]) {
      expect(detectLookup(t, game), t).toBeNull();
    }
  });

  it("対応していない話題(料理・投資など)では調べない", () => {
    expect(detectLookup("おすすめのレシピ教えて", [{ tag: "cooking", weight: 1 }])).toBeNull();
    expect(detectLookup("おすすめの株ある?", [{ tag: "investment", weight: 1 }])).toBeNull();
  });

  it("LLMの話題に無くても、本文のキーワードで話題を補う。ゲーム・アニメ・漫画・音楽に対応", () => {
    expect(detectLookup("面白いゲームないかな", [{ tag: "daily", weight: 1 }])).toBe("game");
    expect(detectLookup("おすすめのアニメ教えて", [])).toBe("anime");
    expect(detectLookup("最近の人気の曲、教えて", [])).toBe("music");
    expect(detectLookup("新作の漫画ないかな", [])).toBe("manga");
  });
});

describe("調べ先の読み取り", () => {
  it("Steam: 売れ筋の名前だけを、重複・空・長すぎを除いて取り出す", async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string) => (urls.push(url), json(STEAM)));
    expect(await steamTopSellers(asFetch(f))).toEqual(["Counter-Strike 2", "モンスターハンターワイルズ", "Baldur's Gate 3", "Palworld / パルワールド"]);
    expect(urls[0]).toBe("https://store.steampowered.com/api/featuredcategories?cc=jp&l=japanese");
  });

  it("AniList: 日本語タイトルを優先し、成人向けを除くクエリをPOSTする", async () => {
    let init: RequestInit | undefined;
    const f = vi.fn(async (_u: string, i: RequestInit) => ((init = i), json(ANILIST)));
    expect(await anilist("ANIME")(asFetch(f))).toEqual(["葬送のフリーレン", "Dandadan"]);
    const body = JSON.parse(init!.body as string);
    expect(body.query).toContain("isAdult: false");
    expect(body.variables).toEqual({ type: "ANIME" });
  });

  it("Apple Music: 曲名(アーティスト)にする", async () => {
    expect(await appleTopSongs(asFetch(async () => json(APPLE)))).toEqual(["ライラック(Mrs. GREEN APPLE)", "Subtitle(Official髭男dism)", "曲だけ"]);
  });

  it("形が違う・空の応答でも落ちず、空の結果になる。HTTPエラーは例外", async () => {
    expect(await steamTopSellers(asFetch(async () => json({})))).toEqual([]);
    expect(await anilist("MANGA")(asFetch(async () => json({ data: null })))).toEqual([]);
    await expect(steamTopSellers(asFetch(async () => json({}, 503)))).rejects.toThrow(/503/);
  });

  it("結果は最大6件", async () => {
    const many = { top_sellers: { items: Array.from({ length: 20 }, (_, i) => ({ name: `ゲーム${i}` })) } };
    expect((await steamTopSellers(asFetch(async () => json(many)))).length).toBe(6);
  });
});

describe("取得とキャッシュ", () => {
  const on = () => ({ ...env, LOOKUP_ENABLED: "true" });
  const game = [{ tag: "game", weight: 1 }];

  it("無効(既定)のときは、何もせず、通信もしない", async () => {
    const f = vi.fn(async () => json(STEAM));
    expect(await lookupForText({ ...env }, "面白いゲームないかな", game, asFetch(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("頼んでいない会話では通信しない", async () => {
    const f = vi.fn(async () => json(STEAM));
    expect(await lookupForText(on(), "ゲームした", game, asFetch(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("調べた結果を返し、3時間は使い回す(全ユーザー共通のキャッシュ)", async () => {
    const f = vi.fn(async () => json(STEAM));
    const t0 = 1_800_000_000_000;
    const r = await lookupForText(on(), "面白いゲームないかな", game, asFetch(f), t0);
    expect(r).toMatchObject({ tag: "game", label: ADAPTERS.game!.label });
    expect(r!.items[0]).toBe("Counter-Strike 2");
    await lookupForText(on(), "おすすめのゲーム教えて", game, asFetch(f), t0 + LOOKUP_TTL_MS - 1000);
    expect(f).toHaveBeenCalledTimes(1);
    await lookupForText(on(), "おすすめのゲーム教えて", game, asFetch(f), t0 + LOOKUP_TTL_MS + 1000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("ユーザーの言葉は、外への通信に一切含まれない(URLにも本文にも出ない)", async () => {
    const sent: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => (sent.push(url + " " + (init?.body ?? "")), json(STEAM)));
    const secret = "田中太郎の秘密の電話番号090-1234-5678でも遊べる面白いゲームないかな";
    await lookupForText(on(), secret, game, asFetch(f));
    expect(f).toHaveBeenCalled();
    const all = sent.join("\n");
    for (const leak of ["田中", "秘密", "090", "電話"]) expect(all).not.toContain(leak);
  });

  it("失敗しても例外にしない。古い結果があれば使い、10分後に再挑戦する", async () => {
    const t0 = 1_800_000_000_000;
    await lookupForText(on(), "面白いゲームないかな", game, asFetch(async () => json(STEAM)), t0);
    const fail = vi.fn(async () => json({}, 503));
    const t1 = t0 + LOOKUP_TTL_MS + 1000;
    const r = await lookupForText(on(), "面白いゲームないかな", game, asFetch(fail), t1);
    expect(r!.items[0]).toBe("Counter-Strike 2"); // 古い結果で答える
    expect(fail).toHaveBeenCalledTimes(1);
    await lookupForText(on(), "面白いゲームないかな", game, asFetch(fail), t1 + 5 * 60_000); // まだ
    expect(fail).toHaveBeenCalledTimes(1);
    await lookupForText(on(), "面白いゲームないかな", game, asFetch(fail), t1 + 11 * 60_000); // 再挑戦
    expect(fail).toHaveBeenCalledTimes(2);
  });

  it("初めての取得に失敗したら null(結果なしで普通に返事する)", async () => {
    const f = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await lookupForText(on(), "面白いゲームないかな", game, asFetch(f))).toBeNull();
  });
});

describe("会話への組み込み(統合)", () => {
  function fakeNetwork(opts: { steamDown?: boolean } = {}) {
    const external: { url: string; body: string }[] = [];
    const prompts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.startsWith("https://store.steampowered.com/")) {
        external.push({ url: u, body: String(init?.body ?? "") });
        if (opts.steamDown) throw new Error("steam down");
        return json(STEAM);
      }
      const body = JSON.parse(init!.body as string);
      const name = body.response_format.json_schema.name as string;
      prompts.push(body.messages[1].content as string);
      const content =
        name === "topics_result"
          ? { topics: [{ tag: "game", weight: 1 }] }
          : { replies: [...(body.messages[1].content as string).matchAll(/personaId: (\S+)/g)].map((m) => ({ personaId: m[1], text: "いいですね、それなら気になるやつがあるよ" })) };
      return json({ choices: [{ message: { content: JSON.stringify(content) } }] });
    }) as unknown as typeof fetch);
    return { external, prompts };
  }
  const base = { LLM_PROVIDER: "local", LLM_MODEL: "fake", LLM_BASE_URL: "http://fake.invalid/v1", LOOKUP_ENABLED: "true" };

  async function withEnv(overrides: Record<string, string>, path: string, init: RequestInit) {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(`http://localhost${path}`, init), { ...env, ...base, ...overrides }, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }
  const followGamers = async (userId: string) => {
    for (const id of ["riku_game", "dai_dev", "ren_cinema"]) {
      await env.DB.prepare("INSERT INTO relations (user_id, persona_id, followed_at) VALUES (?, ?, 1000)").bind(userId, id).run();
    }
  };

  it("「面白いゲームないかな」とつぶやくと、人気のゲームを調べて、返信するキャラへの指示に入る", async () => {
    const { token, userId } = await register();
    await followGamers(userId);
    const net = fakeNetwork();
    for (let i = 0; i < 4; i++) await withEnv({}, "/v1/posts", authed(token, "POST", { body: "最近ヒマ。面白いゲームないかな" }));

    const reply = net.prompts.filter((p) => p.includes("personaId:"));
    expect(reply.length).toBeGreaterThan(0);
    expect(reply.some((p) => p.includes("調べた結果(いま人気のゲーム(Steamの売れ筋)): Counter-Strike 2 / モンスターハンターワイルズ"))).toBe(true);
    // 外への通信は固定のSteam APIだけで、つぶやきは含まれない。キャッシュで1回だけ
    expect(net.external).toHaveLength(1);
    expect(net.external[0]!.url + net.external[0]!.body).not.toContain("ヒマ");
  });

  it("ただの報告(ゲームした)では調べない", async () => {
    const { token, userId } = await register();
    await followGamers(userId);
    const net = fakeNetwork();
    for (let i = 0; i < 3; i++) await withEnv({}, "/v1/posts", authed(token, "POST", { body: "今日はゲームした。楽しかった" }));
    expect(net.external).toEqual([]);
    expect(net.prompts.join("")).not.toContain("調べた結果");
  });

  it("スレッドで「他にも面白いゲームない?」と聞くと、そのフォロワーが調べた結果を踏まえて返事する", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId, "riku_game", { postBody: "ゲームの話", text: "ガチでわかるw" });
    const net = fakeNetwork();
    const res = await withEnv({}, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body: "他にも面白いゲームない?" }));
    expect(res.status).toBe(201);
    const p = net.prompts.at(-1)!;
    expect(p).toContain("調べた結果(いま人気のゲーム(Steamの売れ筋))");
    expect(p).toContain("モンスターハンターワイルズ");
    expect(net.external).toHaveLength(1);
    expect(net.external[0]!.url + net.external[0]!.body).not.toContain("他にも");
  });

  it("スレッドで話題の言葉が無くても、元のつぶやきの話題で調べる(「何かおすすめある?」)", async () => {
    const { token, userId } = await register();
    const id = await seedReply(userId, "riku_game", { postBody: "ゲームの話", text: "ガチでわかるw" });
    await env.DB.prepare("UPDATE posts SET topics = ? WHERE user_id = ?").bind(JSON.stringify([{ tag: "game", weight: 1 }]), userId).run();
    const net = fakeNetwork();
    await withEnv({}, `/v1/reactions/${encodeURIComponent(id)}/messages`, authed(token, "POST", { body: "何かおすすめある?" }));
    expect(net.prompts.at(-1)).toContain("調べた結果");
  });

  it("無効(既定)のときは、頼まれても調べない", async () => {
    const { token, userId } = await register();
    await followGamers(userId);
    const net = fakeNetwork();
    for (let i = 0; i < 3; i++) await withEnv({ LOOKUP_ENABLED: "false" }, "/v1/posts", authed(token, "POST", { body: "面白いゲームないかな" }));
    expect(net.external).toEqual([]);
    expect(net.prompts.join("")).not.toContain("調べた結果");
  });

  it("調べに失敗しても、投稿も返信も普通に完了する", async () => {
    const { token, userId } = await register();
    await followGamers(userId);
    fakeNetwork({ steamDown: true });
    for (let i = 0; i < 4; i++) expect((await withEnv({}, "/v1/posts", authed(token, "POST", { body: "面白いゲームないかな" }))).status).toBe(201);
    const posts = ((await (await call("/v1/posts", bearer(token))).json()) as { posts: { status: string; reactions: { type: string }[] }[] }).posts;
    expect(posts.every((p) => p.status === "done")).toBe(true);
    expect(posts.some((p) => p.reactions.some((r) => r.type === "reply"))).toBe(true);
  });
});

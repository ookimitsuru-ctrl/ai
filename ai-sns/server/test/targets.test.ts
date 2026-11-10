import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { loadReplyTargets } from "../src/targets";

async function seed(userId: string, postBody: string, replyText: string, at: number) {
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, nickname, created_at) VALUES (?, 'u', 1)").bind(userId).run();
  const postId = `${userId}-${at}`;
  await env.DB.prepare("INSERT INTO posts (id, user_id, body, created_at) VALUES (?, ?, ?, ?)").bind(postId, userId, postBody, at).run();
  await env.DB.prepare(
    "INSERT INTO reactions (id, user_id, post_id, persona_id, type, text, visible_at, created_at) VALUES (?, ?, ?, 'kenji_run', 'reply', ?, ?, ?)",
  ).bind(`r-${postId}`, userId, postId, replyText, at, at).run();
}

beforeEach(async () => {
  for (const t of ["notifications", "reactions", "posts", "relations", "users", "invites"]) await env.DB.prepare(`DELETE FROM ${t}`).run();
});

describe("返信用の情報収集", () => {
  it("直近のやりとりは自分のものだけ。他ユーザーのつぶやき・返信は混ざらない", async () => {
    await seed("A", "Aのつぶやき", "Aへの返信", 100);
    await seed("B", "Bの秘密のつぶやき", "Bへの返信", 200);
    const [forA] = await loadReplyTargets(env.DB, "A", ["kenji_run"], new Set());
    expect(forA!.recentExchanges).toEqual([{ userText: "Aのつぶやき", replyText: "Aへの返信" }]);
    expect(JSON.stringify(forA)).not.toContain("B");
    const [forC] = await loadReplyTargets(env.DB, "C", ["kenji_run"], new Set());
    expect(forC!.recentExchanges).toEqual([]);
  });

  it("新しい3件を古い順で返し、新規フォロワーのフラグが付く", async () => {
    for (let i = 1; i <= 5; i++) await seed("A", `つぶやき${i}`, `返信${i}`, i * 100);
    const [t] = await loadReplyTargets(env.DB, "A", ["kenji_run"], new Set(["kenji_run"]));
    expect(t!.recentExchanges.map((e) => e.replyText)).toEqual(["返信3", "返信4", "返信5"]);
    expect(t!.isNewFollower).toBe(true);
  });
});

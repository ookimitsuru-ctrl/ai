import { PERSONAS } from "./data";
import { decideFollows } from "./follow";
import { createLlmProvider } from "./llm";
import { MockLlmProvider } from "./llm/mock";
import type { GeneratedReply, LlmProvider, ReplyTarget } from "./llm/provider";
import { decideReactions } from "./reactions";
import { randomFor } from "./rng";
import { loadReplyTargets } from "./targets";
import { analyzeByKeywords } from "./topics";
import type { Env, TopicWeight } from "./types";

/** 返信生成。LLM の失敗・拒否・設定ミスでもアプリは止めず、ペルソナのセリフ例で代用する(SPEC §8) */
async function generateRepliesSafely(
  llm: LlmProvider,
  post: { id: string; body: string },
  topics: TopicWeight[],
  targets: ReplyTarget[],
): Promise<Map<string, string>> {
  if (targets.length === 0) return new Map();
  let list: GeneratedReply[];
  try {
    list = await llm.generateReplies({ post, topics, targets });
  } catch (err) {
    console.error("generateReplies failed; fallback to samples", err);
    list = await new MockLlmProvider().generateReplies({ post, topics, targets });
  }
  return new Map(list.map((r) => [r.personaId, r.text]));
}

/** 人ごとの表示遅延(ms)。10秒〜最大遅延の間でずらし、同じ投稿なら同じ値になる。最大遅延が0なら即時 */
export function delayFor(postId: string, personaId: string, delayMax: number): number {
  if (delayMax <= 0) return 0;
  return Math.floor(10_000 + randomFor(postId, `delay:${personaId}`) * Math.max(0, delayMax - 10_000));
}

/**
 * 投稿1件の処理: 話題解析 → フォロー判定 → リアクション判定 → 返信生成 → 保存。
 * - 結果は最後に1回のバッチで書く。途中で落ちても中途半端な状態は残らず、投稿は 'processing' のまま
 *   (→ 一定時間後に recoverStuckPosts が縮退運転で完了させる)
 * - 乱数は投稿IDから決まるので、やり直しても同じ判定になる
 * - degraded=true なら LLM を使わない(キーワード話題解析+セリフ例の返信)
 * - 新規フォロワーのフォロー時刻と通知は、その人の返信と同じ時刻にそろえる(時間差演出)
 */
export async function processPost(env: Env, postId: string, opts: { degraded?: boolean } = {}): Promise<void> {
  const db = env.DB;
  const post = await db
    .prepare("SELECT id, user_id, body, status FROM posts WHERE id = ?")
    .bind(postId)
    .first<{ id: string; user_id: string; body: string; status: string }>();
  if (!post || post.status !== "processing") return;
  const userId = post.user_id;

  // 話題解析。LLM の設定ミス・障害・拒否があってもキーワード一致で続行する(縮退運転)
  let llm: LlmProvider;
  let topics: TopicWeight[];
  if (opts.degraded) {
    llm = new MockLlmProvider();
    topics = analyzeByKeywords(post.body);
  } else {
    try {
      llm = createLlmProvider(env);
    } catch (err) {
      console.error("createLlmProvider failed; fallback to mock", err);
      llm = new MockLlmProvider();
    }
    try {
      topics = await llm.analyzeTopics(post.body);
    } catch (err) {
      console.error("analyzeTopics failed; fallback to keywords", err);
      topics = analyzeByKeywords(post.body);
    }
  }

  const now = Date.now();
  // フォロー判定。対象は未フォロー(時間差で予約済みの人も含めて除外)。他ユーザーの状況は見ない
  const rel = await db
    .prepare("SELECT persona_id, followed_at FROM relations WHERE user_id = ?")
    .bind(userId)
    .all<{ persona_id: string; followed_at: number }>();
  const allRelated = new Set(rel.results.map((r) => r.persona_id));
  const visibleFollowers = new Set(rel.results.filter((r) => r.followed_at <= now).map((r) => r.persona_id));

  const decisions = decideFollows({
    candidates: PERSONAS.filter((p) => !allRelated.has(p.id)),
    topics,
    currentFollowerCount: allRelated.size,
    randFor: (personaId) => randomFor(postId, personaId),
  });

  // リアクション判定。反応するのは、すでに表示されているフォロワー+今回の新規フォロワー
  const newIds = new Set(decisions.map((d) => d.personaId));
  const plan = decideReactions({
    followers: PERSONAS.filter((p) => visibleFollowers.has(p.id) || newIds.has(p.id)).map((persona) => ({
      persona,
      isNewFollower: newIds.has(persona.id),
    })),
    topics,
    randFor: (key) => randomFor(postId, key),
  });

  // 返信生成(このユーザーとの直近のやりとりだけを渡す)
  const replyIds = plan.filter((r) => r.kind === "reply").map((r) => r.personaId);
  const targets = await loadReplyTargets(db, userId, replyIds, newIds);
  const replies = await generateRepliesSafely(llm, { id: postId, body: post.body }, topics, targets);

  // 保存(1回のバッチ。やり直しても二重にならないよう、IDは投稿ID+ペルソナIDで決める)
  const delayMax = Number.parseInt(env.REACTION_DELAY_MAX_MS ?? "180000", 10) || 0;
  const doneAt = Date.now();
  const visibleAt = (personaId: string) => doneAt + delayFor(postId, personaId, delayMax);

  const stmts = [
    db
      .prepare("UPDATE posts SET topics = ?, status = 'done' WHERE id = ? AND status = 'processing'")
      .bind(JSON.stringify(topics), postId),
  ];
  for (const d of decisions) {
    const at = visibleAt(d.personaId);
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO relations (user_id, persona_id, followed_at, trigger_post_id, affinity_at_follow) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(userId, d.personaId, at, postId, d.affinity),
      db
        .prepare(
          "INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, 'follow', ?, ?, ?)",
        )
        .bind(`follow:${userId}:${d.personaId}`, userId, d.personaId, at, doneAt),
    );
  }
  for (const r of plan) {
    const reactionId = `${postId}:${r.personaId}`;
    const at = visibleAt(r.personaId);
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO reactions (id, user_id, post_id, persona_id, type, text, visible_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(reactionId, userId, postId, r.personaId, r.kind, r.kind === "reply" ? (replies.get(r.personaId) ?? null) : null, at, doneAt),
      db
        .prepare("INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(`reaction:${reactionId}`, userId, r.kind, reactionId, at, doneAt),
    );
  }
  await db.batch(stmts);
}

/**
 * 処理中のまま一定時間たった投稿(処理が途中で打ち切られた等)を、AIを使わない縮退運転で完了させる。
 * 読み出し(一覧・通知)のたびに呼ぶ。同時に呼ばれても、最初の1回だけが担当する。
 * 返した Promise の完了は呼び出し側が待つ(または裏で走らせる)。
 */
export async function recoverStuckPosts(env: Env, userId: string): Promise<Promise<void>[]> {
  const db = env.DB;
  const stuckMs = Number.parseInt(env.STUCK_POST_MS ?? "90000", 10) || 90_000;
  const now = Date.now();
  const rows = await db
    .prepare("SELECT id FROM posts WHERE user_id = ? AND status = 'processing' AND process_started_at < ? LIMIT 3")
    .bind(userId, now - stuckMs)
    .all<{ id: string }>();
  const jobs: Promise<void>[] = [];
  for (const { id } of rows.results) {
    const claim = await db
      .prepare("UPDATE posts SET process_started_at = ? WHERE id = ? AND status = 'processing' AND process_started_at < ?")
      .bind(now, id, now - stuckMs)
      .run();
    if (claim.meta.changes === 1) {
      jobs.push(
        processPost(env, id, { degraded: true }).catch((err) => console.error("recoverStuckPosts failed", id, err)),
      );
    }
  }
  return jobs;
}

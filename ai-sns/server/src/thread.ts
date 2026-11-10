import { PERSONA_BY_ID } from "./data";
import { angleFor } from "./angles";
import { createLlmProvider } from "./llm";
import { lookupForText } from "./lookup";
import { analyzeByKeywords } from "./topics";
import { MockLlmProvider } from "./llm/mock";
import type { LlmProvider, ReplyTarget } from "./llm/provider";
import { generateRepliesSafely } from "./processPost";
import { randomFor } from "./rng";
import type { Env, TopicWeight } from "./types";

/** スレッドで、フォロワーが返事をするまでの待ち時間(ms)。会話らしく数秒〜最大30秒。最大遅延が0なら即時 */
export function threadDelayFor(msgId: string, delayMax: number): number {
  if (delayMax <= 0) return 0;
  const cap = Math.max(3_000, Math.min(delayMax, 30_000));
  return Math.floor(3_000 + randomFor(msgId, "thread-delay") * (cap - 3_000));
}

/** スレッドの会話履歴を「相手の言葉→自分の返事」の組にする。最初の組は、元のつぶやきとフォロワーの最初の返信 */
export function buildExchanges(
  rootPost: string,
  rootReply: string,
  history: { role: string; text: string }[],
  maxPairs = 4,
): { userText: string; replyText: string }[] {
  const pairs = [{ userText: rootPost, replyText: rootReply }];
  let pendingUser: string | null = null;
  for (const m of history) {
    if (m.role === "user") pendingUser = m.text;
    else if (pendingUser !== null) {
      pairs.push({ userText: pendingUser, replyText: m.text });
      pendingUser = null;
    }
  }
  return pairs.slice(-maxPairs);
}

/**
 * スレッドへのユーザーの発言1件に、そのフォロワーが返事をする。
 * - 返事の生成は、つぶやきへの返信と同じ仕組み(口調・検証・再生成・失敗時の縮退)
 * - 会話の履歴は、そのユーザーとそのスレッドの分だけを渡す(他のスレッド・他ユーザーは混ぜない)
 * - 結果は1回のバッチで書く。途中で落ちても中途半端な状態は残らない(→ recoverStuckThreadMessages)
 */
export async function processThreadMessage(env: Env, msgId: string, opts: { degraded?: boolean } = {}): Promise<void> {
  const db = env.DB;
  const msg = await db
    .prepare("SELECT id, user_id, reaction_id, text, status, created_at FROM thread_messages WHERE id = ? AND role = 'user'")
    .bind(msgId)
    .first<{ id: string; user_id: string; reaction_id: string; text: string; status: string; created_at: number }>();
  if (!msg || msg.status !== "processing") return;

  const root = await db
    .prepare(
      "SELECT r.persona_id, r.text AS reply_text, p.body, p.topics FROM reactions r JOIN posts p ON p.id = r.post_id WHERE r.id = ? AND r.user_id = ? AND p.user_id = ? AND r.type = 'reply'",
    )
    .bind(msg.reaction_id, msg.user_id, msg.user_id)
    .first<{ persona_id: string; reply_text: string | null; body: string; topics: string | null }>();
  const persona = root && PERSONA_BY_ID.get(root.persona_id);
  if (!root || !persona) return;

  const history = await db
    .prepare(
      "SELECT role, text FROM thread_messages WHERE user_id = ? AND reaction_id = ? AND created_at < ? AND id != ? ORDER BY created_at ASC",
    )
    .bind(msg.user_id, msg.reaction_id, msg.created_at, msg.id)
    .all<{ role: string; text: string }>();

  const target: ReplyTarget = {
    persona,
    isNewFollower: false,
    recentExchanges: buildExchanges(root.body, root.reply_text ?? "", history.results),
    angle: angleFor(msg.id, persona.id),
  };

  let llm: LlmProvider;
  if (opts.degraded) llm = new MockLlmProvider();
  else {
    try {
      llm = createLlmProvider(env);
    } catch (err) {
      console.error("createLlmProvider failed; fallback to mock", err);
      llm = new MockLlmProvider();
    }
  }
  const rootTopics: TopicWeight[] = root.topics ? (JSON.parse(root.topics) as TopicWeight[]) : [];
  // 「他にも面白いゲームある?」のようにスレッドで聞かれたら、人気のものを調べて返事に組み込む
  // (発言に話題の言葉が無い「何かおすすめある?」は、元のつぶやきの話題を使う)
  if (!opts.degraded) {
    const own = analyzeByKeywords(msg.text);
    const lookup = await lookupForText(env, msg.text, own.some((t) => t.tag !== "daily") ? own : rootTopics);
    if (lookup) target.lookup = { label: lookup.label, items: lookup.items };
  }
  const topics = rootTopics;
  const replies = await generateRepliesSafely(llm, { id: msg.id, body: msg.text }, topics, [target], "thread");
  const text = replies.get(persona.id) ?? persona.samples[0]!;

  const delayMax = Number.parseInt(env.REACTION_DELAY_MAX_MS ?? "180000", 10) || 0;
  const now = Date.now();
  const visibleAt = now + threadDelayFor(msg.id, delayMax);
  const replyId = `${msg.id}:reply`;
  await db.batch([
    db.prepare("UPDATE thread_messages SET status = 'done' WHERE id = ? AND status = 'processing'").bind(msg.id),
    db
      .prepare(
        "INSERT OR IGNORE INTO thread_messages (id, user_id, reaction_id, role, persona_id, text, status, visible_at, created_at) VALUES (?, ?, ?, 'persona', ?, ?, 'done', ?, ?)",
      )
      .bind(replyId, msg.user_id, msg.reaction_id, persona.id, text, visibleAt, now),
    db
      .prepare("INSERT OR IGNORE INTO notifications (id, user_id, type, ref_id, visible_at, created_at) VALUES (?, ?, 'thread_reply', ?, ?, ?)")
      .bind(`thread:${replyId}`, msg.user_id, replyId, visibleAt, now),
  ]);
}

/** 返事ができないまま時間がたった発言を、AIを使わない縮退運転で完了させる(読み出しのたびに確認) */
export async function recoverStuckThreadMessages(env: Env, userId: string): Promise<Promise<void>[]> {
  const db = env.DB;
  const stuckMs = Number.parseInt(env.STUCK_POST_MS ?? "90000", 10) || 90_000;
  const now = Date.now();
  const rows = await db
    .prepare("SELECT id FROM thread_messages WHERE user_id = ? AND role = 'user' AND status = 'processing' AND process_started_at < ? LIMIT 3")
    .bind(userId, now - stuckMs)
    .all<{ id: string }>();
  const jobs: Promise<void>[] = [];
  for (const { id } of rows.results) {
    const claim = await db
      .prepare("UPDATE thread_messages SET process_started_at = ? WHERE id = ? AND status = 'processing' AND process_started_at < ?")
      .bind(now, id, now - stuckMs)
      .run();
    if (claim.meta.changes === 1) {
      jobs.push(processThreadMessage(env, id, { degraded: true }).catch((err) => console.error("recoverStuckThreadMessages failed", id, err)));
    }
  }
  return jobs;
}

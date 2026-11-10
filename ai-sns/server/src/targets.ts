import { PERSONA_BY_ID } from "./data";
import type { ReplyTarget } from "./llm/provider";

/**
 * 返信するペルソナごとに、プロンプトへ渡す情報を集める。
 * 「直近のやりとり」は必ずそのユーザー自身のものだけ(SPEC §3.6: 他ユーザーのデータは絶対に混ぜない)。
 */
export async function loadReplyTargets(
  db: D1Database,
  userId: string,
  personaIds: string[],
  newFollowerIds: Set<string>,
): Promise<ReplyTarget[]> {
  const targets: ReplyTarget[] = [];
  for (const id of personaIds) {
    const ex = await db
      .prepare(
        "SELECT p.body AS userText, r.text AS replyText FROM reactions r JOIN posts p ON p.id = r.post_id WHERE r.user_id = ? AND p.user_id = ? AND r.persona_id = ? AND r.type = 'reply' AND r.text IS NOT NULL ORDER BY r.created_at DESC LIMIT 3",
      )
      .bind(userId, userId, id)
      .all<{ userText: string; replyText: string }>();
    targets.push({
      persona: PERSONA_BY_ID.get(id)!,
      isNewFollower: newFollowerIds.has(id),
      recentExchanges: ex.results.map((e) => ({ userText: e.userText, replyText: e.replyText })).reverse(),
    });
  }
  return targets;
}

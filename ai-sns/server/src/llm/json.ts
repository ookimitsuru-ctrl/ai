/**
 * LLM の出力テキストから JSON を取り出す。
 * - Qwen3 などの <think>…</think> は取り除く(閉じタグが無い場合は以降すべて捨てる)
 * - ```json フェンスや前後の説明文があっても、最初の { から最後の } までを読む
 */
export function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("LLM の出力に JSON が見つかりません");
  }
}

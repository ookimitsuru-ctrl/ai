/**
 * LLM(ローカル / Haiku)が、このアプリの用途で実用になるかを手元で試すスクリプト。サーバーは不要。
 *
 *   # ローカルLLM(OpenAI互換API)の例
 *   LLM_PROVIDER=local LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=<モデル名> \
 *     npm run try-llm -- "朝ランで10km走ってきた!"
 *
 *   # Haiku の例
 *   LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... npm run try-llm -- "新しいカフェでラテを飲んだ"
 *
 * オプション: --personas=kenji_run,miyu_cafe  返信させる人を指定(省略時は話題に合う上位5人)
 *            --new=kenji_run                   その人を「今フォローしてきた」扱いにする
 */
import { assignAngles } from "../src/angles";
import { PERSONAS, PERSONA_BY_ID } from "../src/data";
import { computeAffinity } from "../src/follow";
import { createLlmProvider } from "../src/llm";
import { PromptedLlmProvider } from "../src/llm/prompted";
import { verifyReply } from "../src/llm/verify";
import { assignRoles, looksLikeRequest } from "../src/roles";
import type { Env, Persona } from "../src/types";

const args = process.argv.slice(2);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const post = args.filter((a) => !a.startsWith("--")).join(" ") || "朝ランで10km走ってきた!今日は気持ちよかった";

const llm = createLlmProvider(process.env as unknown as Env);
console.log(`プロバイダ: ${llm.name}`);
console.log(`つぶやき: ${post}\n`);

const t0 = Date.now();
const topics = await llm.analyzeTopics(post);
console.log(`[話題解析] ${((Date.now() - t0) / 1000).toFixed(1)}秒 →`, topics.map((t) => `${t.tag}:${t.weight}`).join(", "));

let chosen: Persona[];
const ids = opt("personas");
if (ids) {
  chosen = ids.split(",").map((id) => {
    const p = PERSONA_BY_ID.get(id.trim());
    if (!p) throw new Error(`未知のペルソナ: ${id}`);
    return p;
  });
} else {
  chosen = PERSONAS.map((p) => ({ p, a: computeAffinity(p, topics) }))
    .filter((x) => x.a > 0)
    .sort((x, y) => y.a - x.a)
    .slice(0, 5)
    .map((x) => x.p);
  if (chosen.length === 0) chosen = PERSONAS.slice(0, 3);
}
const newId = opt("new");

// 本番と同じように、質問・頼みごとなら「役割分担」、そうでなければ「切り口」を割り当てる
const asking = looksLikeRequest(post);
const ranked = [...chosen].sort((a, b) => computeAffinity(b, topics) - computeAffinity(a, topics)).map((p) => p.id);
const roles = asking ? assignRoles(ranked) : new Map<string, string>();
const angles = asking ? new Map<string, string>() : assignAngles("try", chosen.map((p) => p.id));
console.log(asking ? "[質問・頼みごと] 役割を分担して答えさせます" : "[ふつうのつぶやき] 切り口を変えて返信させます");

const t1 = Date.now();
const replies = await llm.generateReplies({
  post: { id: "try", body: post },
  topics,
  targets: chosen.map((persona) => ({
    persona,
    isNewFollower: persona.id === newId,
    recentExchanges: [],
    role: roles.get(persona.id),
    angle: angles.get(persona.id),
  })),
});
const sec = ((Date.now() - t1) / 1000).toFixed(1);
console.log(`[返信生成] ${chosen.length}人分 ${sec}秒\n`);

let ok = 0;
for (const r of replies) {
  const persona = PERSONA_BY_ID.get(r.personaId)!;
  const problem = verifyReply(persona, r.text, post);
  if (!problem) ok++;
  const role = roles.get(r.personaId);
  console.log(`${persona.name}(@${persona.handle})${role ? `  [役割: ${role.slice(0, 14)}…]` : ""}${r.mood === "fallback" ? "  ※セリフ例で代用" : ""}`);
  console.log(`  ${r.text}`);
  if (problem) console.log(`  ⚠ 基準違反: ${problem}`);
}

if (llm instanceof PromptedLlmProvider) {
  const d = llm.lastDiagnostics;
  const firstTry = d.filter((x) => x.attempts === 1 && x.source === "llm").length;
  const fallback = d.filter((x) => x.source === "sample").length;
  console.log(`\n--- 集計 ---`);
  console.log(`1回目で合格: ${firstTry}/${d.length}  再生成が必要だった: ${d.length - firstTry - fallback}  セリフ例で代用: ${fallback}`);
  for (const x of d.filter((y) => y.rejected.length > 0)) console.log(`  却下 ${x.personaId}: ${x.rejected.join(" / ")}`);
}
console.log(`基準を満たした返信: ${ok}/${replies.length}`);
console.log("\n口調がキャラらしいか(語尾・一人称・長さ・個性の違い)は、上の出力を目で見て判断してください。");

/**
 * フォローの増え方を、AI を使わずに確認するシミュレーション。
 *   npm run sim
 *   FOLLOW_CFG='{"pace":0.6,"hookProbability":0.7}' npm run sim   # パラメータを一時的に変えて試す
 */
import { PERSONAS } from "../src/data";
import { DEFAULT_FOLLOW_CONFIG, type FollowConfig, decideFollows, followProbability } from "../src/follow";
import { randomFor, seededRandom } from "../src/rng";
import { analyzeByKeywords } from "../src/topics";
import { ALL_POSTS, POSTS_BY_GENRE } from "./samplePosts";

const overrides = process.env.FOLLOW_CFG ? (JSON.parse(process.env.FOLLOW_CFG) as Partial<FollowConfig>) : {};
const cfg: FollowConfig = { ...DEFAULT_FOLLOW_CONFIG, ...overrides };
console.log("設定:", JSON.stringify({ ...cfg, interestValue: undefined }));

// ---- A. 投稿ごとに、誰がどのくらいの確率でフォローするか ----
console.log("\n=== A. 投稿 → フォローしやすい人(確率5%以上、フォロワー0人のとき) ===");
for (const post of ALL_POSTS) {
  const topics = analyzeByKeywords(post);
  const rows = PERSONAS.map((p) => ({ p, ...followProbability(p, topics, 0, cfg) }))
    .filter((r) => r.probability >= 0.05)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4)
    .map((r) => `${r.p.name}${Math.round(r.probability * 100)}%`);
  console.log(`「${post}」 [${topics.map((t) => t.tag).join(",")}] → ${rows.join(" / ") || "(誰も来ない)"}`);
}

// ---- B. 続けて投稿したときのフォロワー数の推移 ----
const USERS = 3000;
const MAX_POSTS = 100;

function simulate(pool: string[], seed: number): number[] {
  const rand = seededRandom(seed);
  const followed = new Set<string>();
  const curve: number[] = [];
  for (let i = 0; i < MAX_POSTS; i++) {
    const text = pool[Math.floor(rand() * pool.length)]!;
    const postId = `u${seed}-p${i}`;
    const decisions = decideFollows({
      candidates: PERSONAS.filter((p) => !followed.has(p.id)),
      topics: analyzeByKeywords(text),
      currentFollowerCount: followed.size,
      randFor: (id) => randomFor(postId, id),
      cfg,
    });
    decisions.forEach((d) => followed.add(d.personaId));
    curve.push(followed.size);
  }
  return curve;
}

const quantile = (xs: number[], q: number) => xs.slice().sort((a, b) => a - b)[Math.floor(q * (xs.length - 1))]!;

function report(label: string, pool: string[]) {
  const curves = Array.from({ length: USERS }, (_, i) => simulate(pool, i + 1));
  const mean = (n: number) => (curves.reduce((s, c) => s + c[n - 1]!, 0) / USERS).toFixed(1);
  const reach = (k: number) => {
    const posts = curves.map((c) => c.findIndex((v) => v >= k) + 1).filter((v) => v > 0);
    return posts.length < USERS * 0.5 ? "—(半数未満)" : `${quantile(posts, 0.5)}回目(中央値) ${Math.round((posts.length / USERS) * 100)}%到達`;
  };
  console.log(`\n--- ${label} (サンプル${pool.length}件) ---`);
  console.log(`フォロワー平均: 1投稿後 ${mean(1)} / 5投稿後 ${mean(5)} / 10投稿後 ${mean(10)} / 20投稿後 ${mean(20)} / 30投稿後 ${mean(30)} / 60投稿後 ${mean(60)} / 100投稿後 ${mean(100)}`);
  console.log(`5人到達: ${reach(5)} / 10人到達: ${reach(10)} / 20人(コンプリート)到達: ${reach(20)}`);
}

console.log("\n=== B. 続けて投稿したときのフォロワー数(3000人分のシミュレーション) ===");
report("いろんな話題をつぶやく人", ALL_POSTS);
report("ランニングや運動ばかりの人", POSTS_BY_GENRE["運動"]!);
report("食べ物の話ばかりの人", POSTS_BY_GENRE["食べ物"]!);
report("日常の雑談ばかりの人", POSTS_BY_GENRE["雑談"]!);

/**
 * 調べもの(Steam / AniList / Apple Music)とニュースが、実際のネットで取れるかを試すスクリプト。サーバー不要。
 *   npm run try-lookup
 *   npm run try-lookup -- --news=running      # ニュースRSS(話題タグ)も試す
 *
 * 実際の公開APIの応答の形が、想定と違っていないかの確認用。取れた件数と中身を表示する。
 * 外に送るのは固定のリクエストだけ(ユーザーの言葉は使わない)。
 */
import { ADAPTERS, detectLookup } from "../src/lookup";
import { DEFAULT_NEWS_RSS_URL, isUsableHeadline, newsQueryFor, parseRssItems } from "../src/news";

const newsTag = process.argv.find((a) => a.startsWith("--news="))?.split("=")[1];

console.log("=== 調べもの(会話で頼まれたときに使う) ===");
let failed = 0;
for (const [tag, adapter] of Object.entries(ADAPTERS)) {
  const t0 = Date.now();
  try {
    const items = await adapter.fetch(fetch);
    console.log(`\n[${tag}] ${adapter.label}  ${((Date.now() - t0) / 1000).toFixed(1)}秒 ${items.length}件`);
    items.forEach((x, i) => console.log(`  ${i + 1}. ${x}`));
    if (items.length === 0) {
      failed++;
      console.log("  ⚠ 0件でした。応答の形が想定と違う可能性があります(src/lookup.ts の読み取りを直す必要があります)");
    }
  } catch (e) {
    failed++;
    console.log(`\n[${tag}] ${adapter.label}\n  ✗ 失敗: ${e instanceof Error ? e.message : e}`);
  }
}

console.log("\n=== 頼まれたかどうかの判定(通信なし) ===");
for (const text of ["面白いゲームないかな", "他にも面白いゲームない?", "おすすめのアニメ教えて", "最近人気の曲って何?", "ゲームした", "今日は朝ランした"]) {
  console.log(`  ${detectLookup(text, []) ? "調べる  " : "調べない"}  ${text}`);
}

if (newsTag) {
  console.log(`\n=== ニュースRSS(話題タグ: ${newsTag}) ===`);
  const q = newsQueryFor(newsTag);
  if (!q) console.log("  このタグはニュースを探さない設定です");
  else {
    try {
      const res = await fetch(DEFAULT_NEWS_RSS_URL.replace("{q}", encodeURIComponent(q)), { headers: { "user-agent": "hitorigoto/0.1" } });
      const items = parseRssItems(await res.text());
      const ok = items.filter((i) => isUsableHeadline(i.title));
      console.log(`  HTTP ${res.status}  見出し ${items.length}件(使える ${ok.length}件)`);
      ok.slice(0, 5).forEach((x, i) => console.log(`  ${i + 1}. ${x.title}`));
    } catch (e) {
      console.log(`  ✗ 失敗: ${e instanceof Error ? e.message : e}`);
    }
  }
}
console.log(failed === 0 ? "\n✓ すべて取得できました" : `\n⚠ ${failed}件が取れませんでした。上の表示を貼ってください`);

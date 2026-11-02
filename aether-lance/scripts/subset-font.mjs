// Regenerate src/assets/fonts/DotGothic16-subset.woff2: DotGothic16 (SIL OFL 1.1) cut down to the characters the game
// actually prints (every non-ASCII character in src/ plus printable ASCII). Run after adding new UI text:
//   node scripts/subset-font.mjs
// The subset is produced by the Google Fonts `text=` API. tests/unit/font.test.ts fails when src/ uses a
// character that is missing from src/assets/fonts/subset-chars.txt, as a reminder to rerun this script.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/assets/fonts');

export function collectChars(dir = path.join(root, 'src')) {
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.ts')) for (const ch of fs.readFileSync(p, 'utf8')) if (ch.codePointAt(0) > 0x7e && ch.trim()) set.add(ch);
    }
  };
  walk(dir);
  return [...set].sort().join('');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const chars = collectChars();
  const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=DotGothic16&text=' + encodeURIComponent(chars), { headers: { 'user-agent': ua } })).text();
  const m = css.match(/url\((https:\/\/[^)]+)\) format\('woff2'\)/);
  if (!m) { console.error('unexpected response from Google Fonts:\n' + css.slice(0, 500)); process.exit(1); }
  const buf = Buffer.from(await (await fetch(m[1])).arrayBuffer());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'DotGothic16-subset.woff2'), buf);
  fs.writeFileSync(path.join(outDir, 'subset-chars.txt'), chars);
  console.log(`wrote DotGothic16-subset.woff2 (${(buf.length / 1024).toFixed(1)} KB, ${[...chars].length} chars)`);
}

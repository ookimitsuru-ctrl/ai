// Inline the built JS/CSS into one self-contained HTML file.
import fs from 'node:fs';
import path from 'node:path';

const [, , srcDir, outFile] = process.argv;
if (!srcDir || !outFile) { console.error('usage: singlefile.mjs <distDir> <out.html>'); process.exit(1); }
let html = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_m, href) => {
  const css = fs.readFileSync(path.join(srcDir, href), 'utf8');
  return `<style>${css}</style>`;
});
html = html.replace(/<script type="module" crossorigin src="\.?\/?([^"]+\.js)"><\/script>/g, (_m, src) => {
  const js = fs.readFileSync(path.join(srcDir, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<link rel="manifest"[^>]*>/g, '');
html = html.replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/g, '');
html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n  <meta name="singlefile" content="1" />');
// inline the SVG icon as a data URI favicon
try { const svg = fs.readFileSync(path.join(srcDir, 'icon.svg'), 'utf8'); html = html.replace('</title>', '</title>\n  <link rel="icon" href="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '" />'); } catch { /* no icon */ }
// the embedded font's license travels inside the single file
try { const ofl = fs.readFileSync(path.join(srcDir, 'licenses/DotGothic16-OFL.txt'), 'utf8').replace(/--/g, '- -'); html = html.replace('</html>', `<!--\n${ofl}\n-->\n</html>`); } catch { /* no license file */ }
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
fs.rmSync(srcDir, { recursive: true, force: true });
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);

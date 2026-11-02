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
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
fs.rmSync(srcDir, { recursive: true, force: true });
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);

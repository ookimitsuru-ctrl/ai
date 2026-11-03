// Classic-edition icons with the preinstalled Playwright Chromium:
//  1. public/icon.svg is generated from the player sprite itself (KESTREL Mk.II, frame 2) in the classic single-file
//     build (run `npm run build:single` first), on a starry background;
//  2. PNG icons and the Android adaptive-icon layers are rendered from that SVG.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function shipSvg(browser) {
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, '../dist-single/aether-lance.html') + '?debug=1');
  await page.waitForFunction(() => window.__dev && window.__dev.SPR && window.__dev.SPR.kestrel, null, { timeout: 60000 });
  const px = await page.evaluate(() => {
    const S = window.__dev.SPR.kestrel;
    const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
    const g = c.getContext('2d'); g.drawImage(S.canvas, 2 * S.w, 0, S.w, S.h, 0, 0, S.w, S.h);
    return { w: S.w, h: S.h, d: Array.from(g.getImageData(0, 0, S.w, S.h).data) };
  });
  await page.close();
  const N = 48, ox = Math.floor((N - px.w) / 2), oy = Math.floor((N - px.h) / 2);
  const hex = (i) => '#' + [px.d[i], px.d[i + 1], px.d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">`, `  <rect class="bg" width="${N}" height="${N}" fill="#0b0d17"/>`];
  for (const [x, y, c] of [[5, 9, '#97a9c6'], [40, 6, '#c6d2e3'], [33, 40, '#6a7fa3'], [8, 38, '#97a9c6'], [44, 30, '#44587e'], [20, 5, '#6a7fa3']]) out.push(`  <rect class="star" x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
  // the lance beam behind the ship
  out.push(`  <rect class="beam" x="0" y="${oy + 10}" width="${ox + 2}" height="1" fill="#33b7e8"/>`);
  for (let y = 0; y < px.h; y++) {
    let x = 0;
    while (x < px.w) {
      const i = (y * px.w + x) * 4;
      if (px.d[i + 3] < 128) { x++; continue; }
      const col = hex(i);
      let run = 1;
      while (x + run < px.w && px.d[(y * px.w + x + run) * 4 + 3] >= 128 && hex((y * px.w + x + run) * 4) === col) run++;
      out.push(`  <rect x="${ox + x}" y="${oy + y}" width="${run}" height="1" fill="${col}"/>`);
      x += run;
    }
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}

(async () => {
  const browser = await chromium.launch();
  const svg = await shipSvg(browser);
  fs.writeFileSync(path.join(__dirname, '../public/icon.svg'), svg);
  for (const size of [192, 512, 180]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:#0b0d17"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${size}px;height:${size}px;image-rendering:pixelated;display:block"></body></html>`);
    await page.screenshot({ path: path.join(__dirname, `../public/${size === 180 ? 'apple-touch-icon' : 'icon-' + size}.png`) });
    await page.close();
  }
  // Android adaptive-icon foregrounds: 108dp canvas, artwork in the central 72dp (the background layer is #0b0d17)
  const android = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [dpi, size] of Object.entries(android)) {
    const art = Math.round((size * 72) / 108), off = Math.round((size - art) / 2);
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px;image-rendering:pixelated;display:block"></body></html>`);
    const out = path.join(__dirname, `../android/app/src/main/res/mipmap-${dpi}/ic_launcher_foreground.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, omitBackground: true });
    // themed-icon silhouette (Android 13+): the ship alone, no backdrop or stars; only the alpha channel is used
    const ship = svg.split('\n').filter((l) => !/class="(bg|star|beam)"/.test(l)).join('\n');
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(ship).toString('base64')}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px;image-rendering:pixelated;display:block"></body></html>`);
    await page.screenshot({ path: out.replace('foreground', 'monochrome'), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('icons written');
})();

// HD edition launcher icon (Android adaptive icon layers), drawn as vector art with the preinstalled Playwright
// Chromium: the KESTREL from the sprite builder's polygons, smoothly shaded, over a deep-space gradient.
//   node scripts/make-icons-hd.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const html = `<canvas id="c"></canvas><script>
function draw(size, layer) {
  const c = document.getElementById('c'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  const u = size / 108; // 1 dp
  if (layer === 'bg') {
    const r = g.createRadialGradient(size * 0.62, size * 0.38, 0, size * 0.5, size * 0.5, size * 0.75);
    r.addColorStop(0, '#1d4a7a'); r.addColorStop(0.45, '#0f2140'); r.addColorStop(1, '#070912');
    g.fillStyle = r; g.fillRect(0, 0, size, size);
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.fillStyle = '#dfe9ff'; g.beginPath(); g.arc(rnd() * size, rnd() * size, (0.25 + rnd() * 0.6) * u, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // planet rim low right
    const pr = size * 0.9;
    const pg = g.createRadialGradient(size * 1.1, size * 1.55, pr * 0.9, size * 1.1, size * 1.55, pr * 1.02);
    pg.addColorStop(0, 'rgba(255,191,77,0)'); pg.addColorStop(0.93, 'rgba(255,170,60,0.55)'); pg.addColorStop(0.97, 'rgba(160,90,220,0.5)'); pg.addColorStop(1, 'rgba(160,90,220,0)');
    g.fillStyle = pg; g.fillRect(0, 0, size, size);
    return c.toDataURL('image/png');
  }
  // KESTREL Mk.II, fitted into the 66 dp safe zone, nose up-right (same layout as the 40×20 game sprite)
  const S = 64 * u / 40;
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(-0.2);
  g.scale(S, S);
  g.translate(-20, -10.5);
  const mono = layer === 'mono';
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
  const shade = (y0, y1, a, b, c2) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(0.45, b); gr.addColorStop(1, c2); return gr; };
  const fillPath = (style) => { g.fillStyle = mono ? '#fff' : style; g.fill(); if (!mono) { g.lineWidth = 0.28; g.strokeStyle = 'rgba(8,12,24,0.9)'; g.stroke(); } };
  const tankAt = (cx, cy, rx, ry, light) => {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7);
    fillPath(light ? shade(cy - ry, cy + ry, '#ffffff', '#c6d2e3', '#5c6f94') : shade(cy - ry, cy + ry, '#c6d2e3', '#8a9cbc', '#3a4a6c'));
    if (!mono) {
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.clip();
      g.fillStyle = shade(cy - ry, cy + ry, '#c8573a', '#a33a14', '#5e1c0a'); g.fillRect(cx + 1.8, cy - ry, 2.2, ry * 2);
      g.strokeStyle = 'rgba(40,50,80,0.5)'; g.lineWidth = 0.2;
      for (const dx of [-4.5, 6.5]) { g.beginPath(); g.moveTo(cx + dx, cy - ry); g.lineTo(cx + dx, cy + ry); g.stroke(); }
      g.restore();
    }
  };
  if (!mono) {
    for (const ey of [8.5, 12.5]) {
      const eg = g.createRadialGradient(2, ey, 0, 2, ey, 6);
      eg.addColorStop(0, 'rgba(230,250,255,1)'); eg.addColorStop(0.35, 'rgba(127,224,255,0.75)'); eg.addColorStop(1, 'rgba(28,138,192,0)');
      g.fillStyle = eg; g.beginPath(); g.ellipse(-0.5, ey, 6, 2, 0, 0, 7); g.fill();
    }
  }
  // upper strut + cannon (far side)
  poly([14, 3.6, 19, 3.6, 21, 8.2, 16, 8.2]); fillPath('#8a9cbc');
  g.beginPath(); g.roundRect(12, 2.1, 8, 1.8, 0.5); fillPath(shade(2, 4, '#e6eefb', '#a9b8d2', '#6a7fa3'));
  g.beginPath(); g.roundRect(19, 2.6, 18, 0.9, 0.4); fillPath(shade(2.6, 3.5, '#e6eefb', '#a9b8d2', '#6a7fa3'));
  tankAt(15.5, 6.2, 7.8, 2.5, false);
  // engines
  g.beginPath(); g.roundRect(3, 7, 5, 3, 0.6); fillPath('#2d3c5e');
  g.beginPath(); g.roundRect(3, 11, 5, 3, 0.6); fillPath('#2d3c5e');
  // hull
  poly([6, 8, 13, 7.4, 22, 7.6, 28, 8.4, 34, 9.4, 39.5, 10.5, 34, 11.4, 28, 12.1, 22, 12.6, 13, 12.7, 6, 12.3]);
  fillPath(shade(7.4, 12.7, '#ffffff', '#d4dcea', '#7a8bab'));
  if (!mono) { poly([27, 9.6, 35, 10.2, 35, 10.8, 27, 10.9]); g.fillStyle = '#a33a14'; g.fill(); }
  // canopy
  g.beginPath(); g.ellipse(25, 8.1, 3.9, 1.25, 0, 0, 7);
  if (!mono) { const cg = g.createLinearGradient(21, 7, 28, 9.3); cg.addColorStop(0, '#d4f7ff'); cg.addColorStop(0.45, '#33b7e8'); cg.addColorStop(1, '#0e2a4a'); g.fillStyle = cg; g.fill(); g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(24, 7.6, 1.5, 0.35, -0.1, 0, 7); g.fill(); }
  else { g.fillStyle = '#fff'; g.fill(); }
  // lower strut, near tank, lower cannon
  poly([12, 16.9, 18, 16.9, 20, 14, 15, 14]); fillPath('#8a9cbc');
  tankAt(15, 13.6, 8, 3.1, true);
  g.beginPath(); g.roundRect(11, 16.6, 8, 1.8, 0.5); fillPath(shade(16.6, 18.4, '#e6eefb', '#a9b8d2', '#6a7fa3'));
  g.beginPath(); g.roundRect(18, 17.1, 18, 0.9, 0.4); fillPath(shade(17.1, 18, '#e6eefb', '#a9b8d2', '#6a7fa3'));
  if (!mono) {
    for (const [mx, my] of [[37.4, 3.05], [36.4, 17.55]]) { const tg = g.createRadialGradient(mx, my, 0, mx, my, 1.8); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, 'rgba(127,224,255,0)'); g.fillStyle = tg; g.beginPath(); g.arc(mx, my, 1.8, 0, 7); g.fill(); }
  }
  g.restore();
  return c.toDataURL('image/png');
}
</script>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html);
  const sizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  const res = path.join(__dirname, '../android/app/src/hd/res');
  for (const [dpi, size] of Object.entries(sizes)) {
    const dir = path.join(res, `mipmap-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [layer, name] of [['bg', 'ic_launcher_background'], ['fg', 'ic_launcher_foreground'], ['mono', 'ic_launcher_monochrome']]) {
      const url = await page.evaluate(([s, l]) => draw(s, l), [size, layer]);
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  // a flat preview for the README / review
  const prev = await page.evaluate(() => { const bg = draw(432, 'bg'); return bg; });
  void prev;
  await browser.close();
  console.log('HD icons written');
})();

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
  // ship, fitted into the 66 dp safe zone, nose up-right
  const S = 60 * u / 32;
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(-0.22);
  g.scale(S, S);
  g.translate(-16, -7.2);
  const mono = layer === 'mono';
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
  if (!mono) {
    // lance beam + engine glow
    const beam = g.createLinearGradient(-40, 0, 30, 0);
    beam.addColorStop(0, 'rgba(51,183,232,0)'); beam.addColorStop(1, 'rgba(127,224,255,0.9)');
    g.fillStyle = beam; g.fillRect(-40, 6.6, 70, 0.8);
    const eg = g.createRadialGradient(1, 7.2, 0, 1, 7.2, 7);
    eg.addColorStop(0, 'rgba(255,240,200,1)'); eg.addColorStop(0.3, 'rgba(255,170,60,0.8)'); eg.addColorStop(1, 'rgba(217,96,28,0)');
    g.fillStyle = eg; g.beginPath(); g.ellipse(-1, 7.2, 8, 3, 0, 0, 7); g.fill();
  }
  const fill = (pts, a, b, c2) => {
    poly(pts);
    if (mono) { g.fillStyle = '#fff'; g.fill(); return; }
    const gr = g.createLinearGradient(0, 2, 0, 11); gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.fill();
    g.lineWidth = 0.35; g.strokeStyle = 'rgba(10,16,32,0.9)'; g.stroke();
  };
  fill([10, 9, 19, 9, 12, 13, 6, 13], '#c6d2e3', '#97a9c6', '#44587e');          // lower wing
  fill([4, 5.5, 7, 1.2, 9.5, 1.2, 11.5, 5.2], '#e6eefb', '#97a9c6', '#6a7fa3');    // dorsal fin
  fill([3, 5, 10, 4, 18, 4.3, 24, 5.8, 27, 7.2, 24, 8.6, 18, 9.6, 10, 10, 3, 9.6], '#ffffff', '#c6d2e3', '#6a7fa3'); // fuselage
  if (!mono) {
    g.fillStyle = '#2d3c5e'; g.fillRect(1, 5, 3, 5);
    g.strokeStyle = '#c6d2e3'; g.lineWidth = 1; g.lineCap = 'round'; g.beginPath(); g.moveTo(24.5, 7.2); g.lineTo(30.5, 7.2); g.stroke();
    const cg = g.createLinearGradient(16, 4, 23, 7.5); cg.addColorStop(0, '#d4f7ff'); cg.addColorStop(0.5, '#33b7e8'); cg.addColorStop(1, '#135e8a');
    g.fillStyle = cg; g.beginPath(); g.ellipse(19.5, 5.7, 3.4, 1.7, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(18.6, 5.1, 1.3, 0.45, -0.2, 0, 7); g.fill();
    g.strokeStyle = '#33b7e8'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(8, 7.2); g.lineTo(20, 7.2); g.stroke();
    const tip = g.createRadialGradient(30.8, 7.2, 0, 30.8, 7.2, 2.4); tip.addColorStop(0, '#ffffff'); tip.addColorStop(1, 'rgba(127,224,255,0)');
    g.fillStyle = tip; g.beginPath(); g.arc(30.8, 7.2, 2.4, 0, 7); g.fill();
  } else { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(24.5, 7.2); g.lineTo(30.5, 7.2); g.stroke(); }
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

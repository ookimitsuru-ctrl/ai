// Render public/icon.svg to PNG icons with the preinstalled Playwright Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../public/icon.svg'), 'utf8');
  const browser = await chromium.launch();
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
    const ship = svg.split('\n').filter((l) => !/width="32" height="32"|width="1" height="1"/.test(l)).join('\n');
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(ship).toString('base64')}" style="position:absolute;left:${off}px;top:${off}px;width:${art}px;height:${art}px;image-rendering:pixelated;display:block"></body></html>`);
    await page.screenshot({ path: out.replace('foreground', 'monochrome'), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('icons written');
})();

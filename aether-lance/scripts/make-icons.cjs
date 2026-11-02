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
  await browser.close();
  console.log('icons written');
})();

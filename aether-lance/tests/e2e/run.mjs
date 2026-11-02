// End-to-end smoke tests (docs/10_plan_qa.md §3.3) against the production builds.
// Usage: npm run build && npm run build:single && npm run e2e
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'tests/e2e/out');
fs.mkdirSync(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || '/').split('?')[0]);
  let f = path.join(root, 'dist', u === '/' ? 'index.html' : u);
  if (!f.startsWith(path.join(root, 'dist')) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4179, r));
const BASE = 'http://localhost:4179/';

let failures = 0;
const results = [];
async function scenario(name, fn, ctxOpts = {}) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_(NAME|INTERNET|CONNECTION|TUNNEL)/.test(m.text())) errors.push(m.text()); });
  try {
    await fn(page);
    if (errors.length) throw new Error('console errors: ' + errors.slice(0, 3).join(' | '));
    results.push(`PASS ${name}`);
  } catch (e) {
    failures++;
    results.push(`FAIL ${name}: ${e.message}`);
    await page.screenshot({ path: path.join(out, name.replace(/\W+/g, '_') + '.png') }).catch(() => {});
  }
  await browser.close();
}

const top = (page) => page.evaluate(() => {
  const s = window.__scenes?.top;
  return s ? { name: s.id ?? s.constructor.name, score: s.world?.score ?? null, t: s.world?.t ?? null, px: s.world?.player.x ?? null, state: s.world?.player.state ?? null } : null;
});
const waitFor = async (page, pred, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await top(page);
    if (v && pred(v)) return v;
    if (Date.now() - t0 > ms) throw new Error('timeout waiting; last=' + JSON.stringify(v));
    await page.waitForTimeout(150);
  }
};
const press = async (page, key, hold = 80) => { await page.keyboard.down(key); await page.waitForTimeout(hold); await page.keyboard.up(key); };
const canvasNotBlack = (page) => page.evaluate(() => {
  const c = window.__renderer.gameCanvas;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0; for (let i = 0; i < d.length; i += 16) sum += d[i] + d[i + 1] + d[i + 2];
  return sum > (d.length / 16) * 20;
});

async function toGame(page) {
  await waitFor(page, (v) => v.name === 'BootScene');
  await page.waitForTimeout(600);
  await press(page, 'KeyZ');
  await waitFor(page, (v) => v.name === 'TitleScene');
  await page.waitForTimeout(900);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'MainMenuScene');
  await page.waitForTimeout(300);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'DifficultyScene');
  await page.waitForTimeout(300);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'GameScene');
}

await scenario('boot and title render', async (page) => {
  await page.goto(BASE + '?debug=1');
  await waitFor(page, (v) => v.name === 'BootScene');
  await page.waitForTimeout(600);
  await press(page, 'KeyZ');
  await waitFor(page, (v) => v.name === 'TitleScene');
  await page.waitForTimeout(800);
  if (!(await canvasNotBlack(page))) throw new Error('title canvas is black');
  await page.screenshot({ path: path.join(out, 'title.png') });
});

await scenario('start a game and score points', async (page) => {
  await page.goto(BASE + '?debug=1');
  await toGame(page);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(9000);
  await page.keyboard.up('KeyZ');
  const v = await top(page);
  if (!(v.score > 0)) throw new Error('score did not increase: ' + JSON.stringify(v));
  await page.screenshot({ path: path.join(out, 'game.png') });
});

await scenario('pause and resume', async (page) => {
  await page.goto(BASE + '?debug=1');
  await toGame(page);
  await page.waitForTimeout(1000);
  await press(page, 'Escape');
  await waitFor(page, (v) => v.name === 'PauseScene');
  const t1 = (await page.evaluate(() => window.__scenes.stack[0].world.t));
  await page.waitForTimeout(800);
  const t2 = (await page.evaluate(() => window.__scenes.stack[0].world.t));
  if (t1 !== t2) throw new Error('world advanced while paused');
  await press(page, 'Escape');
  await waitFor(page, (v) => v.name === 'GameScene');
});

await scenario('touch drag moves the ship (iPhone 12)', async (page) => {
  await page.goto(BASE + '?debug=1');
  await page.waitForTimeout(1500);
  await toGame(page);
  await waitFor(page, (v) => v.name === 'GameScene' && v.state === 'play', 10000);
  const before = (await top(page)).px;
  const cdp = await page.context().newCDPSession(page);
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await tp('touchStart', 150, 250);
  for (let i = 1; i <= 15; i++) { await tp('touchMove', 150 + i * 6, 250); await page.waitForTimeout(16); }
  await tp('touchEnd', 0, 0);
  await page.waitForTimeout(200);
  const after = (await top(page)).px;
  if (!(after > before + 20)) throw new Error(`ship did not move right: ${before} → ${after}`);
}, { ...devices['iPhone 12 landscape'] });

await scenario('replay reproduces a live run', async (page) => {
  await page.goto(BASE + '?debug=1');
  await toGame(page);
  await page.keyboard.down('KeyZ');
  for (const k of ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) await press(page, k, 900);
  await page.keyboard.up('KeyZ');
  // snapshot the recording and the live state in one synchronous step
  const live = await page.evaluate(() => {
    const s = window.__scenes.top;
    const w = s.world;
    window.__rec = { start: structuredClone(s.run.rec.start), modes: s.run.rec.modes.slice(), frames: s.run.rec.frames.slice() };
    return { n: window.__rec.frames.length, frame: w.frame, score: w.score, x: w.player.x, y: w.player.y, lv: w.player.lv, kills: w.stats.kills };
  });
  if (live.n < 300) throw new Error('too few recorded frames: ' + live.n);
  await page.evaluate(() => {
    const GS = window.__scenes.top.constructor;
    const r = window.__rec;
    const s = new GS(r.start, { frames: r.frames, modes: r.modes, label: 'TEST', exit: () => null });
    s.endSpectate = function () {
      if (window.__end) return;
      const w = this.world;
      window.__end = { n: this.replayIdx, frame: w.frame, score: w.score, x: w.player.x, y: w.player.y, lv: w.player.lv, kills: w.stats.kills };
    };
    window.__scenes.goto(() => s, 2);
  });
  const t0 = Date.now();
  let end = null;
  while (!end && Date.now() - t0 < 30000) { await page.waitForTimeout(250); end = await page.evaluate(() => window.__end ?? null); }
  if (!end) throw new Error('replay did not finish');
  const keys = ['n', 'frame', 'score', 'x', 'y', 'lv', 'kills'];
  const diff = keys.filter((k) => end[k] !== live[k]);
  if (diff.length) throw new Error('replay diverged: live=' + JSON.stringify(live) + ' replay=' + JSON.stringify(end));
});

await scenario('best score stores a replay that plays from the ranking', async (page) => {
  await page.goto(BASE + '?debug=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '?debug=1');
  await toGame(page);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyZ');
  await page.evaluate(() => { const w = window.__scenes.top.world; w.score = 9999990; w.lives = 0; w.continues = 99; w.killPlayer('test'); });
  await waitFor(page, (v) => v.name === 'NameEntryScene', 15000);
  await page.waitForTimeout(900); // let the fade-in finish (input is swallowed while fading)
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'RankingScene', 8000);
  await page.waitForTimeout(900);
  const has = await page.evaluate(() => window.__scenes.top.hasReplay);
  if (!has) throw new Error('ranking has no replay for the new best score');
  await page.screenshot({ path: path.join(out, 'ranking_replay.png') });
  await press(page, 'KeyZ');
  await waitFor(page, (v) => v.name === 'GameScene' && v.t > 60, 8000);
  const rep = await page.evaluate(() => !!window.__scenes.top.replay);
  if (!rep) throw new Error('not a replay');
  await page.screenshot({ path: path.join(out, 'replay.png') });
  await press(page, 'Escape');
  await waitFor(page, (v) => v.name === 'RankingScene', 8000);
});

await scenario('single-file build runs from file://', async (page) => {
  const f = path.join(root, 'dist-single/aether-lance.html');
  if (!fs.existsSync(f)) throw new Error('missing ' + f);
  await page.goto('file://' + f + '?debug=1');
  await waitFor(page, (v) => v.name === 'BootScene', 10000);
  await page.waitForTimeout(600);
  await press(page, 'KeyZ');
  await waitFor(page, (v) => v.name === 'TitleScene');
  await page.waitForTimeout(800);
  if (!(await canvasNotBlack(page))) throw new Error('canvas black');
});

await scenario('android shell: app-assets origin, offline, back button', async (page) => {
  // Mirrors the APK: the single file is served from https://appassets.androidplatform.net/ and nothing else is reachable.
  const html = fs.readFileSync(path.join(root, 'dist-single/aether-lance.html'));
  const blocked = [];
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'appassets.androidplatform.net' && u.pathname === '/index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    blocked.push(u.href.slice(0, 80));
    return route.abort();
  });
  const back = () => page.evaluate(() => window.AetherLance.back());
  await page.goto('https://appassets.androidplatform.net/index.html?debug=1');
  await waitFor(page, (v) => v.name === 'BootScene', 10000);
  if (await back()) throw new Error('back on the boot screen should leave the app');
  await page.waitForTimeout(600);
  await page.touchscreen.tap(400, 200);
  await waitFor(page, (v) => v.name === 'TitleScene');
  if (await back()) throw new Error('back on the title should leave the app');
  const font = await page.evaluate(() => document.fonts.check('16px "DotGothic16"', 'エーテル'));
  if (!font) throw new Error('bundled font not loaded');
  await page.waitForTimeout(900);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'MainMenuScene');
  await page.waitForTimeout(400);
  if (!(await back())) throw new Error('back in the menu should be handled');
  await waitFor(page, (v) => v.name === 'TitleScene');
  await page.waitForTimeout(900);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'MainMenuScene');
  await page.waitForTimeout(300);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'DifficultyScene');
  await page.waitForTimeout(300);
  await press(page, 'Enter');
  await waitFor(page, (v) => v.name === 'GameScene' && v.state === 'play', 10000);
  if (!(await back())) throw new Error('back in game should be handled');
  await waitFor(page, (v) => v.name === 'PauseScene');
  await page.waitForTimeout(300);
  await back();
  await waitFor(page, (v) => v.name === 'GameScene');
  // saves survive a restart of the app
  await page.evaluate(() => localStorage.setItem('aetherlance.test', 'kept'));
  await page.reload();
  await waitFor(page, (v) => v.name === 'BootScene', 10000);
  if ((await page.evaluate(() => localStorage.getItem('aetherlance.test'))) !== 'kept') throw new Error('localStorage lost');
  if (blocked.length) throw new Error('unexpected network requests: ' + blocked.join(', '));
  await page.screenshot({ path: path.join(out, 'android_shell.png') });
}, { ...devices['Pixel 7 landscape'] });

server.close();
console.log(results.join('\n'));
process.exit(failures ? 1 : 0);

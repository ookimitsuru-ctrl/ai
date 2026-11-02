// 40-second promotional video, images only (no HUD, no text, no logo), with the game's own music and SFX.
//
//   npm run build:single && node scripts/make-pv.mjs [--preview] [--out pv/aether-lance-pv.mp4]
//
// How it works: the single-file build is opened with ?debug, the real-time loop is stopped (__dev.manual) and every
// video frame is produced by exactly one fixed 60 Hz game update (__dev.advance), so the footage is frame-exact and
// deterministic (the autopilot plays, invincible). Audio: the game's mixer is rebuilt on an OfflineAudioContext behind a
// Proxy whose currentTime is the video clock, so music notes and SFX are scheduled exactly where the frames are; at
// the end the offline context renders the whole soundtrack in one go. Cuts land on bar lines of the stage-1 theme
// (150 BPM → one bar = 96 frames).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PREVIEW = args.includes('--preview');
// --from N: frames before N are simulated (for the soundtrack) but not filmed again; earlier frames on disk are reused
const FROM = args.includes('--from') ? Number(args[args.indexOf('--from') + 1]) : 0;
const OUT = path.resolve(root, args[args.indexOf('--out') + 1] && args.includes('--out') ? args[args.indexOf('--out') + 1] : PREVIEW ? 'pv/preview.mp4' : 'pv/aether-lance-pv.mp4');
const W = PREVIEW ? 480 : 1920, H = PREVIEW ? 270 : 1080;
const FPS = 60, BAR = 96, TOTAL = 25 * BAR; // 40 s
const work = path.join(root, 'pv/frames' + (PREVIEW ? '-preview' : ''));

// ---- shot list (bars of the stage-1 theme: 4-bar intro, 8-bar A, 8-bar B, then A again) ----
const L = (weapon, lv, drones, extra = {}) => ({ weapon, lv, sub: 'seeker', subLv: 1, drones, formation: 'wing', barrier: 0, speedLv: 2, ...extra });
const SHOTS = [
  { bars: 2, title: true },                                                             // planet at dusk, the KESTREL streaks past
  { bars: 2, stage: 1, at: 'start', warm: 10, load: L('pulse', 3, 2) },                 // launch
  { bars: 2, stage: 1, at: 'cp2', warm: 560, load: L('pulse', 3, 2) },                  // through the ring station
  { bars: 2, stage: 2, at: 'midboss', warm: 270, load: L('ray', 3, 2) },                // crystal cave, prism lasers
  { bars: 2, stage: 3, at: 'cp2', warm: 420, load: L('fan', 2, 1) },                    // organic tunnel
  { bars: 2, stage: 3, at: 'boss', warm: 480, load: L('fan', 3, 2) },                   // MATRIARCH
  { bars: 2, stage: 4, at: 'midboss', warm: 280, load: L('pulse', 3, 2), flash: true }, // storm crystal, bullet rings, lightning
  { bars: 2, stage: 5, at: 'cp2', warm: 720, load: L('ray', 4, 2) },                    // molten falls
  { bars: 2, stage: 5, at: 'boss', warm: 620, load: L('ray', 4, 2), driveAt: 24 },      // ANVIL + Lance Drive
  { bars: 2, stage: 6, at: 'cp2', warm: 520, load: L('fan', 3, 2) },                    // rhythm walls
  { bars: 3, stage: 6, at: 'boss', warm: 320, load: L('ray', 4, 2), flash: true },      // THE CHOIR
  { bars: 2, stage: 6, at: 'boss', warm: 320, load: L('ray', 4, 2), finale: true },     // its fall, fade to black
];
if (SHOTS.reduce((a, s) => a + s.bars, 0) * BAR !== TOTAL) throw new Error('shot list must add up to 25 bars');

const SKIP_SFX = /^(shot_|hit_|graze|enemy_fire_s|chip_tick|star|speed_|formation|menu_|pause|countdown|tally|stage_intro|siren)/;

if (!FROM) fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('file://' + path.join(root, 'dist-single/aether-lance.html') + '?debug=1');
await page.waitForFunction(() => window.__dev && window.__scenes?.top);

await page.evaluate(({ SKIP }) => {
  const D = window.__dev;
  D.manual(true);
  const st = D.save.data.settings;
  st.quality = 'high'; st.crt = 'light'; st.bloom = 60; st.shake = 'full'; st.lang = 'en';
  D.renderer.settings.crt = 'light'; D.renderer.settings.bloom = 60; D.renderer.lowQuality = false;
  D.pv.textless = true; D.pv.lockMusic = true; D.pv.muteSfx = true; D.pv.sfxVol = 0.55;
  // offline audio whose clock is the video clock
  const SR = 48000;
  const off = new OfflineAudioContext({ numberOfChannels: 2, length: SR * 41, sampleRate: SR });
  window.__pvT = 0;
  window.__pvOff = off;
  const proxy = new Proxy(off, {
    get(t, k) {
      if (k === 'currentTime') return window.__pvT;
      if (k === 'resume' || k === 'suspend' || k === 'close') return () => Promise.resolve();
      if (k === 'state') return 'running';
      const v = Reflect.get(t, k, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  D.audio.vol = { master: 9, bgm: 9, sfx: 7 };
  D.audio.useContext(proxy);
  // the PV owns the music; scenes may not start or stop songs, and busy SFX are left out
  const play = D.audio.playMusic.bind(D.audio);
  D.audio.playMusic = () => {};
  D.audio.stopMusic = () => {};
  const sfx = D.audio.sfx.bind(D.audio);
  const re = new RegExp(SKIP);
  D.audio.sfx = (id, ...a) => { if (!re.test(id)) sfx(id, ...a); };
  window.__pvPlay = play;
  // overlay for flashes / the final fade
  const ov = document.createElement('div');
  ov.id = 'pvfade';
  ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99;opacity:0;background:#fff';
  document.body.appendChild(ov);
}, { SKIP: SKIP_SFX.source });

let frame = 0;
async function shoot() {
  const file = path.join(work, String(frame).padStart(5, '0') + (PREVIEW ? '.jpg' : '.png'));
  if (frame >= FROM) await page.screenshot(PREVIEW ? { path: file, type: 'jpeg', quality: 85, timeout: 180000 } : { path: file, timeout: 180000 });
  frame++;
}

for (const [i, S] of SHOTS.entries()) {
  const n = S.bars * BAR;
  // set up the shot (silently)
  await page.evaluate(({ S }) => {
    const D = window.__dev;
    D.pv.muteSfx = true;
    if (S.title) {
      D.scenes.replaceNow(new D.TitleScene());
      D.backdrop.t = 70; // the fly-by starts 50 frames in
      return;
    }
    const run = D.newRun('practice', 'normal', 'inplace');
    run.stage = S.stage; run.startAt = S.at; run.god = true; run.loadout = S.load;
    const scene = new D.GameScene(run, undefined, (w) => {
      const inp = D.botInput(w);
      if (S.driveAt !== undefined) {
        // hold the gauge just below full so the autopilot cannot fire it early, then trigger on the beat
        if (window.__pvShotFrame < S.driveAt) { w.player.drive = Math.min(w.player.drive, 99); inp.bits &= ~D.IB.DRIVE; }
        if (window.__pvShotFrame === S.driveAt) { w.player.drive = 100; inp.bits |= D.IB.DRIVE; }
      }
      return inp;
    }, 0);
    scene.debug = null;
    D.scenes.replaceNow(scene);
    window.__pvShotFrame = -1;
    D.step(S.warm ?? 0);
  }, { S });
  if (S.finale) {
    // knock out THE CHOIR's first two forms (core ring, winged body) during the warm-up; stop once its last form,
    // the silhouette, has been on screen for a moment, so that the killing blow lands inside the shot
    const ok = await page.evaluate(() => {
      const D = window.__dev;
      const w = D.scenes.top.world;
      let seen = 0;
      for (let k = 0; k < 6000; k++) {
        const b = w.boss?.active ? w.boss : null;
        if (!b) return false;
        const sil = b.parts?.find((q) => q.id === 'sil' && q.alive && !q.armored);
        if (sil && ++seen > 150) return true;
        if (!sil && k % 12 === 0) { const vul = (b.parts ?? []).find((q) => q.alive && !q.armored && q.maxHp < 1e6 && q.id !== 'sil'); if (vul) w.damageEnemy(b, vul, 99999, 0); }
        D.step(1); // no drawing while fast-forwarding (queued GPU work would stall the next screenshot)
      }
      return false;
    });
    if (!ok) throw new Error('finale: could not reach the last form');
  }
  // capture
  await page.evaluate(() => { window.__dev.pv.muteSfx = false; });
  if (i === 0) await page.evaluate(() => { window.__pvPlay('st1', 0, 0); });
  for (let k = 0; k < n; k++) {
    await page.evaluate(({ k, S, frame, TOTAL, FROM }) => {
      const D = window.__dev;
      window.__pvT = frame / 60;
      window.__pvShotFrame = k;
      if (S.finale && k === 24) {
        // the killing blow, on the beat
        const w = D.scenes.top.world, b = w.boss;
        const sil = b?.active ? b.parts?.find((q) => q.id === 'sil' && q.alive) : null;
        if (sil) w.damageEnemy(b, sil, 99999, 0);
      }
      if (frame < FROM) D.step(1); else D.advance(1);
      if (frame === 12 * 96) D.audio.setDrive(true); // the B section gets the drive hats
      const ov = document.getElementById('pvfade');
      let op = 0, col = '#fff';
      if (S.flash && k < 10) op = 0.85 * (1 - k / 10);
      if (S.finale) {
        const left = TOTAL - frame;
        if (left <= 60) { col = '#000'; op = 1 - left / 60; }
      }
      ov.style.background = col; ov.style.opacity = String(op);
    }, { k, S, frame, TOTAL, FROM });
    await shoot();
    if (frame % 240 === 0) console.log(`frame ${frame}/${TOTAL}`);
  }
}

// render the soundtrack
const wavB64 = await page.evaluate(async () => {
  window.__pvT = 40.5;
  const buf = await window.__pvOff.startRendering();
  const n = Math.min(buf.length, Math.round(40 * buf.sampleRate));
  const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
  const fadeN = Math.round(1.6 * buf.sampleRate); // music fades over the last bar
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
  str(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    const g = i > n - fadeN ? (n - i) / fadeN : 1;
    data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L0[i] * g)) * 32767, true);
    data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R0[i] * g)) * 32767, true);
  }
  const bytes = new Uint8Array(data.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
});
const wav = path.join(work, 'audio.wav');
fs.writeFileSync(wav, Buffer.from(wavB64, 'base64'));
await browser.close();

// encode
const pattern = path.join(work, '%05d' + (PREVIEW ? '.jpg' : '.png'));
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', pattern, '-i', wav,
  '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11',
  '-c:v', 'libx264', '-preset', PREVIEW ? 'veryfast' : 'slow', '-crf', PREVIEW ? '23' : '16', '-pix_fmt', 'yuv420p', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', OUT,
], { stdio: 'inherit' });
console.log('wrote', OUT);

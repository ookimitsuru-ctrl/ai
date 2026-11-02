// Entry point: boot, fixed-timestep loop, global error handling (docs/02_tech.md §4.1, §13).
import { input } from './core/input';
import { scenes } from './core/scene';
import { save, loadSave } from './core/save';
import { renderer } from './render/renderer';
import { audio } from './audio/engine';
import { applySettings, registerStage } from './app';
import { buildAllSprites } from './content/index';
import { ALL_SONGS } from './content/music/index';
import { ALL_STAGES } from './content/stages/index';
import { BootScene, TitleScene } from './scenes/title';
import { GameScene } from './scenes/game';
import { botInput } from './game/bot';
import { IB } from './game/player';
import { newRun } from './app';
import { pv } from './core/pv';
import { backdrop } from './scenes/backdrop';
import { font } from './render/font';
import { PAL } from './render/palette';
import dotGothicUrl from './assets/fonts/DotGothic16-subset.woff2?url';
import rajdhani600 from './assets/fonts/Rajdhani-600.woff2?url';
import rajdhani700 from './assets/fonts/Rajdhani-700.woff2?url';
import { HD, TEXT_FONT, setRenderScale } from './core/hd';

// DotGothic16 (subset) — Copyright 2020 The DotGothic16 Project Authors, SIL Open Font License 1.1.
// The notice ships in index.html and the full license in public/licenses/ (appended to the single-file build).
function loadFont(): void {
  // Bundled subset (inlined as a data URI by Vite), so Japanese text keeps its pixel look offline and in the APK.
  // HD edition: Rajdhani (Latin, OFL) instead; Japanese falls back to the system's sans-serif.
  const faces: [string, string, string][] = HD
    ? [['Rajdhani', rajdhani600, '600'], ['Rajdhani', rajdhani700, '700']]
    : [['DotGothic16', dotGothicUrl, '400']];
  for (const [family, url, weight] of faces) {
    try {
      const ff = new FontFace(family, `url(${url}) format('woff2')`, { weight });
      document.fonts.add(ff);
      void ff.load().catch(() => { /* fall back to system fonts */ });
    } catch { /* FontFace API unavailable */ }
  }
}

/** Hook for the Android shell's back button: returns true when the game handled it (false = leave the app). */
function installAndroidBack(): void {
  const tap = (code: string) => {
    const dev = input.lastDevice; // a back press should not hide the touch buttons
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    input.lastDevice = dev;
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })), 90);
  };
  Object.assign(window as object, {
    AetherLance: {
      back(): boolean {
        const id = scenes.top?.id;
        if (!id || id === 'BootScene' || id === 'TitleScene') return false;
        tap('Escape');
        return true;
      },
    },
  });
}

function showError(err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  console.error(err);
  const root = document.getElementById('app')!;
  if (document.getElementById('errbox')) return;
  const box = document.createElement('div');
  box.id = 'errbox';
  box.style.cssText = 'position:fixed;inset:0;background:rgba(11,13,23,.94);color:#c6d2e3;font:14px ' + TEXT_FONT.replace(/"/g, "'") + ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:10;padding:16px;text-align:center';
  const ja = save.data.settings.lang === 'ja';
  box.innerHTML = `<div style="font-size:20px;color:#ff9fd0">${ja ? 'エラーが発生しました' : 'An error occurred'}</div><pre style="max-width:90vw;max-height:40vh;overflow:auto;white-space:pre-wrap;font-size:11px;color:#97a9c6"></pre>`;
  box.querySelector('pre')!.textContent = msg.slice(0, 2000);
  const copy = document.createElement('button');
  copy.textContent = ja ? 'エラー内容をコピー' : 'Copy error details';
  copy.onclick = () => { void navigator.clipboard?.writeText(msg); };
  const back = document.createElement('button');
  back.textContent = ja ? 'タイトルへ戻る' : 'Back to title';
  back.onclick = () => { box.remove(); scenes.replaceNow(new TitleScene()); };
  for (const b of [copy, back]) { b.style.cssText = 'font:inherit;padding:8px 16px;background:#1f2a44;color:#f2f6fb;border:1px solid #33b7e8;cursor:pointer'; box.appendChild(b); }
  root.appendChild(box);
}

function boot(): void {
  // HD edition: 3× art on capable devices, 2× on small ones (decided before any canvas or sprite is built)
  if (HD) {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 3) || (navigator.hardwareConcurrency || 8) <= 4;
    setRenderScale(weak ? 2 : 3);
  }
  loadFont();
  installAndroidBack();
  save.data = loadSave();
  const root = document.getElementById('app')!;
  renderer.init(root);
  input.attach(root);
  applySettings();
  // first user gesture unlocks audio (must be inside the event handler for iOS)
  const unlock = () => { audio.unlock(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });
  window.addEventListener('gamepadconnected', unlock);
  audio.registerSongs(ALL_SONGS);
  for (const s of ALL_STAGES) registerStage(s);
  // loading frame
  const h = renderer.hud;
  renderer.game.fillStyle = PAL.N0; renderer.game.fillRect(0, 0, 480, 270);
  font().draw(h, 'LOADING', 240, 130, 'N6', 1, 'center');
  renderer.present();
  setTimeout(() => {
    try {
      buildAllSprites();
    } catch (e) { showError(e); return; }
    scenes.replaceNow(new BootScene());
    if (location.search.includes('debug')) {
      Object.assign(window as object, {
        __scenes: scenes, __renderer: renderer,
        // hooks for scripts/make-pv.mjs (frame-exact capture) and other tooling
        __dev: {
          scenes, renderer, audio, save, pv, backdrop, GameScene, TitleScene, botInput, newRun, IB,
          /** stop the real-time loop; the caller advances frames with advance() */
          manual(on: boolean) { manual = on; },
          /** run n fixed 60 Hz updates, then draw one frame */
          advance(n = 1) { for (let i = 0; i < n; i++) stepOnce(); renderOnce(1); },
          /** run n updates without drawing (fast-forward) */
          step(n = 1) { for (let i = 0; i < n; i++) stepOnce(); },
        },
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) audio.suspend(); else audio.resume();
    });
    requestAnimationFrame(loop);
  }, 30);
}

let acc = 0;
let last = performance.now();
let gameFrame = 0;
let manual = false;

function stepOnce(): void {
  input.poll();
  scenes.update();
  gameFrame++;
  audio.update(gameFrame);
}

function renderOnce(alpha: number): void {
  renderer.beginFrame();
  scenes.render(alpha);
  if (scenes.fadeAlpha > 0) {
    renderer.hud.fillStyle = `rgba(0,0,0,${scenes.fadeAlpha})`;
    renderer.hud.fillRect(0, 0, 480, 270);
    renderer.overlay.setTransform(1, 0, 0, 1, 0, 0);
    renderer.overlay.globalAlpha = scenes.fadeAlpha;
    renderer.overlay.fillStyle = '#000';
    renderer.overlay.fillRect(renderer.vp.x, renderer.vp.y, renderer.vp.w, renderer.vp.h);
    renderer.overlay.globalAlpha = 1;
  }
  renderer.present();
}

function loop(now: number): void {
  if (manual) { last = now; acc = 0; requestAnimationFrame(loop); return; }
  const speed = save.data.settings.gameSpeed / 100;
  const STEP = 1000 / 60 / speed;
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let steps = 0;
  try {
    while (acc >= STEP && steps < 5) {
      stepOnce();
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    renderOnce(acc / STEP);
  } catch (e) {
    showError(e);
  }
  requestAnimationFrame(loop);
}

// offline support (PWA) — only for the hosted build, not for the single-file build or dev server
if (import.meta.env.PROD && location.protocol.startsWith('http') && !document.querySelector('meta[name="singlefile"]') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* optional */ }); });
}

window.addEventListener('error', (e) => showError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));
boot();

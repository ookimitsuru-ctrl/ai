// In-game HUD (docs/09_ui.md §5).
import { PAL, rgba } from './palette';
import { font } from './font';
import { fromStrings, type Sprite } from './sprite';
import type { World } from '../game/world';
import { HD } from '../core/hd';

let shipIcon: Sprite | null = null;
let fade = 1;
let hiShown = 0;

export function drawHud(g: CanvasRenderingContext2D, w: World, hi: number, label: string): void {
  shipIcon ??= fromStrings({ map: { W: 'N7', C: 'C3', O: 'O5', K: 'N1' }, frames: [['..KK.....', 'OWWWWCCK.', 'OKWWWWWWK', '..KWW....']] });
  const f = font();
  const p = w.player;
  const near = p.alive && (p.y < 12 + 24 || p.y > 256 - 24);
  fade += ((near ? 0.3 : 1) - fade) * 0.1;
  g.globalAlpha = fade;
  // bands
  if (HD) {
    // soft gradient plates keep the vector text readable over bright stages
    const top = g.createLinearGradient(0, 0, 0, 16);
    top.addColorStop(0, 'rgba(6,8,16,0.72)'); top.addColorStop(0.7, 'rgba(6,8,16,0.5)'); top.addColorStop(1, 'rgba(6,8,16,0)');
    g.fillStyle = top; g.fillRect(0, 0, 480, 16);
    const bot = g.createLinearGradient(0, 252, 0, 270);
    bot.addColorStop(0, 'rgba(6,8,16,0)'); bot.addColorStop(0.3, 'rgba(6,8,16,0.55)'); bot.addColorStop(1, 'rgba(6,8,16,0.78)');
    g.fillStyle = bot; g.fillRect(0, 252, 480, 18);
  } else {
    g.fillStyle = rgba('N0', 0.45);
    g.fillRect(0, 0, 480, 12);
    g.fillRect(0, 256, 480, 14);
  }
  // top
  const sc = String(Math.floor(w.displayScore)).padStart(10, '0');
  f.draw(g, '1P', 4, 2, 'C4');
  f.draw(g, sc, 20, 2, 'N8');
  hiShown = Math.max(hi, w.score);
  f.draw(g, 'HI', 190, 2, 'N6');
  f.draw(g, String(hiShown).padStart(10, '0'), 206, 2, w.score >= hi && w.score > 0 ? 'Y3' : 'N6');
  f.draw(g, label, 476, 2, 'N6', 1, 'right');
  // bottom: lives
  const lives = Math.max(0, w.lives);
  if (lives <= 4) for (let i = 0; i < lives; i++) g.drawImage(shipIcon.canvas, 4 + i * 11, 260, shipIcon.w, shipIcon.h);
  else { g.drawImage(shipIcon.canvas, 4, 260, shipIcon.w, shipIcon.h); f.draw(g, '×' + lives, 15, 259, 'N8'); }
  // speed
  if (!p.touch) {
    f.draw(g, 'SPD', 52, 259, 'N6');
    for (let i = 0; i < 4; i++) {
      const on = i < p.speedLv;
      g.fillStyle = on ? (p.speedFx > 0 && (w.frame >> 1) % 2 ? PAL.N8 : PAL.C3) : PAL.N3;
      g.fillRect(72 + i * 5, 260, 4, 6);
    }
  }
  // weapon
  const wl = p.weapon === 'pulse' ? 'P' : p.weapon === 'fan' ? 'F' : 'R';
  g.fillStyle = PAL.N7; g.fillRect(100, 258, 9, 10);
  f.draw(g, wl, 102, 259, wl === 'P' ? 'C1' : wl === 'F' ? 'G1' : 'P1');
  f.draw(g, 'LV' + p.lv, 112, 259, 'N8');
  for (let i = 0; i < 5; i++) { g.fillStyle = i < p.lv ? '#ff6a3d' : PAL.N3; g.fillRect(130 + i * 4, 261, 3, 4); }
  // sub
  if (p.sub) {
    g.fillStyle = PAL.P3; g.fillRect(152, 258, 9, 10);
    f.draw(g, p.sub === 'bomb' ? 'B' : 'S', 154, 259, 'N0');
    f.draw(g, String(p.subLv), 163, 259, 'P4');
  }
  // drones
  for (let i = 0; i < 4; i++) f.draw(g, i < p.drones ? '●' : '○', 176 + i * 6, 259, i < p.drones ? 'C4' : 'N3');
  f.draw(g, p.formation.toUpperCase(), 202, 259, p.formLabel > 0 ? 'N8' : 'N5');
  // drive
  f.draw(g, 'DRIVE', 240, 259, p.driving ? 'Y4' : 'N6');
  const gx = 272, gw = 100;
  g.fillStyle = PAL.N2; g.fillRect(gx, 260, gw, 6);
  const full = p.drive >= 100 && !p.driving;
  g.fillStyle = p.driving ? PAL.Y4 : full ? ((w.frame >> 3) % 2 ? PAL.Y3 : PAL.Y4) : PAL.Y2;
  g.fillRect(gx + 1, 261, Math.round(((gw - 2) * p.drive) / 100), 4);
  if (full) { g.strokeStyle = PAL.Y3; g.lineWidth = 1; g.strokeRect(gx - 0.5, 259.5, gw + 1, 7); f.draw(g, 'READY', gx + gw + 4, 259, (w.frame >> 3) % 2 ? 'Y4' : 'Y2'); }
  // barrier
  for (let i = 0; i < p.barrier; i++) f.draw(g, '⬡', 470 - i * 7, 259, 'G3');
  g.globalAlpha = 1;
  // boss bar
  const showBar = (w.phase === 'boss' && w.bossReady && w.boss?.active) || (w.midboss?.active && w.midboss.age > 60);
  if (showBar) {
    const bb = w.bossBar;
    bb.shown += (bb.value - bb.shown) * 0.1;
    if (Math.abs(bb.shown - bb.value) < 0.5) bb.shown = bb.value;
    const x = 130, y = 14, W = 220;
    const timeLow = w.phase === 'boss' && w.bossLimit > 0 && w.bossTimer < 600 && (w.frame >> 3) % 2;
    g.fillStyle = rgba('N0', 0.6); g.fillRect(x - 1, y - 1, W + 2, 6);
    g.fillStyle = PAL.N8; g.fillRect(x, y, Math.round((W * bb.shown) / bb.max), 4);
    g.fillStyle = timeLow ? PAL.O5 : PAL.R2; g.fillRect(x, y, Math.round((W * bb.value) / bb.max), 4);
    f.draw(g, bb.name, x - 4, y - 1, 'N7', 1, 'right');
    if (w.phase === 'boss' && w.bossLimit > 0) f.draw(g, String(Math.ceil(w.bossTimer / 60)), x + W + 4, y - 1, timeLow ? 'O5' : 'N6');
  }
}

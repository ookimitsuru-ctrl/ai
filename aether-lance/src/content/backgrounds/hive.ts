// STAGE 3 background: a forest swallowed by the hive.
import { PAL } from '../../render/palette';
import { layerCanvas, type Canvas } from '../../render/sprite';
import { blit, lw, snap } from '../../core/hd';
import { gradientCanvas, drawRepeat, fbm, paintCanvas, rampPick } from './common';
import { Rng } from '../../core/rng';
import type { Background } from './index';
import type { World } from '../../game/world';

function stalks(): { c: Canvas; veins: { x: number; y0: number; y1: number }[] } {
  const W = 900, H = 270;
  const { c, g } = layerCanvas(W, H);
  const r = new Rng(17);
  const veins: { x: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 128 + r.next() * 40, w = 18 + r.next() * 22;
    g.fillStyle = PAL.G0;
    g.beginPath();
    g.moveTo(x - w / 2, H);
    for (let y = H; y >= 0; y -= 10) g.lineTo(x - w / 2 + Math.sin(y * 0.03 + i) * 8, y);
    for (let y = 0; y <= H; y += 10) g.lineTo(x + w / 2 + Math.sin(y * 0.03 + i) * 8, y);
    g.closePath(); g.fill();
    veins.push({ x: x + Math.sin(i) * 3, y0: 0, y1: H });
  }
  return { c, veins };
}

function canopy(): Canvas {
  return paintCanvas(1024, 80, (x, y) => {
    const edge = 30 + fbm(x * 0.03, 2, 4, 3) * 50;
    if (y > edge) return null;
    const n = fbm(x * 0.06, y * 0.08, 8, 3);
    if (y > edge - 2) return 'G1';
    return rampPick(['N0', 'G0', 'G0', 'G1'], n, x, y);
  });
}

function membranes(): Canvas {
  const { c, g } = layerCanvas(1100, 270);
  const r = new Rng(23);
  for (let i = 0; i < 6; i++) {
    const x = r.next() * 1100, y = 40 + r.next() * 190, rx = 30 + r.next() * 50, ry = 20 + r.next() * 40;
    g.globalAlpha = 0.18; g.fillStyle = PAL.F2;
    g.beginPath(); g.ellipse(x, y, rx, ry, r.next(), 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.5; g.strokeStyle = PAL.F3; g.lineWidth = 1; g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

export function hiveBackground(_w: World): Background {
  const grad = gradientCanvas(480, 270, ['G1', 'G0', 'N0', 'N0', 'G0']);
  const st = stalks();
  const can = canopy();
  const mem = membranes();
  const motes = Array.from({ length: 50 }, (_, i) => ({ x: (i * 131) % 480, y: (i * 71) % 270, s: 0.3 + (i % 4) * 0.15, ph: i * 1.7 }));
  return {
    draw(g, w) {
      g.drawImage(grad, 0, 0, 480, 270);
      drawRepeat(g, can, w.bgX, 0.03, 0);
      // stalks with pulsing veins
      const f = 0.15;
      let x0 = -((w.bgX * f) % lw(st.c)); if (x0 > 0) x0 -= lw(st.c);
      for (let ox = x0; ox < 480; ox += lw(st.c)) {
        blit(g, st.c, snap(ox), 0);
        const pulse = 0.5 + 0.5 * Math.sin(w.frame * 0.07);
        g.fillStyle = PAL.T2;
        for (const v of st.veins) {
          const vx = Math.round(ox + v.x);
          if (vx < -2 || vx > 482) continue;
          const yy = (w.frame * 2 + v.x) % 270;
          g.globalAlpha = 0.25 + pulse * 0.35;
          g.fillRect(vx, 0, 1, 270);
          g.globalAlpha = 0.9;
          g.fillStyle = PAL.T3; g.fillRect(vx - 1, Math.round(270 - yy), 3, 6); g.fillStyle = PAL.T2;
        }
        g.globalAlpha = 1;
      }
      drawRepeat(g, mem, w.bgX, 0.45, 0);
      for (const m of motes) {
        let x = (m.x - w.bgX * m.s + Math.sin(w.frame * 0.02 + m.ph) * 8) % 480; if (x < 0) x += 480;
        const y = (m.y - w.frame * 0.15 * m.s + 270 * 4) % 270;
        g.fillStyle = (m.ph | 0) % 3 ? PAL.T3 : PAL.G4;
        g.globalAlpha = 0.5 + 0.5 * Math.sin(w.frame * 0.05 + m.ph);
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      g.globalAlpha = 1;
    },
  };
}

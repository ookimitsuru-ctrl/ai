// STAGE 4 background: upper atmosphere of a gas giant — storm towers, cloud sea, speed lines.
import { PAL } from '../../render/palette';
import { makeCanvas, ctx2d, type Canvas } from '../../render/sprite';
import { gradientCanvas, drawRepeat, fbm, paintCanvas, rampPick } from './common';
import { lightningPts, stampLine, drawGlow } from '../../render/draw';
import { fxRng } from '../../core/rng';
import type { Background } from './index';
import type { World } from '../../game/world';

function towers(): Canvas {
  return paintCanvas(1200, 270, (x, y) => {
    const h = 120 + fbm(x * 0.004, 1, 51, 3) * 160;
    const top = 270 - h;
    if (y < top) return null;
    const n = fbm(x * 0.02, y * 0.03, 52, 4);
    const d = y - top;
    if (d < 3) return n > 0.5 ? 'N5' : 'N4';
    return rampPick(['N1', 'P0', 'N2', 'P1', 'N3'], Math.min(1, n * 0.9 + (d < 20 ? 0.25 : 0)), x, y);
  });
}

function cloudLayer(seed: number, h: number, ramp: ('N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'P1' | 'P2' | 'C1' | 'C2')[], thick: number): Canvas {
  return paintCanvas(1024, h, (x, y) => {
    const edge = thick + fbm(x * 0.012, 3, seed, 4) * (h - thick);
    const yy = h - y;
    if (yy > edge) return null;
    const n = fbm(x * 0.03, y * 0.05, seed + 7, 4);
    const t = Math.min(1, (edge - yy) / 30 + n * 0.4);
    return rampPick(ramp, 1 - t, x, y);
  });
}

function ringArc(): Canvas {
  const c = makeCanvas(900, 120);
  const g = ctx2d(c);
  for (let x = 0; x < 900; x++) {
    const y = 20 + x * 0.09;
    g.fillStyle = PAL.P1; g.fillRect(x, Math.round(y), 1, 6);
    g.fillStyle = PAL.P2; g.fillRect(x, Math.round(y + 1), 1, 1);
    g.fillStyle = PAL.N3; g.fillRect(x, Math.round(y + 8), 1, 2);
  }
  return c;
}

export function stormBackground(_w: World): Background {
  const grad = gradientCanvas(480, 270, ['C0', 'P0', 'P1', 'P0', 'N1']);
  const tw = towers();
  const mid = cloudLayer(61, 120, ['N2', 'N3', 'P1', 'N4', 'P2'], 30);
  const sea = cloudLayer(71, 90, ['N3', 'N4', 'N5', 'N6'], 40);
  const ring = ringArc();
  const flashes: { x: number; t: number }[] = [];
  const lines = Array.from({ length: 24 }, (_, i) => ({ y: (i * 37) % 250 + 10, x: (i * 211) % 480, s: 3 + (i % 4) }));
  return {
    draw(g, w) {
      g.drawImage(grad, 0, 0);
      drawRepeat(g, ring, w.bgX, 0.01, 10);
      // distant storm towers with internal flashes
      drawRepeat(g, tw, w.bgX, 0.1, 0);
      if (fxRng.next() < 0.012) flashes.push({ x: fxRng.next() * 480, t: 8 });
      g.globalCompositeOperation = 'lighter';
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]!;
        drawGlow(g, f.x, 160, 60, PAL.C3, (f.t / 8) * 0.5);
        if (--f.t <= 0) flashes.splice(i, 1);
      }
      g.globalCompositeOperation = 'source-over';
      drawRepeat(g, mid, w.bgX, 0.35, 120);
      // speed lines
      g.fillStyle = PAL.N4;
      for (const l of lines) {
        const x = ((l.x - w.bgX * l.s * 0.5) % 480 + 480) % 480;
        g.globalAlpha = 0.35;
        g.fillRect(Math.round(x), l.y, 18 + l.s * 4, 1);
      }
      g.globalAlpha = 1;
      drawRepeat(g, sea, w.bgX, 0.8, 184);
    },
    drawFg(g, w) {
      // occasional bright bolt far in the clouds after big lightning
      for (const h of w.hazards.items) {
        if (!h.active || h.kind !== 'bolt' || h.tele > 0) continue;
        const pts = lightningPts(h.x + 40, 0, h.x + 90, 120, 6, 12, () => fxRng.next());
        g.fillStyle = PAL.N7; g.globalAlpha = 0.35;
        for (let k = 0; k + 3 < pts.length; k += 2) stampLine(g, pts[k]!, pts[k + 1]!, pts[k + 2]!, pts[k + 3]!, 1);
        g.globalAlpha = 1;
      }
      // fast cloud wisps
      g.fillStyle = PAL.N5;
      g.globalAlpha = 0.25;
      for (let i = 0; i < 4; i++) {
        const x = ((i * 300 - w.bgX * 1.6) % 1200 + 1200) % 1200 - 200;
        const y = 30 + i * 60;
        if (Math.abs(y - w.player.y) < 30 && Math.abs(x + 60 - w.player.x) < 80) continue;
        g.fillRect(Math.round(x), y, 120, 6); g.fillRect(Math.round(x) + 20, y - 3, 70, 3);
      }
      g.globalAlpha = 1;
    },
  };
}

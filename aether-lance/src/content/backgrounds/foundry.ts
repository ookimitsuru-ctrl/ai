// STAGE 5 background: orbital foundry interior (supports vertical scrolling).
import { PAL } from '../../render/palette';
import { makeCanvas, ctx2d, type Canvas } from '../../render/sprite';
import { drawGlow } from '../../render/draw';
import { Rng } from '../../core/rng';
import type { Background } from './index';
import type { World } from '../../game/world';

function tileLayer(w: number, h: number, seed: number, fn: (g: CanvasRenderingContext2D, r: Rng) => void): Canvas {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  fn(g, new Rng(seed));
  return c;
}

function drawTiled(g: CanvasRenderingContext2D, c: Canvas, ox: number, oy: number): void {
  let x0 = -(ox % c.width); if (x0 > 0) x0 -= c.width;
  let y0 = -(oy % c.height); if (y0 > 0) y0 -= c.height;
  for (let y = y0; y < 270; y += c.height) for (let x = x0; x < 480; x += c.width) g.drawImage(c, Math.round(x), Math.round(y));
}

export function foundryBackground(_w: World): Background {
  const far = tileLayer(640, 360, 81, (g, r) => {
    g.fillStyle = PAL.N0; g.fillRect(0, 0, 640, 360);
    for (let i = 0; i < 10; i++) {
      const x = r.next() * 640, w = 20 + r.next() * 40;
      g.fillStyle = PAL.N1; g.fillRect(Math.round(x), 0, Math.round(w), 360);
      g.fillStyle = PAL.O0; for (let y = 0; y < 360; y += 30) g.fillRect(Math.round(x + 3), y + 10, Math.round(w - 6), 2);
    }
    for (let i = 0; i < 6; i++) { // crane silhouettes
      const x = r.next() * 640, y = r.next() * 300;
      g.fillStyle = PAL.N2; g.fillRect(Math.round(x), Math.round(y), 120, 6);
      for (let k = 0; k < 120; k += 10) g.fillRect(Math.round(x + k), Math.round(y + 6), 1, 8);
      g.fillRect(Math.round(x + 90), Math.round(y + 6), 2, 40);
    }
  });
  const mid = tileLayer(512, 300, 82, (g, r) => {
    for (let i = 0; i < 8; i++) {
      const y = r.next() * 300, x = r.next() * 512, len = 80 + r.next() * 200;
      g.fillStyle = PAL.N2; g.fillRect(Math.round(x), Math.round(y), Math.round(len), 7);
      g.fillStyle = PAL.N3; g.fillRect(Math.round(x), Math.round(y), Math.round(len), 2);
      for (let k = 0; k < len; k += 40) { g.fillStyle = PAL.N1; g.fillRect(Math.round(x + k), Math.round(y - 2), 4, 11); }
    }
    for (let i = 0; i < 5; i++) { const x = r.next() * 512, y = r.next() * 300; g.fillStyle = PAL.N2; g.fillRect(Math.round(x), Math.round(y), 8, 60); }
  });
  const lights = Array.from({ length: 10 }, (_, i) => ({ x: (i * 173) % 512, y: (i * 97) % 300, ph: i * 13 }));
  return {
    draw(g, w) {
      drawTiled(g, far, w.bgX * 0.06, w.bgY * 0.06);
      // furnace glow from below
      const off = w.stageData.lightsOff ? 0.2 : 1;
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, 120 - ((w.bgX * 0.06) % 300), 300, 200, PAL.O2, 0.55 * off);
      drawGlow(g, 400 - ((w.bgX * 0.06 + 150) % 300), 310, 180, PAL.O3, 0.45 * off);
      g.globalCompositeOperation = 'source-over';
      drawTiled(g, mid, w.bgX * 0.4, w.bgY * 0.4);
      // warning lights
      for (const l of lights) {
        let x = (l.x - w.bgX * 0.4) % 512; if (x < 0) x += 512;
        let y = (l.y - w.bgY * 0.4) % 300; if (y < 0) y += 300;
        if (x > 480 || y > 270) continue;
        const on = ((w.frame + l.ph) >> 4) % 2 === 0 && !w.stageData.lightsOff;
        g.fillStyle = on ? PAL.O5 : PAL.O1;
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
        if (on) { g.globalCompositeOperation = 'lighter'; drawGlow(g, x + 1, y + 1, 6, PAL.O4, 0.6); g.globalCompositeOperation = 'source-over'; }
      }
      // steam puffs
      if (w.frame % 40 === 0 && !w.stageData.lightsOff) w.fx.p('smoke', 40 + ((w.frame * 7) % 400), 268, 0, -0.6, 70, 4, PAL.N5, { grow: 0.15 });
    },
  };
}

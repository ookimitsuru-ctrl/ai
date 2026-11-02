// STAGE 2 background: crystal caverns.
import { PAL } from '../../render/palette';
import { layerCanvas, type Canvas } from '../../render/sprite';
import { blit, lw, snap } from '../../core/hd';
import { gradientCanvas, drawRepeat, fbm, paintCanvas, rampPick } from './common';
import { Rng } from '../../core/rng';
import type { Background } from './index';
import type { World } from '../../game/world';

function pillars(): Canvas {
  const W = 960, H = 270;
  const { c, g } = layerCanvas(W, H);
  const r = new Rng(41);
  for (let i = 0; i < 9; i++) {
    const x = r.next() * W, w = 14 + r.next() * 26, top = r.next() < 0.5;
    const len = 90 + r.next() * 120;
    g.fillStyle = PAL.P0;
    g.beginPath();
    if (top) { g.moveTo(x - w / 2, 0); g.lineTo(x + w / 2, 0); g.lineTo(x + w * 0.1, len); }
    else { g.moveTo(x - w / 2, H); g.lineTo(x + w / 2, H); g.lineTo(x - w * 0.1, H - len); }
    g.closePath(); g.fill();
    g.fillStyle = PAL.P1;
    for (let k = 0; k < len; k += 3) {
      const yy = top ? k : H - k;
      const ww = (w / 2) * (1 - k / len);
      g.fillRect(Math.round(x - ww * 0.2), yy, 1, 2);
    }
  }
  return c;
}

function rockBand(top: boolean): Canvas {
  const W = 1024, H = 70;
  return paintCanvas(W, H, (x, y) => {
    const yy = top ? y : H - 1 - y;
    const edge = 26 + fbm(x * 0.02, 1, top ? 3 : 9, 3) * 40;
    if (yy > edge) return null;
    const n = fbm(x * 0.05, y * 0.05, 5, 3);
    if (yy > edge - 2) return 'P1';
    if (n > 0.66 && (x * 13 + y * 7) % 11 === 0) return 'C3';
    if (n > 0.62) return 'P2';
    return rampPick(['N0', 'P0', 'N1'], n, x, y);
  });
}

export function caveBackground(_w: World): Background {
  const grad = gradientCanvas(480, 270, ['P0', 'N0', 'N0', 'N0', 'P0']);
  const pil = pillars();
  const bandT = rockBand(true), bandB = rockBand(false);
  const motes = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % 480, y: (i * 53) % 270, s: 0.2 + (i % 5) * 0.08, ph: i }));
  return {
    draw(g, w) {
      g.drawImage(grad, 0, 0, 480, 270);
      drawRepeat(g, pil, w.bgX, 0.2, 0);
      drawRepeat(g, bandT, w.bgX, 0.5, 0);
      drawRepeat(g, bandB, w.bgX, 0.5, 200);
      for (const m of motes) {
        let x = (m.x - w.bgX * m.s) % 480; if (x < 0) x += 480;
        const y = (m.y + Math.sin((w.frame + m.ph * 40) * 0.01) * 10 + 270) % 270;
        const tw = Math.sin(w.frame * 0.07 + m.ph);
        if (tw < 0) continue;
        g.fillStyle = tw > 0.8 ? PAL.C4 : PAL.P3;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    },
  };
}

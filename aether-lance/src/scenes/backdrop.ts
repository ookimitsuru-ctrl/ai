// Shared animated backdrop for title & menus: dusk planet, stars, KESTREL fly-by, logo.
import { PAL } from '../render/palette';
import { makeCanvas, ctx2d, drawSprite, type Canvas } from '../render/sprite';
import { font } from '../render/font';
import { drawGlow } from '../render/draw';
import { StarField } from '../content/backgrounds/common';
import { planetCanvas } from '../content/backgrounds/orbit';
import { SPR } from '../content/sprites/registry';
import { pv } from '../core/pv';

let logo: Canvas | null = null;

export function logoCanvas(): Canvas {
  if (logo) return logo;
  const f = font();
  const text = 'AETHER LANCE';
  const sc = 3;
  const w = f.width(text, sc) + 8, h = 8 * sc + 8;
  const base = makeCanvas(w, h);
  const g = ctx2d(base);
  // italic shear: draw row by row with offset
  const tmp = makeCanvas(w, h);
  const tg = ctx2d(tmp);
  f.draw(tg, text, 4, 4, 'N8', sc);
  const img = tg.getImageData(0, 0, w, h);
  const out = g.createImageData(w, h);
  const grad = ['#ffffff', '#ffffff', '#f2f6fb', '#d4f7ff', '#c6d2e3', '#7fe0ff', '#97a9c6', '#7fe0ff', '#33b7e8', '#33b7e8', '#1c8ac0', '#135e8a'];
  for (let y = 0; y < h; y++) {
    const shear = Math.round((h - y) * 0.25);
    const col = grad[Math.min(grad.length - 1, Math.max(0, Math.floor(((y - 4) / (8 * sc - 3)) * grad.length)))]!;
    const v = parseInt(col.slice(1), 16);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!img.data[i + 3]) continue;
      const nx = x + shear - 3;
      if (nx < 0 || nx >= w) continue;
      const o = (y * w + nx) * 4;
      out.data[o] = (v >> 16) & 255; out.data[o + 1] = (v >> 8) & 255; out.data[o + 2] = v & 255; out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  // outline
  const res = makeCanvas(w + 2, h + 2);
  const rg = ctx2d(res);
  const sil = makeCanvas(w, h); const sg = ctx2d(sil); sg.drawImage(base, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = PAL.N1; sg.fillRect(0, 0, w, h);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [2, 2]] as const) rg.drawImage(sil, dx, dy);
  rg.drawImage(base, 1, 1);
  logo = res;
  return res;
}

export class Backdrop {
  stars = new StarField(77, [0.03, 0.08, 0.16], [120, 80, 50]);
  t = 0;
  fly = -1;
  draw(g: CanvasRenderingContext2D, dim = 0): void {
    this.t++;
    g.fillStyle = PAL.N0; g.fillRect(0, 0, 480, 270);
    this.stars.draw(g, this.t * 0.6, 0, this.t);
    const pl = planetCanvas(false);
    g.drawImage(pl, Math.round(480 - pl.width + 70 - Math.sin(this.t * 0.001) * 10), 270 - pl.height + 70);
    // fly-by every 15 s
    if (this.t % 900 === 120) this.fly = 0;
    if (this.fly >= 0) {
      this.fly++;
      const x = -40 + this.fly * 5, y = 200 - this.fly * 0.9;
      g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 30; k++) { g.fillStyle = k < 6 ? PAL.O5 : k < 16 ? PAL.C3 : PAL.C1; g.fillRect(Math.round(x - 16 - k * 4), Math.round(y + k * 0.72), 4, 1); }
      drawGlow(g, x - 14, y, 10, PAL.O5, 0.6);
      g.globalCompositeOperation = 'source-over';
      drawSprite(g, SPR.kestrel!, 1, x, y);
      if (x > 560) this.fly = -1;
    }
    if (dim > 0) { g.fillStyle = `rgba(4,5,10,${dim})`; g.fillRect(0, 0, 480, 270); }
  }

  drawLogo(g: CanvasRenderingContext2D, y: number, frame: number): void {
    if (pv.textless) return;
    const lc = logoCanvas();
    const x = Math.round(240 - lc.width / 2);
    g.drawImage(lc, x, y);
    // lance streak
    const per = 300;
    const ph = frame % per;
    if (ph < 50) {
      const sx = x - 40 + (ph / 40) * (lc.width + 80);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = PAL.C4; g.fillRect(x - 30, y + lc.height / 2, Math.max(0, sx - x + 30), 1);
      g.fillStyle = PAL.N8; g.fillRect(Math.round(sx - 30), y + lc.height / 2 - 1, 30, 3);
      drawGlow(g, sx, y + lc.height / 2, 22, PAL.C3, 0.9);
      g.globalCompositeOperation = 'source-over';
    }
  }
}

export const backdrop = new Backdrop();

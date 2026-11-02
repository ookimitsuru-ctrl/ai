// Shared animated backdrop for title & menus: dusk planet, stars, KESTREL fly-by, logo.
import { PAL } from '../render/palette';
import { HD, blit, lw, lh } from '../core/hd';
import { layerCanvas } from '../render/sprite';
import { makeCanvas, ctx2d, drawSprite, type Canvas } from '../render/sprite';
import { font } from '../render/font';
import { drawGlow } from '../render/draw';
import { StarField } from '../content/backgrounds/common';
import { planetCanvas } from '../content/backgrounds/orbit';
import { SPR } from '../content/sprites/registry';
import { pv } from '../core/pv';

let logo: Canvas | null = null;

/** HD logo: wide italic Rajdhani with a chrome-to-cyan gradient, dark outline and a soft cyan glow. */
function logoCanvasHD(): Canvas {
  const W = 300, H = 42;
  const { c, g } = layerCanvas(W, H);
  const text = 'AETHER LANCE';
  g.font = '700 36px "Rajdhani", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const cx = W / 2, by = 33;
  g.save();
  g.translate(cx, by); g.transform(1, 0, -0.18, 1, 0, 0); g.translate(-cx, -by); // italic shear
  if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px';
  g.shadowColor = 'rgba(51,183,232,0.85)'; g.shadowBlur = 10;
  g.lineJoin = 'round'; g.lineWidth = 3.2; g.strokeStyle = '#0a1830';
  g.strokeText(text, cx, by);
  g.shadowBlur = 0;
  const grd = g.createLinearGradient(0, by - 30, 0, by + 2);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.38, '#d9f6ff'); grd.addColorStop(0.52, '#7fe0ff');
  grd.addColorStop(0.56, '#33b7e8'); grd.addColorStop(1, '#135e8a');
  g.fillStyle = grd;
  g.fillText(text, cx, by);
  // specular streak across the top of the letters
  g.globalCompositeOperation = 'source-atop';
  const sp = g.createLinearGradient(0, by - 30, 0, by - 18);
  sp.addColorStop(0, 'rgba(255,255,255,0.0)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp; g.fillRect(0, by - 30, W, 12);
  g.restore();
  return c;
}

export function logoCanvas(): Canvas {
  if (logo) return logo;
  if (HD) return (logo = logoCanvasHD());
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
    blit(g, pl, Math.round(480 - lw(pl) + 70 - Math.sin(this.t * 0.001) * 10), 270 - lh(pl) + 70);
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
    const LW = lw(lc), LH = lh(lc);
    const x = Math.round(240 - LW / 2);
    blit(g, lc, x, y);
    // lance streak
    const per = 300;
    const ph = frame % per;
    if (ph < 50) {
      const sx = x - 40 + (ph / 40) * (LW + 80);
      g.globalCompositeOperation = 'lighter';
      if (HD) {
        const tr = g.createLinearGradient(x - 30, 0, sx, 0);
        tr.addColorStop(0, 'rgba(51,183,232,0)'); tr.addColorStop(1, 'rgba(127,224,255,0.9)');
        g.fillStyle = tr; g.fillRect(x - 30, y + LH / 2 - 0.5, Math.max(0, sx - x + 30), 1);
        const hd = g.createLinearGradient(sx - 30, 0, sx, 0);
        hd.addColorStop(0, 'rgba(255,255,255,0)'); hd.addColorStop(1, 'rgba(255,255,255,1)');
        g.fillStyle = hd; g.fillRect(sx - 30, y + LH / 2 - 1.2, 30, 2.4);
      } else {
        g.fillStyle = PAL.C4; g.fillRect(x - 30, y + LH / 2, Math.max(0, sx - x + 30), 1);
        g.fillStyle = PAL.N8; g.fillRect(Math.round(sx - 30), y + LH / 2 - 1, 30, 3);
      }
      drawGlow(g, sx, y + LH / 2, 22, PAL.C3, 0.9);
      g.globalCompositeOperation = 'source-over';
    }
  }
}

export const backdrop = new Backdrop();

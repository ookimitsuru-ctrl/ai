// Background helpers: parallax star fields, palette-quantised gradients, prop scatter.
import { PAL, type PalKey, bayer, hexToRgb } from '../../render/palette';
import { makeCanvas, ctx2d, type Canvas } from '../../render/sprite';
import { Rng } from '../../core/rng';
import { HD, RS, lw, lh, snap, type ScaledCanvas } from '../../core/hd';

/** HD: paintCanvas works at this many pixels per game pixel; the dither then gets blurred into smooth gradients. */
const PAINT_K = 2;
let paintK = 1;

export function rampPick(ramp: PalKey[], t: number, x: number, y: number): PalKey {
  const n = ramp.length;
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(f);
  const idx = f - i > bayer(Math.floor((x + 0.5) * paintK), Math.floor((y + 0.5) * paintK)) ? i + 1 : i;
  return ramp[Math.min(n - 1, idx)]!;
}

/** Paint a canvas pixel-by-pixel from a function returning a palette key (or null = transparent). */
export function paintCanvas(w: number, h: number, fn: (x: number, y: number) => PalKey | null): Canvas {
  const K = HD ? PAINT_K : 1;
  paintK = K;
  const W = Math.round(w * K), H = Math.round(h * K);
  const c = makeCanvas(W, H) as ScaledCanvas;
  const g = ctx2d(c);
  const img = g.createImageData(W, H);
  const cache = new Map<string, [number, number, number]>();
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    // HD samples between the game pixels, so noise and edges gain real detail
    const k = K === 1 ? fn(X, Y) : fn((X + 0.5) / K - 0.5, (Y + 0.5) / K - 0.5);
    if (!k) continue;
    let rgb = cache.get(k);
    if (!rgb) { rgb = hexToRgb(PAL[k]); cache.set(k, rgb); }
    const o = (Y * W + X) * 4;
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  paintK = 1;
  if (K !== 1) {
    // melt the ordered dither into continuous colour, keep the silhouette crisp
    const soft = makeCanvas(W, H);
    const sg = ctx2d(soft);
    sg.filter = `blur(${K * 0.9}px)`;
    sg.drawImage(c, 0, 0);
    sg.filter = 'none';
    sg.globalCompositeOperation = 'destination-in';
    sg.drawImage(c, 0, 0);
    g.drawImage(soft, 0, 0); // over the dithered base, which still shows where the blur thinned the edge
    c.k = K;
  }
  return c;
}

export function vnoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263 + seed * 1442695041) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise2(x * f, y * f, seed + i * 17); amp *= 0.5; f *= 2; }
  return s;
}

export interface StarField { drawHD(g: CanvasRenderingContext2D, bgX: number, bgY: number, frame: number, tint: PalKey[]): void }
export class StarField {
  private stars: { x: number; y: number; b: number; ph: number }[][] = [];
  constructor(seed: number, private factors = [0.02, 0.05, 0.1], counts = [110, 80, 50], private wrap = 960, private h = 270) {
    const r = new Rng(seed);
    for (let l = 0; l < factors.length; l++) {
      const arr = [];
      for (let i = 0; i < counts[l]!; i++) arr.push({ x: r.next() * wrap, y: r.next() * h, b: r.next(), ph: r.next() * 6.28 });
      this.stars.push(arr);
    }
  }
  draw(g: CanvasRenderingContext2D, bgX: number, bgY: number, frame: number, tint: PalKey[] = ['N4', 'N6', 'N8']): void {
    if (HD) { this.drawHD(g, bgX, bgY, frame, tint); return; }
    for (let l = 0; l < this.stars.length; l++) {
      const f = this.factors[l]!;
      const ox = bgX * f, oy = bgY * f;
      for (const s of this.stars[l]!) {
        let x = (s.x - ox) % this.wrap; if (x < 0) x += this.wrap;
        if (x >= 480) continue;
        let y = (s.y - oy) % this.h; if (y < 0) y += this.h;
        const tw = Math.sin(frame * 0.05 + s.ph);
        const bi = l === 0 ? (s.b > 0.8 && tw > 0.3 ? 1 : 0) : l === 1 ? (tw > 0.6 ? 2 : 1) : 2;
        g.fillStyle = PAL[tint[bi]!];
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (l === 2 && s.b > 0.85 && tw > 0.7) {
          g.fillStyle = PAL[tint[1]!];
          g.fillRect(Math.round(x) - 1, Math.round(y), 1, 1); g.fillRect(Math.round(x) + 1, Math.round(y), 1, 1);
          g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1); g.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
        }
      }
    }
  }
}

/** HD stars: round points of varying size and brightness, the near layer with a soft halo and cross glint. */
StarField.prototype.drawHD = function (this: StarField, g: CanvasRenderingContext2D, bgX: number, bgY: number, frame: number, tint: PalKey[]): void {
  const self = this as unknown as { stars: { x: number; y: number; b: number; ph: number }[][]; factors: number[]; wrap: number; h: number };
  for (let l = 0; l < self.stars.length; l++) {
    const f = self.factors[l]!;
    const ox = bgX * f, oy = bgY * f;
    const col = PAL[tint[Math.min(2, l)]!];
    g.fillStyle = col;
    for (const st of self.stars[l]!) {
      let x = (st.x - ox) % self.wrap; if (x < 0) x += self.wrap;
      if (x >= 480) continue;
      let y = (st.y - oy) % self.h; if (y < 0) y += self.h;
      const tw = 0.6 + 0.4 * Math.sin(frame * 0.05 + st.ph);
      const r = (0.28 + l * 0.17 + st.b * 0.25) * (l === 2 ? 0.8 + tw * 0.4 : 1);
      g.globalAlpha = Math.min(1, (0.35 + l * 0.25 + st.b * 0.3) * (l === 0 ? 0.8 : tw));
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (l === 2 && st.b > 0.8) {
        g.globalAlpha = 0.25 * tw;
        g.beginPath(); g.arc(x, y, r * 3.2, 0, Math.PI * 2); g.fill();
        if (st.b > 0.9 && tw > 0.85) { g.globalAlpha = 0.5 * (tw - 0.85) / 0.15; g.fillRect(x - 3, y - 0.15, 6, 0.3); g.fillRect(x - 0.15, y - 3, 0.3, 6); }
      }
    }
  }
  g.globalAlpha = 1;
};
void RS;

/** Draw a horizontally repeating layer canvas with parallax factor. */
export function drawRepeat(g: CanvasRenderingContext2D, c: Canvas, bgX: number, f: number, y: number, bgY = 0, fy = 0): void {
  const w = lw(c), h = lh(c);
  let x = -((bgX * f) % w);
  if (x > 0) x -= w;
  const yy = snap(y - bgY * fy);
  for (; x < 480; x += w) g.drawImage(c, snap(x), yy, w, h);
}

export function gradientCanvas(w: number, h: number, ramp: PalKey[], vertical = true): Canvas {
  return paintCanvas(w, h, (x, y) => rampPick(ramp, vertical ? y / (h - 1) : x / (w - 1), x, y));
}

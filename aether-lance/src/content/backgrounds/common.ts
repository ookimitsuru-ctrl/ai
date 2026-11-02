// Background helpers: parallax star fields, palette-quantised gradients, prop scatter.
import { PAL, type PalKey, bayer, hexToRgb } from '../../render/palette';
import { makeCanvas, ctx2d, type Canvas } from '../../render/sprite';
import { Rng } from '../../core/rng';

export function rampPick(ramp: PalKey[], t: number, x: number, y: number): PalKey {
  const n = ramp.length;
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(f);
  const idx = f - i > bayer(x, y) ? i + 1 : i;
  return ramp[Math.min(n - 1, idx)]!;
}

/** Paint a canvas pixel-by-pixel from a function returning a palette key (or null = transparent). */
export function paintCanvas(w: number, h: number, fn: (x: number, y: number) => PalKey | null): Canvas {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  const img = g.createImageData(w, h);
  const cache = new Map<string, [number, number, number]>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = fn(x, y);
    if (!k) continue;
    let rgb = cache.get(k);
    if (!rgb) { rgb = hexToRgb(PAL[k]); cache.set(k, rgb); }
    const o = (y * w + x) * 4;
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
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

/** Draw a horizontally repeating layer canvas with parallax factor. */
export function drawRepeat(g: CanvasRenderingContext2D, c: Canvas, bgX: number, f: number, y: number, bgY = 0, fy = 0): void {
  const w = c.width;
  let x = -((bgX * f) % w);
  if (x > 0) x -= w;
  const yy = Math.round(y - bgY * fy);
  for (; x < 480; x += w) g.drawImage(c, Math.round(x), yy);
}

export function gradientCanvas(w: number, h: number, ramp: PalKey[], vertical = true): Canvas {
  return paintCanvas(w, h, (x, y) => rampPick(ramp, vertical ? y / (h - 1) : x / (w - 1), x, y));
}

// HD edition sprite rasteriser. The sprite builder (SB) records its primitives; here they are replayed at
// RS×2 resolution, shaded with continuous light (no palette quantisation), a Blinn-Phong highlight and a soft rim,
// given a thin anti-aliased outline, and downsampled to RS× (2×2 supersampling).
import { PAL, type PalKey, hexToRgb } from './palette';
import { RS, type ScaledCanvas } from '../core/hd';
import type { Material } from './sprite';

export type SBOp =
  | { k: 'rect'; x: number; y: number; w: number; h: number; id: number }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number; id: number }
  | { k: 'ring'; cx: number; cy: number; r0: number; r1: number; id: number }
  | { k: 'poly'; pts: number[]; id: number }
  | { k: 'line'; x0: number; y0: number; x1: number; y1: number; id: number; thick: number }
  | { k: 'px'; x: number; y: number; rgb: number }
  | { k: 'mirrorY' }
  | { k: 'mirrorX' };

const LX = -0.55, LY = -0.72, LZ = 0.42;
const LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN, ly = LY / LN, lz = LZ / LN;
// half vector between the light and the viewer (0,0,1)
const HX0 = lx, HY0 = ly, HZ0 = lz + 1;
const HN = Math.hypot(HX0, HY0, HZ0);
const hx = HX0 / HN, hy = HY0 / HN, hz = HZ0 / HN;

const rgbCache = new Map<string, [number, number, number]>();
function rgb(k: PalKey | string): [number, number, number] {
  let c = rgbCache.get(k);
  if (!c) { c = hexToRgb(k.startsWith('#') ? k : PAL[k as PalKey]); rgbCache.set(k, c); }
  return c;
}

class Grid {
  readonly m: Uint8Array;
  readonly ov: Int32Array;
  constructor(readonly W: number, readonly H: number, readonly S: number) {
    this.m = new Uint8Array(W * H);
    this.ov = new Int32Array(W * H).fill(-1);
  }
  set(X: number, Y: number, id: number): void {
    if (X < 0 || Y < 0 || X >= this.W || Y >= this.H) return;
    const i = Y * this.W + X;
    this.m[i] = id;
    if (id === 0) this.ov[i] = -1;
  }
  run(op: SBOp): void {
    const S = this.S;
    switch (op.k) {
      case 'rect': {
        const x0 = Math.round((op.x | 0) * S), y0 = Math.round((op.y | 0) * S);
        const x1 = x0 + Math.round(op.w * S), y1 = y0 + Math.round(op.h * S);
        for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) this.set(X, Y, op.id);
        break;
      }
      case 'ellipse': {
        const { cx, cy, rx, ry } = op;
        const X0 = Math.floor((cx - rx - 1) * S), X1 = Math.ceil((cx + rx + 1) * S), Y0 = Math.floor((cy - ry - 1) * S), Y1 = Math.ceil((cy + ry + 1) * S);
        for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
          const dx = ((X + 0.5) / S - cx) / rx, dy = ((Y + 0.5) / S - cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(X, Y, op.id);
        }
        break;
      }
      case 'ring': {
        const { cx, cy, r0, r1 } = op;
        for (let Y = Math.floor((cy - r1 - 1) * S); Y <= (cy + r1 + 1) * S; Y++) for (let X = Math.floor((cx - r1 - 1) * S); X <= (cx + r1 + 1) * S; X++) {
          const d = Math.hypot((X + 0.5) / S - cx, (Y + 0.5) / S - cy);
          if (d >= r0 && d <= r1) this.set(X, Y, op.id);
        }
        break;
      }
      case 'poly': {
        const p = op.pts, n = p.length / 2;
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) { minY = Math.min(minY, p[i * 2 + 1]!); maxY = Math.max(maxY, p[i * 2 + 1]!); }
        for (let Y = Math.floor(minY * S); Y <= Math.ceil(maxY * S); Y++) {
          const sy = (Y + 0.5) / S;
          const xs: number[] = [];
          for (let i = 0; i < n; i++) {
            const ax = p[i * 2]!, ay = p[i * 2 + 1]!, bx = p[((i + 1) % n) * 2]!, by = p[((i + 1) % n) * 2 + 1]!;
            if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
          }
          xs.sort((a, b) => a - b);
          for (let k = 0; k + 1 < xs.length; k += 2) for (let X = Math.ceil(xs[k]! * S - 0.5); X <= Math.floor(xs[k + 1]! * S - 0.5); X++) this.set(X, Y, op.id);
        }
        break;
      }
      case 'line': {
        // classic: endpoints rounded to pixels, w×w stamps → a capsule through the pixel centres
        const ax = Math.round(op.x0) + 0.5, ay = Math.round(op.y0) + 0.5, bx = Math.round(op.x1) + 0.5, by = Math.round(op.y1) + 0.5;
        const r = Math.max(1, op.thick) / 2;
        const X0 = Math.floor((Math.min(ax, bx) - r - 1) * S), X1 = Math.ceil((Math.max(ax, bx) + r + 1) * S);
        const Y0 = Math.floor((Math.min(ay, by) - r - 1) * S), Y1 = Math.ceil((Math.max(ay, by) + r + 1) * S);
        const vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
        for (let Y = Y0; Y <= Y1; Y++) for (let X = X0; X <= X1; X++) {
          const px = (X + 0.5) / S, py = (Y + 0.5) / S;
          const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / vv));
          const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
          // square-ish profile like the stamped pixels, softened at the ends
          if (Math.max(Math.abs(dx), Math.abs(dy)) <= r || dx * dx + dy * dy <= r * r * 1.15) this.set(X, Y, op.id);
        }
        break;
      }
      case 'px': {
        const x0 = (op.x | 0) * S, y0 = (op.y | 0) * S;
        for (let Y = y0; Y < y0 + S; Y++) for (let X = x0; X < x0 + S; X++) {
          if (X < 0 || Y < 0 || X >= this.W || Y >= this.H) continue;
          const i = Y * this.W + X;
          this.ov[i] = op.rgb;
          if (this.m[i] === 0) this.m[i] = 255;
        }
        break;
      }
      case 'mirrorY': {
        const { W, H } = this;
        for (let Y = 0; Y < H >> 1; Y++) for (let X = 0; X < W; X++) {
          const a = Y * W + X, b = (H - 1 - Y) * W + X;
          this.m[b] = this.m[a]!; this.ov[b] = this.ov[a]!;
        }
        break;
      }
      case 'mirrorX': {
        const { W, H } = this;
        for (let Y = 0; Y < H; Y++) for (let X = 0; X < W >> 1; X++) {
          const a = Y * W + X, b = Y * W + (W - 1 - X);
          this.m[b] = this.m[a]!; this.ov[b] = this.ov[a]!;
        }
        break;
      }
    }
  }
}

function lerpRamp(ramp: PalKey[], f: number, out: number[]): void {
  const n = ramp.length;
  const t = Math.max(0, Math.min(n - 1, f));
  const i = Math.min(n - 2, Math.floor(t)), u = n === 1 ? 0 : t - i;
  const a = rgb(ramp[Math.max(0, i)]!), b = rgb(ramp[Math.min(n - 1, i + 1)]!);
  out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; out[2] = a[2] + (b[2] - a[2]) * u;
}

/** Render recorded ops at RS× (supersampled 2×). Returns a canvas tagged with k = RS. */
export function renderSpriteHD(w: number, h: number, ops: SBOp[], mats: Material[], outline: PalKey | 'auto' | null): ScaledCanvas {
  const K = RS, SS = 2, S = K * SS;
  const W = w * S, H = h * S, N = W * H;
  const gr = new Grid(W, H, S);
  for (const op of ops) gr.run(op);
  const m = gr.m, ov = gr.ov;

  // distance to the region edge (empty or another material), chamfer
  const d = new Float32Array(N);
  const INF = 1e6;
  for (let i = 0; i < N; i++) d[i] = m[i] === 0 ? 0 : INF;
  const same = (i: number, j: number) => m[j] === m[i] || m[j] === 255 || m[i] === 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (m[i] === 0) continue;
    let v = d[i]!;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) v = Math.min(v, 1);
    if (x > 0) { const j = i - 1; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
    if (y > 0) { const j = i - W; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
    if (x > 0 && y > 0) { const j = i - W - 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
    if (x < W - 1 && y > 0) { const j = i - W + 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (m[i] === 0) continue;
    let v = d[i]!;
    if (x < W - 1) { const j = i + 1; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
    if (y < H - 1) { const j = i + W; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
    if (x < W - 1 && y < H - 1) { const j = i + W + 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
    if (x > 0 && y < H - 1) { const j = i + W - 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
    d[i] = v;
  }
  // height field (rounded bevel)
  const Hf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const id = m[i]!;
    if (id === 0) continue;
    const mat = id === 255 ? null : mats[id]!;
    const bevel = (mat?.bevel ?? 4) * S;
    const t = Math.min(d[i]!, bevel) / bevel;
    Hf[i] = bevel * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  }
  const Hat = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : Hf[y * W + x]!);

  const big = document.createElement('canvas') as ScaledCanvas;
  big.width = W; big.height = H;
  const bg = big.getContext('2d')!;
  const img = bg.createImageData(W, H);
  const px = img.data;
  const col = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const id = m[i]!;
    if (id === 0) continue;
    const o = i * 4;
    px[o + 3] = 255;
    if (ov[i]! >= 0) {
      const v = ov[i]!;
      px[o] = (v >> 16) & 255; px[o + 1] = (v >> 8) & 255; px[o + 2] = v & 255;
      continue;
    }
    const mat = mats[id]!;
    const ramp = mat.ramp, n = ramp.length;
    if (mat.flat !== undefined) { lerpRamp(ramp, mat.flat, col); px[o] = col[0]!; px[o + 1] = col[1]!; px[o + 2] = col[2]!; continue; }
    if (mat.emissive) {
      const bevel = (mat.bevel ?? 4) * S;
      const t = Math.min(d[i]!, bevel) / bevel;
      lerpRamp(ramp, Math.pow(t, 0.8) * (n - 1), col);
      const core = Math.max(0, t - 0.85) * 3; // white-hot centre
      px[o] = Math.min(255, col[0]! + core * 90); px[o + 1] = Math.min(255, col[1]! + core * 90); px[o + 2] = Math.min(255, col[2]! + core * 90);
      continue;
    }
    // smoothed normal (wider stencil = softer, more "modelled" look)
    const nx = (Hat(x - 2, y) - Hat(x + 2, y)) / 4 + (Hat(x - 1, y) - Hat(x + 1, y)) / 4;
    const ny = (Hat(x, y - 2) - Hat(x, y + 2)) / 4 + (Hat(x, y - 1) - Hat(x, y + 1)) / 4;
    const nl = Math.sqrt(nx * nx + ny * ny + 1);
    const Nx = nx / nl, Ny = ny / nl, Nz = 1 / nl;
    const dot = Nx * lx + Ny * ly + Nz * lz;
    const I = Math.max(0, Math.min(1, 0.1 + dot * 1.08));
    lerpRamp(ramp, I * (n - 1), col);
    // gloss
    const sp = Math.pow(Math.max(0, Nx * hx + Ny * hy + Nz * hz), mat.shine ? 26 : 40) * (mat.shine ? 0.75 : 0.32);
    // rim: cool light from below-right on the shaded side, sells the volume
    const rim = Math.pow(Math.max(0, 1 - Nz), 1.6) * Math.max(0, Nx * 0.55 + Ny * 0.8) * 0.5;
    const shine = mat.shine ? rgb(mat.shine) : [255, 255, 255];
    px[o] = Math.min(255, col[0]! + (shine[0]! - col[0]!) * sp + rim * 70);
    px[o + 1] = Math.min(255, col[1]! + (shine[1]! - col[1]!) * sp + rim * 110);
    px[o + 2] = Math.min(255, col[2]! + (shine[2]! - col[2]!) * sp + rim * 150);
  }

  // outline: distance outside the shape, with the nearest filled pixel's material
  if (outline !== null) {
    const od = new Float32Array(N);
    const near = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) { if (m[i] !== 0) { od[i] = 0; near[i] = i; } else od[i] = INF; }
    const relax = (i: number, j: number, c: number) => { if (od[j]! + c < od[i]!) { od[i] = od[j]! + c; near[i] = near[j]!; } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m[i] !== 0) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - W, 1);
      if (x > 0 && y > 0) relax(i, i - W - 1, 1.414);
      if (x < W - 1 && y > 0) relax(i, i - W + 1, 1.414);
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (m[i] !== 0) continue;
      if (x < W - 1) relax(i, i + 1, 1);
      if (y < H - 1) relax(i, i + W, 1);
      if (x < W - 1 && y < H - 1) relax(i, i + W + 1, 1.414);
      if (x > 0 && y < H - 1) relax(i, i + W - 1, 1.414);
    }
    const ow = 0.7 * S; // outline thickness: 0.7 game px
    for (let i = 0; i < N; i++) {
      if (m[i] !== 0 || od[i]! > ow + 0.5 || near[i]! < 0) continue;
      const nb = m[near[i]!]!;
      const mat = nb === 255 ? null : mats[nb]!;
      if (mat?.emissive && !mat.outline) continue;
      const key: PalKey | string = mat?.outline ?? (outline === 'auto' ? (mat ? mat.ramp[0]! : 'N1') : outline);
      const c = rgb(key);
      const o = i * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
      px[o + 3] = Math.round(255 * Math.max(0, Math.min(1, ow + 0.5 - od[i]!)) * 0.9);
    }
  }
  bg.putImageData(img, 0, 0);

  // 2×2 supersampling → RS×
  const out = document.createElement('canvas') as ScaledCanvas;
  out.width = w * K; out.height = h * K;
  const og = out.getContext('2d')!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  og.drawImage(big, 0, 0, out.width, out.height);
  out.k = K;
  return out;
}

/** Pixel-string sprites in HD: Scale2x-style edge smoothing, then a soft downsample to RS×. */
export function upscalePixelArt(src: HTMLCanvasElement): ScaledCanvas {
  const K = RS;
  const w = src.width, h = src.height;
  // nearest ×(K*4), then blur slightly and draw down to ×K: rounds the stair steps without losing the shape
  const big = document.createElement('canvas');
  big.width = w * K * 4; big.height = h * K * 4;
  const g = big.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.filter = `blur(${K * 1.6}px)`;
  g.drawImage(src, 0, 0, big.width, big.height);
  // re-harden alpha (blur softens the outline too much)
  const im = g.getImageData(0, 0, big.width, big.height);
  for (let i = 3; i < im.data.length; i += 4) { const a = im.data[i]!; im.data[i] = a < 90 ? 0 : a > 150 ? 255 : Math.round(((a - 90) / 60) * 255); }
  g.putImageData(im, 0, 0);
  const out = document.createElement('canvas') as ScaledCanvas;
  out.width = w * K; out.height = h * K;
  const og = out.getContext('2d')!;
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high';
  og.drawImage(big, 0, 0, out.width, out.height);
  out.k = K;
  return out;
}

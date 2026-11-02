// Terrain chunk painting with procedural themes (docs/07_visual.md §5.2).
import { makeCanvas, ctx2d, type Canvas } from './sprite';
import { PAL, type PalKey, hexToRgb } from './palette';
import { MAT, CW, CHK, type Terrain } from '../game/terrain';

export interface PaintInfo { x: number; y: number; mat: number; d: number; ax: number; ay: number; lit: number }
export type Painter = (p: PaintInfo) => PalKey;

function h2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export const THEMES: Record<string, Painter> = {
  hull: (p) => {
    const { x, y, d, lit } = p;
    if (d <= 1) return lit > 0.25 ? 'C3' : lit < -0.3 ? 'N1' : 'N4';
    if (d === 2) return lit > 0.2 ? 'N6' : lit < -0.3 ? 'N1' : 'N3';
    if (d === 3 && lit > 0.3) return 'N5';
    const px = ((x % 40) + 40) % 40, py = ((y % 24) + 24) % 24;
    if (d >= 5 && px >= 6 && px < 10 && py >= 6 && py < 8 && ((x / 40) | 0) % 3 === 0) return 'C4';
    if (px === 0 || py === 0) return 'N2';
    if (px === 3 && py === 3) return 'N5';
    if (d > 12) return h2(x >> 2, y >> 2) > 0.5 ? 'N2' : 'N1';
    return h2(x >> 3, y >> 3) > 0.7 ? 'N4' : 'N3';
  },
  cave: (p) => {
    const { x, y, d, lit, mat } = p;
    if (mat === MAT.CRYSTAL) {
      if (d <= 1) return lit > 0 ? 'C5' : 'P2';
      if (d === 2) return lit > 0 ? 'P4' : 'P1';
      const band = (((x + y * 2) % 23) + 23) % 23;
      if (band < 2) return 'C4';
      return d > 6 ? 'P1' : lit > 0.2 ? 'P3' : 'P2';
    }
    if (d <= 1) return lit > 0.25 ? 'P3' : 'N0';
    if (d === 2) return lit > 0.2 ? 'P2' : 'N0';
    const n = h2(x >> 2, y >> 2);
    if (d < 7) return n > 0.6 ? 'P1' : 'N2';
    if (n > 0.93) return 'P2';
    return n > 0.5 ? 'N1' : 'P0';
  },
  flesh: (p) => {
    const { x, y, d, lit } = p;
    if (d <= 1) return lit > 0.2 ? 'T3' : 'F0';
    if (d === 2) return lit > 0.2 ? 'F3' : 'F0';
    if (d === 3) return lit > 0.2 ? 'F2' : 'F1';
    const v = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 3) + Math.sin(y * 0.13 + x * 0.03);
    if (Math.abs(v) < 0.08 && d > 4) return 'T2';
    if (d > 10) return h2(x >> 2, y >> 2) > 0.6 ? 'F1' : 'F0';
    return h2(x >> 2, y >> 2) > 0.65 ? 'F2' : 'F1';
  },
  ruins: (p) => {
    const { x, y, d, lit } = p;
    if (d <= 1) return lit > 0.25 ? 'N7' : 'N1';
    if (d === 2) return lit > 0.2 ? 'N6' : 'N2';
    if (lit > 0.4 && d <= 3) return 'G2';
    const bx = ((x % 20) + 20) % 20, by = ((y % 10) + 10) % 10;
    const row = Math.floor(y / 10);
    const bx2 = (bx + (row % 2) * 10) % 20;
    if (by === 0 || bx2 === 0) return 'N2';
    return h2(x >> 3, y >> 2) > 0.75 ? 'G1' : 'N4';
  },
  foundry: (p) => {
    const { x, y, d, lit, mat } = p;
    if (mat === MAT.CONV_L || mat === MAT.CONV_R) {
      if (d <= 2) return ((x >> 2) + (y > 0 ? 0 : 1)) % 2 ? 'N2' : 'N4';
      return 'N1';
    }
    if (d <= 1) return lit > 0.25 ? 'O5' : 'N0';
    if (d === 2) return lit > 0.2 ? 'N6' : 'N1';
    if (d >= 3 && d <= 5) return (((x + y) >> 3) % 2) ? 'Y3' : 'N1';
    const px = ((x % 32) + 32) % 32, py = ((y % 32) + 32) % 32;
    if (px === 0 || py === 0) return 'N1';
    if ((px === 4 || px === 28) && (py === 4 || py === 28)) return 'N5';
    return h2(x >> 3, y >> 3) > 0.8 ? 'N2' : 'N3';
  },
  choir: (p) => {
    const { x, y, d, lit } = p;
    if (d <= 1) return lit > 0.2 ? 'Y4' : 'N4';
    if (d === 2) return lit > 0.2 ? 'N8' : 'N5';
    const px = ((x % 48) + 48) % 48, py = ((y % 32) + 32) % 32;
    if ((px === 24 && py > 6 && py < 26) || (py === 16 && px > 14 && px < 34)) return 'Y3';
    if (px === 0 || py === 0) return 'N5';
    if (d > 10) return 'N6';
    return lit > 0.1 ? 'N8' : 'N7';
  },
};

const rgbOf = new Map<string, [number, number, number]>();
function rgbKey(k: PalKey): [number, number, number] {
  let c = rgbOf.get(k);
  if (!c) { c = hexToRgb(PAL[k]); rgbOf.set(k, c); }
  return c;
}

export class TerrainRenderer {
  private cache = new Map<number, { c: Canvas; ver: number; used: number }>();
  private frame = 0;
  constructor(private t: Terrain, private painter: Painter) {}

  private paint(cx: number, cy: number): Canvas {
    const P = 7;
    const W = CW + P * 2, H = CHK + P * 2;
    const t = this.t;
    const mask = new Uint8Array(W * H);
    const x0 = cx * CW - P, y0 = cy * CHK - P;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = t.get(x0 + x, y0 + y);
    const dist = new Float32Array(W * H);
    const INF = 99;
    for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? INF : 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      dist[i] = Math.min(dist[i]!, dist[i - 1]! + 1, dist[i - W]! + 1, dist[i - W - 1]! + 1.4, dist[i - W + 1]! + 1.4);
    }
    for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      if (!mask[i]) continue;
      dist[i] = Math.min(dist[i]!, dist[i + 1]! + 1, dist[i + W]! + 1, dist[i + W + 1]! + 1.4, dist[i + W - 1]! + 1.4);
    }
    const c = makeCanvas(CW, CHK);
    const g = ctx2d(c);
    const img = g.createImageData(CW, CHK);
    const info: PaintInfo = { x: 0, y: 0, mat: 0, d: 0, ax: 0, ay: 0, lit: 0 };
    for (let y = 0; y < CHK; y++) for (let x = 0; x < CW; x++) {
      const i = (y + P) * W + (x + P);
      const m = mask[i]!;
      if (!m || m === MAT.BREAK) continue;
      const d = dist[i]!;
      const gx = dist[i + 1]! - dist[i - 1]!, gy = dist[i + W]! - dist[i - W]!;
      const gl = Math.sqrt(gx * gx + gy * gy) || 1;
      info.x = x0 + P + x; info.y = y0 + P + y; info.mat = m; info.d = Math.round(Math.min(d, 40));
      info.ax = -gx / gl; info.ay = -gy / gl;
      info.lit = info.ax * -0.6 + info.ay * -0.8;
      const [r, gg, b] = rgbKey(this.painter(info));
      const o = (y * CW + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Draw all visible chunks. Generates at most `budget` new chunks per call (others next frame). */
  draw(g: CanvasRenderingContext2D, camX: number, camY: number, budget = 2): void {
    this.frame++;
    const cx0 = Math.max(0, Math.floor(camX / CW)), cx1 = Math.floor((camX + 480) / CW);
    const cy0 = Math.floor(camY / CHK), cy1 = Math.floor((camY + 270) / CHK);
    let made = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1 + 1; cx++) {
      if (!this.t.chunk(cx, cy, false)) continue;
      const key = (cy + 512) * 8192 + cx;
      const ver = this.t.version(cx, cy);
      let e = this.cache.get(key);
      if (!e || e.ver !== ver) {
        if (made < budget) { e = { c: this.paint(cx, cy), ver, used: this.frame }; this.cache.set(key, e); made++; }
        else if (!e) continue;
      }
      e.used = this.frame;
      if (cx <= cx1) g.drawImage(e.c, Math.round(cx * CW - camX), Math.round(cy * CHK - camY));
    }
    if (this.cache.size > 24) {
      for (const [k, v] of this.cache) if (this.frame - v.used > 120) this.cache.delete(k);
    }
  }

  /** Pre-generate chunks around a camera position (stage load / checkpoint). */
  warm(camX: number, camY: number): void {
    const g = makeCanvas(1, 1).getContext('2d')!;
    for (let i = 0; i < 6; i++) this.draw(g, camX, camY, 8);
  }
}

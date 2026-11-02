// HD edition terrain: the per-pixel material map is resampled into smooth contours (bilinear occupancy, anti-aliased
// edge), lit from a continuous distance-field normal, and textured with the same theme painters plus soft shading
// and fine grain. Chunks are painted RS× in time-sliced jobs, ahead of the camera, so streaming never stalls a frame.
import { makeCanvas, ctx2d, type Canvas } from './sprite';
import { PAL, type PalKey, hexToRgb } from './palette';
import { MAT, CW, CHK, type Terrain } from '../game/terrain';
import { RS } from '../core/hd';
import type { Painter, PaintInfo } from './terrainRender';
import { THEMES_HD, type ShaderHD, type SurfHD } from './terrainThemesHD';

const P = 7;

function h2(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const rgbOf = new Map<string, [number, number, number]>();
function rgbKey(k: PalKey): [number, number, number] {
  let c = rgbOf.get(k);
  if (!c) { c = hexToRgb(PAL[k]); rgbOf.set(k, c); }
  return c;
}

interface Entry { c: Canvas | null; ver: number; used: number; job: Generator<void, Canvas, void> | null; jobVer: number }

export class TerrainRendererHD {
  private cache = new Map<number, Entry>();
  private frame = 0;
  private readonly K = RS;
  private shader: ShaderHD | null;
  constructor(private t: Terrain, private painter: Painter, themeId = '') {
    this.shader = THEMES_HD[themeId] ?? null;
  }

  /** Paint one chunk; yields every few rows so the work can be spread over frames. */
  private *paint(cx: number, cy: number): Generator<void, Canvas, void> {
    const K = this.K;
    const W = CW + P * 2, H = CHK + P * 2;
    const t = this.t;
    const mask = new Uint8Array(W * H);
    const x0 = cx * CW - P, y0 = cy * CHK - P;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = t.get(x0 + x, y0 + y);
    // distance inside solids (breakables count as solid for the bevel, but are drawn elsewhere)
    const dist = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? 99 : 0;
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
    const occ = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) occ[i] = mask[i] && mask[i] !== MAT.BREAK ? 1 : 0;
    yield;

    const OW = CW * K, OH = CHK * K;
    const c = makeCanvas(OW, OH);
    const g = ctx2d(c);
    const img = g.createImageData(OW, OH);
    const px = img.data;
    const info: PaintInfo = { x: 0, y: 0, mat: 0, d: 0, ax: 0, ay: 0, lit: 0 };
    const surf: SurfHD = { x: 0, y: 0, mat: 0, d: 0, ax: 0, ay: 0, lit: 0 };
    const col = [0, 0, 0];
    const shader = this.shader;
    for (let Y = 0; Y < OH; Y++) {
      const v = (Y + 0.5) / K - 0.5 + P;
      const iv = Math.floor(v), fv = v - iv;
      for (let X = 0; X < OW; X++) {
        const u = (X + 0.5) / K - 0.5 + P;
        const iu = Math.floor(u), fu = u - iu;
        const i00 = iv * W + iu, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
        const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
        const o = occ[i00]! * w00 + occ[i10]! * w10 + occ[i01]! * w01 + occ[i11]! * w11;
        const alpha = Math.max(0, Math.min(1, (o - 0.5) * K * 1.1 + 0.5));
        if (alpha <= 0) continue;
        // material of the strongest solid corner
        let mi = i00, mw = occ[i00]! * w00;
        if (occ[i10]! * w10 > mw) { mi = i10; mw = occ[i10]! * w10; }
        if (occ[i01]! * w01 > mw) { mi = i01; mw = occ[i01]! * w01; }
        if (occ[i11]! * w11 > mw) { mi = i11; mw = occ[i11]! * w11; }
        const m = mask[mi]!;
        if (!m || m === MAT.BREAK) continue;
        const D00 = dist[i00]!, D10 = dist[i10]!, D01 = dist[i01]!, D11 = dist[i11]!;
        const d = D00 * w00 + D10 * w10 + D01 * w01 + D11 * w11;
        const gx = (1 - fv) * (D10 - D00) + fv * (D11 - D01);
        const gy = (1 - fu) * (D01 - D00) + fu * (D11 - D10);
        const gl = Math.sqrt(gx * gx + gy * gy) || 1;
        const wx = x0 + u, wy = y0 + v;
        const ax = -gx / gl, ay = -gy / gl, lit = ax * -0.6 + ay * -0.8;
        const grain = (h2(X + cx * 977, Y + cy * 613) - 0.5) * 0.05;
        let r: number, gg: number, b: number;
        if (shader) {
          surf.x = wx; surf.y = wy; surf.mat = m; surf.d = Math.max(0, d - 0.5); surf.ax = ax; surf.ay = ay; surf.lit = lit;
          shader(surf, col);
          const k = 1 + grain;
          r = col[0]! * k; gg = col[1]! * k; b = col[2]! * k;
        } else {
          info.x = Math.floor(wx); info.y = Math.floor(wy); info.mat = m;
          info.d = Math.max(1, Math.min(40, Math.round(d)));
          info.ax = ax; info.ay = ay; info.lit = lit;
          const c3 = rgbKey(this.painter(info));
          // continuous light on top of the theme colour: rim near the surface, darker deep inside, fine grain
          const near = Math.exp(-d / 3.2);
          const shade = 1 + lit * 0.22 * near - Math.min(0.22, Math.max(0, d - 3) * 0.012) + grain;
          r = c3[0] * shade; gg = c3[1] * shade; b = c3[2] * shade;
        }
        const oo = (Y * OW + X) * 4;
        px[oo] = r > 255 ? 255 : r; px[oo + 1] = gg > 255 ? 255 : gg; px[oo + 2] = b > 255 ? 255 : b;
        px[oo + 3] = Math.round(alpha * 255);
      }
      if ((Y & 31) === 31) yield;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  private key(cx: number, cy: number): number { return (cy + 512) * 8192 + cx; }

  /** Advance a job; `budget` ms, or until done when budget is Infinity. Returns true when the chunk is ready. */
  private run(e: Entry, budget: number): boolean {
    if (!e.job) return true;
    const t0 = performance.now();
    for (;;) {
      const r = e.job.next();
      if (r.done) { e.c = r.value; e.ver = e.jobVer; e.job = null; return true; }
      if (performance.now() - t0 > budget) return false;
    }
  }

  private entry(cx: number, cy: number): Entry | null {
    if (!this.t.chunk(cx, cy, false)) return null;
    const k = this.key(cx, cy);
    const ver = this.t.version(cx, cy);
    let e = this.cache.get(k);
    if (!e) { e = { c: null, ver: -1, used: this.frame, job: null, jobVer: -1 }; this.cache.set(k, e); }
    if (e.ver !== ver && (!e.job || e.jobVer !== ver)) { e.job = this.paint(cx, cy); e.jobVer = ver; }
    return e;
  }

  draw(g: CanvasRenderingContext2D, camX: number, camY: number, budgetMs = 3): void {
    this.frame++;
    const cx0 = Math.max(0, Math.floor(camX / CW)), cx1 = Math.floor((camX + 480) / CW);
    const cy0 = Math.floor(camY / CHK), cy1 = Math.floor((camY + 270) / CHK);
    let spent = 0;
    // visible chunks first (must have something to show), then look ahead in both scroll directions
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const e = this.entry(cx, cy);
      if (!e) continue;
      e.used = this.frame;
      if (e.job) {
        const t0 = performance.now();
        this.run(e, e.c ? Math.max(0.5, budgetMs - spent) : Infinity);
        spent += performance.now() - t0;
      }
      if (e.c) g.drawImage(e.c, cx * CW - camX, cy * CHK - camY, CW, CHK);
    }
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 2; cx++) {
      if (spent >= budgetMs) break;
      if (cx < 0 || (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1)) continue;
      const e = this.entry(cx, cy);
      if (!e) continue;
      e.used = this.frame;
      if (e.job) { const t0 = performance.now(); this.run(e, budgetMs - spent); spent += performance.now() - t0; }
    }
    if (this.cache.size > 18) {
      for (const [k, v] of this.cache) if (this.frame - v.used > 90) this.cache.delete(k);
    }
  }

  /** Paint the chunks around a camera position synchronously (stage load / checkpoint). */
  warm(camX: number, camY: number): void {
    const cx0 = Math.max(0, Math.floor(camX / CW)) , cx1 = Math.floor((camX + 480) / CW) + 1;
    const cy0 = Math.floor(camY / CHK), cy1 = Math.floor((camY + 270) / CHK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const e = this.entry(cx, cy);
      if (e) { e.used = this.frame; this.run(e, Infinity); }
    }
  }
}

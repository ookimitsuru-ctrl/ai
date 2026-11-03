// Sprites: pixel-string definitions, an auto-shading "sprite builder", and pre-baked variants
// (hit-flash silhouette, carrier glow, vertical flip, pre-rotated frames).
import { PAL, type PalKey, hexToRgb, bayer } from './palette';
import { HD, RS, snap, type ScaledCanvas } from '../core/hd';
import { renderSpriteHD, upscalePixelArt, type SBOp } from './spriteHD';

export type Canvas = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): Canvas {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export function ctx2d(c: Canvas): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: false })!;
  g.imageSmoothingEnabled = HD;
  if (HD) g.imageSmoothingQuality = 'high';
  return g;
}

/** HD: an art canvas of logical size w×h stored at RS× (drawing code keeps using game-pixel coordinates). */
export function layerCanvas(w: number, h: number): { c: ScaledCanvas; g: CanvasRenderingContext2D } {
  const k = HD ? RS : 1;
  const c = makeCanvas(Math.ceil(w * k), Math.ceil(h * k)) as ScaledCanvas;
  c.k = k;
  const g = ctx2d(c);
  if (k !== 1) g.setTransform(k, 0, 0, k, 0, 0);
  return { c, g };
}

export class Sprite {
  readonly w: number;
  readonly h: number;
  readonly frames: number;
  readonly canvas: Canvas;
  /** canvas pixels per game pixel (RS for HD-built art, 1 for classic) */
  readonly k: number;
  private _flash: Canvas | null = null;
  private _flipY: Sprite | null = null;
  private _flipX: Sprite | null = null;
  private _glow = new Map<string, Canvas>();
  private _rot = new Map<number, Sprite[]>();

  constructor(canvas: Canvas, w: number, h: number, frames: number, k = 1) {
    this.canvas = canvas;
    this.w = w;
    this.h = h;
    this.frames = frames;
    this.k = k;
  }

  static fromCanvases(list: Canvas[]): Sprite {
    const k = (list[0] as ScaledCanvas | undefined)?.k ?? 1;
    const w = Math.max(...list.map((c) => c.width));
    const h = Math.max(...list.map((c) => c.height));
    const strip = makeCanvas(w * list.length, h);
    const g = ctx2d(strip);
    list.forEach((c, i) => g.drawImage(c, i * w + ((w - c.width) >> 1), (h - c.height) >> 1));
    return new Sprite(strip, w / k, h / k, list.length, k);
  }

  get flash(): Canvas {
    if (!this._flash) {
      if (this.k === 1) this._flash = tinted(this.canvas, '#ffffff');
      else {
        // HD: a bright glaze over the shaded sprite instead of a flat white silhouette
        const c = makeCanvas(this.canvas.width, this.canvas.height) as ScaledCanvas;
        c.k = this.k;
        const g = ctx2d(c);
        g.drawImage(this.canvas, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255,250,240,0.62)';
        g.fillRect(0, 0, c.width, c.height);
        this._flash = c;
      }
    }
    return this._flash;
  }

  /** Halo around the silhouette (carrier glow): 1 px ring in classic, a soft blurred aura in HD. Size (w+2)×(h+2) per frame. */
  glow(color: string): Canvas {
    let c = this._glow.get(color);
    if (!c) {
      const k = this.k;
      c = makeCanvas(this.canvas.width + 2 * k * this.frames, this.canvas.height + 2 * k);
      const g = ctx2d(c);
      const t = tinted(this.canvas, color);
      if (k === 1) {
        for (let f = 0; f < this.frames; f++) {
          for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 2], [0, 2], [2, 0]] as const) g.drawImage(t, f * this.w, 0, this.w, this.h, f * (this.w + 2) + dx, dy, this.w, this.h);
        }
        g.globalCompositeOperation = 'destination-out';
        for (let f = 0; f < this.frames; f++) g.drawImage(this.canvas, f * this.w, 0, this.w, this.h, f * (this.w + 2) + 1, 1, this.w, this.h);
      } else {
        const fw = this.w * k, fh = this.h * k;
        g.filter = `blur(${k * 1.2}px)`;
        for (let f = 0; f < this.frames; f++) for (let r = 0; r < 2; r++) g.drawImage(t, f * fw, 0, fw, fh, f * (fw + 2 * k) + k, k, fw, fh);
        g.filter = 'none';
        g.globalCompositeOperation = 'destination-out';
        for (let f = 0; f < this.frames; f++) g.drawImage(this.canvas, f * fw, 0, fw, fh, f * (fw + 2 * k) + k, k, fw, fh);
      }
      this._glow.set(color, c);
    }
    return c;
  }

  /** Draw the glow() halo for a frame, centred like drawSprite. */
  drawGlow(g: CanvasRenderingContext2D, color: string, frame: number, x: number, y: number): void {
    const k = this.k, f = ((frame % this.frames) + this.frames) % this.frames;
    g.drawImage(this.glow(color), f * (this.w + 2) * k, 0, (this.w + 2) * k, (this.h + 2) * k, snap(x - this.w / 2 - 1), snap(y - this.h / 2 - 1), this.w + 2, this.h + 2);
  }

  get flipY(): Sprite {
    if (!this._flipY) {
      const c = makeCanvas(this.canvas.width, this.canvas.height);
      const g = ctx2d(c);
      g.translate(0, c.height);
      g.scale(1, -1);
      g.drawImage(this.canvas, 0, 0);
      this._flipY = new Sprite(c, this.w, this.h, this.frames, this.k);
    }
    return this._flipY;
  }

  get flipX(): Sprite {
    if (!this._flipX) {
      const parts: Canvas[] = [];
      const fw = this.w * this.k, fh = this.h * this.k;
      for (let i = 0; i < this.frames; i++) {
        const c = makeCanvas(fw, fh) as ScaledCanvas;
        c.k = this.k;
        const g = ctx2d(c);
        g.translate(fw, 0);
        g.scale(-1, 1);
        g.drawImage(this.canvas, i * fw, 0, fw, fh, 0, 0, fw, fh);
        parts.push(c);
      }
      this._flipX = Sprite.fromCanvases(parts);
    }
    return this._flipX;
  }

  /** n pre-rotated copies of frame 0 (index k → angle k*360/n). */
  rotations(n: number, frame = 0): Sprite[] {
    let r = this._rot.get(n * 100 + frame);
    if (!r) {
      const src = this.frameCanvas(frame);
      r = [];
      for (let k = 0; k < n; k++) {
        if (this.k === 1) {
          const c = rotSprite(src, (k * 360) / n);
          r.push(new Sprite(c, c.width, c.height, 1));
        } else {
          // HD: smooth rotation of the hi-res frame
          const deg = (k * 360) / n, rad = (deg * Math.PI) / 180;
          const cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
          const lw0 = Math.ceil(this.w * cs + this.h * sn) + 2, lh0 = Math.ceil(this.w * sn + this.h * cs) + 2;
          const c = makeCanvas(lw0 * this.k, lh0 * this.k);
          const g = ctx2d(c);
          g.translate(c.width / 2, c.height / 2);
          g.rotate(rad);
          g.drawImage(src, -src.width / 2, -src.height / 2);
          r.push(new Sprite(c, lw0, lh0, 1, this.k));
        }
      }
      this._rot.set(n * 100 + frame, r);
    }
    return r;
  }

  frameCanvas(frame: number): Canvas {
    const fw = this.w * this.k, fh = this.h * this.k;
    const c = makeCanvas(fw, fh) as ScaledCanvas;
    c.k = this.k;
    ctx2d(c).drawImage(this.canvas, frame * fw, 0, fw, fh, 0, 0, fw, fh);
    return c;
  }
}

export function tinted(src: Canvas, color: string): Canvas {
  const c = makeCanvas(src.width, src.height) as ScaledCanvas;
  c.k = (src as ScaledCanvas).k;
  const g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Hit-flash phase: continuous hits alternate 2f white / 2f normal (docs/04 §1.1). Set by the world renderer. */
export const flashState = { on: true };

/** Draw a sprite centred at (x, y). */
export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, frame: number, x: number, y: number, flash = false): void {
  const f = ((frame % s.frames) + s.frames) % s.frames;
  const k = s.k;
  g.drawImage(flash && flashState.on ? s.flash : s.canvas, f * s.w * k, 0, s.w * k, s.h * k, snap(x - s.w / 2), snap(y - s.h / 2), s.w, s.h);
}

// ---------------------------------------------------------------------------
// Pixel-string sprites
export interface StringSpriteDef {
  map: Record<string, PalKey | string>;
  frames: string[][];
}

export function fromStrings(def: StringSpriteDef): Sprite {
  const list: Canvas[] = [];
  for (const rows of def.frames) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const c = makeCanvas(w, h);
    const g = ctx2d(c);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const row = rows[y]!;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.' || ch === ' ') continue;
        const key = def.map[ch];
        if (!key) continue;
        const hex = key.startsWith('#') ? key : PAL[key as PalKey];
        const [r, gg, b] = hexToRgb(hex);
        const o = (y * w + x) * 4;
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    list.push(HD ? upscalePixelArt(c) : c);
  }
  return Sprite.fromCanvases(list);
}

// ---------------------------------------------------------------------------
// Auto-shading sprite builder
export interface Material {
  ramp: PalKey[];        // dark → light
  bevel?: number;        // rounding radius in px (default 4)
  emissive?: boolean;    // glows: bright core, no light direction
  flat?: number;         // fixed ramp index (no shading)
  dither?: boolean;
  outline?: PalKey;      // outline color next to this material
  shine?: PalKey;        // highlight color for the most-lit pixels
}

const LX = -0.55, LY = -0.72, LZ = 0.42;
const LN = Math.sqrt(LX * LX + LY * LY + LZ * LZ);

export class SB {
  readonly w: number;
  readonly h: number;
  readonly m: Uint8Array;
  readonly ov: Int32Array;
  private mats: Material[] = [{ ramp: ['N0'] }];
  /** primitives, replayed at high resolution by the HD edition */
  readonly ops: SBOp[] = [];

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.m = new Uint8Array(w * h);
    this.ov = new Int32Array(w * h).fill(-1);
  }

  mat(def: Material): number {
    this.mats.push(def);
    return this.mats.length - 1;
  }

  private set(x: number, y: number, id: number): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.m[i] = id;
    if (id === 0) this.ov[i] = -1;
  }

  rect(x: number, y: number, w: number, h: number, id: number): this {
    if (HD) { this.ops.push({ k: 'rect', x, y, w, h, id }); return this; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, id);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, id: number): this {
    if (HD) { this.ops.push({ k: 'ellipse', cx, cy, rx, ry, id }); return this; }
    const x0 = Math.floor(cx - rx - 1), x1 = Math.ceil(cx + rx + 1), y0 = Math.floor(cy - ry - 1), y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, id);
    }
    return this;
  }

  circle(cx: number, cy: number, r: number, id: number): this {
    return this.ellipse(cx, cy, r, r, id);
  }

  ring(cx: number, cy: number, r0: number, r1: number, id: number): this {
    if (HD) { this.ops.push({ k: 'ring', cx, cy, r0, r1, id }); return this; }
    for (let y = Math.floor(cy - r1 - 1); y <= cy + r1 + 1; y++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r0 && d <= r1) this.set(x, y, id);
    }
    return this;
  }

  /** Filled polygon from flat [x0,y0,x1,y1,...] (pixel-centre sampling, even-odd). */
  poly(pts: number[], id: number): this {
    if (HD) { this.ops.push({ k: 'poly', pts: pts.slice(), id }); return this; }
    const n = pts.length / 2;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, pts[i * 2 + 1]!); maxY = Math.max(maxY, pts[i * 2 + 1]!); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!;
        const bx = pts[((i + 1) % n) * 2]!, by = pts[((i + 1) % n) * 2 + 1]!;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) this.set(x, y, id);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, id: number, thick = 1): this {
    if (HD) { this.ops.push({ k: 'line', x0, y0, x1, y1, id, thick }); return this; }
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (thick <= 1) this.set(x0, y0, id);
      else this.rect(x0 - ((thick - 1) >> 1), y0 - ((thick - 1) >> 1), thick, thick, id);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Explicit colour override (detail pixels). Marks the pixel as filled. */
  px(x: number, y: number, key: PalKey | string): this {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = y * this.w + x;
    const hex = key.startsWith('#') ? key : PAL[key as PalKey];
    if (HD) { this.ops.push({ k: 'px', x, y, rgb: parseInt(hex.slice(1), 16) }); return this; }
    this.ov[i] = parseInt(hex.slice(1), 16);
    if (this.m[i] === 0) this.m[i] = 255;
    return this;
  }

  pxLine(x0: number, y0: number, x1: number, y1: number, key: PalKey): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), key);
    return this;
  }

  pxRect(x: number, y: number, w: number, h: number, key: PalKey): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, key);
    return this;
  }

  /** Mirror the top half onto the bottom half (vertical symmetry). */
  mirrorY(): this {
    if (HD) { this.ops.push({ k: 'mirrorY' }); return this; }
    const { w, h } = this;
    for (let y = 0; y < h >> 1; y++) for (let x = 0; x < w; x++) {
      const a = y * w + x, b = (h - 1 - y) * w + x;
      this.m[b] = this.m[a]!; this.ov[b] = this.ov[a]!;
    }
    return this;
  }

  mirrorX(): this {
    if (HD) { this.ops.push({ k: 'mirrorX' }); return this; }
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w >> 1; x++) {
      const a = y * w + x, b = y * w + (w - 1 - x);
      this.m[b] = this.m[a]!; this.ov[b] = this.ov[a]!;
    }
    return this;
  }

  render(opts: { outline?: PalKey | 'auto' | null } = {}): Canvas {
    if (HD) return renderSpriteHD(this.w, this.h, this.ops, this.mats, opts.outline === undefined ? 'N1' : opts.outline);
    const { w, h, m } = this;
    const N = w * h;
    // region distance (to empty or different material), chamfer 1/1.414
    const d = new Float32Array(N);
    const INF = 1e6;
    for (let i = 0; i < N; i++) d[i] = m[i] === 0 ? 0 : INF;
    const same = (i: number, j: number) => m[j] === m[i] || m[j] === 255 || m[i] === 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i] === 0) continue;
      let v = d[i]!;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) v = Math.min(v, 1);
      if (x > 0) { const j = i - 1; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
      if (y > 0) { const j = i - w; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
      if (x > 0 && y > 0) { const j = i - w - 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
      if (x < w - 1 && y > 0) { const j = i - w + 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (m[i] === 0) continue;
      let v = d[i]!;
      if (x < w - 1) { const j = i + 1; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
      if (y < h - 1) { const j = i + w; v = Math.min(v, same(i, j) ? d[j]! + 1 : 1); }
      if (x < w - 1 && y < h - 1) { const j = i + w + 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
      if (x > 0 && y < h - 1) { const j = i + w - 1; v = Math.min(v, same(i, j) ? d[j]! + 1.414 : 1.414); }
      d[i] = v;
    }
    // height field
    const H = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const id = m[i]!;
      if (id === 0) continue;
      const mat = id === 255 ? null : this.mats[id]!;
      const bevel = mat?.bevel ?? 4;
      const t = Math.min(d[i]!, bevel) / bevel;
      H[i] = bevel * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    }
    const c = makeCanvas(w, h);
    const g = ctx2d(c);
    const img = g.createImageData(w, h);
    const put = (i: number, hex: string | number) => {
      const v = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
      const o = i * 4;
      img.data[o] = (v >> 16) & 255; img.data[o + 1] = (v >> 8) & 255; img.data[o + 2] = v & 255; img.data[o + 3] = 255;
    };
    const Hat = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : H[y * w + x]!);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const id = m[i]!;
      if (id === 0) continue;
      if (this.ov[i]! >= 0) { put(i, this.ov[i]!); continue; }
      const mat = this.mats[id]!;
      const ramp = mat.ramp;
      const n = ramp.length;
      let idx: number;
      if (mat.flat !== undefined) idx = mat.flat;
      else if (mat.emissive) {
        const bevel = mat.bevel ?? 4;
        const f = (Math.min(d[i]!, bevel) / bevel) * (n - 1);
        idx = mat.dither ? Math.floor(f) + (f - Math.floor(f) > bayer(x, y) ? 1 : 0) : Math.round(f);
      } else {
        const nx = (Hat(x - 1, y) - Hat(x + 1, y)) / 2;
        const ny = (Hat(x, y - 1) - Hat(x, y + 1)) / 2;
        const nz = 1;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const dot = (nx * LX + ny * LY + nz * LZ) / (nl * LN);
        const I = Math.max(0, Math.min(1, 0.12 + dot * 1.05));
        const f = I * (n - 1);
        idx = mat.dither ? Math.floor(f) + (f - Math.floor(f) > bayer(x, y) ? 1 : 0) : Math.round(f);
        if (mat.shine && I > 0.97) { put(i, PAL[mat.shine]); continue; }
      }
      idx = Math.max(0, Math.min(n - 1, idx));
      put(i, PAL[ramp[idx]!]);
    }
    const ol = opts.outline === undefined ? 'N1' : opts.outline;
    if (ol !== null) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (m[i] !== 0) continue;
        let nb = 0;
        if (x > 0 && m[i - 1]) nb = m[i - 1]!;
        else if (x < w - 1 && m[i + 1]) nb = m[i + 1]!;
        else if (y > 0 && m[i - w]) nb = m[i - w]!;
        else if (y < h - 1 && m[i + w]) nb = m[i + w]!;
        if (!nb) continue;
        const mat = nb === 255 ? null : this.mats[nb]!;
        if (mat?.emissive && !mat.outline) continue;
        if (mat?.outline) put(i, PAL[mat.outline]);
        else if (ol === 'auto') put(i, PAL[mat ? mat.ramp[0]! : 'N1']);
        else put(i, PAL[ol]);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------------------
// RotSprite-lite: Scale2x twice → nearest rotate → sample block centres.
function scale2x(src: Uint32Array<ArrayBufferLike>, w: number, h: number): Uint32Array<ArrayBufferLike> {
  const out = new Uint32Array(w * 2 * h * 2);
  const W = w * 2;
  const at = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    out[y * 2 * W + x * 2] = e0; out[y * 2 * W + x * 2 + 1] = e1;
    out[(y * 2 + 1) * W + x * 2] = e2; out[(y * 2 + 1) * W + x * 2 + 1] = e3;
  }
  return out;
}

export function rotSprite(src: Canvas, deg: number): Canvas {
  const w = src.width, h = src.height;
  const data = ctx2d(src).getImageData(0, 0, w, h);
  let px: Uint32Array<ArrayBufferLike> = new Uint32Array(data.data.buffer.slice(0));
  px = scale2x(px, w, h);
  px = scale2x(px, w * 2, h * 2);
  const W = w * 4, Hh = h * 4;
  const rad = (deg * Math.PI) / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);
  const ow = Math.ceil(Math.abs(w * cs) + Math.abs(h * sn)) + 2;
  const oh = Math.ceil(Math.abs(w * sn) + Math.abs(h * cs)) + 2;
  const out = makeCanvas(ow, oh);
  const g = ctx2d(out);
  const img = g.createImageData(ow, oh);
  const o32 = new Uint32Array(img.data.buffer);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const dx = (x + 0.5 - ow / 2) * 4, dy = (y + 0.5 - oh / 2) * 4;
    const sx = Math.floor(dx * cs + dy * sn + W / 2), sy = Math.floor(-dx * sn + dy * cs + Hh / 2);
    if (sx < 0 || sy < 0 || sx >= W || sy >= Hh) continue;
    o32[y * ow + x] = px[sy * W + sx]!;
  }
  g.putImageData(img, 0, 0);
  return out;
}

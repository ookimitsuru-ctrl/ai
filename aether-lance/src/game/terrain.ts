// Terrain: chunked per-pixel material bitmap in world coordinates, built from segment primitives,
// plus breakable/regenerating blocks and dynamic solids (waving walls, rhythm walls).
// (Implementation of docs/02_tech.md §7.3 — a per-pixel bitmap replaces 16×16 tile masks; same behaviour.)
import { dsin } from '../core/dmath';

export const MAT = { EMPTY: 0, ROCK: 1, CRYSTAL: 2, BREAK: 3, CONV_L: 4, CONV_R: 5, ALT: 6 } as const;

export const CW = 256;
export const CHK = 256;

export interface Breakable {
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  regen: number;      // frames to regrow (0 = never)
  timer: number;
  alive: boolean;
  flash: number;
  grow: number;       // 0..1 regrow animation (pre-solid swelling)
  style: 'crystal' | 'flesh';
  hidden?: string;    // item revealed
}

export interface DynSolid {
  kind: 'wave' | 'rhythm';
  x0: number; x1: number;
  // wave: floor baseline / ceiling baseline
  floorY?: number; ceilY?: number; amp?: number; period?: number; k?: number;
  // rhythm: box & phase
  y?: number; h?: number; phase?: number; solid?: boolean; glow?: number;
}

export class Terrain {
  chunks = new Map<number, Uint8Array>();
  ver = new Map<number, number>();
  breakables: Breakable[] = [];
  dyn: DynSolid[] = [];
  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 272;
  frame = 0;

  private key(cx: number, cy: number): number { return (cy + 512) * 8192 + cx; }

  chunk(cx: number, cy: number, create: boolean): Uint8Array | null {
    const k = this.key(cx, cy);
    let c = this.chunks.get(k);
    if (!c && create) { c = new Uint8Array(CW * CHK); this.chunks.set(k, c); }
    return c ?? null;
  }

  bump(cx: number, cy: number): void {
    const k = this.key(cx, cy);
    this.ver.set(k, (this.ver.get(k) ?? 0) + 1);
  }

  version(cx: number, cy: number): number { return this.ver.get(this.key(cx, cy)) ?? 0; }

  get(x: number, y: number): number {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0) return 0;
    const cx = x >> 8, cy = Math.floor(y / CHK);
    const c = this.chunks.get(this.key(cx, cy));
    if (!c) return 0;
    return c[(y - cy * CHK) * CW + (x & 255)]!;
  }

  set(x: number, y: number, v: number): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0) return;
    const cx = x >> 8, cy = Math.floor(y / CHK);
    const c = this.chunk(cx, cy, v !== 0);
    if (!c) return;
    c[(y - cy * CHK) * CW + (x & 255)] = v;
    if (x + 1 > this.maxX) this.maxX = x + 1;
  }

  fillRect(x: number, y: number, w: number, h: number, v: number): void {
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, v);
    this.touch(x0, y0, x1, y1);
  }

  touch(x0: number, y0: number, x1: number, y1: number): void {
    for (let cy = Math.floor(y0 / CHK); cy <= Math.floor((y1 - 1) / CHK); cy++)
      for (let cx = Math.max(0, x0 >> 8); cx <= Math.max(0, (x1 - 1) >> 8); cx++) this.bump(cx, cy);
  }

  /** Material at a world point including dynamic solids. */
  solid(x: number, y: number): number {
    const m = this.get(x, y);
    if (m) return m;
    for (let i = 0; i < this.dyn.length; i++) {
      const d = this.dyn[i]!;
      if (x < d.x0 || x >= d.x1) continue;
      if (d.kind === 'wave') {
        const o = this.waveOffset(d, x);
        if (d.floorY !== undefined && y >= d.floorY - o) return MAT.ROCK;
        if (d.ceilY !== undefined && y <= d.ceilY + o) return MAT.ROCK;
      } else if (d.solid && y >= d.y! && y < d.y! + d.h!) return MAT.ALT;
    }
    return 0;
  }

  waveOffset(d: DynSolid, x: number): number {
    return (d.amp ?? 8) * (0.5 + 0.5 * dsin((this.frame * 360) / (d.period ?? 120) + (x - d.x0) * (d.k ?? 1.5)));
  }

  /** Surface normal (pointing out of solid) estimated from a 7×7 neighbourhood. */
  normal(x: number, y: number, out: { x: number; y: number }): void {
    let sx = 0, sy = 0;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      if (this.solid(x + i, y + j)) { sx += i; sy += j; }
    }
    const l = Math.sqrt(sx * sx + sy * sy);
    if (l < 0.001) { out.x = 0; out.y = -1; return; }
    out.x = -sx / l; out.y = -sy / l;
  }

  surfaceDown(x: number, y: number, max = 400): number {
    for (let d = 0; d < max; d++) if (this.solid(x, y + d)) return y + d;
    return y + max;
  }

  surfaceUp(x: number, y: number, max = 400): number {
    for (let d = 0; d < max; d++) if (this.solid(x, y - d)) return y - d;
    return y - max;
  }

  breakableAt(x: number, y: number): Breakable | null {
    for (const b of this.breakables) if (b.alive && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
    return null;
  }

  damageBreakable(b: Breakable, dmg: number): boolean {
    b.hp -= dmg;
    b.flash = 3;
    if (b.hp <= 0) {
      b.alive = false;
      b.timer = b.regen;
      b.grow = 0;
      this.fillRect(b.x, b.y, b.w, b.h, MAT.EMPTY);
      return true;
    }
    return false;
  }

  /** Per-frame: regrowth of breakables, rhythm walls are driven by the stage. */
  update(frame: number, overlapsPlayer: (b: Breakable) => boolean): Breakable[] {
    this.frame = frame;
    const regrown: Breakable[] = [];
    for (const b of this.breakables) {
      if (b.flash > 0) b.flash--;
      if (!b.alive && b.regen > 0) {
        if (b.timer > 0) b.timer--;
        b.grow = b.timer < 30 ? 1 - b.timer / 30 : 0;
        if (b.timer <= 0) {
          if (overlapsPlayer(b)) { b.timer = 10; continue; }
          b.alive = true; b.hp = b.maxHp; b.grow = 0;
          this.fillRect(b.x, b.y, b.w, b.h, MAT.BREAK);
          regrown.push(b);
        }
      }
    }
    return regrown;
  }

  reset(): void {
    for (const b of this.breakables) {
      if (!b.alive) { b.alive = true; b.hp = b.maxHp; this.fillRect(b.x, b.y, b.w, b.h, MAT.BREAK); }
    }
  }
}

// ---------------------------------------------------------------------------
function hash(n: number): number {
  let x = (n | 0) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const a = hash(i * 31 + seed), b = hash((i + 1) * 31 + seed);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

export type Profile = [number, number][];

/** Builds terrain from primitives (world coordinates; screen-height worlds have y in 0..272). */
export class TerrainBuilder {
  constructor(public t: Terrain, public bottom = 272, public top = 0) {}

  private profileAt(p: Profile, x: number): number | null {
    if (!p.length || x < p[0]![0] || x > p[p.length - 1]![0]) return null;
    for (let i = 0; i + 1 < p.length; i++) {
      const [x0, h0] = p[i]!, [x1, h1] = p[i + 1]!;
      if (x >= x0 && x <= x1) return x1 === x0 ? h1 : h0 + ((h1 - h0) * (x - x0)) / (x1 - x0);
    }
    return null;
  }

  /** Floor: profile of [worldX, height-from-bottom]. */
  floor(p: Profile, o: { mat?: number; rough?: number; freq?: number; seed?: number; bottom?: number } = {}): this {
    const mat = o.mat ?? MAT.ROCK, bottom = o.bottom ?? this.bottom;
    const x0 = Math.floor(p[0]![0]), x1 = Math.ceil(p[p.length - 1]![0]);
    for (let x = x0; x < x1; x++) {
      let h = this.profileAt(p, x);
      if (h === null) continue;
      if (h <= 0.01) continue;
      if (o.rough) h += (vnoise(x / (o.freq ?? 18), o.seed ?? 1) - 0.5) * 2 * o.rough + (vnoise(x / 5, (o.seed ?? 1) + 9) - 0.5) * o.rough * 0.5;
      const sy = Math.round(bottom - Math.max(1, h));
      for (let y = sy; y < bottom + 2; y++) this.t.set(x, y, mat);
    }
    this.t.touch(x0, bottom - 400, x1, bottom + 2);
    return this;
  }

  ceil(p: Profile, o: { mat?: number; rough?: number; freq?: number; seed?: number; top?: number } = {}): this {
    const mat = o.mat ?? MAT.ROCK, top = o.top ?? this.top;
    const x0 = Math.floor(p[0]![0]), x1 = Math.ceil(p[p.length - 1]![0]);
    for (let x = x0; x < x1; x++) {
      let h = this.profileAt(p, x);
      if (h === null) continue;
      if (h <= 0.01) continue;
      if (o.rough) h += (vnoise(x / (o.freq ?? 18), (o.seed ?? 3) + 77) - 0.5) * 2 * o.rough + (vnoise(x / 5, (o.seed ?? 3) + 99) - 0.5) * o.rough * 0.5;
      const ey = Math.round(top + Math.max(1, h));
      for (let y = top - 2; y < ey; y++) this.t.set(x, y, mat);
    }
    this.t.touch(x0, top - 2, x1, top + 400);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, mat: number = MAT.ROCK): this {
    this.t.fillRect(x, y, w, h, mat);
    return this;
  }

  clear(x: number, y: number, w: number, h: number): this {
    this.t.fillRect(x, y, w, h, MAT.EMPTY);
    return this;
  }

  poly(pts: number[], mat: number = MAT.ROCK): this {
    const n = pts.length / 2;
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < n; i++) { minY = Math.min(minY, pts[i * 2 + 1]!); maxY = Math.max(maxY, pts[i * 2 + 1]!); minX = Math.min(minX, pts[i * 2]!); maxX = Math.max(maxX, pts[i * 2]!); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2]!, ay = pts[i * 2 + 1]!, bx = pts[((i + 1) % n) * 2]!, by = pts[((i + 1) % n) * 2 + 1]!;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) this.t.set(x, y, mat);
    }
    this.t.touch(Math.floor(minX), Math.floor(minY), Math.ceil(maxX) + 1, Math.ceil(maxY) + 1);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, mat: number = MAT.ROCK): this {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.t.set(x, y, mat);
    }
    this.t.touch(Math.floor(cx - rx), Math.floor(cy - ry), Math.ceil(cx + rx) + 1, Math.ceil(cy + ry) + 1);
    return this;
  }

  /** Jagged blob (asteroid/rock island). */
  blob(cx: number, cy: number, r: number, seed: number, mat: number = MAT.ROCK, jag = 0.3): this {
    const pts: number[] = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - jag + jag * 2 * hash(seed * 97 + i));
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    }
    return this.poly(pts, mat);
  }

  breakable(x: number, y: number, w: number, h: number, hp: number, regen = 0, style: 'crystal' | 'flesh' = 'crystal', hidden?: string): this {
    this.t.breakables.push({ x, y, w, h, hp, maxHp: hp, regen, timer: 0, alive: true, flash: 0, grow: 0, style, hidden });
    this.t.fillRect(x, y, w, h, MAT.BREAK);
    return this;
  }

  /** Stalactite / crystal spike pointing down (from ceiling) or up (from floor). */
  spike(x: number, baseY: number, w: number, len: number, dir: 1 | -1, mat: number = MAT.ROCK): this {
    return this.poly([x - w / 2, baseY, x + w / 2, baseY, x + w * 0.1, baseY + dir * len], mat);
  }
}

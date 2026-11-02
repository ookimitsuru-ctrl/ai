// Script context for enemy / boss coroutines + the bullet-pattern library (docs/02 §5.3, docs/04 §4).
import { datan2, dcos, dsin, ease as easeFn, type Ease } from '../core/dmath';
import { fxRng } from '../core/rng';
import { PAL } from '../render/palette';
import { EF, type Bullet, type BulletKind, type Enemy, type Hazard, type Part, type Shape } from './entities';
import { MAT } from './terrain';
import type { World } from './world';

export type Gen = Generator<number | undefined, void, unknown>;

export interface FireOpts {
  kind?: BulletKind;
  x?: number; y?: number;          // absolute origin (default: enemy + muzzle)
  ox?: number; oy?: number;        // offset from enemy
  base?: number;                   // base angle (default: aimed)
  scalable?: boolean;
  force?: boolean;                 // ignore fairness gate (bosses during scripted moments)
  sfx?: string | null;
  accel?: number; maxSpeed?: number; minSpeed?: number; turn?: number; turnFrames?: number; delay?: number; split?: number; bounce?: number; homing?: number; life?: number;
}

const tmpN = { x: 0, y: 0 };

export class Ctx {
  e!: Enemy;
  constructor(public w: World) {}

  get p() { return this.w.player; }
  get rng() { return this.w.rng; }
  get frame(): number { return this.w.frame; }
  get rank(): number { return this.w.rank; }
  get loop2(): boolean { return this.w.loop >= 2; }
  get diff() { return this.w.diff; }

  // ---- movement --------------------------------------------------------------------------------
  *moveTo(x: number, y: number, frames: number, ease: Ease = 'inOutSine'): Gen {
    const e = this.e;
    const anchored = e.anchored;
    const sx = anchored ? e.wx : e.x, sy = anchored ? e.wy : e.y;
    const tx = anchored ? x + this.w.camX : x, ty = anchored ? y + this.w.camY : y;
    e.vx = e.vy = 0;
    for (let i = 1; i <= frames; i++) {
      const k = easeFn(ease, i / frames);
      if (anchored) { e.wx = sx + (tx - sx) * k; e.wy = sy + (ty - sy) * k; }
      else { e.x = sx + (x - sx) * k; e.y = sy + (y - sy) * k; }
      yield 1;
    }
  }

  *moveBy(dx: number, dy: number, frames: number, ease: Ease = 'inOutSine'): Gen {
    const e = this.e;
    const ax = e.anchored, sx = ax ? e.wx : e.x, sy = ax ? e.wy : e.y;
    e.vx = e.vy = 0;
    for (let i = 1; i <= frames; i++) {
      const k = easeFn(ease, i / frames);
      if (ax) { e.wx = sx + dx * k; e.wy = sy + dy * k; } else { e.x = sx + dx * k; e.y = sy + dy * k; }
      yield 1;
    }
  }

  setPolar(angle: number, speed: number): void { this.e.vx = dcos(angle) * speed; this.e.vy = dsin(angle) * speed; }

  // ---- queries -------------------------------------------------------------------------------------
  aim(x = this.e.x, y = this.e.y): number {
    const p = this.w.player;
    if (p.state === 'dead' || p.state === 'gone') return 180;
    return datan2(p.hitY - y, p.hitX - x);
  }
  iv(n: number): number { return Math.max(1, Math.round(n * this.w.fireIntervalMul())); }
  can(aimed = false): boolean { return this.w.canFire(this.e, aimed); }
  fires(): boolean { return this.e.fireMask === 0 ? false : ((this.e.fireMask >> this.e.fIndex) & 1) === 1; }
  tele(n: number): number { return Math.max(n, this.w.cfg.teleMin); }
  nAdj(n: number, scalable = true): number {
    if (!scalable) return n;
    let k = n + this.w.cfg.nwayDelta + (this.w.rank >= 70 ? 2 : 0);
    if (k < 1) k = 1;
    return k;
  }
  rnd(): number { return this.w.rng.next(); }

  // ---- firing ----------------------------------------------------------------------------------------
  private origin(o: FireOpts): [number, number] {
    const e = this.e;
    return [o.x ?? e.x + (o.ox ?? 0), o.y ?? e.y + (o.oy ?? 0)];
  }

  private gate(o: FireOpts, aimed: boolean): boolean {
    return o.force ? this.w.player.state !== 'dead' && this.w.suppressFire <= 0 : this.w.canFire(this.e, aimed);
  }

  private snd(o: FireOpts, kind: BulletKind, x: number): void {
    if (o.sfx === null) return;
    this.w.sfx(o.sfx ?? (kind === 'orb' || kind === 'globe' || kind === 'globeSplit' ? 'enemy_fire_m' : 'enemy_fire_s'), x);
  }

  bullet(x: number, y: number, angle: number, speed: number, kind: BulletKind = 'pellet', o: FireOpts = {}): Bullet | null {
    return this.w.spawnBullet(x, y, angle, speed, kind, { ...o, force: false });
  }

  aimed(speed: number, o: FireOpts = {}): boolean {
    if (!this.gate(o, o.base === undefined)) return false;
    const [x, y] = this.origin(o);
    const kind = o.kind ?? 'pellet';
    this.w.spawnBullet(x, y, o.base ?? this.aim(x, y), speed, kind, o);
    this.snd(o, kind, x);
    return true;
  }

  nway(n: number, spread: number, speed: number, o: FireOpts = {}): boolean {
    if (!this.gate(o, o.base === undefined)) return false;
    const [x, y] = this.origin(o);
    const kind = o.kind ?? 'pellet';
    const k = this.nAdj(n, o.scalable ?? true);
    const base = o.base ?? this.aim(x, y);
    const sp = k > n ? (spread * (k - 1)) / Math.max(1, n - 1) : k < n ? (spread * (k - 1)) / Math.max(1, n - 1) : spread;
    for (let i = 0; i < k; i++) {
      const a = k === 1 ? base : base - sp / 2 + (sp * i) / (k - 1);
      this.w.spawnBullet(x, y, a, speed, kind, o);
    }
    this.snd(o, kind, x);
    return true;
  }

  ring(n: number, speed: number, o: FireOpts & { start?: number; gapAt?: number; gapN?: number } = {}): boolean {
    if (!this.gate(o, false)) return false;
    const [x, y] = this.origin(o);
    const kind = o.kind ?? 'pellet';
    const k = o.scalable ? this.nAdj(n) : n;
    const start = o.start ?? 0;
    for (let i = 0; i < k; i++) {
      const a = start + (360 * i) / k;
      if (o.gapAt !== undefined) {
        let d = a - o.gapAt; while (d > 180) d -= 360; while (d < -180) d += 360;
        if (Math.abs(d) < ((o.gapN ?? 1) * 360) / k / 2 + 0.01) continue;
      }
      this.w.spawnBullet(x, y, a, speed, kind, o);
    }
    this.snd(o, kind, x);
    return true;
  }

  /** Vertical wall of bullets with a gap of `gapSize` bullets around `gapY`. */
  wall(x: number, y0: number, count: number, spacing: number, speed: number, angle: number, gapY: number, gapSize: number, o: FireOpts = {}): boolean {
    if (!this.gate(o, false)) return false;
    let gi = Math.round((gapY - y0) / spacing - (gapSize - 1) / 2);
    gi = Math.max(0, Math.min(count - gapSize, gi));
    for (let i = 0; i < count; i++) {
      if (i >= gi && i < gi + gapSize) continue;
      this.w.spawnBullet(x, y0 + i * spacing, angle, speed, o.kind ?? 'pellet', o);
    }
    this.snd(o, o.kind ?? 'pellet', x);
    return true;
  }

  waveArc(angle: number, half: number, o: FireOpts & { gapA?: number; gapHalf?: number; gapA2?: number; grow?: number } = {}): boolean {
    if (!this.gate(o, false)) return false;
    const [x, y] = this.origin(o);
    const b = this.w.spawnBullet(x, y, angle, 0, 'waveArc', { force: true, arcHalf: half, gapA: o.gapA, gapHalf: o.gapHalf, gapA2: o.gapA2, arcGrow: o.grow ?? 2 });
    if (b) b.arcR = 6;
    this.w.sfx('wave_arc', x);
    return true;
  }

  // ---- lasers / hazards ------------------------------------------------------------------------------
  /** Raycast a beam (with crystal reflections) into a polyline. */
  traceBeam(x: number, y: number, angle: number, reflect: number, out: number[]): void {
    out.length = 0;
    out.push(x, y);
    let dx = dcos(angle), dy = dsin(angle);
    let cx = x, cy = y;
    const t = this.w.terrain;
    let refl = 0;
    for (let step = 0; step < 400; step++) {
      cx += dx * 2; cy += dy * 2;
      if (cx < -20 || cx > 500 || cy < -20 || cy > 290) break;
      const m = t.solid(cx + this.w.camX, cy + this.w.camY);
      if (m) {
        if (m === MAT.CRYSTAL && refl < reflect) {
          t.normal(cx + this.w.camX, cy + this.w.camY, tmpN);
          const dot = dx * tmpN.x + dy * tmpN.y;
          dx -= 2 * dot * tmpN.x; dy -= 2 * dot * tmpN.y;
          const l = Math.sqrt(dx * dx + dy * dy); dx /= l; dy /= l;
          cx -= dx * 0; cy -= dy * 0;
          out.push(cx, cy);
          cx += dx * 3; cy += dy * 3;
          refl++;
          continue;
        }
        break;
      }
    }
    out.push(cx, cy);
  }

  laser(x: number, y: number, angle: number, o: { width?: number; tele?: number; dur?: number; reflect?: number; owner?: Enemy | null; color?: number } = {}): Hazard | null {
    const pts: number[] = [];
    this.traceBeam(x, y, angle, o.reflect ?? 0, pts);
    const tele = this.tele(o.tele ?? 40);
    const h = this.w.addHazard('laser', { width: o.width ?? 4, tele, dur: o.dur ?? 40, owner: o.owner === undefined ? this.e : o.owner, sound: 'laser_fire', color: o.color ?? 0, x, y, angle });
    if (!h) return null;
    this.setPts(h, pts);
    this.w.addTele('line', 0, 0, 0, 0, tele, 1, 'O5', pts.slice());
    this.w.sfx('laser_charge', x);
    return h;
  }

  setPts(h: Hazard, pts: number[]): void {
    h.np = Math.min(8, pts.length / 2);
    for (let i = 0; i < h.np * 2; i++) h.pts[i] = pts[i]!;
  }

  /** Re-aim an existing laser hazard (follows its owner). */
  retarget(h: Hazard, x: number, y: number, angle: number, reflect = 0): void {
    const pts: number[] = [];
    this.traceBeam(x, y, angle, reflect, pts);
    this.setPts(h, pts);
    h.x = x; h.y = y; h.angle = angle;
  }

  telegraph(kind: 'line' | 'band' | 'circle' | 'cross' | 'shadow' | 'vband' | 'dots', x1: number, y1: number, x2: number, y2: number, frames: number, w = 1, color = 'O5', pts: number[] | null = null): void {
    this.w.addTele(kind, x1, y1, x2, y2, frames, w, color, pts);
  }

  sfx(id: string, x = this.e?.x ?? 240): void { this.w.sfx(id, x); }
  shake(v: number): void { this.w.shake(v); }
  flash(a: number, color = '#ffffff'): void { this.w.flash(a, color); }

  spawn(id: string, x: number, y: number, o: { behavior?: string; p?: Record<string, number>; parent?: Enemy; anchored?: boolean; wx?: number; wy?: number } = {}): Enemy | null {
    const self = this.e;
    const e = this.w.spawnEnemy(id, x, y, o);
    this.e = self;
    return e;
  }

  thread(g: Gen): void { this.e.threads.push({ gen: g, wait: 0 }); }
  runThread(e: Enemy, g: Gen): void { e.threads.push({ gen: g, wait: 0 }); }

  // ---- parts ---------------------------------------------------------------------------------------------
  part(id: string, ox: number, oy: number, shape: Shape, hp: number, o: Partial<Part> = {}): Part {
    const p: Part = { id, ox, oy, shape, hp, maxHp: hp, armored: false, alive: true, flash: 0, score: 2000, dmgMul: 1, contact: true, visible: true, x: this.e.x + ox, y: this.e.y + oy, ...o };
    (this.e.parts ??= []).push(p);
    return p;
  }

  getPart(id: string): Part {
    const p = this.e.parts?.find((x) => x.id === id);
    if (!p) throw new Error('part ' + id);
    return p;
  }

  partAlive(id: string): boolean { return !!this.e.parts?.find((x) => x.id === id)?.alive; }

  // ---- boss flow -----------------------------------------------------------------------------------------
  bossReady(): void { this.e.flags &= ~EF.INVULN; this.w.startBossFight(this.e); }
  killBoss(chain = 120): void { this.w.defeatBoss(this.e, chain); }

  bossDeath(e: Enemy, chain: number): void {
    e.threads.length = 0;
    e.flags |= EF.INVULN | EF.NO_FIRE | EF.NO_CONTACT;
    e.vx *= 0.3; e.vy *= 0.3;
    const w = this.w;
    const custom = e.o.deathFx as ((k: number) => void) | undefined;
    e.threads.push({ wait: 0, gen: (function* () {
      const bw = (e.o.bw as number) ?? 120, bh = (e.o.bh as number) ?? 80;
      for (let f = 0; f < chain; f++) {
        e.vx *= 0.96; e.vy = e.vy * 0.96 + 0.01;
        if (f % 6 === 0) {
          const x = e.x + (fxRng.next() - 0.5) * bw, y = e.y + (fxRng.next() - 0.5) * bh;
          w.fx.explosion(x, y, f % 18 === 0 ? 'large' : 'medium');
          w.sfx(f % 18 === 0 ? 'explode_l' : 'explode_m', x);
          w.shake(0.12);
        }
        custom?.(f / chain);
        yield 1;
      }
      w.fx.explosion(e.x, e.y, 'large');
      for (let k = 0; k < 6; k++) w.fx.explosion(e.x + (fxRng.next() - 0.5) * bw, e.y + (fxRng.next() - 0.5) * bh, 'large');
      w.fx.ring(e.x, e.y, 160, PAL.N8, 30, 4);
      w.fx.embers(e.x, e.y, 100, 4);
      w.fx.debris(e.x, e.y, 16, null, 0, 0, PAL.N4);
      w.renderHooks.wave?.(e.x, e.y, 260, 40, 1.4);
      w.renderHooks.chroma?.(1.2);
      w.flash(0.8, '#ffffff', 0.027);
      w.shake(1);
      w.sfx('boss_die', e.x);
      w.removeEnemy(e, true);
    })() });
  }
}

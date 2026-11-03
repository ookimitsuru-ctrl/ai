// Entity types and fixed-size pools (docs/02_tech.md §5).
import type { WeaponType } from '../core/save';
import type { EnemyDef } from './registry';

export type ItemKind = 'arms' | 'wisp' | 'aegis' | 'drive' | 'armsChip' | 'subChip' | 'oneUp' | 'star' | 'lostWisp';
export type BulletKind = 'pellet' | 'orb' | 'needle' | 'globe' | 'globeSplit' | 'missile' | 'shard' | 'waveArc' | 'chip';
export type SizeClass = 'S' | 'M' | 'L' | 'B';
export type SubType = 'bomb' | 'seeker';
export type Formation = 'wing' | 'trail' | 'orbit';

export const EF = {
  ARMORED: 1, GROUND: 2, CEILING: 4, WALL: 8, PERSISTENT: 16, NO_FIRE: 32, FRONT_ONLY: 64, NO_REVENGE: 128,
  INVULN: 256, NO_CONTACT: 512, BOSS: 1024, PASS_SHOTS: 2048, BACKGROUND: 4096, NO_SCORE: 8192, AIR_ANCHOR: 16384,
} as const;

export type Shape =
  | { kind: 'circle'; r: number; ox: number; oy: number }
  | { kind: 'box'; w: number; h: number; ox: number; oy: number };

export const circle = (r: number, ox = 0, oy = 0): Shape => ({ kind: 'circle', r, ox, oy });
export const box = (w: number, h: number, ox = 0, oy = 0): Shape => ({ kind: 'box', w, h, ox, oy });

export interface Pooled { active: boolean }

export class Pool<T extends Pooled> {
  readonly items: T[];
  constructor(n: number, make: () => T) {
    this.items = Array.from({ length: n }, make);
  }
  /** First free slot, or null if full. */
  get(): T | null {
    for (let i = 0; i < this.items.length; i++) if (!this.items[i]!.active) return this.items[i]!;
    return null;
  }
  /** Free slot, or recycle slot `cursor` (oldest-ish). */
  private cursor = 0;
  getOrRecycle(): T {
    const f = this.get();
    if (f) return f;
    const it = this.items[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.items.length;
    return it;
  }
  count(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }
  clear(): void {
    for (const it of this.items) it.active = false;
  }
}

// ---------------------------------------------------------------------------
export const SHOT_PULSE = 0, SHOT_FAN = 1, SHOT_RAY = 2, SHOT_BOMB = 3, SHOT_SEEKER = 4;

export class Shot implements Pooled {
  active = false;
  kind = 0;
  x = 0; y = 0; px = 0; py = 0; vx = 0; vy = 0;
  w = 0; h = 0;
  len = 0;         // ray length
  dmg = 1;
  life = 0;
  age = 0;
  gold = false;
  drone = false;
  thick = false;
  refl = 0;
  angle = 0;
  grav = 0;
  speed = 0;
  target: Enemy | null = null;
  hits = new Int32Array(24);
  nh = 0;
  // ray trail polyline (head first): up to 8 points
  trail = new Float32Array(16);
  nt = 0;
  scale = 1;
}

export class Bullet implements Pooled {
  active = false;
  kind: BulletKind = 'pellet';
  x = 0; y = 0; px = 0; py = 0; vx = 0; vy = 0;
  angle = 0; speed = 0; accel = 0; maxSpeed = 99; minSpeed = 0; turn = 0; turnFrames = 0;
  r = 2;
  life = 0; age = 0;
  grazed = false;
  hp = 0;
  bounce = 0;
  split = 0;          // frames until split (globeSplit)
  homing = 0;         // frames of homing left
  delay = 0;          // frames before moving (bullet "placed" then launched)
  arcR = 0; arcHalf = 30; gapA = 999; gapHalf = 0; gapA2 = 999; arcGrow = 2; arcMax = 240;
  fade = 0;           // >0 → dissolving (no collision)
}

export class Item implements Pooled {
  active = false;
  kind: ItemKind = 'arms';
  x = 0; y = 0; px = 0; py = 0; vx = 0; vy = 0;
  age = 0; life = 0;
  phase = 0;          // chip letter index
  magnet = false;
  baseY = 0;
  autoMagnet = 0;     // frames until auto magnet (stars)
}

export interface Part {
  id: string;
  ox: number; oy: number;
  shape: Shape;
  hp: number; maxHp: number;
  armored: boolean;
  alive: boolean;
  flash: number;
  score: number;
  dmgMul: number;
  contact: boolean;
  visible: boolean;
  /** absolute position this frame (computed by world) */
  x: number; y: number;
  onDestroy?: () => void;
  data?: Record<string, number>;
}

export interface Thread { gen: Generator<number | undefined, void, unknown>; wait: number }

export class Enemy implements Pooled {
  active = false;
  uid = 0;
  id = '';
  def!: EnemyDef;
  x = 0; y = 0; px = 0; py = 0; vx = 0; vy = 0; ax = 0; ay = 0;
  hp = 1; maxHp = 1;
  flash = 0;
  age = 0;
  flags = 0;
  carrier: ItemKind | null = null;
  formation = -1;
  fIndex = 0;
  fireMask = 0;
  threads: Thread[] = [];
  parts: Part[] | null = null;
  anchored = false;
  wx = 0; wy = 0;
  angle = 180;
  frame = 0;
  onScreenAt = -1;
  shape: Shape = { kind: 'circle', r: 6, ox: 0, oy: 0 };
  score = 100;
  size: SizeClass = 'S';
  dmgMul = 1;
  dead = false;
  parent: Enemy | null = null;
  v: Record<string, number> = {};
  o: Record<string, unknown> = {};
  flipY = false;
  revenge = false;
  invulnUntil = 0;
  entered = false;
  noOffscreenKill = false;
  hitSound = 'hit_enemy';
  armorFront = 0;     // SHELL-like: shots coming from this side (+1 = from left) are deflected
  drawLayer = 0;      // 0 ground layer, 1 air
  spawnFrame = 0;
  killedByPlayer = false;
}

export interface EnemyDefLike {
  id: string;
  hp: number;
  score: number;
  size: SizeClass;
}

export type HazardKind = 'laser' | 'bolt' | 'arc' | 'flame' | 'column' | 'band' | 'tendril' | 'molten' | 'press' | 'wall';

export class Hazard implements Pooled {
  active = false;
  kind: HazardKind = 'laser';
  pts = new Float32Array(16); // polyline x,y pairs (screen space)
  np = 0;
  width = 4;
  tele = 0;       // telegraph frames remaining
  dur = 0;        // active frames remaining
  age = 0;
  owner: Enemy | null = null;
  ownerUid = 0;
  color = 0;      // style variant
  x = 0; y = 0; w = 0; h = 0; // rect hazards (column/band/molten/flame) ; flame uses x,y,angle(w),len(h)
  angle = 0;
  lethal = true;
  sound = '';
  loopKey = '';
}

export type TeleKind = 'line' | 'band' | 'circle' | 'arrow' | 'shadow' | 'dots' | 'cross' | 'vband';

export class Tele implements Pooled {
  active = false;
  kind: TeleKind = 'line';
  x1 = 0; y1 = 0; x2 = 0; y2 = 0; w = 1;
  life = 0; max = 0;
  color = 'O5';
  pts: number[] | null = null;
}

export type ParticleKind = 'spark' | 'ember' | 'smoke' | 'debris' | 'ring' | 'glow' | 'fire' | 'shard' | 'flash' | 'trail' | 'leaf' | 'drop' | 'line';

export class Particle implements Pooled {
  active = false;
  kind: ParticleKind = 'spark';
  x = 0; y = 0; vx = 0; vy = 0;
  life = 0; max = 1;
  size = 1; grow = 0;
  color = '#fff';
  color2 = '#fff';
  grav = 0;
  drag = 1;
  rot = 0; vr = 0;
  add = false;
  src: CanvasImageSource | null = null;
  sx = 0; sy = 0; sw = 0; sh = 0;
}

export class Popup implements Pooled {
  active = false;
  text = '';
  x = 0; y = 0;
  life = 0;
  color = 'N8';
  small = true;
}

export interface PlayerLoadout {
  weapon: WeaponType; lv: number; sub: SubType | null; subLv: number; drones: number; formation: Formation; barrier: number; speedLv: number;
}

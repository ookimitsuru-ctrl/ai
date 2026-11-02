// Stage definition types and authoring helpers (docs/05_stages.md, docs/11_appendix.md §2).
import type { ItemKind } from './entities';
import type { TerrainBuilder } from './terrain';
import type { World } from './world';

export const SEC = 60;
export const s = (sec: number): number => Math.round(sec * SEC);

export interface SpawnEv {
  at: number; type: 'spawn'; id: string;
  x?: number; y?: number;
  behavior?: string;
  p?: Record<string, number>;
  count?: number; interval?: number;
  dy?: number; dx?: number;          // per-member offsets
  bonus?: ItemKind; carrier?: ItemKind; carrierIndex?: number;
  fireMask?: number;
  snap?: 'floor' | 'ceil' | 'left' | 'right';
  wx?: number; wy?: number;          // absolute world anchor
  loop2?: boolean;                   // only in loop 2
  warn?: boolean;                    // behind-warning
  noCount?: boolean;
}

export type TimelineEv =
  | SpawnEv
  | { at: number; type: 'scroll'; v: number; over?: number }
  | { at: number; type: 'scrollV'; vx: number; vy: number; over?: number }
  | { at: number; type: 'bg'; vx: number; vy?: number }
  | { at: number; type: 'wind'; v: number; warn?: number; over?: number }
  | { at: number; type: 'bolts'; xs: number[]; warn?: number; aim?: boolean }
  | { at: number; type: 'midboss'; id: string; drop?: ItemKind }
  | { at: number; type: 'boss'; id: string }
  | { at: number; type: 'bgm'; id: string; fade?: number }
  | { at: number; type: 'section'; name: string }
  | { at: number; type: 'item'; kind: ItemKind; x: number; y: number; world?: boolean }
  | { at: number; type: 'call'; fn: (w: World) => void; state?: boolean }
  | { at: number; type: 'checkpoint'; id: 'cp1' | 'cp2' | 'cp3' };

export interface StageDef {
  id: number;
  nameEn: string;
  nameJa: string;
  briefKey: string;
  bgm: string;
  bossBgm: string;
  bossName: string;
  theme: string;           // terrain painter id
  bgId: string;            // background renderer id
  worldTop?: number;       // world y range (for chunk rendering bounds)
  worldBottom?: number;
  dark?: boolean;          // ST2 light mask
  beatBpm?: number;        // ST6 beat sync
  scroll0: number;         // initial scroll speed
  events: TimelineEv[];
  build(b: TerrainBuilder, X: (t: number) => number, Y: (t: number) => number): void;
  onUpdate?(w: World): void;
  checkpoints: { id: 'start' | 'cp1' | 'cp2' | 'cp3'; at: number }[];
  midbossAt: number;
  bossAt: number;
}

/** Integrate the static scroll profile → camera position at timeline time t. */
export function scrollProfile(def: StageDef, maxT = 18000): { X: (t: number) => number; Y: (t: number) => number; xs: Float64Array; ys: Float64Array } {
  const xs = new Float64Array(maxT + 1), ys = new Float64Array(maxT + 1);
  const evs = def.events.filter((e) => e.type === 'scroll' || e.type === 'scrollV').sort((a, b) => a.at - b.at);
  let vx = def.scroll0, vy = 0, fromX = vx, fromY = 0, toX = vx, toY = 0, rampT = 0, rampLen = 0;
  let idx = 0, x = 0, y = 0;
  for (let t = 0; t <= maxT; t++) {
    while (idx < evs.length && evs[idx]!.at <= t) {
      const e = evs[idx++]!;
      fromX = vx; fromY = vy;
      if (e.type === 'scroll') { toX = e.v; toY = vy; rampLen = e.over ?? 60; }
      else if (e.type === 'scrollV') { toX = e.vx; toY = e.vy; rampLen = e.over ?? 60; }
      rampT = 0;
    }
    if (rampT < rampLen) { rampT++; const k = rampT / rampLen; vx = fromX + (toX - fromX) * k; vy = fromY + (toY - fromY) * k; }
    else { vx = toX; vy = toY; }
    xs[t] = x; ys[t] = y;
    x += vx; y += vy;
  }
  const X = (t: number) => xs[Math.max(0, Math.min(maxT, Math.round(t)))]!;
  const Y = (t: number) => ys[Math.max(0, Math.min(maxT, Math.round(t)))]!;
  return { X, Y, xs, ys };
}

// ---- authoring helpers ----------------------------------------------------------
type SpOpts = Omit<SpawnEv, 'at' | 'type' | 'id'>;
export const sp = (at: number, id: string, y: number, o: SpOpts = {}): SpawnEv => ({ at, type: 'spawn', id, y, ...o });
export const ground = (at: number, id: string, snap: 'floor' | 'ceil', dx = 24, o: SpOpts = {}): SpawnEv => ({ at, type: 'spawn', id, snap, dx, ...o });
export const scroll = (at: number, v: number, over = 60): TimelineEv => ({ at, type: 'scroll', v, over });
export const section = (at: number, name: string): TimelineEv => ({ at, type: 'section', name });
export const item = (at: number, kind: ItemKind, x: number, y: number): TimelineEv => ({ at, type: 'item', kind, x, y });
export const call = (at: number, fn: (w: World) => void, state = false): TimelineEv => ({ at, type: 'call', fn, state });

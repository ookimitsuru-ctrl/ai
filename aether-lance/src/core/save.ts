// Persistent data (docs/09_ui.md §8). All storage access is wrapped: the game must run without it.
import { DEFAULT_KEYS, DEFAULT_PAD, type KeyBindings, type PadBindings } from './input';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'ordeal';
export const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'ordeal'];
export type WeaponType = 'pulse' | 'fan' | 'ray';

export interface Settings {
  lang: 'ja' | 'en';
  shotMode: 'hold' | 'toggle';
  touchSensitivity: number;
  touchLayout: 'right' | 'left';
  touchAlwaysFire: boolean;
  vibration: boolean;
  keys: KeyBindings;
  pad: PadBindings;
  analogMove: boolean;
  scaleMode: 'integer' | 'fit' | 'stretch';
  scaleFilter: 'sharp' | 'soft';
  crt: 'off' | 'light' | 'strong';
  scanline: number;
  bloom: number;
  interpolate: boolean;
  quality: 'auto' | 'high' | 'low';
  showFps: boolean;
  volMaster: number;
  volBgm: number;
  volSfx: number;
  shake: 'off' | 'half' | 'full';
  flashReduce: boolean;
  bulletEmphasis: boolean;
  showHitbox: boolean;
  bgDim: number;
  gameSpeed: 100 | 90 | 80;
}

export interface RankEntry { name: string; score: number; reach: string; date: string; flags: string[]; weapon: WeaponType }

export interface SaveData {
  version: 1;
  settings: Settings;
  records: Record<Difficulty | 'bossrush', RankEntry[]>;
  progress: {
    reachedStage: Record<Difficulty, number>;
    loop2Reached: boolean;
    cleared: Record<Difficulty, number>; // 0 none, 1 loop1, 2 loop2
    bossRushUnlocked: boolean;
    ordealUnlocked: boolean;
    heardSongs: string[];
    seenIntro: boolean;
  };
  stats: { playTimeSec: number; kills: number; deaths: number; credits: number; weaponUse: Record<WeaponType, number> };
  lastName: string;
  achievements: string[];
}

const KEY = 'aetherlance.save.v1';

function defaultLang(): 'ja' | 'en' {
  try { return (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en'; } catch { return 'ja'; }
}

/** Phones and tablets: integer scaling wastes too much of a small screen, so they start in FIT. */
function coarsePointer(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

export function defaultSettings(): Settings {
  return {
    lang: defaultLang(), shotMode: 'hold', touchSensitivity: 1.3, touchLayout: 'right', touchAlwaysFire: false, vibration: true,
    keys: structuredClone(DEFAULT_KEYS), pad: structuredClone(DEFAULT_PAD), analogMove: false,
    scaleMode: coarsePointer() ? 'fit' : 'integer', scaleFilter: 'sharp', crt: 'light', scanline: 15, bloom: 55, interpolate: true, quality: 'auto', showFps: false,
    volMaster: 8, volBgm: 7, volSfx: 8,
    shake: 'full', flashReduce: false, bulletEmphasis: false, showHitbox: false, bgDim: 0, gameSpeed: 100,
  };
}

const DEFAULT_RANKS: [string, number, string, WeaponType][] = [
  ['ACE', 1500000, 'ALL', 'pulse'], ['KST', 1000000, '6-1', 'ray'], ['ORD', 800000, '5-1', 'fan'], ['ARC', 600000, '4-1', 'pulse'],
  ['LNC', 450000, '3-1', 'ray'], ['VGR', 300000, '3-1', 'fan'], ['HAL', 200000, '2-1', 'pulse'], ['SKY', 120000, '2-1', 'pulse'],
  ['NOV', 80000, '1-1', 'fan'], ['RKE', 50000, '1-1', 'pulse'],
];

export function defaultRanking(mul = 1): RankEntry[] {
  return DEFAULT_RANKS.map(([name, score, reach, weapon]) => ({ name, score: Math.round(score * mul / 10) * 10, reach, date: '2026-11-02', flags: [], weapon }));
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: defaultSettings(),
    records: {
      easy: defaultRanking(0.5), normal: defaultRanking(1), hard: defaultRanking(1.3), ordeal: defaultRanking(1.6),
      bossrush: DEFAULT_RANKS.map(([name], i) => ({ name, score: (6 + i) * 60 * 60, reach: 'ALL', date: '2026-11-02', flags: [], weapon: 'pulse' as WeaponType })),
    },
    progress: {
      reachedStage: { easy: 1, normal: 1, hard: 1, ordeal: 1 },
      loop2Reached: false,
      cleared: { easy: 0, normal: 0, hard: 0, ordeal: 0 },
      bossRushUnlocked: false, ordealUnlocked: false, heardSongs: [], seenIntro: false,
    },
    stats: { playTimeSec: 0, kills: 0, deaths: 0, credits: 0, weaponUse: { pulse: 0, fan: 0, ray: 0 } },
    lastName: 'AAA',
    achievements: [],
  };
}

/** Merge `src` onto `def` keeping only keys/types present in def (partial recovery of broken data). */
function mergeTyped<T>(def: T, src: unknown): T {
  if (src === null || src === undefined) return def;
  if (Array.isArray(def)) return (Array.isArray(src) ? src : def) as T;
  if (typeof def === 'object' && def !== null) {
    if (typeof src !== 'object' || Array.isArray(src)) return def;
    const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
    for (const k of Object.keys(out)) out[k] = mergeTyped(out[k], (src as Record<string, unknown>)[k]);
    return out as T;
  }
  return (typeof src === typeof def ? src : def) as T;
}

export function loadSave(): SaveData {
  const def = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as { version?: number };
    // version migrations go here (v1 is current)
    const merged = mergeTyped(def, parsed);
    // records: validate entries
    for (const k of Object.keys(merged.records) as (keyof SaveData['records'])[]) {
      const list = merged.records[k];
      merged.records[k] = Array.isArray(list) ? list.filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string').slice(0, 10) : def.records[k];
      if (merged.records[k].length < 10) merged.records[k] = def.records[k];
    }
    // key bindings must contain every action
    for (const a of Object.keys(def.settings.keys) as (keyof KeyBindings)[]) {
      const v = merged.settings.keys[a];
      if (!Array.isArray(v) || v.length !== 2) merged.settings.keys[a] = def.settings.keys[a];
    }
    return merged;
  } catch {
    return def;
  }
}

export function storeSave(s: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export const save: { data: SaveData } = { data: defaultSave() };

export function persist(): void { storeSave(save.data); }

export function insertRank(diff: Difficulty | 'bossrush', e: RankEntry, lowerIsBetter = false): number {
  const list = save.data.records[diff];
  let pos = list.findIndex((x) => (lowerIsBetter ? e.score < x.score : e.score > x.score));
  if (pos < 0) pos = list.length;
  if (pos >= 10) return -1;
  list.splice(pos, 0, e);
  list.length = Math.min(10, list.length);
  return pos;
}

export function rankPosition(diff: Difficulty | 'bossrush', score: number, lowerIsBetter = false): number {
  const list = save.data.records[diff];
  const pos = list.findIndex((x) => (lowerIsBetter ? score < x.score : score > x.score));
  return pos < 0 ? (list.length < 10 ? list.length : -1) : pos;
}

export type { KeyBindings, PadBindings };

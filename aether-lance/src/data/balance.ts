// All tunable numbers (docs/03_gameplay.md, docs/11_appendix.md §6).
import type { Difficulty } from '../core/save';

export const PLAYER = {
  speeds: [1.6, 2.2, 2.8, 3.4] as const,
  defaultSpeedLv: 2,
  hitR: 2.0,
  hitOffsetX: 3,
  terrainW: 16,
  terrainH: 6,
  grazeR: 14,
  pickupR: 12,
  magnetR: 40,
  bounds: { x0: 12, x1: 468, y0: 16, y1: 256 },
  enterFrames: 45,
  respawnWait: 120,
  respawnEnter: 40,
  respawnInvuln: 120,
  touchMaxStep: 12,
};

export interface PulseLv { offsets: number[]; angles: number[]; interval: number; speed: number; dmg: number; thick?: boolean }
export const PULSE: PulseLv[] = [
  { offsets: [0], angles: [0], interval: 5, speed: 10, dmg: 1.0 },
  { offsets: [-3, 3], angles: [0, 0], interval: 5, speed: 10, dmg: 1.0 },
  { offsets: [-3, 3], angles: [0, 0], interval: 4, speed: 11, dmg: 1.1 },
  { offsets: [0, 0, 0], angles: [0, -3, 3], interval: 4, speed: 11, dmg: 1.1 },
  { offsets: [0, 0, 0], angles: [0, -3, 3], interval: 4, speed: 12, dmg: 1.3, thick: true },
];

export interface FanLv { angles: number[]; interval: number; speed: number; dmg: number }
export const FAN: FanLv[] = [
  { angles: [0, -12, 12], interval: 7, speed: 8.0, dmg: 0.8 },
  { angles: [0, -16, 16], interval: 6, speed: 8.0, dmg: 0.9 },
  { angles: [0, -10, 10, -20, 20], interval: 6, speed: 8.5, dmg: 0.9 },
  { angles: [0, -10, 10, -20, 20, 162, 198], interval: 6, speed: 9.0, dmg: 1.0 },
  { angles: [0, -9, 9, -18, 18, -28, 28, 162, 198], interval: 6, speed: 9.0, dmg: 1.0 },
];

export interface RayLv { len: number; width: number; interval: number; speed: number; dmg: number }
export const RAY: RayLv[] = [
  { len: 40, width: 2, interval: 12, speed: 14, dmg: 3.0 },
  { len: 56, width: 3, interval: 11, speed: 14, dmg: 4.0 },
  { len: 72, width: 3, interval: 10, speed: 15, dmg: 5.0 },
  { len: 80, width: 4, interval: 10, speed: 15, dmg: 6.5 },
  { len: 96, width: 6, interval: 9, speed: 16, dmg: 8.0 },
];

export const BOMB = { interval: 24, vx: 1.5, vy: 0.5, gravity: 0.12, radius: 14, dmg: 4 };
export const SEEKER = { interval: 40, speed0: 2, accel: 0.25, maxSpeed: 6, turn: 6, dmg: 2.5, life: 120 };

export const DRONE = {
  max: 4,
  dmgMul: { wing: 0.6, trail: 0.6, orbit: 0.4 } as Record<string, number>,
  trailSpacing: 10,
  orbitR: 26,
  orbitSpeed: 4,
  wingSlots: [[-6, -20], [-6, 20], [-18, -36], [-18, 36]] as const,
  lostLife: 420,
};

export const DRIVE = {
  duration: 360, invuln: 60, ringRadius: 320, ringFrames: 30, ringDamage: 20,
  intervalMul: 0.75, dmgMul: 1.5, scoreMul: 2,
  gain: { killS: 1, killM: 4, part: 6, cell: 34, graze: 0.5, star: 0.2, maxedItem: 15, sameChip: 10 },
};

export const SCORE = {
  pointBlankR: 48, formationPer: 300, graze: 50, star: 10,
  maxedItem: 5000, aegisRefill: 2000, driveFull: 3000, sameChip: 3000, subMax: 3000,
  stageClear: 10000, noMiss: 30000, bossTimeK: 500, items: 20000, loop2Mul: 1.5,
};

export interface DiffCfg {
  lives: number; extend: number[]; extendEvery: number; bulletSpeed: number; fireInterval: number; nwayDelta: number;
  revenge: 'never' | 'loop2' | 'rank50' | 'always'; terrainKills: boolean; lvLoss: number; continues: number;
  rank: [number, number]; loops: number; teleMin: number; startLoop: number;
}

export const DIFFICULTY: Record<Difficulty, DiffCfg> = {
  easy: { lives: 5, extend: [30000, 100000], extendEvery: 150000, bulletSpeed: 0.75, fireInterval: 1.4, nwayDelta: -2, revenge: 'never', terrainKills: false, lvLoss: 0, continues: 99, rank: [0, 40], loops: 1, teleMin: 60, startLoop: 1 },
  normal: { lives: 3, extend: [50000, 150000], extendEvery: 200000, bulletSpeed: 1.0, fireInterval: 1.0, nwayDelta: 0, revenge: 'loop2', terrainKills: true, lvLoss: 1, continues: 5, rank: [10, 100], loops: 2, teleMin: 40, startLoop: 1 },
  hard: { lives: 3, extend: [50000, 150000], extendEvery: 200000, bulletSpeed: 1.15, fireInterval: 0.85, nwayDelta: 0, revenge: 'rank50', terrainKills: true, lvLoss: 2, continues: 3, rank: [30, 100], loops: 2, teleMin: 30, startLoop: 1 },
  ordeal: { lives: 2, extend: [100000, 300000], extendEvery: 0, bulletSpeed: 1.25, fireInterval: 0.75, nwayDelta: 2, revenge: 'always', terrainKills: true, lvLoss: 99, continues: 0, rank: [60, 100], loops: 2, teleMin: 30, startLoop: 2 },
};

export const FAIRNESS = { noFireAfterEnter: 20, noSpawnNearPlayer: 40, warnBehind: 60, crushWarn: 60 };

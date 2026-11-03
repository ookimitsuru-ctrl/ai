# 11. 付録: データ形式とサンプルコード

この付録のコードは「形」を示すためのものである。実装時に細部を変えてもよいが、ここに書かれた**フィールドの意味と単位**は守ること（時間 = f、距離 = px、角度 = 度、速度 = px/f）。

## 1. 基本の型

```ts
// src/game/types.ts
export type Difficulty = 'easy' | 'normal' | 'hard' | 'ordeal';
export type WeaponType = 'pulse' | 'fan' | 'ray';
export type SubType = 'bomb' | 'seeker';
export type Formation = 'wing' | 'trail' | 'orbit';
export type ItemKind = 'arms' | 'wisp' | 'aegis' | 'drive' | 'armsChip' | 'subChip' | 'oneUp' | 'star' | 'lostWisp';
export type BulletKind = 'pellet' | 'orb' | 'needle' | 'globe' | 'globeSplit' | 'laser' | 'missile' | 'bolt' | 'shard' | 'waveArc';
export type Ease = 'linear' | 'inQuad' | 'outQuad' | 'inOutSine' | 'outBack';
export type Action = 'up' | 'down' | 'left' | 'right' | 'shot' | 'drive' | 'speedUp' | 'speedDown' | 'formation' | 'pause' | 'confirm' | 'cancel';

export const enum EF {            // Enemy flags（ビットフラグ）
  ARMORED = 1, GROUND = 2, CEILING = 4, WALL = 8, PERSISTENT = 16, NO_FIRE = 32, FRONT_ONLY = 64, NO_REVENGE = 128,
}

export type Shape =
  | { type: 'circle'; r: number; ox?: number; oy?: number }
  | { type: 'aabb'; w: number; h: number; ox?: number; oy?: number }
  | { type: 'capsule'; len: number; r: number };
```

## 2. ステージの定義

```ts
// src/content/stages/types.ts
export interface StageDef {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  nameEn: string; nameJa: string; briefingKey: string;
  bgm: string; bossBgm: string;
  scroll: number;                         // 基本スクロール速度
  backgrounds: BackgroundLayerDef[];
  terrain: TerrainSegment[];
  terrainTheme: string;                   // タイルの生成関数のID
  checkpoints: { id: 'start' | 'cp1' | 'cp2' | 'cp3'; at: number }[];
  events: TimelineEvent[];
}

export type TerrainSegment =
  | { t: 'none'; len: number }
  | { t: 'floor'; len: number; h: number; rough?: number }
  | { t: 'ceil'; len: number; h: number; rough?: number }
  | { t: 'corridor'; len: number; floor: number; ceil: number }
  | { t: 'ramp'; len: number; which: 'floor' | 'ceil'; from: number; to: number }
  | { t: 'pillars'; len: number; interval: number; width: number; gap: number; alternate: boolean }
  | { t: 'wave'; len: number; amp: number; period: number }
  // 以下は、直前までのセグメントの上に重ねるオブジェクト（x はステージ先頭からのワールド座標）
  | { t: 'breakable'; x: number; y: number; w: number; h: number; hp: number; regen?: number }
  | { t: 'crystal'; x: number; y: number; w: number; h: number }
  | { t: 'conveyor'; x: number; w: number; which: 'floor' | 'ceil'; speed: number }
  | { t: 'rhythm'; x: number; y: number; w: number; h: number; phase: 0 | 1 }
  | { t: 'item'; x: number; y: number; kind: ItemKind };

export type TimelineEvent =
  | { at: number; spawn: string; x?: number; y: number; behavior?: string; params?: Record<string, number>;
      count?: number; interval?: number; formation?: string; carrier?: ItemKind; bonus?: ItemKind;
      fireMask?: number; snap?: 'floor' | 'ceil'; anchorX?: number; loop2Only?: boolean; warnBehind?: boolean }
  | { at: number; scroll: number; over: number; ease?: Ease }
  | { at: number; scrollV: [number, number]; over: number }
  | { at: number; wind: number; over: number; warn: number }
  | { at: number; lightning: number[]; warn: number }       // x座標の配列
  | { at: number; midboss: string } | { at: number; boss: string }
  | { at: number; waitUntil: 'midbossDefeated' | 'bossDefeated' }
  | { at: number; bgm: string; fade?: number }
  | { at: number; section: string }                         // HUDの表示と、テレメトリ用
  | { at: number; message: string };                        // 開発用
```

### 2.1 ステージ1の抜粋

```ts
// src/content/stages/stage1.ts
const S = 60; // 1秒
export const stage1: StageDef = {
  id: 1, nameEn: 'ORBITAL RING', nameJa: '軌道環', briefingKey: 'st1.brief',
  bgm: 'st1', bossBgm: 'boss', scroll: 0.75, terrainTheme: 'hull',
  backgrounds: [ /* 05 §2.2 */ ],
  terrain: [
    { t: 'none', len: 3800 },                                    // 0:00〜1:25 付近まで地形なし
    { t: 'ramp', which: 'floor', len: 160, from: 0, to: 48 },     // D1 床がせり上がる
    { t: 'floor', len: 640, h: 48, rough: 4 },
    { t: 'corridor', len: 600, floor: 48, ceil: 72 },             // D2 通路の高さ 270-48-72 = 150
    { t: 'ramp', which: 'ceil', len: 120, from: 72, to: 112 },    // D4 通路が110pxへ
    // ...
  ],
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: 85 * S }, { id: 'cp2', at: 165 * S }, { id: 'cp3', at: 215 * S }],
  events: [
    { at: 4 * S,  section: 'A' },
    { at: 4 * S,  spawn: 'dart', behavior: 'sine', y: 90,  count: 5, interval: 18 },
    { at: 8 * S,  spawn: 'dart', behavior: 'sine', y: 180, count: 5, interval: 18, bonus: 'arms' },
    { at: 13 * S, spawn: 'swirl', y: 70, count: 6, interval: 12, fireMask: 0b001010 },
    { at: 18 * S, spawn: 'dart', behavior: 'dive', y: 50,  count: 5, interval: 18 },
    { at: 18 * S + 6, spawn: 'dart', behavior: 'dive', y: 220, count: 5, interval: 18 },
    { at: 24 * S, spawn: 'swirl', y: 200, count: 6, interval: 12, bonus: 'wisp' },
    { at: 48 * S, spawn: 'debrisL', y: 120, carrier: 'drive' },
    { at: 65 * S, spawn: 'bulwark', y: 135 },
    { at: 85 * S, spawn: 'dart', behavior: 'straight', x: -20, y: 100, count: 3, interval: 20, warnBehind: true },
    { at: 115 * S, spawn: 'runner', snap: 'floor', anchorX: 5700, carrier: 'subChip' },
    { at: 135 * S, midboss: 'gatekeeper' },
    { at: 135 * S, waitUntil: 'midbossDefeated' },
    // ...
    { at: 215 * S, boss: 'warden' },
    { at: 215 * S, waitUntil: 'bossDefeated' },
  ],
};
```

## 3. 敵の定義とスクリプト

```ts
// src/content/enemies/types.ts
export interface EnemyDef {
  id: string;
  sprite: string;                // アトラスの名前
  shape: Shape;
  hp: number; score: number; size: 'S' | 'M' | 'L';
  flags: number;                 // EF の組み合わせ
  muzzle?: [number, number];     // 発射位置のオフセット
  behaviors: Record<string, (e: Enemy, c: ScriptCtx) => Generator<number, void, unknown>>;
  defaultBehavior: string;
  onDeath?: (e: Enemy, c: ScriptCtx) => void;   // 分裂など
}
```

```ts
// src/content/enemies/lancer.ts
export const lancer: EnemyDef = {
  id: 'lancer', sprite: 'lancer', shape: { type: 'aabb', w: 18, h: 6 },
  hp: 4, score: 300, size: 'S', flags: EF.FRONT_ONLY,
  defaultBehavior: 'charge',
  behaviors: {
    *charge(e, c) {
      yield* c.moveTo(400, e.y, 40, 'outQuad');
      const targetY = c.player.y;                       // この時点の自機のyを記憶する
      c.telegraph('line', { x1: e.x, y1: targetY, x2: 0, y2: targetY, width: 1 }, 30);
      yield* c.moveTo(400, targetY, 30, 'inOutSine');   // 予告の間に、狙う高さへ移動する
      c.sfx('lancer_dash');
      c.setVel(-6.0, 0);
    },
  },
};
```

## 4. ボスのスクリプト（WARDEN フェーズ2の骨格）

```ts
// src/content/bosses/warden.ts
export function* wardenPhase2(b: Boss, c: ScriptCtx) {
  yield* c.partAnim('shutter', 'open', 60);
  c.part('core').armored = false;
  while (c.part('core').alive) {
    const fast = c.part('core').hpRatio < 0.3;
    const k = fast ? 0.75 : 1;
    // a. リングバースト
    for (let i = 0; i < 3; i++) {
      c.fire('ring', { n: 12, speed: 1.6, startAngle: i * 15, kind: 'orb', from: 'core' });
      yield Math.round(20 * k);
    }
    yield Math.round(40 * k);
    // b. スパイラル
    yield* c.run(spiral({ arms: fast ? 3 : 2, rotPerShot: 7, interval: 4, duration: 90, speed: 1.8, from: 'core' }));
    yield Math.round(40 * k);
    // c. 突撃
    c.telegraph('band', { y: b.y, h: 96, color: 'danger' }, 40);
    c.partFlash('prow', 40);
    yield 40;
    yield* c.moveTo(420, b.y, 30, 'outQuad');
    yield* c.moveTo(220, b.y, 30, 'inQuad');
    c.shake(0.2);
    yield* c.moveTo(330, b.y, 60, 'inOutSine');
    yield Math.round(40 * k);
  }
}
```

## 5. MML のサンプル（メインテーマの冒頭。パーサの動作確認を兼ねる）

```ts
// src/content/music/title.ts
// 作曲時に自由に置き換えてよい。このサンプルはパーサとシンセの検証用のオリジナル旋律である。
export const title: Song = {
  id: 'title', title: 'Aether Lance', bpm: 120,
  tracks: {
    lead: `t120 @lead_saw v12 o5 l8
      L
      d4. a  g4 f  e | f  g  a2 r4  | b-4. a g4 f e | a2. r4 |
      d4. a  g4 f  e | f  g  a  > c d4 < a4 | b-4 > c4 d4 e4 | f+2. r4 |`,
    bass: `@bass_fm v11 o2 l8
      L
      [d d > d < d]2 | [b- b- > b- < b-]2 | [> c c > c < c <]2 | [a a > a < a]2 |
      [g g > g < g]2 | [b- b- > b- < b-]2 | [> c c > c < c <]2 | [d d > d < d]2 |`,
    pad: `@pad v7 o4 l1
      L
      {d f a} | {d f b-} | {e g > c <} | {c+ e a} |
      {d g b-} | {d f b-} | {e g > c <} | {d f+ a} |`,   // {} は和音（同時発音）
    drums: `@drums v12 l8
      L
      [c f+ d f+ c c d f+]8 |`,
  },
  driveTracks: [], noteEventTracks: [],
};
```

- **和音の記法:** `{c e g}4` のように `{ }` で囲んだ音を同時に発音する（繰り返しの `[ ]` と区別するため）。08 §4.1 のMML文法に、このコマンドを含めて実装する。
- `|` は小節線として読みやすさのためだけに置いてよい（繰り返しの `[ ]` の中にある `|` だけが「最終回で抜ける位置」の意味を持つ）。

## 6. balance.ts の抜粋

```ts
// src/data/balance.ts
export const PLAYER = {
  speeds: [1.6, 2.2, 2.8, 3.4] as const,
  defaultSpeedLv: 2,
  hitR: 2.0, hitOffsetX: 3, terrainBox: [16, 6] as const, grazeR: 14, pickupR: 12, magnetR: 40,
  bounds: { x0: 12, x1: 468, y0: 16, y1: 256 },
  respawn: { wait: 120, enter: 40, invuln: 120, startInvuln: 0 },
};

export const PULSE = [
  { n: 1, offsets: [0],         angles: [0],        interval: 5, speed: 10, dmg: 1.0 },
  { n: 2, offsets: [-3, 3],     angles: [0, 0],     interval: 5, speed: 10, dmg: 1.0 },
  { n: 2, offsets: [-3, 3],     angles: [0, 0],     interval: 4, speed: 11, dmg: 1.1 },
  { n: 3, offsets: [0, 0, 0],   angles: [0, -3, 3], interval: 4, speed: 11, dmg: 1.1 },
  { n: 3, offsets: [0, 0, 0],   angles: [0, -3, 3], interval: 4, speed: 12, dmg: 1.3, thickCenter: true },
] as const;

export const FAN = [
  { angles: [0, -12, 12],                            interval: 7, speed: 8.0, dmg: 0.8 },
  { angles: [0, -16, 16],                            interval: 6, speed: 8.0, dmg: 0.9 },
  { angles: [0, -10, 10, -20, 20],                   interval: 6, speed: 8.5, dmg: 0.9 },
  { angles: [0, -10, 10, -20, 20, 162, 198],         interval: 6, speed: 9.0, dmg: 1.0 },
  { angles: [0, -9, 9, -18, 18, -28, 28, 162, 198],  interval: 6, speed: 9.0, dmg: 1.0 },
] as const;

export const RAY = [
  { len: 40, width: 2, interval: 12, speed: 14, dmg: 3.0 },
  { len: 56, width: 3, interval: 11, speed: 14, dmg: 4.0 },
  { len: 72, width: 3, interval: 10, speed: 15, dmg: 5.0 },
  { len: 80, width: 4, interval: 10, speed: 15, dmg: 6.5 },
  { len: 96, width: 6, interval: 9,  speed: 16, dmg: 8.0 },
] as const;

export const DRONE = { max: 4, dmgMul: { wing: 0.6, trail: 0.6, orbit: 0.4 }, trailSpacing: 10, orbitR: 26, orbitSpeed: 4,
  wingSlots: [[-6, -20], [-6, 20], [-18, -36], [-18, 36]] as const, switchFrames: 12 };

export const DRIVE = { duration: 360, invuln: 60, ringRadius: 320, ringFrames: 30, ringDamage: 20,
  intervalMul: 0.75, dmgMul: 1.5, scoreMul: 2,
  gain: { killS: 1, killM: 4, part: 6, cell: 34, graze: 0.5, star: 0.2, maxedItem: 15 } };

export const DIFFICULTY = {
  easy:   { lives: 5, bulletSpeed: 0.75, fireInterval: 1.4,  nwayDelta: -2, revenge: 'never', terrainKills: false, lvLoss: 0,  continues: Infinity, rank: [0, 40] },
  normal: { lives: 3, bulletSpeed: 1.0,  fireInterval: 1.0,  nwayDelta: 0,  revenge: 'loop2', terrainKills: true,  lvLoss: 1,  continues: 5,        rank: [10, 100] },
  hard:   { lives: 3, bulletSpeed: 1.15, fireInterval: 0.85, nwayDelta: 0,  revenge: 'rank50', terrainKills: true, lvLoss: 2,  continues: 3,        rank: [30, 100] },
  ordeal: { lives: 2, bulletSpeed: 1.25, fireInterval: 0.75, nwayDelta: 2,  revenge: 'always', terrainKills: true, lvLoss: 99, continues: 0,        rank: [60, 100] },
} as const;

export const FAIRNESS = { noFireAfterEnter: 20, noSpawnNearPlayer: 40, warnBehind: 60,
  minTelegraph: { easy: 60, normal: 40, hard: 30, ordeal: 30 }, crushWarn: 60 };
```

## 7. リプレイの形式［SHOULD］

```ts
interface Replay {
  version: 1; seedBase: number; difficulty: Difficulty; respawn: 'inplace' | 'checkpoint';
  startStage: number; startLoop: 1 | 2; loadout?: PracticeLoadout;
  gameVersion: string;                 // バージョンが違うリプレイは再生しない
  input: string;                       // 1フレームの入力 = 12bitのビットマスク。(値, 連続数) の組をRLEで圧縮し、base64にする
  checksum: { stage: number; frame: number; hash: string }[];   // ステージ終了ごとの状態のハッシュ（決定性の検証用）
}
```

## 8. 状態のハッシュ（決定性の検証）

```ts
// FNV-1a 32bit。ワールドの主要な値を、決まった順序で投入する
function worldHash(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= (v * 1000) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(w.frame); mix(w.score); mix(w.player.x); mix(w.player.y); mix(w.player.lv); mix(w.rank);
  for (const e of w.enemies.activeInOrder()) { mix(e.def.idHash); mix(e.x); mix(e.y); mix(e.hp); }
  for (const b of w.bullets.activeInOrder()) { mix(b.x); mix(b.y); }
  mix(w.rngGame.state);
  return h.toString(16).padStart(8, '0');
}
```

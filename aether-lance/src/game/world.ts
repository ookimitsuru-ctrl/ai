// World: owns all game state and runs the fixed update order (docs/02_tech.md §4.3).
import { Rng, fxRng } from '../core/rng';
import { datan2, dcos, dsin, dist2, clamp } from '../core/dmath';
import type { Difficulty } from '../core/save';
import { DIFFICULTY, DRIVE, FAIRNESS, PLAYER, SCORE, BOMB, SEEKER, DRONE, BOSS_DMG, FILLER, type DiffCfg } from '../data/balance';
import { PAL } from '../render/palette';
import {
  Pool, Shot, Bullet, Item, Enemy, Hazard, Tele, Particle, Popup, EF, SHOT_PULSE, SHOT_FAN, SHOT_RAY, SHOT_BOMB, SHOT_SEEKER,
  type BulletKind, type ItemKind, type Part, type PlayerLoadout, type HazardKind, type TeleKind, type Shape,
} from './entities';
import { Player, updatePlayer, collectItem, addDrive, emptyInput, type InputFrame } from './player';
import { Terrain, TerrainBuilder, MAT } from './terrain';
import { scrollProfile, type StageDef, type SpawnEv, type TimelineEv } from './stage';
import { ENEMIES, type EnemyDef } from './registry';
import { Fx } from './fx';
import { circleVsShape, boxVsShape, segVsShape, segDist2 } from './collision';
import { Ctx } from './script';


/** Respawn entry candidates, nearest to the usual (60, 135) first. */
const ENTRY_SPOTS: { x: number; y: number }[] = (() => {
  const out: { x: number; y: number }[] = [];
  for (const x of [60, 80, 100, 120, 150, 180, 210, 240, 270]) for (let y = 39; y <= 231; y += 12) out.push({ x, y });
  return out.sort((a, b) => (Math.abs(a.x - 60) + Math.abs(a.y - 135) * 1.2) - (Math.abs(b.x - 60) + Math.abs(b.y - 135) * 1.2));
})();
/** The ship's 16×6 terrain box with a few pixels of room around it. */
const ENTRY_BOX: [number, number][] = [];
for (const dx of [-12, -6, 0, 6, 12]) for (const dy of [-7, 0, 7]) ENTRY_BOX.push([dx, dy]);

export type WorldEvent =
  | { type: 'stageClear'; bossBonus: boolean }
  | { type: 'gameOver' }
  | { type: 'warning'; name: string }
  | { type: 'bossStart'; name: string }
  | { type: 'checkpoint'; id: string }
  | { type: 'death'; cause: string }
  | { type: 'extend' }
  | { type: 'section'; name: string }
  | { type: 'vibrate'; ms: number }
  | { type: 'ending' };

export type MusicCmd = { cmd: 'play'; id: string; fade?: number } | { cmd: 'stop'; fade?: number } | { cmd: 'drive'; on: boolean } | { cmd: 'duck'; db: number; sec: number } | { cmd: 'tempo'; bpm: number };

export interface WorldOptions {
  stage: StageDef;
  diff: Difficulty;
  loop: number;
  mode: 'arcade' | 'practice' | 'bossrush';
  respawn: 'inplace' | 'checkpoint';
  score?: number;
  lives?: number;
  extIdx?: number;
  loadout?: PlayerLoadout;
  drive?: number;
  startAt?: 'start' | 'cp1' | 'cp2' | 'cp3' | 'midboss' | 'boss';
  god?: boolean;
  shotMode?: 'hold' | 'toggle';
}

export interface Formation { n: number; killed: number; lost: number; bonus: ItemKind | null; x: number; y: number; group: string }

export class World {
  readonly stage: StageDef;
  readonly diff: Difficulty;
  readonly cfg: DiffCfg;
  readonly loop: number;
  readonly mode: WorldOptions['mode'];
  respawnMode: 'inplace' | 'checkpoint';
  rng: Rng;
  frame = 0;
  t = 0;
  evIdx = 0;
  waiting: null | 'midboss' | 'boss' = null;
  pending: { at: number; ev: SpawnEv; i: number; fid: number }[] = [];
  /** frames until the next filler formation may be sent */
  fillerCd = FILLER.firstDelay;
  events: WorldEvent[] = [];
  sfxQ: { id: string; x: number }[] = [];
  musicQ: MusicCmd[] = [];

  // camera / scroll
  camX = 0; camY = 0;
  scrollVX = 0; scrollVY = 0;
  private sFromX = 0; private sFromY = 0; private sToX = 0; private sToY = 0; private sRamp = 0; private sRampLen = 0;
  bgX = 0; bgY = 0; bgVX: number | null = null; bgVY: number | null = null;
  wind = 0; windTarget = 0; windWarn = 0; windFrom = 0; windRamp = 0; windRampLen = 1; windDir = 0;
  conveyorPush = 0;
  haze = 0;
  dark = false;
  terrain = new Terrain();
  profile: { X: (t: number) => number; Y: (t: number) => number };

  player = new Player();
  shots = new Pool(320, () => new Shot());
  bullets = new Pool(1024, () => new Bullet());
  enemies = new Pool(180, () => new Enemy());
  items = new Pool(96, () => new Item());
  hazards = new Pool(48, () => new Hazard());
  teles = new Pool(64, () => new Tele());
  particles = new Pool(2048, () => new Particle());
  popups = new Pool(64, () => new Popup());
  fx = new Fx(this.particles);
  ctx: Ctx;

  score = 0;
  displayScore = 0;
  lives: number;
  extIdx = 0;
  rankTime = 0;
  rank = 0;
  continues = 0;

  hitstop = 0;
  slowmo = 0;
  trauma = 0;
  flashA = 0;
  flashColor = '#ffffff';
  flashDecay = 0.05;
  suppressFire = 0;
  noPlayerFire = false;
  respawned = false;
  uidSeq = 1;

  phase: 'play' | 'warning' | 'boss' | 'bossDying' | 'clear' | 'gameover' | 'escape' = 'play';
  phaseTimer = 0;
  boss: Enemy | null = null;
  bossId = '';
  bossTimer = 0;
  bossLimit = 0;
  bossReady = false;
  bossFrames = 0;
  bossBar = { name: '', value: 0, max: 1, shown: 0 };
  midboss: Enemy | null = null;
  midTimer = 0;
  midDrop: ItemKind | null = null;
  formations = new Map<number, Formation>();
  fseq = 1;
  section = 'A';
  checkpoint: 'start' | 'cp1' | 'cp2' | 'cp3' = 'start';
  warnings: { y: number; life: number }[] = [];
  beatOrigin = 0;
  beatLen = 24;
  musicId = '';
  musicStartFrame = 0;
  stats = { deaths: 0, kills: 0, itemsTotal: 0, itemsGot: 0, shots: 0, grazes: 0, bossFrames: 0, groupKills: new Map<string, number>() };
  stageData: Record<string, number> = {};
  practiceGod = false;
  /** player position history (ECHO enemies replay it) */
  hist = new Float32Array(2 * 512);
  histN = 0;

  constructor(o: WorldOptions) {
    this.stage = o.stage;
    this.diff = o.diff;
    this.cfg = DIFFICULTY[o.diff];
    this.loop = o.loop;
    this.mode = o.mode;
    this.respawnMode = o.respawn;
    this.rng = new Rng(o.stage.id * 7919 + o.loop * 104729);
    this.score = o.score ?? 0;
    this.displayScore = this.score;
    this.lives = o.lives ?? this.cfg.lives - 1;
    this.extIdx = o.extIdx ?? 0;
    this.rankTime = 0;
    this.dark = !!o.stage.dark;
    if (o.stage.beatBpm) this.beatLen = 3600 / o.stage.beatBpm;
    this.ctx = new Ctx(this);
    if (o.loadout) this.player.apply(o.loadout);
    this.player.drive = o.drive ?? 0;
    this.player.shotMode = o.shotMode ?? 'hold';
    this.practiceGod = !!o.god;
    this.player.godMode = !!o.god;
    // terrain
    this.profile = scrollProfile(o.stage);
    const b = new TerrainBuilder(this.terrain, o.stage.worldBottom ?? 272, o.stage.worldTop ?? 0);
    this.terrain.minY = (o.stage.worldTop ?? 0) - 8;
    this.terrain.maxY = (o.stage.worldBottom ?? 272) + 8;
    o.stage.build(b, this.profile.X, this.profile.Y);
    // item totals (for ITEMS bonus)
    for (const e of o.stage.events) {
      if (e.type === 'spawn' && (!e.loop2 || this.loop >= 2)) { if (e.bonus) this.stats.itemsTotal++; if (e.carrier) this.stats.itemsTotal++; }
      else if (e.type === 'item' && e.kind !== 'oneUp') this.stats.itemsTotal++;
      else if (e.type === 'midboss' && e.drop) this.stats.itemsTotal++;
    }
    for (const br of this.terrain.breakables) if (br.hidden && br.hidden !== 'oneUp') this.stats.itemsTotal++;
    this.scrollVX = this.sToX = o.stage.scroll0;
    // start position
    const start = o.startAt ?? 'start';
    if (start !== 'start') {
      const cp = o.stage.checkpoints.find((c) => c.id === start);
      const at = cp ? cp.at : start === 'midboss' ? o.stage.midbossAt - 60 : start === 'boss' ? o.stage.bossAt - 60 : 0;
      this.fastForward(at);
      if (start.startsWith('cp')) this.checkpoint = start as 'cp1' | 'cp2' | 'cp3';
      this.player.startEnter(-20, 80, PLAYER.enterFrames);
    } else {
      this.player.startEnter(-20, 80, PLAYER.enterFrames);
      this.music({ cmd: 'play', id: o.stage.bgm, fade: 0 });
      this.musicId = o.stage.bgm;
      this.beatOrigin = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  get rankMul(): { speed: number; interval: number } {
    return { speed: 1 + this.rank * 0.003, interval: 1 - this.rank * 0.003 };
  }
  bulletSpeedMul(): number { return this.cfg.bulletSpeed * (1 + this.rank * 0.003) * (this.loop >= 2 ? 1.1 : 1); }
  fireIntervalMul(): number { return this.cfg.fireInterval * (1 - this.rank * 0.003); }
  revengeOn(): boolean {
    const r = this.cfg.revenge;
    return r === 'always' || (r === 'loop2' && this.loop >= 2) || (r === 'rank50' && (this.rank >= 50 || this.loop >= 2));
  }

  sfx(id: string, x = 240): void { this.sfxQ.push({ id, x }); }
  music(c: MusicCmd): void { this.musicQ.push(c); }
  shake(v: number): void { this.trauma = Math.min(1, this.trauma + v); }
  flash(a: number, color = '#ffffff', decay = 0.05): void { if (a > this.flashA) { this.flashA = a; this.flashColor = color; this.flashDecay = decay; } }
  popup(text: string, x: number, y: number, color = 'N8', small = true): void {
    const p = this.popups.getOrRecycle();
    p.active = true; p.text = text; p.x = x; p.y = y; p.life = small ? 40 : 45; p.color = color; p.small = small;
  }
  fxSparks(x: number, y: number, n: number, color: string): void { this.fx.sparks(x, y, n, color); }
  fxRing(x: number, y: number, r: number, color: string, life: number): void { this.fx.ring(x, y, r, color, life); }

  /** Beat helpers (ST6). */
  beatIndex(): number { return Math.floor((this.frame - this.beatOrigin) / this.beatLen); }
  framesToBeat(mult = 1): number {
    const L = this.beatLen * mult;
    const ph = (((this.frame - this.beatOrigin) % L) + L) % L;
    return ph === 0 ? L : L - ph;
  }
  setBeatOrigin(): void { this.beatOrigin = this.frame + 1; }
  /** Player position `back` frames ago. */
  pastPos(back: number, out: { x: number; y: number }): void {
    const n = Math.min(back, this.histN - 1, 511);
    const k = (((this.histN - 1 - n) % 512) + 512) % 512 * 2;
    out.x = this.hist[k]!; out.y = this.hist[k + 1]!;
  }

  // ---------------------------------------------------------------------------------------------
  update(inp: InputFrame): void {
    this.frame++;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - this.flashDecay);
    this.trauma = Math.max(0, this.trauma - 1.5 / 60);
    if (this.hitstop > 0) { this.hitstop--; this.fx.update(); return; }
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.slowmo % 3 !== 0) { this.fx.update(); this.stepPopups(); return; }
    }
    this.stepTimeline();
    this.stepCamera();
    this.stepPhase();
    updatePlayer(this, inp);
    { const k = (this.histN++ % 512) * 2; this.hist[k] = this.player.x; this.hist[k + 1] = this.player.y; }
    this.stepShots();
    this.stepEnemies();
    this.stepBullets();
    this.stepHazards();
    this.stepItems();
    this.collide();
    this.stepTerrain();
    this.fx.update();
    this.stepPopups();
    this.stepScore();
    this.stage.onUpdate?.(this);
    if (this.suppressFire > 0) this.suppressFire--;
  }

  // ---- timeline --------------------------------------------------------------------------------
  private stepTimeline(): void {
    if (this.waiting) {
      if (this.waiting === 'midboss') {
        const m = this.midboss;
        if (!m || !m.active) { this.waiting = null; this.midboss = null; }
        else if (this.midTimer > 0 && --this.midTimer === 0) this.escape(m);
      }
      if (this.waiting) return;
    }
    const evs = this.stage.events;
    while (this.evIdx < evs.length && evs[this.evIdx]!.at <= this.t) {
      const e = evs[this.evIdx++]!;
      this.runEvent(e);
      if (this.waiting) { this.t++; return; }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      if (p.at <= this.t) { this.pending.splice(i, 1); this.spawnMember(p.ev, p.i, p.fid); }
    }
    this.stepFillers();
    this.t++;
  }

  /** Filler waves: between scripted waves, keep a steady stream of the stage's small enemies coming. */
  private stepFillers(): void {
    const list = this.stage.fillers;
    if (!list?.length || this.phase !== 'play' || this.waiting || this.stageData.silence || this.player.state === 'gone') return;
    if (this.fillerCd > 0) { this.fillerCd--; return; }
    // stay out of the way of scripted spawns and boss entrances
    const evs = this.stage.events;
    for (let i = this.evIdx; i < evs.length; i++) {
      const e = evs[i]!;
      const dt = e.at - this.t;
      if (dt > FILLER.bossGap) break;
      if ((e.type === 'midboss' || e.type === 'boss') || (e.type === 'spawn' && dt <= FILLER.scriptGap)) { this.fillerCd = 20; return; }
    }
    let alive = this.pending.length;
    for (const e of this.enemies.items) if (e.active && !e.dead && !(e.flags & (EF.BACKGROUND | EF.NO_SCORE)) && e.size !== 'B' && e.size !== 'L') alive++;
    if (alive >= FILLER.minAlive) { this.fillerCd = 15; return; }
    if (Math.abs(this.scrollVY) > 0.3) {
      // vertical shaft: come down from the top, inside the open part of the shaft
      const vl = this.stage.fillersV;
      if (!vl?.length) { this.fillerCd = 30; return; }
      const sy = 14 + this.camY;
      let lx = 240, rx = 240;
      if (this.terrain.solid(240 + this.camX, sy)) { this.fillerCd = 20; return; }
      while (lx > 8 && !this.terrain.solid(lx - 4 + this.camX, sy)) lx -= 4;
      while (rx < 472 && !this.terrain.solid(rx + 4 + this.camX, sy)) rx += 4;
      const xs = rx - lx - FILLER.margin * 2;
      if (xs < 8) { this.fillerCd = 20; return; }
      const tv = vl[Math.floor(this.rng.next() * vl.length)]!;
      const x = Math.round(lx + FILLER.margin + this.rng.next() * xs);
      this.runEvent({ ...tv, at: this.t, type: 'spawn', x, y: -20, p: { ...(tv.p ?? {}) } });
      this.fillerCd = FILLER.cooldown;
      return;
    }
    // a free corridor at the right edge
    const sx = 470 + this.camX;
    let top = 135, bot = 135;
    if (this.terrain.solid(sx, 135 + this.camY)) { this.fillerCd = 20; return; }
    while (top > 8 && !this.terrain.solid(sx, top - 4 + this.camY)) top -= 4;
    while (bot < 262 && !this.terrain.solid(sx, bot + 4 + this.camY)) bot += 4;
    const span = bot - top - FILLER.margin * 2;
    if (span < FILLER.minSpan - FILLER.margin * 2) { this.fillerCd = 20; return; }
    const tpl = list[Math.floor(this.rng.next() * list.length)]!;
    const y = Math.round(top + FILLER.margin + this.rng.next() * Math.max(0, span));
    const ev: SpawnEv = { ...tpl, at: this.t, type: 'spawn', y, p: { ...(tpl.p ?? {}) } };
    if (ev.p && 'dir' in ev.p) ev.p.dir = y < 135 ? 1 : -1; // loops curl toward the open side
    if (ev.p && 'phase' in ev.p) ev.p.phase = this.rng.next() < 0.5 ? 0 : 180;
    this.runEvent(ev);
    this.fillerCd = FILLER.cooldown;
  }

  private runEvent(e: TimelineEv, fastForward = false): void {
    switch (e.type) {
      case 'spawn': {
        if (fastForward) return;
        if (e.loop2 && this.loop < 2) return;
        const n = e.count ?? 1;
        let fid = -1;
        if (n > 1 || e.bonus) {
          fid = this.fseq++;
          this.formations.set(fid, { n, killed: 0, lost: 0, bonus: e.bonus ?? null, x: 0, y: 0, group: e.p?.group !== undefined ? String(e.p.group) : '' });
        }
        if (e.warn) this.behindWarning(e.y ?? 135);
        for (let i = 0; i < n; i++) {
          if (i === 0 || !e.interval) this.spawnMember(e, i, fid);
          else this.pending.push({ at: this.t + i * e.interval, ev: e, i, fid });
        }
        break;
      }
      case 'scroll': this.setScroll(e.v, this.scrollVY, e.over ?? 60); break;
      case 'scrollV': this.setScroll(e.vx, e.vy, e.over ?? 60); break;
      case 'bg': this.bgVX = e.vx; this.bgVY = e.vy ?? null; break;
      case 'wind':
        this.windFrom = this.wind; this.windTarget = e.v; this.windRamp = 0; this.windRampLen = e.over ?? 30;
        this.windWarn = fastForward ? 0 : e.warn ?? 60; this.windDir = Math.sign(e.v - this.wind);
        if (fastForward) { this.wind = e.v; this.windRamp = this.windRampLen; }
        break;
      case 'bolts':
        if (fastForward) return;
        for (const x of e.xs) this.lightning(e.aim ? this.player.x + x : x, e.warn ?? Math.max(this.cfg.teleMin, 50));
        break;
      case 'midboss':
        if (fastForward) return;
        this.waiting = 'midboss';
        this.midDrop = e.drop ?? null;
        this.midboss = this.spawnEnemy(e.id, 520, 135, {});
        if (this.midboss) {
          this.midTimer = this.midboss.def.timeLimit ?? 0;
          this.midboss.o.drop = e.drop ?? null;
        }
        break;
      case 'boss':
        if (fastForward) return;
        this.waiting = 'boss';
        this.bossId = e.id;
        this.phase = 'warning';
        this.phaseTimer = 180;
        this.music({ cmd: 'stop', fade: 1.5 });
        if (!this.stage.beatBpm) this.sfx('siren');
        this.events.push({ type: 'warning', name: ENEMIES.get(e.id)?.bossName ?? this.stage.bossName });
        break;
      case 'bgm':
        this.music({ cmd: 'play', id: e.id, fade: e.fade ?? 0 });
        this.musicId = e.id; this.musicStartFrame = this.frame;
        if (this.stage.beatBpm) this.setBeatOrigin();
        break;
      case 'section': this.section = e.name; if (!fastForward) this.events.push({ type: 'section', name: e.name }); break;
      case 'item': if (!fastForward) this.spawnItem(e.kind, e.world ? e.x - this.camX : e.x, e.world ? e.y - this.camY : e.y); break;
      case 'call': if (!fastForward || e.state) e.fn(this); break;
      case 'checkpoint': this.checkpoint = e.id; if (!fastForward) this.events.push({ type: 'checkpoint', id: e.id }); break;
    }
  }

  /** Re-create world state at timeline time `at` without spawning (checkpoint restart / practice). */
  fastForward(at: number): void {
    this.fillerCd = FILLER.firstDelay;
    this.t = 0; this.evIdx = 0;
    this.camX = 0; this.camY = 0;
    this.scrollVX = this.sToX = this.stage.scroll0; this.scrollVY = this.sToY = 0; this.sRamp = this.sRampLen = 0;
    this.wind = this.windTarget = 0;
    let bgm = this.stage.bgm;
    const evs = this.stage.events;
    while (this.evIdx < evs.length && evs[this.evIdx]!.at <= at) {
      const e = evs[this.evIdx]!;
      if (e.type === 'midboss' || e.type === 'boss') {
        if (e.at >= at) break;
      }
      if (e.type === 'bgm') bgm = e.id;
      else this.runEvent(e, true);
      this.evIdx++;
    }
    this.camX = this.profile.X(at);
    this.camY = this.profile.Y(at);
    this.t = at;
    if (!this.stageData.silence) this.music({ cmd: 'play', id: bgm, fade: 0.3 });
    this.musicId = bgm; this.musicStartFrame = this.frame;
    this.beatOrigin = this.frame;
    this.bgX = this.camX; this.bgY = this.camY;
  }

  private setScroll(vx: number, vy: number, over: number): void {
    this.sFromX = this.scrollVX; this.sFromY = this.scrollVY;
    this.sToX = vx; this.sToY = vy;
    this.sRamp = 0; this.sRampLen = Math.max(1, over);
  }

  private stepCamera(): void {
    if (this.sRamp < this.sRampLen) {
      this.sRamp++;
      const k = this.sRamp / this.sRampLen;
      this.scrollVX = this.sFromX + (this.sToX - this.sFromX) * k;
      this.scrollVY = this.sFromY + (this.sToY - this.sFromY) * k;
    }
    const moving = !this.waiting;
    if (moving) {
      // keep terrain exactly on the static profile
      this.camX = this.profile.X(this.t);
      this.camY = this.profile.Y(this.t);
    }
    this.bgX += this.bgVX ?? (moving ? this.scrollVX : this.stage.scroll0 * 0.4);
    this.bgY += this.bgVY ?? (moving ? this.scrollVY : 0);
    // wind
    if (this.windWarn > 0) this.windWarn--;
    else if (this.windRamp < this.windRampLen) { this.windRamp++; this.wind = this.windFrom + (this.windTarget - this.windFrom) * (this.windRamp / this.windRampLen); }
    for (let i = this.warnings.length - 1; i >= 0; i--) if (--this.warnings[i]!.life <= 0) this.warnings.splice(i, 1);
  }

  private stepPhase(): void {
    if (this.phase === 'warning') {
      if (--this.phaseTimer <= 0) {
        this.phase = 'boss';
        this.boss = this.spawnEnemy(this.bossId, 560, 135, {});
        this.bossReady = false;
        this.bossFrames = 0;
      }
    } else if (this.phase === 'boss') {
      const b = this.boss;
      if (b && b.active) {
        if (this.bossReady) {
          this.bossFrames++;
          if (this.bossTimer > 0 && --this.bossTimer === 0) { this.escape(b); this.phase = 'escape'; }
        }
        this.computeBossBar(b);
      }
    } else if (this.phase === 'escape') {
      const b = this.boss;
      if (!b || !b.active) { this.phase = 'clear'; this.events.push({ type: 'stageClear', bossBonus: false }); }
    } else if (this.phase === 'bossDying') {
      if (--this.phaseTimer <= 0) {
        this.phase = 'clear';
        this.events.push({ type: 'stageClear', bossBonus: true });
      }
    }
    if (this.midboss && this.midboss.active) this.computeBossBar(this.midboss);
  }

  computeBossBar(b: Enemy): void {
    let v = 0, m = 0;
    if (b.parts) {
      for (const p of b.parts) { if (p.maxHp > 0 && p.maxHp < 1e6) { m += p.maxHp; if (p.alive) v += Math.max(0, p.hp); } }
    } else { v = b.hp; m = b.maxHp; }
    if (b.o.barV !== undefined) { v = b.o.barV as number; m = b.o.barM as number; }
    this.bossBar.name = b.def.bossName ?? '';
    this.bossBar.value = v; this.bossBar.max = Math.max(1, m);
  }

  /** Called by boss scripts once the entrance is over. */
  startBossFight(e: Enemy): void {
    if (e !== this.boss) return;
    this.bossReady = true;
    this.bossLimit = this.bossTimer = e.def.timeLimit ?? 0;
    this.music({ cmd: 'play', id: this.stage.bossBgm });
    this.musicId = this.stage.bossBgm; this.musicStartFrame = this.frame;
    if (this.stage.beatBpm) this.setBeatOrigin();
    this.events.push({ type: 'bossStart', name: e.def.bossName ?? '' });
  }

  /** Boss defeated: start the death sequence. */
  defeatBoss(e: Enemy, chain = 120): void {
    if (this.phase === 'bossDying' || this.phase === 'clear') return;
    this.phase = 'bossDying';
    this.phaseTimer = chain + 90;
    this.hitstop = this.stage.beatBpm ? 0 : 8;
    this.slowmo = this.stage.beatBpm ? 0 : 60;
    this.stats.bossFrames = this.bossFrames;
    this.cancelBullets(true);
    this.music({ cmd: 'stop', fade: 0.05 });
    this.addScore(e.score, e.x, e.y, false, true);
    this.ctx.bossDeath(e, chain);
  }

  escape(e: Enemy): void {
    e.threads.length = 0;
    e.flags |= EF.INVULN | EF.NO_FIRE;
    e.noOffscreenKill = false;
    e.flags &= ~EF.PERSISTENT;
    this.ctx.runThread(e, (function* (en: Enemy) {
      for (;;) { en.vx = Math.min(6, en.vx + 0.12); en.vy *= 0.95; yield 1; }
    })(e));
  }

  // ---- spawning --------------------------------------------------------------------------------
  private spawnMember(ev: SpawnEv, i: number, fid: number): void {
    let x = (ev.x ?? 500) + (ev.dx ?? 0) * (ev.snap ? 0 : i);
    let y = (ev.y ?? 135) + (ev.dy ?? 0) * i;
    const def = ENEMIES.get(ev.id);
    if (!def) { console.warn('unknown enemy', ev.id); return; }
    let anchored = false, wx = 0, wy = 0, flip = false;
    if (ev.wx !== undefined) { anchored = true; wx = ev.wx + (ev.dx ?? 0) * i; wy = ev.wy ?? 135; }
    if (ev.snap) {
      anchored = true;
      wx = this.camX + 480 + (ev.dx ?? 24) + i * (ev.p?.spacing ?? 0);
      const h = def.shape.kind === 'box' ? def.shape.h : def.shape.r * 2;
      const scanY = this.camY + (ev.y ?? 135);
      if (ev.snap === 'floor') wy = this.terrain.surfaceDown(wx, scanY) - h / 2;
      else if (ev.snap === 'ceil') { wy = this.terrain.surfaceUp(wx, scanY) + h / 2 + 1; flip = true; }
      x = wx - this.camX; y = wy - this.camY;
    }
    const e = this.spawnEnemy(ev.id, x, y, { behavior: ev.behavior, p: ev.p, anchored, wx, wy, flip, snap: ev.snap });
    if (!e) return;
    if (fid >= 0) { e.formation = fid; e.fIndex = i; }
    e.fireMask = ev.fireMask ?? 0;
    if (ev.carrier && (ev.carrierIndex === undefined || ev.carrierIndex === i)) e.carrier = ev.carrier;
  }

  spawnEnemy(id: string, x: number, y: number, o: { behavior?: string; p?: Record<string, number>; anchored?: boolean; wx?: number; wy?: number; flip?: boolean; parent?: Enemy; snap?: string }): Enemy | null {
    const def = ENEMIES.get(id);
    if (!def) { console.warn('unknown enemy', id); return null; }
    const e = this.enemies.get();
    if (!e) return null;
    resetEnemy(e);
    e.active = true;
    e.uid = this.uidSeq++;
    e.id = id;
    e.def = def as EnemyDef;
    e.x = e.px = x; e.y = e.py = y;
    e.hp = e.maxHp = def.hp;
    e.score = def.score;
    e.size = def.size;
    e.flags = def.flags ?? 0;
    e.shape = def.shape;
    e.anchored = !!o.anchored;
    e.wx = o.wx ?? x + this.camX; e.wy = o.wy ?? y + this.camY;
    e.flipY = !!o.flip;
    if (o.snap === 'ceil') e.flags |= EF.CEILING;
    else if (o.snap === 'floor') e.flags |= EF.GROUND;
    e.parent = o.parent ?? null;
    e.spawnFrame = this.frame;
    e.drawLayer = def.layer ?? (e.flags & (EF.GROUND | EF.CEILING | EF.WALL) ? 0 : 1);
    if (o.p) for (const k in o.p) e.v[k] = o.p[k]!;
    const c = this.ctx;
    c.e = e;
    def.init?.(e, c);
    const fn = (o.behavior && def.behaviors?.[o.behavior]) || def.script || (def.behaviors ? Object.values(def.behaviors)[0] : undefined);
    if (fn) e.threads.push({ gen: fn(e, c), wait: 0 });
    return e;
  }

  spawnBullet(x: number, y: number, angle: number, speed: number, kind: BulletKind = 'pellet', o: Partial<Bullet> & { force?: boolean; raw?: boolean } = {}): Bullet | null {
    if (!o.force) {
      if (this.suppressFire > 0 || this.phase === 'bossDying' || this.phase === 'clear') return null;
      if (x < -16 || x > 496 || y < -16 || y > 286) return null;
      const p = this.player;
      if (p.alive && dist2(x, y, p.hitX, p.hitY) < FAIRNESS.noSpawnNearPlayer * FAIRNESS.noSpawnNearPlayer) return null;
    }
    const b = this.bullets.get();
    if (!b) return null;
    const sp = o.raw ? speed : speed * this.bulletSpeedMul();
    b.active = true; b.kind = kind;
    b.x = b.px = x; b.y = b.py = y;
    b.angle = angle; b.speed = sp;
    b.vx = dcos(angle) * sp; b.vy = dsin(angle) * sp;
    b.accel = 0; b.maxSpeed = 99; b.minSpeed = 0; b.turn = 0; b.turnFrames = 0;
    b.r = kind === 'pellet' ? 2 : kind === 'orb' ? 3.5 : kind === 'needle' ? 1.5 : kind === 'globe' || kind === 'globeSplit' ? 6 : kind === 'missile' ? 3 : kind === 'shard' ? 2.5 : kind === 'chip' ? 1.8 : 1.5;
    b.life = 900; b.age = 0; b.grazed = false; b.hp = kind === 'missile' ? 1 : 0; b.bounce = kind === 'shard' ? 1 : 0;
    b.split = kind === 'globeSplit' ? 60 : 0; b.homing = kind === 'missile' ? 150 : 0; b.delay = 0; b.fade = 0;
    b.arcR = 0; b.arcHalf = 30; b.gapA = 999; b.gapHalf = 0; b.gapA2 = 999; b.arcGrow = 2; b.arcMax = 240;
    if (o.accel !== undefined) b.accel = o.accel;
    if (o.maxSpeed !== undefined) b.maxSpeed = o.maxSpeed * (o.raw ? 1 : this.bulletSpeedMul());
    if (o.minSpeed !== undefined) b.minSpeed = o.minSpeed;
    if (o.turn !== undefined) b.turn = o.turn;
    if (o.turnFrames !== undefined) b.turnFrames = o.turnFrames;
    if (o.delay !== undefined) b.delay = o.delay;
    if (o.life !== undefined) b.life = o.life;
    if (o.split !== undefined) b.split = o.split;
    if (o.bounce !== undefined) b.bounce = o.bounce;
    if (o.arcHalf !== undefined) b.arcHalf = o.arcHalf;
    if (o.gapA !== undefined) b.gapA = o.gapA;
    if (o.gapHalf !== undefined) b.gapHalf = o.gapHalf;
    if (o.gapA2 !== undefined) b.gapA2 = o.gapA2;
    if (o.arcGrow !== undefined) b.arcGrow = o.arcGrow * (o.raw ? 1 : this.bulletSpeedMul());
    if (o.homing !== undefined) b.homing = o.homing;
    return b;
  }

  spawnShot(kind: number, x: number, y: number, angle: number, speed: number, dmg: number, gold: boolean, drone: boolean, w: number, h: number): Shot | null {
    const s = kind === SHOT_PULSE || kind === SHOT_FAN ? this.shots.getOrRecycle() : this.shots.get();
    if (!s) return null;
    s.active = true; s.kind = kind;
    s.x = s.px = x; s.y = s.py = y;
    s.angle = angle; s.speed = speed;
    s.vx = dcos(angle) * speed; s.vy = dsin(angle) * speed;
    s.dmg = dmg; s.gold = gold; s.drone = drone; s.w = w; s.h = h; s.len = w;
    s.life = 120; s.age = 0; s.refl = 0; s.grav = 0; s.target = null; s.nh = 0; s.nt = 0; s.thick = h >= 5; s.scale = kind === SHOT_FAN ? 0.5 : 1;
    if (kind === SHOT_RAY) { s.trail[0] = x; s.trail[1] = y; s.trail[2] = x; s.trail[3] = y; s.nt = 2; }
    return s;
  }

  spawnItem(kind: ItemKind, x: number, y: number): Item | null {
    const it = kind === 'star' ? this.items.getOrRecycle() : this.items.get();
    if (!it) return null;
    it.active = true; it.kind = kind;
    it.x = it.px = x; it.y = it.py = clamp(y, 20, 250); it.baseY = it.y;
    it.vx = kind === 'star' ? 0 : 1.0; it.vy = 0;
    it.age = 0; it.life = kind === 'lostWisp' ? DRONE.lostLife : 99999;
    it.phase = 0; it.magnet = false; it.autoMagnet = kind === 'star' ? 30 : 0;
    return it;
  }

  addHazard(kind: HazardKind, o: Partial<Hazard>): Hazard | null {
    const h = this.hazards.get();
    if (!h) return null;
    h.active = true; h.kind = kind; h.np = 0; h.width = 4; h.tele = 0; h.dur = 60; h.age = 0; h.owner = null; h.ownerUid = 0;
    h.color = 0; h.x = h.y = h.w = h.h = 0; h.angle = 0; h.lethal = true; h.sound = ''; h.loopKey = '';
    Object.assign(h, o);
    const ow = h.owner as Enemy | null;
    if (ow) h.ownerUid = ow.uid;
    return h;
  }

  addTele(kind: TeleKind, x1: number, y1: number, x2: number, y2: number, life: number, w = 1, color = 'O5', pts: number[] | null = null): Tele | null {
    const t = this.teles.get();
    if (!t) return null;
    t.active = true; t.kind = kind; t.x1 = x1; t.y1 = y1; t.x2 = x2; t.y2 = y2; t.life = t.max = life; t.w = w; t.color = color; t.pts = pts;
    return t;
  }

  behindWarning(y: number): void {
    this.warnings.push({ y, life: FAIRNESS.warnBehind });
    this.sfx('warn_behind', 0);
  }

  lightning(x: number, warn: number): void {
    const t = Math.max(warn, this.cfg.teleMin);
    this.addHazard('bolt', { x, tele: t, dur: 12, width: 12, sound: 'lightning_strike' });
    this.addTele('vband', x, 0, x, 270, t, 12, 'O5');
    this.sfx('lightning_warn', x);
  }

  // ---- update: shots ----------------------------------------------------------------------------
  private stepShots(): void {
    const tx = this.terrain;
    for (const s of this.shots.items) {
      if (!s.active) continue;
      s.px = s.x; s.py = s.y;
      s.age++;
      if (s.kind === SHOT_BOMB) {
        s.vy += s.grav;
        s.x += s.vx; s.y += s.vy;
        if (tx.solid(s.x + this.camX, s.y + this.camY)) { this.bombBlast(s); continue; }
        if (s.y < -10 || s.y > 280 || s.x > 490) s.active = false;
        continue;
      }
      if (s.kind === SHOT_SEEKER) {
        if (!s.target || !s.target.active || s.target.dead) s.target = this.nearestEnemy(s.x, s.y);
        if (s.target && s.age > 6) {
          // multi-part targets: home on the nearest part that can take damage, not on the body's centre (which on
          // the stage 2 boss is the refracting chest crystal: seekers kept feeding its counter-laser, v1.2.0)
          let gx = s.target.x, gy = s.target.y;
          if (s.target.parts) {
            let bd = 1e12;
            for (const pt of s.target.parts) {
              if (!pt.alive || pt.armored || !pt.visible || pt.maxHp >= 1e6) continue;
              const d = dist2(s.x, s.y, pt.x, pt.y);
              if (d < bd) { bd = d; gx = pt.x; gy = pt.y; }
            }
          }
          const a = datan2(gy - s.y, gx - s.x);
          let d = a - s.angle; while (d > 180) d -= 360; while (d < -180) d += 360;
          s.angle += clamp(d, -SEEKER.turn, SEEKER.turn);
        }
        s.speed = Math.min(SEEKER.maxSpeed, s.speed + SEEKER.accel);
        s.vx = dcos(s.angle) * s.speed; s.vy = dsin(s.angle) * s.speed;
        s.x += s.vx; s.y += s.vy;
        if (--s.life <= 0 || s.x < -10 || s.x > 490 || s.y < -10 || s.y > 280) { s.active = false; continue; }
        if (tx.solid(s.x + this.camX, s.y + this.camY)) { this.shotHitsTerrain(s); s.active = false; }
        if (s.age % 3 === 0) this.fx.p('smoke', s.x - s.vx, s.y - s.vy, 0, 0, 12, 1.5, PAL.N6, { grow: 0.08 });
        continue;
      }
      if (s.kind === SHOT_FAN && s.scale < 1) s.scale = Math.min(1, s.scale + 0.125);
      s.x += s.vx; s.y += s.vy;
      if (s.kind === SHOT_RAY) {
        this.stepRay(s);
        continue;
      }
      if (s.x > 500 || s.x < -20 || s.y < -20 || s.y > 290) { s.active = false; continue; }
      const m = tx.solid(s.x + this.camX, s.y + this.camY);
      if (m) { this.shotHitsTerrain(s); s.active = false; }
    }
  }

  private stepRay(s: Shot): void {
    // trail: head first; shift points along keeping total length <= len
    const tx = this.terrain;
    s.trail[0] = s.x; s.trail[1] = s.y;
    // clamp trail length
    let total = 0;
    for (let i = 0; i + 1 < s.nt; i++) {
      const ax = s.trail[i * 2]!, ay = s.trail[i * 2 + 1]!, bx = s.trail[i * 2 + 2]!, by = s.trail[i * 2 + 3]!;
      const seg = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
      if (total + seg >= s.len) {
        const k = seg > 0 ? (s.len - total) / seg : 0;
        s.trail[i * 2 + 2] = ax + (bx - ax) * k; s.trail[i * 2 + 3] = ay + (by - ay) * k;
        s.nt = i + 2;
        break;
      }
      total += seg;
    }
    if (total < s.len && s.nt >= 2) {
      // tail still emerging from the muzzle → nothing to do (tail point stays at muzzle)
    }
    const m = tx.solid(s.x + this.camX, s.y + this.camY);
    if (m) {
      if (m === MAT.CRYSTAL && s.refl < 2) {
        const n = { x: 0, y: 0 };
        tx.normal(s.x + this.camX, s.y + this.camY, n);
        const dot = s.vx * n.x + s.vy * n.y;
        s.vx -= 2 * dot * n.x; s.vy -= 2 * dot * n.y;
        s.x = s.px + s.vx * 0.3; s.y = s.py + s.vy * 0.3;
        s.refl++;
        s.len *= 0.9;
        // insert a bend point
        if (s.nt < 8) {
          for (let i = s.nt; i > 0; i--) { s.trail[i * 2] = s.trail[(i - 1) * 2]!; s.trail[i * 2 + 1] = s.trail[(i - 1) * 2 + 1]!; }
          s.nt++;
        }
        s.trail[0] = s.x; s.trail[1] = s.y;
        this.fx.sparks(s.x, s.y, 5, PAL.P4);
        this.sfx('crystal_ping', s.x);
      } else {
        this.shotHitsTerrain(s);
        s.vx = 0; s.vy = 0; s.life = Math.min(s.life, 4);
      }
    }
    if (--s.life <= 0) { s.active = false; return; }
    const tailX = s.trail[(s.nt - 1) * 2]!, tailY = s.trail[(s.nt - 1) * 2 + 1]!;
    if ((s.x > 500 || s.x < -20 || s.y < -30 || s.y > 300) && (tailX > 500 || tailX < -20 || tailY < -30 || tailY > 300)) s.active = false;
  }

  private shotHitsTerrain(s: Shot): void {
    const b = this.terrain.breakableAt(s.x + this.camX, s.y + this.camY);
    if (b) {
      if (this.terrain.damageBreakable(b, s.dmg)) this.breakableDestroyed(b);
      else this.fx.sparks(s.x, s.y, 2, b.style === 'crystal' ? PAL.P4 : PAL.F3);
    } else if (s.kind !== SHOT_BOMB) this.fx.sparks(s.x - s.vx * 0.5, s.y - s.vy * 0.5, 2, PAL.O5, s.angle + 180, 120, 1.6, 6);
  }

  breakableDestroyed(b: { x: number; y: number; w: number; h: number; style: string; hidden?: string }): void {
    const cx = b.x + b.w / 2 - this.camX, cy = b.y + b.h / 2 - this.camY;
    if (b.style === 'crystal') { this.fx.explosion(cx, cy, 'crystal'); this.sfx('crystal_ping', cx); }
    else { this.fx.explosion(cx, cy, 'organic'); this.sfx('organic_pop', cx); }
    this.addScore(50, cx, cy, false);
    if (b.hidden) { this.spawnItem(b.hidden as ItemKind, cx, cy); b.hidden = undefined; }
  }

  private bombBlast(s: Shot): void {
    s.active = false;
    this.fx.explosion(s.x, s.y, 'tiny');
    this.fx.ring(s.x, s.y, BOMB.radius, PAL.O4, 10);
    this.sfx('bomb_explode', s.x);
    const r = BOMB.radius;
    for (const e of this.enemies.items) {
      if (!e.active || e.dead) continue;
      this.damageEnemyArea(e, s.x, s.y, r, s.dmg);
    }
    const b = this.terrain.breakableAt(s.x + this.camX, s.y + this.camY + (s.grav > 0 ? 2 : -2));
    if (b && this.terrain.damageBreakable(b, s.dmg * 2)) this.breakableDestroyed(b);
  }

  nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null, bd = 1e12, bestBack: Enemy | null = null, bdb = 1e12;
    for (const e of this.enemies.items) {
      if (!e.active || e.dead || e.flags & (EF.INVULN | EF.PASS_SHOTS | EF.BACKGROUND)) continue;
      if (e.x < -8 || e.x > 488 || e.y < -8 || e.y > 278) continue;
      if (e.parts && !e.parts.some((p) => p.alive && !p.armored)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (e.x >= x - 8) { if (d < bd) { bd = d; best = e; } } else if (d < bdb) { bdb = d; bestBack = e; }
    }
    return best ?? bestBack;
  }

  // ---- update: enemies ---------------------------------------------------------------------------
  private stepEnemies(): void {
    const c = this.ctx;
    for (const e of this.enemies.items) {
      if (!e.active) continue;
      e.px = e.x; e.py = e.y;
      e.age++;
      if (e.flash > 0) e.flash--;
      if (e.parts) for (const p of e.parts) if (p.flash > 0) p.flash--;
      c.e = e;
      for (let ti = 0; ti < e.threads.length; ti++) {
        const th = e.threads[ti]!;
        if (th.wait > 0) { th.wait--; continue; }
        const r = th.gen.next();
        if (!e.active) break;
        if (r.done) { e.threads.splice(ti, 1); ti--; continue; }
        th.wait = Math.max(0, (r.value ?? 1) - 1);
      }
      if (!e.active) continue;
      e.vx += e.ax; e.vy += e.ay;
      if (e.anchored) {
        e.wx += e.vx; e.wy += e.vy;
        e.x = e.wx - this.camX; e.y = e.wy - this.camY;
      } else { e.x += e.vx; e.y += e.vy; }
      if (e.parent && e.flags & EF.AIR_ANCHOR) { /* positioned by parent */ }
      // on-screen tracking
      const on = e.x > -4 && e.x < 484 && e.y > -4 && e.y < 274;
      if (on && e.onScreenAt < 0) { e.onScreenAt = this.frame; e.entered = true; }
      if (e.parts) for (const p of e.parts) { p.x = e.x + p.ox; p.y = e.y + p.oy; }
      if (!(e.flags & EF.PERSISTENT) && !e.noOffscreenKill) {
        const off = e.x < -72 || e.x > 560 || e.y < -80 || e.y > 350;
        if ((e.entered && off) || (!e.entered && e.age > 900)) this.removeEnemy(e, false);
      }
    }
  }

  removeEnemy(e: Enemy, killed: boolean): void {
    if (!e.active) return;
    e.active = false;
    e.dead = true;
    if (e.formation >= 0) {
      const f = this.formations.get(e.formation);
      if (f) {
        if (killed) { f.killed++; f.x = e.x; f.y = e.y; } else f.lost++;
        if (f.killed + f.lost >= f.n) {
          if (f.lost === 0) {
            const bonus = SCORE.formationPer * f.n;
            this.addScore(bonus, f.x, f.y - 10, true);
            if (f.bonus) this.spawnItem(f.bonus, f.x, f.y);
            if (f.group) this.stats.groupKills.set(f.group, (this.stats.groupKills.get(f.group) ?? 0) + 1);
          }
          this.formations.delete(e.formation);
        }
      }
    }
    // children follow parent
    for (const o of this.enemies.items) if (o.active && o.parent === e && !(o.flags & EF.PERSISTENT)) this.removeEnemy(o, false);
    for (const h of this.hazards.items) if (h.active && h.ownerUid === e.uid) { if (h.loopKey) this.sfx('__loopstop:' + h.loopKey); h.active = false; }
  }

  /** Apply damage to an enemy (part-aware). Returns 'hit' | 'armor' | 'none'. */
  /** weapon behind the current damageEnemy call (set by the shot code), for the boss damage multiplier */
  dmgSrc: 'pulse' | 'fan' | 'ray' | 'seeker' | 'other' = 'other';

  damageEnemy(e: Enemy, part: Part | null, dmg: number, fromX: number): 'hit' | 'armor' | 'none' {
    if (e.dead || !e.active) return 'none';
    if (e === this.boss || e === this.midboss) dmg *= BOSS_DMG.base * ((e === this.boss ? BOSS_DMG.boss : BOSS_DMG.midboss)[this.stage.id] ?? 1) * BOSS_DMG[this.dmgSrc];
    if (e.flags & EF.INVULN || this.frame < e.invulnUntil) return 'armor';
    if (part) {
      if (!part.alive) return 'none';
      if (part.armored) { part.flash = 2; return 'armor'; }
      part.hp -= dmg * part.dmgMul;
      part.flash = 2;
      e.flash = Math.max(e.flash, 1);
      e.def.onHit?.(e, part, dmg, this.ctx);
      if (part.hp <= 0) {
        part.alive = false;
        part.hp = 0;
        this.hitstop = Math.max(this.hitstop, this.stage.beatBpm ? 0 : 4);
        this.fx.explosion(part.x, part.y, 'medium');
        if (!this.stage.beatBpm) this.fx.explosion(part.x + 8, part.y - 6, 'small');
        this.shake(0.35);
        this.sfx('explode_m', part.x);
        if (part.score) this.addScore(part.score, part.x, part.y, false, true);
        addDrive(this, DRIVE.gain.part);
        this.ctx.e = e;
        part.onDestroy?.();
      }
      return 'hit';
    }
    if (e.flags & EF.ARMORED) return 'armor';
    if (e.armorFront && Math.sign(fromX - e.x) === e.armorFront) return 'armor';
    e.hp -= dmg * e.dmgMul;
    if (e.flash <= 0) e.flash = 2;
    e.def.onHit?.(e, null, dmg, this.ctx);
    if (e.hp <= 0) this.killEnemy(e);
    return 'hit';
  }

  private damageEnemyArea(e: Enemy, x: number, y: number, r: number, dmg: number): void {
    if (e.flags & (EF.PASS_SHOTS | EF.BACKGROUND)) return;
    if (e.parts) {
      for (const p of e.parts) if (p.alive && circleVsShape(x, y, r, p.x, p.y, p.shape)) { this.damageEnemy(e, p, dmg, x); return; }
      return;
    }
    if (circleVsShape(x, y, r, e.x, e.y, e.shape)) this.damageEnemy(e, null, dmg, x);
  }

  killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    e.killedByPlayer = true;
    const def = e.def;
    this.stats.kills++;
    const p = this.player;
    const pb = p.alive && dist2(e.x, e.y, p.x, p.y) < SCORE.pointBlankR * SCORE.pointBlankR;
    if (!(e.flags & EF.NO_SCORE) && e.size !== 'B') {
      this.addScore(e.score * (pb ? 2 : 1), e.x, e.y, e.size !== 'S' || pb);
      if (pb) this.popup('×2', e.x + 10, e.y - 8, 'Y4');
    }
    addDrive(this, def.drive ?? (e.size === 'S' ? DRIVE.gain.killS : e.size === 'M' ? DRIVE.gain.killM : DRIVE.gain.part));
    const ex = def.explosion ?? (e.size === 'S' ? 'small' : e.size === 'M' ? 'medium' : 'large');
    if (ex !== 'none') this.fx.explosion(e.x, e.y, ex === 'small' && e.size === 'S' && (e.shape.kind === 'circle' ? e.shape.r < 5 : e.shape.w < 10) ? 'tiny' : ex);
    if (e.size === 'M') this.shake(0.15);
    else if (e.size === 'L') { this.shake(0.35); this.flash(0.15); }
    this.sfx(def.deathSound ?? (ex === 'organic' ? 'organic_pop' : ex === 'crystal' ? 'crystal_ping' : e.size === 'S' ? 'explode_s' : e.size === 'M' ? 'explode_m' : 'explode_l'), e.x);
    if (e.carrier) this.spawnItem(e.carrier, e.x, e.y);
    if (e.o.drop) this.spawnItem(e.o.drop as ItemKind, e.x, e.y);
    // revenge bullets
    if (this.revengeOn() && !(e.flags & EF.NO_REVENGE) && (e.size === 'S' || e.size === 'M') && p.alive) {
      const d2 = dist2(e.x, e.y, p.hitX, p.hitY);
      if (d2 > 64 * 64 && e.x > p.x + 8 && e.x < 464 && e.x > 0 && e.y > 0 && e.y < 270) {
        this.spawnBullet(e.x, e.y, datan2(p.hitY - e.y, p.hitX - e.x), 1.6, 'pellet');
        this.fx.glow(e.x, e.y, 6, PAL.R3, 8);
      }
    }
    this.ctx.e = e;
    def.onDeath?.(e, this.ctx);
    if (e === this.midboss) this.waiting = null;
    this.removeEnemy(e, true);
  }

  // ---- update: bullets ---------------------------------------------------------------------------
  private stepBullets(): void {
    const tx = this.terrain;
    const p = this.player;
    for (const b of this.bullets.items) {
      if (!b.active) continue;
      b.px = b.x; b.py = b.y;
      b.age++;
      if (b.fade > 0) { if (--b.fade <= 0) b.active = false; continue; }
      if (b.delay > 0) { b.delay--; continue; }
      if (b.kind === 'waveArc') {
        b.arcR += b.arcGrow;
        if (b.arcR > b.arcMax) b.active = false;
        continue;
      }
      if (b.accel !== 0) {
        b.speed = clamp(b.speed + b.accel, b.minSpeed, b.maxSpeed);
      }
      if (b.turn !== 0 && (b.turnFrames === 0 || b.age <= b.turnFrames)) b.angle += b.turn;
      if (b.homing > 0 && p.alive) {
        b.homing--;
        const a = datan2(p.hitY - b.y, p.hitX - b.x);
        let d = a - b.angle; while (d > 180) d -= 360; while (d < -180) d += 360;
        b.angle += clamp(d, -1.5, 1.5);
      }
      if (b.accel !== 0 || b.turn !== 0 || b.homing > 0) { b.vx = dcos(b.angle) * b.speed; b.vy = dsin(b.angle) * b.speed; }
      b.x += b.vx; b.y += b.vy;
      if (b.split > 0 && --b.split === 0) {
        b.active = false;
        for (let k = 0; k < 6; k++) this.spawnBullet(b.x, b.y, b.angle + k * 60 + 30, 1.4, 'pellet', { force: true });
        this.fx.glow(b.x, b.y, 8, PAL.R3, 8);
        continue;
      }
      if (b.kind === 'missile' && b.age % 3 === 0) this.fx.p('smoke', b.x - b.vx * 2, b.y - b.vy * 2, 0, 0, 14, 1.5, PAL.N5, { grow: 0.1 });
      if (--b.life <= 0 || b.x < -24 || b.x > 504 || b.y < -24 || b.y > 294) { b.active = false; continue; }
      if (b.age % 2 === 0 || b.kind === 'shard') {
        const m = tx.solid(b.x + this.camX, b.y + this.camY);
        if (m) {
          if (b.bounce > 0) {
            const n = { x: 0, y: 0 };
            tx.normal(b.x + this.camX, b.y + this.camY, n);
            const dot = b.vx * n.x + b.vy * n.y;
            b.vx -= 2 * dot * n.x; b.vy -= 2 * dot * n.y;
            b.angle = datan2(b.vy, b.vx);
            b.x = b.px; b.y = b.py;
            b.bounce--;
          } else if (b.age > 4) { b.active = false; this.fx.sparks(b.x, b.y, 2, PAL.R3, 0, 360, 1, 6); }
        }
      }
    }
  }

  cancelBullets(toStars: boolean): void {
    for (const b of this.bullets.items) {
      if (!b.active || b.fade > 0) continue;
      if (toStars && b.x > 0 && b.x < 480 && b.y > 0 && b.y < 270) this.spawnItem('star', b.x, b.y);
      b.fade = 12;
    }
    for (const h of this.hazards.items) if (h.active && (h.kind === 'laser' || h.kind === 'arc')) { h.tele = 0; h.dur = Math.min(h.dur, 6); }
  }

  driveRingStep(cx: number, cy: number, r: number): void {
    const r2 = r * r;
    for (const b of this.bullets.items) {
      if (!b.active || b.fade > 0) continue;
      if (dist2(cx, cy, b.x, b.y) <= r2) {
        if (b.x > 0 && b.x < 480 && b.y > 0 && b.y < 270) this.spawnItem('star', b.x, b.y);
        b.fade = 8;
      }
    }
    for (const e of this.enemies.items) {
      if (!e.active || e.dead || e.o.ringHit) continue;
      if (dist2(cx, cy, e.x, e.y) <= r2) {
        e.o.ringHit = true;
        if (e.parts) { for (const pt of e.parts) if (pt.alive && !pt.armored) { this.damageEnemy(e, pt, DRIVE.ringDamage, cx); break; } }
        else this.damageEnemy(e, null, DRIVE.ringDamage, cx);
      }
    }
  }

  onDriveStart(): void {
    const p = this.player;
    this.sfx('drive_start', p.x);
    this.flash(0.4, '#fff8d0');
    this.renderHooks.wave?.(p.x, p.y, 320, 30, 1.2);
    this.music({ cmd: 'drive', on: true });
    this.fx.ring(p.x, p.y, 120, PAL.Y3, 24, 3);
    this.fx.embers(p.x, p.y, 30, 3, PAL.Y3);
    for (const e of this.enemies.items) if (e.active) e.o.ringHit = false;
    this.events.push({ type: 'vibrate', ms: 50 });
  }

  /** Hooks into the renderer (shockwave distortion) — set by the Game scene. */
  renderHooks: { wave?: (x: number, y: number, r: number, life: number, strength: number) => void; chroma?: (v: number) => void } = {};

  // ---- update: hazards ------------------------------------------------------------------------------
  private stepHazards(): void {
    for (const h of this.hazards.items) {
      if (!h.active) continue;
      h.age++;
      if (h.owner && (!h.owner.active || h.owner.uid !== h.ownerUid)) { h.active = false; if (h.loopKey) this.sfx('__loopstop:' + h.loopKey); continue; }
      if (h.tele > 0) {
        h.tele--;
        if (h.tele === 0) {
          if (h.sound) this.sfx(h.sound, h.x || 240);
          if (h.kind === 'bolt') { this.shake(0.15); this.flash(0.12, '#fffbe0'); }
        }
        continue;
      }
      if (h.dur > 0) h.dur--;
      if (h.dur <= 0) { h.active = false; if (h.loopKey) this.sfx('__loopstop:' + h.loopKey); }
    }
    for (const t of this.teles.items) if (t.active && --t.life <= 0) t.active = false;
  }

  // ---- update: items ----------------------------------------------------------------------------------
  private stepItems(): void {
    const p = this.player;
    for (const it of this.items.items) {
      if (!it.active) continue;
      it.px = it.x; it.py = it.y;
      it.age++;
      if (it.kind === 'armsChip' && it.age % 90 === 0) { it.phase++; this.sfx('chip_tick', it.x); }
      if (it.kind === 'subChip' && it.age % 120 === 0) { it.phase++; this.sfx('chip_tick', it.x); }
      if (it.autoMagnet > 0 && --it.autoMagnet === 0) it.magnet = true;
      const near = p.alive && dist2(it.x, it.y, p.x, p.y) < PLAYER.magnetR * PLAYER.magnetR;
      if ((near || it.magnet) && p.state === 'play') {
        const dx = p.x - it.x, dy = p.y - it.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const sp = it.magnet ? 7 : clamp(6 - d / 10, 2, 6);
        it.x += (dx / d) * Math.min(sp, d); it.y += (dy / d) * Math.min(sp, d);
        it.baseY = it.y;
      } else if (it.kind === 'star') {
        it.x -= 0.5; it.y += 0.2;
      } else if (it.kind === 'lostWisp') {
        it.x += it.vx; it.y += it.vy;
        it.vx = it.vx * 0.93 + -0.4 * 0.07; it.vy *= 0.93;
        if (it.x < 240 && it.age > 30 && this.player.state !== 'play') it.x += (240 - it.x) * 0.05;
        it.y = clamp(it.y, 20, 250);
        if (--it.life <= 0) it.active = false;
      } else {
        const vert = !this.waiting && Math.abs(this.scrollVY) > 0.1 && Math.abs(this.scrollVX) < 0.2;
        const drift = vert ? 0 : -Math.max(0.35, Math.min(1.2, this.waiting ? 0.4 : Math.abs(this.scrollVX)));
        it.vx += (drift - it.vx) * 0.05;
        it.x += it.vx;
        if (!this.waiting) it.baseY -= this.scrollVY;
        it.y = clamp(it.baseY + dsin(it.age * 6) * 3, 20, 250);
      }
      if (it.x < -16) it.active = false;
    }
  }

  // ---- collisions ------------------------------------------------------------------------------------
  private collide(): void {
    const p = this.player;
    // shots vs enemies
    for (const s of this.shots.items) {
      if (!s.active || s.kind === SHOT_BOMB) continue;
      for (const e of this.enemies.items) {
        if (!e.active || e.dead || e.flags & (EF.PASS_SHOTS | EF.BACKGROUND)) continue;
        if (s.kind === SHOT_RAY) {
          if (this.rayHitEnemy(s, e)) break;
          continue;
        }
        const target = this.shotTarget(s, e);
        if (!target) continue;
        this.dmgSrc = s.kind === SHOT_PULSE ? 'pulse' : s.kind === SHOT_FAN ? 'fan' : s.kind === SHOT_SEEKER ? 'seeker' : 'other';
        const res = this.damageEnemy(e, target === true ? null : target, s.dmg, s.x - s.vx * 3);
        this.dmgSrc = 'other';
        s.active = false;
        if (res === 'hit') { this.sfx(e.def.hitSound ?? 'hit_enemy', s.x); this.fx.sparks(s.x, s.y, 2, s.gold ? PAL.Y4 : PAL.C4, s.angle + 180, 100, 1.5, 6); }
        else if (res === 'armor') { this.sfx('hit_armor', s.x); this.fx.sparks(s.x, s.y, 3, PAL.Y3, s.angle + 180, 90, 2, 6); }
        break;
      }
    }
    // bomb direct hits
    for (const s of this.shots.items) {
      if (!s.active || s.kind !== SHOT_BOMB) continue;
      for (const e of this.enemies.items) {
        if (!e.active || e.dead || e.flags & (EF.PASS_SHOTS | EF.BACKGROUND)) continue;
        if (this.shotTarget(s, e)) { this.bombBlast(s); break; }
      }
    }
    if (p.state !== 'play') return;
    const hx = p.hitX, hy = p.hitY, hr = PLAYER.hitR;
    const vul = p.vulnerable;
    // orbit drones absorb small bullets
    const orbit = p.formation === 'orbit' && p.drones > 0;
    const gr2 = PLAYER.grazeR;
    for (const b of this.bullets.items) {
      if (!b.active || b.fade > 0 || b.delay > 0) continue;
      if (b.kind === 'waveArc') { if (this.arcHits(b, hx, hy, hr)) { this.hitSrc = 'bullet:waveArc'; this.playerHit(); if (p.state !== 'play') return; } continue; }
      if (orbit && (b.kind === 'pellet' || b.kind === 'needle' || b.kind === 'chip')) {
        let ab = false;
        for (let i = 0; i < p.drones; i++) if (dist2(b.x, b.y, p.dx[i]!, p.dy[i]!) < 49) { ab = true; break; }
        if (ab) { b.active = false; this.fx.sparks(b.x, b.y, 3, PAL.C4, 0, 360, 1.2, 6); continue; }
      }
      const d2 = dist2(b.x, b.y, hx, hy);
      const rr = b.r + hr;
      if (d2 <= rr * rr) {
        if (vul || p.barrier > 0) { if (b.kind !== 'globe') b.active = false; this.hitSrc = 'bullet:' + b.kind; this.playerHit(); if (p.state !== 'play') return; }
        continue;
      }
      if (!b.grazed && d2 <= (gr2 + b.r) * (gr2 + b.r)) {
        b.grazed = true;
        this.stats.grazes++;
        this.addScore(SCORE.graze, 0, 0, false);
        addDrive(this, DRIVE.gain.graze);
        this.fx.sparks((b.x + hx) / 2, (b.y + hy) / 2, 1, PAL.N8, 0, 360, 1, 5);
        this.sfx('graze', hx);
      }
    }
    // missiles can be shot
    for (const s of this.shots.items) {
      if (!s.active || s.kind === SHOT_RAY || s.kind === SHOT_BOMB) continue;
      for (const b of this.bullets.items) {
        if (!b.active || b.kind !== 'missile' || b.fade > 0) continue;
        if (Math.abs(b.x - s.x) < 7 && Math.abs(b.y - s.y) < 6) {
          b.active = false; s.active = false;
          this.fx.explosion(b.x, b.y, 'tiny');
          this.addScore(100, b.x, b.y, false);
          this.sfx('explode_s', b.x);
          break;
        }
      }
    }
    // hazards
    for (const h of this.hazards.items) {
      if (!h.active || h.tele > 0 || !h.lethal) continue;
      if (this.hazardHits(h, hx, hy, hr)) { this.hitSrc = 'hazard:' + h.kind; this.playerHit(); if (p.state !== 'play') return; }
    }
    // enemy bodies
    for (const e of this.enemies.items) {
      if (!e.active || e.dead || e.flags & (EF.NO_CONTACT | EF.BACKGROUND)) continue;
      let hit = false;
      if (e.parts) {
        for (const pt of e.parts) if (pt.contact && (pt.alive || pt.data?.solidDead) && circleVsShape(hx, hy, hr, pt.x, pt.y, pt.shape)) { hit = true; break; }
        const extra = e.o.contact as Shape[] | undefined;
        if (!hit && extra) for (const sh of extra) if (circleVsShape(hx, hy, hr, e.x, e.y, sh)) { hit = true; break; }
      } else hit = circleVsShape(hx, hy, hr, e.x, e.y, e.shape);
      if (hit) {
        this.hitSrc = 'contact:' + e.def.id;
        this.playerHit();
        if (p.state !== 'play') return;
        if (!e.parts && !(e.flags & (EF.INVULN | EF.ARMORED)) && e.size === 'S' && p.barrier >= 0) {
          // body-hitting a small enemy with barrier/invuln destroys it
          if (p.invuln > 0 || p.driving) this.damageEnemy(e, null, 999, p.x);
        }
      }
    }
    // items
    for (const it of this.items.items) {
      if (!it.active) continue;
      if (dist2(it.x, it.y, p.x, p.y) <= PLAYER.pickupR * PLAYER.pickupR) { it.active = false; collectItem(this, it); }
    }
  }

  private shotTarget(s: Shot, e: Enemy): Part | true | null {
    const bw = s.kind === SHOT_PULSE ? s.w : s.kind === SHOT_FAN ? 8 * s.scale : s.w;
    const bh = s.kind === SHOT_PULSE ? s.h + 1 : s.kind === SHOT_FAN ? 4 * s.scale : s.h;
    if (e.parts) {
      let armorHit: Part | null = null;
      for (const pt of e.parts) {
        if (!pt.alive || !pt.visible) continue;
        if (boxVsShape(s.x, s.y, bw, bh, pt.x, pt.y, pt.shape)) { if (!pt.armored) return pt; armorHit ??= pt; }
      }
      if (armorHit) return armorHit;
      const extra = e.o.armorShapes as Shape[] | undefined;
      if (extra) for (const sh of extra) if (boxVsShape(s.x, s.y, bw, bh, e.x, e.y, sh)) return { armored: true, alive: true } as Part;
      return null;
    }
    return boxVsShape(s.x, s.y, bw, bh, e.x, e.y, e.shape) ? true : null;
  }

  private rayHitEnemy(s: Shot, e: Enemy): boolean {
    for (let k = 0; k < s.nh; k++) if (s.hits[k] === e.uid) return false;
    const r = s.h / 2 + 1;
    let hitPart: Part | null = null, hit = false, armor = false;
    for (let i = 0; i + 1 < s.nt && !hit; i++) {
      const x1 = s.trail[i * 2]!, y1 = s.trail[i * 2 + 1]!, x2 = s.trail[i * 2 + 2]!, y2 = s.trail[i * 2 + 3]!;
      if (e.parts) {
        for (const pt of e.parts) {
          if (!pt.alive || !pt.visible) continue;
          if (segVsShape(x1, y1, x2, y2, r, pt.x, pt.y, pt.shape)) {
            if (pt.armored) { armor = true; continue; }
            hitPart = pt; hit = true; break;
          }
        }
        if (!hit && !armor) {
          const extra = e.o.armorShapes as Shape[] | undefined;
          if (extra) for (const sh of extra) if (segVsShape(x1, y1, x2, y2, r, e.x, e.y, sh)) { armor = true; break; }
        }
      } else if (segVsShape(x1, y1, x2, y2, r, e.x, e.y, e.shape)) hit = true;
    }
    if (!hit && !armor) return false;
    if (s.nh < s.hits.length) s.hits[s.nh++] = e.uid;
    if (armor && !hit) {
      this.sfx('hit_armor', s.x);
      this.fx.sparks(s.x, s.y, 4, PAL.Y3);
      s.vx = 0; s.vy = 0; s.life = Math.min(s.life, 3);
      return true;
    }
    this.dmgSrc = 'ray';
    const res = this.damageEnemy(e, hitPart, s.dmg, s.x - 20);
    this.dmgSrc = 'other';
    if (res === 'armor' && (e.flags & EF.ARMORED || e.armorFront)) {
      this.sfx('hit_armor', s.x); this.fx.sparks(s.x, s.y, 4, PAL.Y3);
      s.vx = 0; s.vy = 0; s.life = Math.min(s.life, 3);
      return true;
    }
    if (res === 'hit') { this.sfx(e.def.hitSound ?? 'hit_enemy', s.x); this.fx.sparks(e.x, e.y, 3, PAL.P4, 180, 120, 1.5, 6); }
    return false;
  }

  private arcHits(b: Bullet, hx: number, hy: number, hr: number): boolean {
    const d = Math.sqrt(dist2(b.x, b.y, hx, hy));
    if (Math.abs(d - b.arcR) > 1.5 + hr) return false;
    const a = datan2(hy - b.y, hx - b.x);
    let da = a - b.angle; while (da > 180) da -= 360; while (da < -180) da += 360;
    if (Math.abs(da) > b.arcHalf) return false;
    for (const g of [b.gapA, b.gapA2]) {
      if (g >= 999) continue;
      let dg = a - g; while (dg > 180) dg -= 360; while (dg < -180) dg += 360;
      if (Math.abs(dg) < b.gapHalf) return false;
    }
    return true;
  }

  hazardHits(h: Hazard, hx: number, hy: number, hr: number): boolean {
    switch (h.kind) {
      case 'laser': case 'arc': case 'tendril': {
        const r = h.width / 2 - 1 + hr;
        for (let i = 0; i + 1 < h.np; i++) {
          if (segDist2(hx, hy, h.pts[i * 2]!, h.pts[i * 2 + 1]!, h.pts[i * 2 + 2]!, h.pts[i * 2 + 3]!) <= r * r) return true;
        }
        return false;
      }
      case 'bolt': return h.dur > 0 && Math.abs(hx - h.x) <= h.width / 2 + hr;
      case 'column': case 'band': case 'molten': case 'press': case 'wall':
        return hx >= h.x - hr && hx <= h.x + h.w + hr && hy >= h.y - hr && hy <= h.y + h.h + hr;
      case 'flame': {
        const dx = hx - h.x, dy = hy - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > h.h || d < 2) return false;
        let da = datan2(dy, dx) - h.angle; while (da > 180) da -= 360; while (da < -180) da += 360;
        return Math.abs(da) <= h.w / 2;
      }
    }
    return false;
  }

  /** what the last playerHit() came from (telemetry only) */
  hitSrc = 'hit';

  /** Player hit by something lethal. */
  playerHit(): void {
    const p = this.player;
    if (p.state !== 'play' || p.godMode) return;
    if (p.invuln > 0 || p.driving && p.invuln > 0) return;
    if (p.barrier > 0) { this.barrierHit(); return; }
    this.killPlayer(this.hitSrc);
    this.hitSrc = 'hit';
  }

  barrierHit(): void {
    const p = this.player;
    p.barrier--;
    p.invuln = Math.max(p.invuln, 30);
    this.flash(0.12, '#c8ffd8');
    if (p.barrier <= 0) {
      this.sfx('barrier_break', p.x);
      this.fx.shards(p.x, p.y, 14, [PAL.G3, PAL.G4, PAL.N8]);
    } else {
      this.sfx('barrier_hit', p.x);
      this.fx.ring(p.x, p.y, 18, PAL.G4, 10);
    }
  }

  killPlayer(cause: string): void {
    const p = this.player;
    if (p.state !== 'play' || p.godMode) return;
    if (this.phase === 'bossDying' || this.phase === 'clear') return;
    p.state = 'dead';
    p.timer = 0;
    p.deathX = p.x; p.deathY = p.y;
    this.hitstop = this.stage.beatBpm ? 0 : 6;
    this.shake(0.5);
    this.flash(0.35, '#d4f7ff');
    this.sfx('player_die', p.x);
    this.music({ cmd: 'duck', db: -6, sec: 1 });
    this.events.push({ type: 'death', cause }, { type: 'vibrate', ms: 60 });
    this.fx.explosion(p.x, p.y, 'large');
    this.fx.shards(p.x, p.y, 20, [PAL.C4, PAL.N8, PAL.N6, PAL.C3], 3);
    this.fx.ring(p.x, p.y, 50, PAL.C4, 18, 3);
    this.cancelBullets(false);
    for (const h of this.hazards.items) if (h.active && h.kind === 'laser') { h.dur = Math.min(h.dur, 4); }
    this.suppressFire = PLAYER.respawnWait + PLAYER.respawnEnter + 30;
    this.stats.deaths++;
    this.rankTime = Math.max(0, this.rankTime - 15);
    // penalties
    const loss = this.respawnMode === 'checkpoint' ? 99 : this.cfg.lvLoss;
    if (loss >= 99) { p.lv = 1; p.sub = null; p.subLv = 0; }
    else { p.lv = Math.max(1, p.lv - loss); if (p.subLv > 1) p.subLv = 1; }
    if (this.respawnMode !== 'checkpoint') {
      for (let i = 0; i < p.drones; i++) {
        const it = this.spawnItem('lostWisp', p.dx[i]!, p.dy[i]!);
        if (it) { const a = (i / Math.max(1, p.drones)) * 360 + 45; it.vx = dcos(a) * 1.5; it.vy = dsin(a) * 1.5; }
      }
    }
    p.drones = 0;
    p.barrier = 0;
    p.speedLv = PLAYER.defaultSpeedLv;
    if (p.driveT > 0) { p.driveT = 0; this.music({ cmd: 'drive', on: false }); }
    p.drive = this.respawnMode === 'checkpoint' ? 0 : p.drive * 0.5;
    p.driveRingR = -1;
  }

  onPlayerRespawnReady(): void {
    const p = this.player;
    if (this.mode === 'practice' && this.lives <= 0) this.lives = 1;
    if (this.lives <= 0) {
      p.state = 'gone';
      this.phase = this.phase === 'boss' || this.phase === 'warning' ? this.phase : this.phase;
      this.events.push({ type: 'gameOver' });
      return;
    }
    this.lives--;
    this.respawned = true;
    if (this.respawnMode === 'checkpoint' && !this.boss && this.phase === 'play') {
      this.restartAtCheckpoint();
    }
    const at = this.entrySpot();
    p.startEnter(-20, at.x, PLAYER.respawnEnter, at.y);
    p.invuln = 0;
  }

  /**
   * Where a respawning ship flies in to: the usual (60, 135) unless terrain is there or will scroll into it during
   * the entry and the invulnerability after it (stage 5's vertical shaft has its wall at x = 60, which used to kill
   * the ship again the moment its invulnerability ran out, over and over). Picks the nearest spot that stays clear.
   */
  entrySpot(): { x: number; y: number } {
    const horizon = PLAYER.respawnEnter + PLAYER.respawnInvuln + 60;
    let best = ENTRY_SPOTS[0]!, bestT = -1;
    for (const c of ENTRY_SPOTS) {
      let t = 0;
      for (; t <= horizon; t += 6) {
        const cx = this.waiting ? this.camX : this.profile.X(this.t + t), cy = this.waiting ? this.camY : this.profile.Y(this.t + t);
        let hit = false;
        for (const [dx, dy] of ENTRY_BOX) if (this.terrain.solid(c.x + dx + cx, c.y + dy + cy)) { hit = true; break; }
        if (hit) break;
      }
      if (t > horizon) return c;
      if (t > bestT) { bestT = t; best = c; }
    }
    return best;
  }

  /** Continue after game over (arcade): full lives, score reset with credit digit. */
  continueGame(): void {
    this.continues++;
    this.lives = this.cfg.lives - 1;
    this.score = this.continues % 10;
    this.displayScore = this.score;
    this.extIdx = 0;
    this.respawned = true;
    const at = this.entrySpot();
    this.player.startEnter(-20, at.x, PLAYER.respawnEnter, at.y);
    this.suppressFire = PLAYER.respawnEnter + 30;
  }

  restartAtCheckpoint(): void {
    const cp = this.stage.checkpoints.find((c) => c.id === this.checkpoint) ?? this.stage.checkpoints[0]!;
    for (const e of this.enemies.items) e.active = false;
    this.bullets.clear(); this.items.clear(); this.hazards.clear(); this.teles.clear(); this.shots.clear();
    this.pending.length = 0;
    this.formations.clear();
    this.midboss = null; this.waiting = null;
    this.terrain.reset();
    this.fastForward(cp.at);
  }

  // ---- terrain / score ------------------------------------------------------------------------------------
  private stepTerrain(): void {
    const p = this.player;
    const regrown = this.terrain.update(this.frame, (b) => {
      const sx = b.x - this.camX, sy = b.y - this.camY;
      return p.alive && p.x + 10 > sx && p.x - 10 < sx + b.w && p.y + 5 > sy && p.y - 5 < sy + b.h;
    });
    for (const b of regrown) if (b.x - this.camX < 500 && b.x - this.camX > -20) this.sfx('wall_regen', b.x - this.camX);
  }

  private stepPopups(): void {
    for (const pp of this.popups.items) if (pp.active) { pp.y -= 0.3; if (--pp.life <= 0) pp.active = false; }
  }

  addScore(n: number, x: number, y: number, show = true, big = false): void {
    const mul = this.player.driving ? DRIVE.scoreMul : 1;
    const v = Math.round(n * mul);
    this.score += v;
    if (show && v >= 100) this.popup(String(v), x, y, mul > 1 ? 'Y4' : big ? 'O6' : 'N8', !big);
    this.checkExtend();
  }

  nextExtendAt(): number {
    const ext = this.cfg.extend;
    if (this.extIdx < ext.length) return ext[this.extIdx]!;
    if (!this.cfg.extendEvery) return Infinity;
    return ext[ext.length - 1]! + (this.extIdx - ext.length + 1) * this.cfg.extendEvery;
  }

  private checkExtend(): void {
    while (this.score >= this.nextExtendAt()) { this.extIdx++; this.extend(); }
  }

  extend(): void {
    if (this.lives < 8) this.lives++;
    this.sfx('extend');
    this.popup('1UP', this.player.x, this.player.y - 24, 'Y4', false);
    this.events.push({ type: 'extend' });
  }

  private stepScore(): void {
    const d = this.score - this.displayScore;
    this.displayScore += d > 0 ? Math.max(1, Math.ceil(d / 8)) : d;
    const p = this.player;
    if (p.state === 'play' && this.frame % 600 === 0) this.rankTime = Math.min(30, this.rankTime + 0.5);
    const power = (p.lv - 1) * 4 + p.drones * 3 + (p.sub ? 3 : 0) + (p.barrier > 0 ? 2 : 0);
    const [r0, rmax] = this.cfg.rank;
    this.rank = clamp(r0 + this.rankTime + power, 0, rmax);
  }

  /** Can this enemy fire right now? (fairness rules, docs/03 §11) */
  canFire(e: Enemy, aimed = false): boolean {
    if (this.suppressFire > 0 || e.flags & EF.NO_FIRE || e.dead) return false;
    if (this.phase === 'bossDying' || this.phase === 'clear') return false;
    if (e.onScreenAt < 0 || this.frame - e.onScreenAt < FAIRNESS.noFireAfterEnter) return false;
    if (e.x < -8 || e.x > 488 || e.y < -8 || e.y > 278) return false;
    if (aimed && e.flags & EF.FRONT_ONLY && e.x < this.player.x + 8) return false;
    return this.player.state !== 'dead' && this.player.state !== 'gone';
  }
}

function resetEnemy(e: Enemy): void {
  e.vx = e.vy = e.ax = e.ay = 0;
  e.flash = 0; e.age = 0; e.carrier = null; e.formation = -1; e.fIndex = 0; e.fireMask = 0;
  e.threads = []; e.parts = null; e.anchored = false; e.angle = 180; e.frame = 0; e.onScreenAt = -1;
  e.dmgMul = 1; e.dead = false; e.parent = null; e.v = {}; e.o = {}; e.flipY = false; e.revenge = false;
  e.invulnUntil = 0; e.entered = false; e.noOffscreenKill = false; e.armorFront = 0; e.killedByPlayer = false;
}

export { emptyInput };
void fxRng; void SHOT_FAN; void SHOT_SEEKER;

// Player ship KESTREL: movement, weapons, drones, barrier, Lance Drive, death/respawn (docs/03_gameplay.md §3–7).
import { PLAYER, PULSE, FAN, RAY, BOMB, SEEKER, DRONE, DRIVE, SCORE } from '../data/balance';
import { dcos, dsin, clamp, ease } from '../core/dmath';
import type { WeaponType } from '../core/save';
import { SHOT_PULSE, SHOT_FAN, SHOT_RAY, SHOT_BOMB, SHOT_SEEKER, type Formation, type SubType, type Item, type PlayerLoadout } from './entities';
import type { World } from './world';

export const IB = {
  UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, SHOT: 16, DRIVE: 32, SPD_UP: 64, SPD_DN: 128, FORM: 256, TOUCH: 512, ANALOG: 1024,
  SPD_SHIFT: 11, // 3 bits: direct speed 1..4
  SHOT_PRESS: 16384,
} as const;

export interface InputFrame { bits: number; tdx: number; tdy: number; ax: number; ay: number }
export const emptyInput = (): InputFrame => ({ bits: 0, tdx: 0, tdy: 0, ax: 0, ay: 0 });

export const FORMATIONS: Formation[] = ['wing', 'trail', 'orbit'];

export class Player {
  x = -20; y = 135; px = -20; py = 135;
  state: 'enter' | 'play' | 'dead' | 'gone' = 'enter';
  timer = 0;
  enterFrom = -20;
  enterTo = 80;
  enterLen = PLAYER.enterFrames;
  invuln = 0;
  speedLv = PLAYER.defaultSpeedLv;
  bank = 0;
  bankHold = 0;
  weapon: WeaponType = 'pulse';
  lv = 1;
  sub: SubType | null = null;
  subLv = 0;
  drones = 0;
  formation: Formation = 'wing';
  barrier = 0;
  drive = 0;
  driveT = 0;
  fireCd = 0;
  subCd = 0;
  toggleOn = false;
  firing = false;
  muzzle = 0;
  trail = new Float32Array(2 * 80);
  trailHead = 0;
  trailCount = 0;
  dx = new Float32Array(4);
  dy = new Float32Array(4);
  dpx = new Float32Array(4);
  dpy = new Float32Array(4);
  orbitA = 0;
  formSwitch = 0;
  formLabel = 0;
  speedFx = 0;
  moveX = 0;
  moveY = 0;
  touch = false;
  deathX = 0;
  deathY = 0;
  shotMode: 'hold' | 'toggle' = 'hold';
  godMode = false;
  autoDrive = false;   // final boss form 3
  driveRingR = -1;
  driveRingX = 0;
  driveRingY = 0;

  get hitX(): number { return this.x + PLAYER.hitOffsetX; }
  get hitY(): number { return this.y; }
  get alive(): boolean { return this.state === 'play' || this.state === 'enter'; }
  get vulnerable(): boolean { return this.state === 'play' && this.invuln <= 0 && !this.godMode; }
  get driving(): boolean { return this.driveT > 0; }

  loadout(): PlayerLoadout {
    return { weapon: this.weapon, lv: this.lv, sub: this.sub, subLv: this.subLv, drones: this.drones, formation: this.formation, barrier: this.barrier, speedLv: this.speedLv };
  }

  apply(l: PlayerLoadout): void {
    this.weapon = l.weapon; this.lv = l.lv; this.sub = l.sub; this.subLv = l.subLv; this.drones = l.drones;
    this.formation = l.formation; this.barrier = l.barrier; this.speedLv = l.speedLv;
  }

  startEnter(from: number, to: number, frames: number, y = 135): void {
    this.state = 'enter';
    this.timer = 0;
    this.enterFrom = from; this.enterTo = to; this.enterLen = frames;
    this.x = this.px = from; this.y = this.py = y;
    for (let i = 0; i < 4; i++) { this.dx[i] = from - 10; this.dy[i] = y; }
    this.trailCount = 0;
  }
}

function pushTrail(p: Player): void {
  const i = p.trailHead;
  p.trail[i * 2] = p.x; p.trail[i * 2 + 1] = p.y;
  p.trailHead = (i + 1) % 80;
  p.trailCount = Math.min(80, p.trailCount + 1);
}

function trailAt(p: Player, back: number, out: [number, number]): boolean {
  if (back >= p.trailCount) return false;
  const i = (p.trailHead - 1 - back + 800) % 80;
  out[0] = p.trail[i * 2]!; out[1] = p.trail[i * 2 + 1]!;
  return true;
}

const tmp: [number, number] = [0, 0];
const nrm = { x: 0, y: 0 };

// sample points on the 16×6 terrain box
const TPTS: [number, number][] = [];
for (const dx of [-8, -4, 0, 4, 8]) for (const dy of [-3, 3]) TPTS.push([dx, dy]);
TPTS.push([-8, 0], [8, 0], [0, 0]);

export function terrainHit(w: World, x: number, y: number): [number, number] | null {
  for (const [dx, dy] of TPTS) {
    const sx = x + dx, sy = y + dy;
    if (w.terrain.solid(sx + w.camX, sy + w.camY)) return [sx, sy];
  }
  return null;
}

export function updatePlayer(w: World, inp: InputFrame): void {
  const p = w.player;
  p.px = p.x; p.py = p.y;
  for (let i = 0; i < 4; i++) { p.dpx[i] = p.dx[i]!; p.dpy[i] = p.dy[i]!; }
  if (p.formSwitch > 0) p.formSwitch--;
  if (p.formLabel > 0) p.formLabel--;
  if (p.speedFx > 0) p.speedFx--;
  if (p.muzzle > 0) p.muzzle--;
  p.touch = (inp.bits & IB.TOUCH) !== 0;

  if (p.state === 'dead') {
    p.timer++;
    if (p.timer >= PLAYER.respawnWait) w.onPlayerRespawnReady();
    updateDrive(w, p, inp, false);
    return;
  }
  if (p.state === 'gone') return;
  if (p.state === 'enter') {
    p.timer++;
    const k = ease('outCubic', Math.min(1, p.timer / p.enterLen));
    p.x = p.enterFrom + (p.enterTo - p.enterFrom) * k;
    if (p.timer >= p.enterLen) {
      p.state = 'play';
      if (w.respawned) p.invuln = PLAYER.respawnInvuln;
    }
    pushTrail(p);
    updateDrones(w);
    fire(w, p, inp);
    return;
  }

  if (p.invuln > 0) p.invuln--;

  // speed / formation
  const spdSet = (inp.bits >> IB.SPD_SHIFT) & 7;
  if (spdSet >= 1 && spdSet <= 4 && spdSet !== p.speedLv) { p.speedLv = spdSet; p.speedFx = 8; w.sfx('speed_change', p.x); }
  if (inp.bits & IB.SPD_UP) { p.speedLv = (p.speedLv % 4) + 1; p.speedFx = 8; w.sfx('speed_change', p.x); }
  if (inp.bits & IB.SPD_DN) { p.speedLv = p.speedLv === 1 ? 4 : p.speedLv - 1; p.speedFx = 8; w.sfx('speed_down', p.x); }
  if (inp.bits & IB.FORM) {
    p.formation = FORMATIONS[(FORMATIONS.indexOf(p.formation) + 1) % 3]!;
    p.formSwitch = 12; p.formLabel = 45;
    w.sfx('formation', p.x);
  }

  // movement
  const spd = PLAYER.speeds[p.speedLv - 1]!;
  let mx = 0, my = 0;
  if (p.touch) {
    mx = clamp(inp.tdx, -PLAYER.touchMaxStep, PLAYER.touchMaxStep);
    my = clamp(inp.tdy, -PLAYER.touchMaxStep, PLAYER.touchMaxStep);
  } else if (inp.bits & IB.ANALOG) {
    mx = inp.ax * spd; my = inp.ay * spd;
  } else {
    if (inp.bits & IB.LEFT) mx -= 1;
    if (inp.bits & IB.RIGHT) mx += 1;
    if (inp.bits & IB.UP) my -= 1;
    if (inp.bits & IB.DOWN) my += 1;
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    mx *= spd; my *= spd;
  }
  // wind
  my += w.wind;
  // conveyor push (ST5)
  mx += w.conveyorPush;
  p.moveX = mx; p.moveY = my;
  const B = PLAYER.bounds;
  p.x = clamp(p.x + mx, B.x0, B.x1);
  p.y = clamp(p.y + my, B.y0, B.y1);
  // bank animation
  const dirY = Math.abs(my - w.wind) > 0.3 ? Math.sign(my - w.wind) : 0;
  if (dirY !== 0) {
    p.bankHold = Math.sign(p.bankHold) === dirY ? p.bankHold + dirY : dirY;
    const hold = Math.abs(p.bankHold);
    p.bank = dirY * (hold >= 12 ? 2 : hold >= 4 ? 1 : Math.abs(p.bank) >= 1 && Math.sign(p.bank) === dirY ? Math.abs(p.bank) : 0);
  } else {
    if (p.bankHold !== 0) p.bankHold = 0;
    if (p.bank !== 0 && w.frame % 4 === 0) p.bank -= Math.sign(p.bank);
  }
  if (Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 0.3) pushTrail(p);

  // terrain
  const hit = terrainHit(w, p.x, p.y);
  if (hit) onTerrain(w, p, hit);

  updateDrones(w);
  updateDrive(w, p, inp, true);
  fire(w, p, inp);
}

function onTerrain(w: World, p: Player, hit: [number, number]): void {
  const crushed = p.x <= PLAYER.bounds.x0 + 0.5;
  const soft = !w.cfg.terrainKills || p.invuln > 0 || p.godMode || p.barrier > 0 || p.driving;
  if (!soft) { w.killPlayer('terrain'); return; }
  if (p.barrier > 0 && p.invuln <= 0 && !p.godMode && !p.driving) w.barrierHit();
  // push out along the normal
  w.terrain.normal(hit[0] + w.camX, hit[1] + w.camY, nrm);
  for (let k = 0; k < 12; k++) {
    p.x += nrm.x; p.y += nrm.y;
    if (!terrainHit(w, p.x, p.y)) break;
  }
  p.x = clamp(p.x, PLAYER.bounds.x0, PLAYER.bounds.x1);
  p.y = clamp(p.y, PLAYER.bounds.y0, PLAYER.bounds.y1);
  if (terrainHit(w, p.x, p.y)) {
    if (crushed && w.cfg.terrainKills && !p.godMode) { w.killPlayer('crush'); return; }
    // try vertical escape
    for (let k = 1; k < 16; k++) {
      if (!terrainHit(w, p.x, p.y - k)) { p.y -= k; break; }
      if (!terrainHit(w, p.x, p.y + k)) { p.y += k; break; }
      if (!terrainHit(w, p.x + k, p.y)) { p.x += k; break; }
    }
  }
  if (w.frame % 6 === 0) w.fxSparks(p.x, p.y, 3, '#ffbf4d');
}

export function updateDrones(w: World): void {
  const p = w.player;
  const n = p.drones;
  if (p.formation === 'orbit') p.orbitA = (p.orbitA + DRONE.orbitSpeed) % 360;
  const k = p.formSwitch > 0 ? 0.22 : p.formation === 'wing' ? 0.25 : 1;
  for (let i = 0; i < n; i++) {
    let tx: number, ty: number;
    if (p.formation === 'wing') {
      const s = DRONE.wingSlots[i]!;
      tx = p.x + s[0]; ty = p.y + s[1];
    } else if (p.formation === 'trail') {
      if (trailAt(p, (i + 1) * DRONE.trailSpacing, tmp)) { tx = tmp[0]; ty = tmp[1]; }
      else { tx = p.x - 14 * (i + 1); ty = p.y; }
    } else {
      const a = p.orbitA + (360 / n) * i;
      tx = p.x + dcos(a) * DRONE.orbitR; ty = p.y + dsin(a) * DRONE.orbitR;
    }
    const kk = p.formation === 'trail' && p.formSwitch <= 0 ? 1 : k;
    p.dx[i] = p.dx[i]! + (tx - p.dx[i]!) * kk;
    p.dy[i] = p.dy[i]! + (ty - p.dy[i]!) * kk;
  }
}

function updateDrive(w: World, p: Player, inp: InputFrame, canActivate: boolean): void {
  if (p.autoDrive && p.driveT <= 0) p.drive = Math.min(100, p.drive + 1);
  if (p.driveT > 0) {
    p.driveT--;
    p.drive = (p.driveT / DRIVE.duration) * 100;
    if (p.driveT === 0) { p.drive = 0; w.sfx('drive_end', p.x); w.music({ cmd: 'drive', on: false }); }
  }
  if (p.driveRingR >= 0) {
    p.driveRingR += DRIVE.ringRadius / DRIVE.ringFrames;
    w.driveRingStep(p.driveRingX, p.driveRingY, p.driveRingR);
    if (p.driveRingR >= DRIVE.ringRadius) p.driveRingR = -1;
  }
  if (canActivate && (inp.bits & IB.DRIVE) && p.drive >= 100 && p.driveT === 0 && p.state === 'play') {
    p.driveT = DRIVE.duration;
    p.invuln = Math.max(p.invuln, DRIVE.invuln);
    p.driveRingR = 0; p.driveRingX = p.x; p.driveRingY = p.y;
    w.onDriveStart();
  }
}

export function addDrive(w: World, amount: number): void {
  const p = w.player;
  if (p.driveT > 0 || p.state === 'dead') return;
  const before = p.drive;
  p.drive = Math.min(100, p.drive + amount);
  if (before < 100 && p.drive >= 100) w.sfx('drive_ready', p.x);
}

// ---------------------------------------------------------------------------
function fire(w: World, p: Player, inp: InputFrame): void {
  if (p.fireCd > 0) p.fireCd--;
  if (p.subCd > 0) p.subCd--;
  if (p.shotMode === 'toggle' && !p.touch) { if (inp.bits & IB.SHOT_PRESS) p.toggleOn = !p.toggleOn; }
  const shooting = p.shotMode === 'toggle' && !p.touch ? p.toggleOn : (inp.bits & IB.SHOT) !== 0;
  p.firing = shooting;
  if (!shooting || w.noPlayerFire) return;
  const drive = p.driving;
  const dmgK = drive ? DRIVE.dmgMul : 1;
  if (p.fireCd <= 0) {
    const lv = p.lv - 1;
    let interval = 5;
    if (p.weapon === 'pulse') interval = PULSE[lv]!.interval;
    else if (p.weapon === 'fan') interval = FAN[lv]!.interval;
    else interval = RAY[lv]!.interval;
    if (drive) interval = Math.ceil(interval * DRIVE.intervalMul);
    p.fireCd = interval;
    p.muzzle = 2;
    emitMain(w, p.x + 15, p.y, dmgK, false);
    const mul = DRONE.dmgMul[p.formation]!;
    for (let i = 0; i < p.drones; i++) emitMain(w, p.dx[i]! + 6, p.dy[i]!, dmgK * mul, true);
    w.sfx(p.weapon === 'pulse' ? 'shot_pulse' : p.weapon === 'fan' ? 'shot_fan' : 'shot_ray', p.x);
    w.stats.shots++;
  }
  if (p.sub && p.subCd <= 0) {
    p.subCd = p.sub === 'bomb' ? BOMB.interval : SEEKER.interval;
    if (drive) p.subCd = Math.ceil(p.subCd * DRIVE.intervalMul);
    emitSub(w, p.x, p.y, dmgK, false);
    const mul = DRONE.dmgMul[p.formation]!;
    for (let i = 0; i < p.drones; i++) emitSub(w, p.dx[i]!, p.dy[i]!, dmgK * mul, true);
    w.sfx(p.sub === 'bomb' ? 'bomb_drop' : 'seeker_launch', p.x);
  }
}

function emitMain(w: World, x: number, y: number, dmgK: number, drone: boolean): void {
  const p = w.player;
  const lv = p.lv - 1;
  const gold = p.driving;
  if (p.weapon === 'pulse') {
    const L = PULSE[lv]!;
    for (let i = 0; i < L.offsets.length; i++) {
      const a = L.angles[i]!;
      const thick = !!L.thick && i === 0;
      w.spawnShot(SHOT_PULSE, x, y + L.offsets[i]!, a, L.speed, L.dmg * dmgK, gold, drone, thick ? 14 : lv >= 2 ? 12 : 10, thick ? 5 : 3);
    }
  } else if (p.weapon === 'fan') {
    const L = FAN[lv]!;
    for (const a of L.angles) w.spawnShot(SHOT_FAN, x - (Math.abs(a) > 90 ? 18 : 0), y, a, L.speed, L.dmg * dmgK, gold, drone, 8, 4);
  } else {
    const L = RAY[lv]!;
    const s = w.spawnShot(SHOT_RAY, x, y, 0, L.speed, L.dmg * dmgK, gold, drone, L.len, L.width);
    if (s) s.len = L.len; // spawnShot already starts the trail with two points at the muzzle (nt = 2)
  }
}

function emitSub(w: World, x: number, y: number, dmgK: number, drone: boolean): void {
  const p = w.player;
  if (p.sub === 'bomb') {
    const b = w.spawnShot(SHOT_BOMB, x + 2, y + 3, 0, 0, BOMB.dmg * dmgK, p.driving, drone, 6, 6);
    if (b) { b.vx = BOMB.vx; b.vy = BOMB.vy; b.grav = BOMB.gravity; }
    if (p.subLv >= 2) {
      const u = w.spawnShot(SHOT_BOMB, x + 2, y - 3, 0, 0, BOMB.dmg * dmgK, p.driving, drone, 6, 6);
      if (u) { u.vx = BOMB.vx; u.vy = -BOMB.vy; u.grav = -BOMB.gravity; }
    }
  } else if (p.sub === 'seeker') {
    const n = p.subLv >= 2 ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const up = i % 2 === 0;
      const a = up ? -70 - (i >> 1) * 25 : 70 + (i >> 1) * 25;
      const s = w.spawnShot(SHOT_SEEKER, x, y, a, SEEKER.speed0, SEEKER.dmg * dmgK, p.driving, drone, 8, 3);
      if (s) s.life = SEEKER.life;
    }
  }
}

// ---------------------------------------------------------------------------
export function collectItem(w: World, it: Item): void {
  const p = w.player;
  const k = it.kind;
  let label = '';
  let snd = 'pickup_chip';
  let ring = '#ffffff';
  switch (k) {
    case 'arms':
      snd = 'pickup_arms'; ring = '#ff4f4f';
      if (p.lv < 5) { p.lv++; label = `ARMS LV${p.lv}`; }
      else { w.addScore(SCORE.maxedItem, p.x, p.y - 12); addDrive(w, DRIVE.gain.maxedItem); label = 'ARMS MAX'; }
      break;
    case 'wisp':
    case 'lostWisp':
      snd = 'pickup_wisp'; ring = '#7fe0ff';
      if (p.drones < DRONE.max) {
        p.dx[p.drones] = it.x; p.dy[p.drones] = it.y;
        p.drones++;
        label = `WISP ×${p.drones}`;
      } else if (k === 'wisp') { w.addScore(SCORE.maxedItem, p.x, p.y - 12); addDrive(w, DRIVE.gain.maxedItem); label = 'WISP MAX'; }
      break;
    case 'aegis':
      snd = 'pickup_aegis'; ring = '#5ed16b';
      if (p.barrier > 0) w.addScore(SCORE.aegisRefill, p.x, p.y - 12);
      p.barrier = 3; label = 'AEGIS';
      break;
    case 'drive':
      snd = 'pickup_drive'; ring = '#f2cc4a';
      if (p.drive >= 100) w.addScore(SCORE.driveFull, p.x, p.y - 12);
      else addDrive(w, DRIVE.gain.cell);
      label = 'DRIVE';
      break;
    case 'armsChip': {
      const t: WeaponType = (['pulse', 'fan', 'ray'] as const)[it.phase % 3]!;
      if (t === p.weapon) { w.addScore(SCORE.sameChip, p.x, p.y - 12); addDrive(w, DRIVE.gain.sameChip); }
      p.weapon = t; label = t.toUpperCase();
      break;
    }
    case 'subChip': {
      const t: SubType = it.phase % 2 === 0 ? 'bomb' : 'seeker';
      if (p.sub === t) {
        if (p.subLv < 2) p.subLv = 2; else w.addScore(SCORE.subMax, p.x, p.y - 12);
      } else { p.sub = t; p.subLv = 1; }
      label = `${t === 'bomb' ? 'G.BOMB' : 'SEEKER'} LV${p.subLv}`;
      break;
    }
    case 'oneUp':
      w.extend(); label = '1UP'; snd = 'extend'; ring = '#ffe39a';
      break;
    case 'star':
      w.addScore(SCORE.star, 0, 0, false);
      addDrive(w, DRIVE.gain.star);
      w.sfx('star', it.x);
      return;
  }
  if (k !== 'lostWisp') w.stats.itemsGot++;
  w.sfx(snd, p.x);
  if (label) w.popup(label, p.x, p.y - 18, k === 'oneUp' ? 'Y4' : 'N8', false);
  w.fxRing(p.x, p.y, 24, ring, 16);
}

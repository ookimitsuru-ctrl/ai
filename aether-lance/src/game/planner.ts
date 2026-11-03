// Look-ahead autopilot for the automated balance test (scenes/autotest.ts). Unlike the potential-field bot (bot.ts,
// used by the attract demo and the god-mode tests) it plays mortal: every frame it tries the 9 stick directions for
// a short first segment followed by each of the 9 directions again, predicts the player box against the scrolling
// terrain (the exact camera path), bullets, enemy bodies and hazards, and takes the safest path that also lines up
// with something to shoot. It is meant to play like a careful, decent player, so deaths point at the game, not at
// a bot that cannot steer.
import { IB, terrainHit, type InputFrame } from './player';
import { circleVsShape, segDist2 } from './collision';
import { dist2 } from '../core/dmath';
import { PLAYER } from '../data/balance';
import type { World } from './world';
import { EF, type Bullet, type Enemy, type Hazard, type Tele } from './entities';

const DIRS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
const SEG1 = [2, 4, 6];
const SEG2 = [9, 12, 15, 18, 22, 26];
const HIT = 1e5;

interface Ctx {
  w: World;
  bullets: Bullet[];
  enemies: Enemy[];
  hazards: Hazard[];
  teles: Tele[];
  /** flame reach around welders that are sparking and the stage 5 midboss claw */
  flames: { x: number; y: number; r: number }[];
  /** a safe-zone warning is on screen */
  safeNow: boolean;
  spd: number;
}

const TERRAIN_AHEAD = [40, 60, 90];

/** Terrain kill box overlap at (x, y) k frames from now. */
function terrainAt(w: World, x: number, y: number, k: number): boolean {
  const [cx, cy] = camAt(w, k);
  const ox = w.camX, oy = w.camY;
  w.camX = cx; w.camY = cy;
  const hit = !!terrainHit(w, x, y);
  w.camX = ox; w.camY = oy;
  return hit;
}

function camAt(w: World, k: number): [number, number] {
  if (w.waiting) return [w.camX, w.camY];
  return [w.profile.X(w.t + k), w.profile.Y(w.t + k)];
}

/** Danger of the player standing at (x, y) k frames from now. */
function danger(c: Ctx, x: number, y: number, k: number): number {
  const w = c.w;
  let cost = 0;
  // terrain: the real 16×6 kill box, plus a margin ring for comfort
  if (w.cfg.terrainKills) {
    const [cx, cy] = camAt(w, k);
    const ox = w.camX, oy = w.camY;
    w.camX = cx; w.camY = cy;
    if (terrainHit(w, x, y)) cost += HIT;
    else if (terrainHit(w, x, y - 4) || terrainHit(w, x, y + 4) || terrainHit(w, x + 5, y) || terrainHit(w, x - 4, y)) cost += 400;
    w.camX = ox; w.camY = oy;
    if (x < PLAYER.bounds.x0 + 30) cost += (PLAYER.bounds.x0 + 30 - x) * 10; // near the left edge: no room to escape a wall
  }
  const hx = x + PLAYER.hitOffsetX, hy = y, hr = PLAYER.hitR;
  for (const b of c.bullets) {
    const t = Math.max(0, k - b.delay);
    let bx = b.x + b.vx * t, by = b.y + b.vy * t;
    if (b.kind === 'waveArc') {
      const r = b.arcR + b.arcGrow * k;
      const d = Math.sqrt(dist2(b.x, b.y, hx, hy));
      if (Math.abs(d - r) < 6 + hr) cost += HIT * 0.3; // the gaps are not modelled: just keep clear of the ring
      continue;
    }
    if (b.homing > 0) { bx = b.x + (b.vx * t) * 0.6; by = b.y + (b.vy * t) * 0.6; }
    const d2 = dist2(bx, by, hx, hy);
    const rr = b.r + hr + 1.5;
    if (d2 <= rr * rr) cost += HIT;
    else if (d2 < (rr + 9) * (rr + 9)) cost += (rr + 9 - Math.sqrt(d2)) * 25;
  }
  for (const e of c.enemies) {
    const vx = e.x - e.px, vy = e.y - e.py;
    const dx = vx * k, dy = vy * k;
    if (e.parts) {
      for (const pt of e.parts) {
        if (!pt.contact || !(pt.alive || pt.data?.solidDead)) continue;
        if (circleVsShape(hx, hy, hr + 3, pt.x + dx, pt.y + dy, pt.shape)) { cost += HIT; break; }
        if (circleVsShape(hx, hy, hr + 12, pt.x + dx, pt.y + dy, pt.shape)) cost += 150;
      }
      continue;
    }
    if (circleVsShape(hx, hy, hr + 3, e.x + dx, e.y + dy, e.shape)) cost += HIT;
    else if (circleVsShape(hx, hy, hr + 12, e.x + dx, e.y + dy, e.shape)) cost += 150;
  }
  for (const h of c.hazards) {
    if (!h.lethal || h.tele > k + 6) continue;
    if (w.hazardHits(h, hx, hy, hr + 3)) cost += HIT;
    else if (w.hazardHits(h, hx, hy, hr + 10)) cost += 300;
  }
  // warnings a player sees before an attack lands (press bands, laser lines, pillars, rings)
  for (const t of c.teles) {
    if (t.life > k + 8) continue;
    const m = hr + 4;
    let hit = false;
    switch (t.kind) {
      case 'band': {
        const x0 = Math.min(t.x1, t.x2), x1 = t.x1 === t.x2 ? 480 : Math.max(t.x1, t.x2);
        if (t.color !== 'O5') {
          // a coloured band marks a safe zone (stage 5 boss plates): danger is being outside it
          const inside = hy >= Math.min(t.y1, t.y2) + m && hy <= Math.max(t.y1, t.y2) - m;
          hit = !inside && hx >= x0 - m && hx <= x1 + m;
        } else hit = hx >= x0 - m && hx <= x1 + m && hy >= Math.min(t.y1, t.y2) - m && hy <= Math.max(t.y1, t.y2) + m;
        break;
      }
      case 'line':
        if (t.color === 'Y4') break; // guide line through the middle of a safe gap, not a laser warning
        if (t.pts) { for (let i = 0; i + 3 < t.pts.length && !hit; i += 2) hit = segDist2(hx, hy, t.pts[i]!, t.pts[i + 1]!, t.pts[i + 2]!, t.pts[i + 3]!) <= (Math.max(5, t.w * 2) + m) ** 2; }
        else hit = segDist2(hx, hy, t.x1, t.y1, t.x2, t.y2) <= (Math.max(5, t.w * 2) + m) ** 2;
        break;
      case 'vband': hit = Math.abs(hx - t.x1) <= t.w / 2 + m; break;
      case 'circle': hit = dist2(hx, hy, t.x1, t.y1) <= (t.w + m) ** 2; break;
    }
    if (hit) cost += HIT * 0.5;
  }
  for (const f of c.flames) if (dist2(hx, hy, f.x, f.y) < f.r * f.r) cost += HIT * 0.4;
  if (safeMem && !c.safeNow && w.frame < safeMem.until && hx >= safeMem.x0 && hx <= safeMem.x1) {
    const m = PLAYER.hitR + 4;
    if (hy < safeMem.y0 + m || hy > safeMem.y1 - m) cost += HIT * 0.5;
  }
  return cost;
}

/** Where the bot would like to be: in line with the nearest target, a comfortable distance behind it. */
function preferred(w: World): { x: number; y: number } {
  const p = w.player;
  let target: { x: number; y: number } | null = null;
  let best = 1e9;
  for (const e of w.enemies.items) {
    if (!e.active || e.dead) continue;
    if (e.parts) {
      for (const pt of e.parts) {
        if (!pt.alive || pt.armored || pt.maxHp >= 1e6 || pt.x < 40 || pt.x > 476 || pt.y < 10 || pt.y > 260) continue;
        const d = Math.abs(pt.y - p.y) * 0.5 + Math.abs(pt.x - p.x - 120) * 0.1 - (pt.id === 'head' || pt.id === 'core' || pt.id === 'eye' ? 40 : 0);
        if (d < best) { best = d; target = pt; }
      }
      continue;
    }
    if (e.x < p.x + 16 || e.x > 470) continue;
    const d = Math.abs(e.y - p.y) + (e.x - p.x) * 0.3;
    if (d < best) { best = d; target = e; }
  }
  // power-ups that are close are worth a detour
  for (const it of w.items.items) {
    if (!it.active || it.x < 20) continue;
    const d = Math.abs(it.y - p.y) + Math.abs(it.x - p.x);
    if (d < 90 && d * 0.6 < best) { best = d * 0.6; target = { x: it.x + 60, y: it.y }; }
  }
  const tx = target ? Math.max(60, Math.min(150, target.x - 110)) : 100;
  return { x: tx, y: target ? target.y : 135 };
}

let lastDir = 0;
/** the last safe-zone band, remembered while the plates close after its warning has ended */
let safeMem: { x0: number; x1: number; y0: number; y1: number; until: number } | null = null;

export function plannerInput(w: World): InputFrame {
  const p = w.player;
  let bits = IB.SHOT;
  if (p.state !== 'play') return { bits, tdx: 0, tdy: 0, ax: 0, ay: 0 };
  const near = (x: number, y: number, r: number) => Math.abs(x - p.x) < r && Math.abs(y - p.y) < r;
  const c: Ctx = {
    w,
    bullets: w.bullets.items.filter((b) => b.active && b.fade <= 0 && near(b.x, b.y, b.kind === 'waveArc' ? 999 : 170)),
    enemies: w.enemies.items.filter((e) => e.active && !e.dead && !(e.flags & (EF.NO_CONTACT | EF.BACKGROUND)) && (e.parts ? true : near(e.x, e.y, 140))),
    hazards: w.hazards.items.filter((h) => h.active),
    teles: w.teles.items.filter((t) => t.active),
    flames: [],
    safeNow: false,
    spd: PLAYER.speeds[p.speedLv - 1]!,
  };
  for (const e of w.enemies.items) {
    if (!e.active || e.dead) continue;
    if (e.def.id === 'welder' && e.v.spark) c.flames.push({ x: e.x, y: e.y, r: 56 });
    if (e.parts) for (const pt of e.parts) if (pt.id === 'claw' && pt.alive) c.flames.push({ x: pt.x, y: pt.y, r: 74 });
  }
  for (const t of c.teles) {
    if (t.kind !== 'band' || t.color === 'O5') continue;
    c.safeNow = true;
    safeMem = { x0: Math.min(t.x1, t.x2), x1: Math.max(t.x1, t.x2), y0: Math.min(t.y1, t.y2), y1: Math.max(t.y1, t.y2), until: w.frame + t.life + 100 };
  }
  const B = PLAYER.bounds;
  const pref = preferred(w);
  const step = (x: number, y: number, d: [number, number], n: number): [number, number] => {
    let mx = d[0], my = d[1];
    if (mx && my) { mx *= 0.7071; my *= 0.7071; }
    mx = mx * c.spd + w.conveyorPush; my = my * c.spd + w.wind;
    return [Math.max(B.x0, Math.min(B.x1, x + mx * n)), Math.max(B.y0, Math.min(B.y1, y + my * n))];
  };
  let bestCost = Infinity, bestDir = 0;
  for (let i = 0; i < DIRS.length; i++) {
    let c1 = 0, prevK = 0, x = p.x, y = p.y;
    for (const k of SEG1) { [x, y] = step(x, y, DIRS[i]!, k - prevK); prevK = k; c1 += danger(c, x, y, k) * 1.2; }
    if (c1 >= HIT * 3) { if (c1 < bestCost) { bestCost = c1; bestDir = i; } continue; }
    let best2 = Infinity;
    for (let j = 0; j < DIRS.length; j++) {
      let c2 = 0, pk = prevK, x2 = x, y2 = y;
      for (const k of SEG2) { [x2, y2] = step(x2, y2, DIRS[j]!, k - pk); pk = k; c2 += danger(c, x2, y2, k) * (k < 16 ? 1 : 0.6); if (c2 + c1 >= bestCost) break; }
      c2 += Math.abs(x2 - pref.x) * 0.6 + Math.abs(y2 - pref.y) * 1.2;
      // longer look at the terrain only: would holding this spot run into a wall in the next ~1.5 s? (hanging
      // pillars in stage 1 have to be passed underneath well before they arrive, or the ship gets pinned left)
      if (w.cfg.terrainKills) for (const k of TERRAIN_AHEAD) if (terrainAt(w, x2, y2, k)) { c2 += 700; break; }
      if (c2 < best2) best2 = c2;
    }
    const total = c1 + best2 + (i === lastDir ? -2 : 0);
    if (total < bestCost) { bestCost = total; bestDir = i; }
  }
  lastDir = bestDir;
  const [dx, dy] = DIRS[bestDir]!;
  if (dx > 0) bits |= IB.RIGHT; else if (dx < 0) bits |= IB.LEFT;
  if (dy > 0) bits |= IB.DOWN; else if (dy < 0) bits |= IB.UP;
  // Lance Drive when cornered (the safest path still hits) or the screen is thick with bullets
  if (p.drive >= 100 && (bestCost >= HIT || c.bullets.length > 40)) bits |= IB.DRIVE;
  return { bits, tdx: 0, tdy: 0, ax: 0, ay: 0 };
}

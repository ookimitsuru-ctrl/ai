// STAGE 5: MB5 ASSEMBLY ARM, B5 ANVIL (docs/06_bosses.md).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy, type Hazard } from '../../game/entities';
import { dcos, dsin, datan2 } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import { partSprite } from './st1';
import type { Ctx } from '../../game/script';

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

/** Throw a scrap enemy along a parabola that lands on the player's current position. */
function throwScrap(c: Ctx, x: number, y: number, T = 55): void {
  const px = c.p.alive ? c.p.x : 120, py = c.p.alive ? c.p.y : 135;
  const g = 0.12;
  const vx = (px - x) / T, vy = (py - y) / T - 0.5 * g * T;
  const pts: number[] = [];
  for (let t = 0; t <= T; t += 3) pts.push(x + vx * t, y + vy * t + 0.5 * g * t * t);
  c.telegraph('dots', 0, 0, 0, 0, 30, 1, 'O5', pts);
  c.w.spawnEnemy('scrap', x, y, { p: { vx, vy, g } });
}

// ---- MB5 ASSEMBLY ARM ------------------------------------------------------------------------------
const L1 = 72, L2 = 66;
defEnemy({
  id: 'assemblyarm', hp: 1, score: 20000, size: 'L', shape: box(6, 6), flags: EF.PERSISTENT | EF.NO_CONTACT, timeLimit: 40 * 60, bossName: 'ASSEMBLY ARM', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    e.y = 34;
    c.part('joint', 0, 60, circle(12), 600, { score: 4000 });
    c.part('claw', -40, 120, box(34, 28), 600, { score: 4000 });
    e.v.tx = -40; e.v.ty = 120; e.v.closed = 0; e.v.grip = 0;
    e.o.bw = 120; e.o.bh = 180;
  },
  draw(g, e, x, y) {
    const j = P(e, 'joint'), cl = P(e, 'claw');
    // rail
    g.fillStyle = PAL.N2; g.fillRect(0, Math.round(y - 12), 480, 6);
    g.fillStyle = PAL.Y2; for (let k = 0; k < 480; k += 24) g.fillRect(k, Math.round(y - 12), 12, 2);
    drawSprite(g, SPR.arm_base!, 0, x, y - 4);
    g.fillStyle = PAL.N3; stampLine(g, x, y, x + j.ox, y + j.oy, 8);
    g.fillStyle = PAL.Y2; stampLine(g, x, y, x + j.ox, y + j.oy, 2);
    if (cl.alive) { g.fillStyle = PAL.N3; stampLine(g, x + j.ox, y + j.oy, x + cl.ox, y + cl.oy - 10, 7); }
    if (j.alive) partSprite(g, 'arm_joint', e.v.fire ? 1 : 0, j, x, y);
    if (cl.alive) {
      if (e.v.grip) drawSprite(g, SPR.scrap!, 0, x + cl.ox, y + cl.oy + 12);
      partSprite(g, 'arm_claw', e.v.closed ? 1 : 0, cl, x, y);
      if (e.v.red) { g.globalCompositeOperation = 'lighter'; drawGlow(g, x + cl.ox, y + cl.oy, 14, PAL.R3, 0.8); g.globalCompositeOperation = 'source-over'; }
    }
  },
  *script(e, c) {
    const j = P(e, 'joint'), cl = P(e, 'claw');
    e.flags |= EF.INVULN;
    yield* c.moveTo(380, 34, 90, 'outCubic');
    e.flags &= ~EF.INVULN;
    // IK solver thread
    c.thread((function* () {
      for (;;) {
        const flail = !cl.alive ? 1 : 0;
        const tx = e.v.tx! + (flail ? 30 * dsin(e.age * 4) : 0), ty = e.v.ty! + (flail ? 20 * dcos(e.age * 5) : 0);
        const d = Math.min(L1 + L2 - 1, Math.max(10, Math.sqrt(tx * tx + ty * ty)));
        const a = datan2(ty, tx);
        const cosB = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
        const b = (Math.acos(Math.max(-1, Math.min(1, cosB))) * 180) / Math.PI;
        const ja = a - b;
        j.ox = dcos(ja) * L1; j.oy = dsin(ja) * L1;
        if (cl.alive) { cl.ox += (j.ox + dcos(a + 0) * 0 + (tx - j.ox) * 1 - cl.ox) * 0.35; cl.oy += (ty - cl.oy) * 0.35; }
        if (e.v.fire) e.v.fire--;
        yield;
      }
    })());
    // rail drift
    c.thread((function* () { for (let i = 0; ; i++) { e.x = 360 + 50 * dsin(i * 0.6); yield; } })());
    // joint gun
    c.thread((function* () {
      yield 50;
      for (;;) { yield c.iv(cl.alive ? 80 : 50); if (j.alive) { e.v.fire = 8; c.nway(3, 30, 2.0, { ox: j.ox, oy: j.oy }); } }
    })());
    // flame when close
    c.thread((function* () {
      for (;;) {
        yield 10;
        if (!cl.alive) return;
        const cx = e.x + cl.ox, cy = e.y + cl.oy;
        if (c.p.alive && Math.hypot(c.p.x - cx, c.p.y - cy) < 70 && c.can()) {
          for (let i = 0; i < 20; i++) { if (i % 3 === 0) c.w.fx.sparks(cx, cy, 1, PAL.C4); yield; }
          c.w.addHazard('flame', { x: cx, y: cy, angle: c.aim(cx, cy), w: 30, h: 64, tele: 0, dur: 40, owner: e });
          c.sfx('flame');
          yield 80;
        }
      }
    })());
    for (let n = 0; j.alive || cl.alive; n++) {
      yield c.iv(60);
      if (!cl.alive) continue;
      if (n % 2 === 0) {
        // grab scrap from the conveyor and throw it
        e.v.tx = -70; e.v.ty = 186; yield 30;
        e.v.closed = 1; e.v.grip = 1; yield 10;
        e.v.tx = -40; e.v.ty = 100; yield 30;
        if (c.can()) throwScrap(c, e.x + cl.ox, e.y + cl.oy + 12);
        e.v.grip = 0; e.v.closed = 0;
      } else {
        // swipe down through the player's column
        const tx = Math.max(60, Math.min(420, c.p.alive ? c.p.x : 200)) - e.x;
        e.v.tx = tx; e.v.ty = 20;
        e.v.red = 1;
        const tele = c.tele(40);
        c.telegraph('vband', e.x + tx, 0, e.x + tx, 270, tele, 40, 'O4');
        yield tele;
        e.v.red = 0;
        c.sfx('lancer_dash');
        for (let i = 0; i < 20; i++) { e.v.ty = 20 + (i / 20) * 190; yield; }
        c.shake(0.15);
        yield 20;
        e.v.tx = -40; e.v.ty = 120;
        yield 30;
      }
    }
    c.w.killEnemy(e);
  },
});

// ---- B5 ANVIL --------------------------------------------------------------------------------------------
defEnemy({
  id: 'anvil', hp: 1, score: 110000, size: 'B', shape: box(6, 6), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN, timeLimit: 180 * 60, bossName: 'ANVIL', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    e.x = 560; e.y = 135;
    const core = c.part('core', 0, 0, box(54, 54), 4400, { score: 0 });
    core.onDestroy = () => c.killBoss(170);
    c.part('armU', -44, -44, box(38, 18), 600, { score: 5000 });
    c.part('armL', -44, 44, box(38, 18), 600, { score: 5000 });
    e.v.top = 12; e.v.bot = 258; e.v.heat = 0;
    e.o.bw = 120; e.o.bh = 220;
    e.o.contact = [box(70, 300, 40, 0)];
    e.o.armorShapes = [box(30, 300, 60, 0)];
    e.o.deathFx = (k: number) => { e.v.heat = k; c.w.stageData.forcePush = 0; if (k > 0.98) c.w.stageData.lightsOff = 1; };
  },
  draw(g, e, x, y, w) {
    const top = e.v.top!, bot = e.v.bot!;
    const pw = x - 40;
    // plates
    for (const [y0, h, flip] of [[0, top, false], [bot, 270 - bot, true]] as const) {
      if (h <= 0) continue;
      g.fillStyle = PAL.N2; g.fillRect(0, Math.round(y0), Math.round(pw), Math.round(h));
      g.fillStyle = PAL.N4; g.fillRect(0, Math.round(flip ? y0 : y0 + h - 4), Math.round(pw), 4);
      g.fillStyle = PAL.Y3;
      for (let k = 0; k < pw; k += 16) g.fillRect(k + ((k >> 4) % 2 ? 0 : 8), Math.round(flip ? y0 + 4 : y0 + h - 8), 8, 4);
      g.fillStyle = PAL.N1; for (let k = 20; k < pw; k += 40) g.fillRect(k, Math.round(y0), 3, Math.round(h));
    }
    // machine block behind core
    g.fillStyle = PAL.N1; g.fillRect(Math.round(x + 25), 0, 120, 270);
    g.fillStyle = PAL.N3; for (let yy = 8; yy < 270; yy += 24) g.fillRect(Math.round(x + 30), yy, 60, 3);
    g.fillStyle = PAL.Y2; g.fillRect(Math.round(x + 26), 0, 3, 270);
    const core = P(e, 'core');
    // rail
    g.fillStyle = PAL.N4; g.fillRect(Math.round(x + 20), 0, 6, 270);
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y + core.oy, 50 + e.v.heat! * 60, e.v.heat! > 0 ? PAL.O4 : PAL.O3, 0.4 + e.v.heat! * 0.5);
    g.globalCompositeOperation = 'source-over';
    if (core.alive) partSprite(g, 'anvil_core', (e.age >> 3) % 2, core, x, y);
    for (const id of ['armU', 'armL']) {
      const a = P(e, id);
      if (!a.alive) continue;
      g.fillStyle = PAL.N3; stampLine(g, x - 20, y + core.oy + (id === 'armU' ? -20 : 20), x + a.ox + 10, y + a.oy, 6);
      partSprite(g, 'anvil_arm', e.v.weld ? 1 : 0, a, x, y);
    }
    void w;
  },
  *script(e, c) {
    const core = P(e, 'core'), aU = P(e, 'armU'), aL = P(e, 'armL');
    const plates: { t: Hazard | null; b: Hazard | null } = { t: null, b: null };
    const setPlates = () => {
      for (const k of ['t', 'b'] as const) {
        let h = plates[k];
        if (!h || !h.active) { h = c.w.addHazard('wall', { tele: 0, dur: 1e9, owner: e }); plates[k] = h; }
        if (!h) continue;
        h.x = 0; h.w = Math.max(0, e.x - 40);
        if (k === 't') { h.y = 0; h.h = e.v.top!; } else { h.y = e.v.bot!; h.h = 270 - e.v.bot!; }
      }
    };
    const armPos = (dy: number) => { aU.ox = -44 + (e.v.reachU ?? 0); aU.oy = core.oy - 44 + dy; aL.ox = -44 + (e.v.reachL ?? 0); aL.oy = core.oy + 44 - dy; };
    c.thread((function* () { for (;;) { setPlates(); armPos(0); yield; } })());
    yield* c.moveTo(420, 135, 180, 'outCubic');
    c.bossReady();
    // core follows the player on its rail
    c.thread((function* () { for (;;) { if (c.p.alive && !e.v.lockRail) core.oy += Math.max(-0.6, Math.min(0.6, c.p.y - 135 - core.oy)); core.oy = Math.max(-75, Math.min(75, core.oy)); yield; } })());
    const t0 = c.frame;
    // P1
    c.thread((function* () { for (;;) { yield c.iv(90); if (aU.alive || aL.alive) c.nway(3, 30, 1.8, { kind: 'orb', ox: -28, oy: core.oy }); else return; } })());
    let n = 0;
    while ((aU.alive || aL.alive) && c.frame - t0 < 60 * 60) {
      yield c.iv(100);
      const a = n % 2 === 0 ? (aU.alive ? aU : aL) : (aL.alive ? aL : aU);
      if (n % 3 === 2 && a.alive) {
        // welding sweep
        const key = a === aU ? 'reachU' : 'reachL';
        for (let i = 0; i < 30; i++) { e.v[key] = -(i / 30) * 140; yield; }
        e.v.weld = 1;
        const tele = c.tele(30);
        for (let i = 0; i < tele; i++) { if (i % 3 === 0) c.w.fx.sparks(e.x + a.ox, e.y + a.oy, 1, PAL.C4); yield; }
        const fl = c.w.addHazard('flame', { x: e.x + a.ox, y: e.y + a.oy, angle: a === aU ? 120 : 240, w: 30, h: 64, tele: 0, dur: 60, owner: e });
        c.sfx('flame');
        for (let i = 0; i < 60; i++) { if (fl) { fl.x = e.x + a.ox; fl.y = e.y + a.oy; fl.angle = (a === aU ? 110 : 250) + (a === aU ? 1 : -1) * (i / 60) * 140; } yield; }
        e.v.weld = 0;
        for (let i = 0; i < 30; i++) { e.v[key] = -140 + (i / 30) * 140; yield; }
      } else if (a.alive && c.can()) throwScrap(c, e.x + a.ox, e.y + a.oy);
      n++;
    }
    // P2: crusher
    c.sfx('boss_phase');
    const gaps = [135, 80, 190, -1];
    let gi = 0;
    while (core.hp > core.maxHp * 0.3) {
      const gy = gaps[gi % 4] === -1 ? Math.max(50, Math.min(220, c.p.alive ? c.p.y : 135)) : gaps[gi % 4]!;
      gi++;
      // long enough to reach the gap from the far edge (up to ~150 px) even at the slowest speed (1.6 px/frame);
      // it was 60 frames, which only the default speed could just make (v1.1.1)
      const tele = Math.max(c.loop2 ? 70 : 90, c.w.cfg.teleMin);
      c.telegraph('band', 0, gy - 32, e.x - 40, gy + 32, tele, 1, 'G4');
      c.telegraph('line', 0, gy, e.x - 40, gy, tele, 1, 'Y4');
      // ring while open
      c.ring(12, 1.5, { kind: 'orb', ox: -28, oy: core.oy, start: c.rnd() * 30, scalable: true });
      yield tele;
      for (let i = 1; i <= 12; i++) { e.v.top = 12 + (gy - 32 - 12) * (i / 12); e.v.bot = 258 - (258 - gy - 32) * (i / 12); yield; }
      c.sfx('crush'); c.shake(0.4);
      yield c.loop2 ? 40 : 60;
      for (let i = 1; i <= 40; i++) { e.v.top = gy - 32 - (gy - 32 - 12) * (i / 40); e.v.bot = gy + 32 + (258 - gy - 32) * (i / 40); yield; }
      yield 30;
      if (c.loop2 && gi % 2 === 1) continue;
      c.ring(12, 1.5, { kind: 'orb', ox: -28, oy: core.oy, start: c.rnd() * 30, scalable: true });
      yield 50;
    }
    // P3: closed corridor + conveyor + spiral
    c.sfx('boss_phase');
    for (let i = 1; i <= 40; i++) { e.v.top = 12 + 33 * (i / 40); e.v.bot = 258 - 33 * (i / 40); yield; }
    c.w.stageData.forcePush = -0.6;
    c.thread((function* () {
      for (;;) {
        yield c.iv(150);
        const x = 40 + c.rnd() * 280;
        const tele = c.tele(40);
        c.telegraph('shadow', x, 224, x, 225, tele, 22);
        yield tele;
        c.w.spawnEnemy('scrap', x, 30, { p: { vx: 0, vy: 1, g: 0.15 } });
      }
    })());
    for (;;) {
      let a = 0;
      for (let t = 0; t < 90; t += 5) {
        for (let m = 0; m < 4; m++) c.bullet(e.x - 28, e.y + core.oy, a + m * 90, 1.6, 'pellet');
        if (t % 10 === 0) c.sfx('enemy_fire_s');
        a += 6;
        yield 5;
      }
      yield 30;
      for (let k = 0; k < 5; k++) { c.aimed(2.4, { kind: 'needle', ox: -28, oy: core.oy }); yield 8; }
      yield 40;
    }
  },
  onDeath(_e, c) { c.w.stageData.forcePush = 0; },
});

export const _st5b = fxRng;

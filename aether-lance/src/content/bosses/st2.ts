// STAGE 2: MB2 TWIN LENS, B2 LUMEN GOLEM (docs/06_bosses.md).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy, type Part } from '../../game/entities';
import { dcos, dsin, datan2 } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import { partSprite } from './st1';
import type { Ctx } from '../../game/script';

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

// ---- MB2 TWIN LENS ----------------------------------------------------------------------------------
defEnemy({
  id: 'twinlens', hp: 1, score: 12000, size: 'L', shape: box(6, 6), flags: EF.PERSISTENT | EF.NO_CONTACT, timeLimit: 35 * 60, bossName: 'TWIN LENS', explosion: 'crystal',
  init(e, c) {
    e.noOffscreenKill = true;
    c.part('L1', 70, 0, circle(13), 400, { score: 3000 });
    c.part('L2', -70, 0, circle(13), 400, { score: 3000 });
    e.o.bw = 170; e.o.bh = 150; e.o.light = 80;
    e.v.a = 0;
  },
  draw(g, e, x, y) {
    for (const id of ['L1', 'L2']) {
      const p = P(e, id);
      if (!p.alive) continue;
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, x + p.ox, y + p.oy, 22, PAL.C3, 0.5);
      g.globalCompositeOperation = 'source-over';
      partSprite(g, 'lens', e.v.beam ? 1 : (e.age >> 4) % 2, p, x, y);
    }
  },
  *script(e, c) {
    e.flags |= EF.INVULN;
    yield* c.moveTo(340, 135, 90, 'outCubic');
    e.flags &= ~EF.INVULN;
    const L1 = P(e, 'L1'), L2 = P(e, 'L2');
    c.thread((function* () {
      for (;;) {
        e.v.a = (e.v.a! + 1) % 360;
        L1.ox = 70 * dcos(e.v.a!); L1.oy = 70 * dsin(e.v.a!);
        L2.ox = -L1.ox; L2.oy = -L1.oy;
        yield;
      }
    })());
    // needles
    c.thread((function* () {
      yield 50;
      for (;;) {
        for (const L of [L1, L2]) {
          if (!L.alive) continue;
          for (let k = 0; k < 3; k++) { c.aimed(2.4, { kind: 'needle', ox: L.ox, oy: L.oy, sfx: k ? null : 'enemy_fire_s' }); yield 8; }
        }
        yield c.iv(70);
      }
    })());
    // connecting beam
    c.thread((function* () {
      yield 90;
      while (L1.alive && L2.alive) {
        const tele = c.tele(50);
        const h = c.w.addHazard('laser', { width: 4, tele, dur: 60, owner: e, sound: 'laser_fire' });
        c.sfx('laser_charge');
        e.v.beam = 1;
        for (let i = 0; i < tele + 60; i++) {
          if (!L1.alive || !L2.alive) { if (h) h.active = false; break; }
          if (h) { h.np = 2; h.pts[0] = e.x + L1.ox; h.pts[1] = e.y + L1.oy; h.pts[2] = e.x + L2.ox; h.pts[3] = e.y + L2.oy; }
          if (i < tele && (i >> 2) % 2 === 0) c.telegraph('line', e.x + L1.ox, e.y + L1.oy, e.x + L2.ox, e.y + L2.oy, 2);
          yield;
        }
        e.v.beam = 0;
        yield c.iv(90);
      }
      // survivor rage
      for (;;) {
        const L = L1.alive ? L1 : L2;
        if (!L.alive) return;
        if (c.can(true)) c.laser(e.x + L.ox, e.y + L.oy, c.aim(e.x + L.ox, e.y + L.oy), { width: 5, tele: 40, dur: 36, reflect: 2 });
        yield 50;
        c.ring(12, 1.5, { ox: L.ox, oy: L.oy, start: c.rnd() * 30, scalable: true });
        yield c.iv(70);
      }
    })());
    while (L1.alive || L2.alive) yield;
    c.w.killEnemy(e);
  },
});

// ---- B2 LUMEN GOLEM -------------------------------------------------------------------------------------
const REST = { fistU: [-82, -52], fistL: [-82, 52] } as const;

function* punch(e: Enemy, c: Ctx, f: Part, fast: boolean) {
  const [rx, ry] = REST[f.id as 'fistU' | 'fistL'];
  const tele = c.tele(fast ? 32 : 40);
  const ty = Math.max(-100, Math.min(100, (c.p.alive ? c.p.y : 135) - e.y));
  f.data!.glow = 1;
  for (let i = 1; i <= tele; i++) {
    f.oy = ry + (ty - ry) * (i / tele);
    if (i === 1) c.telegraph('band', 160, e.y + ty - 18, e.x + rx, e.y + ty + 18, tele);
    if (!f.alive) return;
    yield;
  }
  c.sfx('lancer_dash');
  while (e.x + f.ox > 160 && f.alive) { f.ox -= 8; yield; }
  c.shake(0.12);
  yield 20;
  if (f.alive) for (let k = 0; k < (c.loop2 ? 8 : 5); k++) c.bullet(e.x + f.ox, e.y + f.oy, 150 + k * (60 / ((c.loop2 ? 8 : 5) - 1)), 1.8, 'shard', { bounce: 1 });
  f.data!.glow = 0;
  const sx = f.ox, sy = f.oy;
  for (let i = 1; i <= 40; i++) { f.ox = sx + (rx - sx) * (i / 40); f.oy = sy + (ry - sy) * (i / 40); yield; }
}

function* slam(e: Enemy, c: Ctx) {
  const U = P(e, 'fistU'), D = P(e, 'fistL');
  for (let i = 1; i <= 20; i++) {
    if (U.alive) U.oy = REST.fistU[1] + (-112 - REST.fistU[1]) * (i / 20);
    if (D.alive) D.oy = REST.fistL[1] + (112 - REST.fistL[1]) * (i / 20);
    yield;
  }
  c.shake(0.3); c.sfx('press_slam');
  const xs: number[] = [];
  for (let k = 0; k < 8; k++) xs.push(40 + c.rnd() * 260);
  const tele = c.tele(40);
  for (const x of xs) c.telegraph('cross', x, 22, x, 22, tele);
  yield tele;
  for (const x of xs) c.w.spawnBullet(x, 16, 90 + (c.rnd() - 0.5) * 20, 1.6, 'shard', { bounce: 1, force: true });
  c.sfx('crystal_ping');
  for (let i = 1; i <= 30; i++) {
    if (U.alive) U.oy = -112 + (REST.fistU[1] + 112) * (i / 30);
    if (D.alive) D.oy = 112 + (REST.fistL[1] - 112) * (i / 30);
    yield;
  }
}

defEnemy({
  id: 'golem', hp: 1, score: 50000, size: 'B', shape: box(10, 10), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN, timeLimit: 150 * 60, bossName: 'LUMEN GOLEM', explosion: 'crystal',
  init(e, c) {
    e.noOffscreenKill = true;
    const head = c.part('head', -18, -72, circle(14), 2000, { armored: true, score: 5000 });
    c.part('fistU', REST.fistU[0], REST.fistU[1], box(40, 34), 500, { score: 4000, data: { glow: 0 } });
    c.part('fistL', REST.fistL[0], REST.fistL[1], box(40, 34), 500, { score: 4000, data: { glow: 0 } });
    c.part('chest', -40, 6, box(30, 38), 1e9, { contact: false, score: 0 });
    e.o.contact = [box(104, 210, 46, 10)];
    e.o.armorShapes = [box(104, 210, 46, 10)];
    e.o.bw = 160; e.o.bh = 200; e.o.light = 150;
    e.v.absorb = 0; e.v.visor = 0;
    head.onDestroy = () => c.killBoss(150);
    e.o.deathFx = (k: number) => { if (fxRng.next() < 0.6) c.w.fx.shards(e.x + (fxRng.next() - 0.5) * 140, e.y + (fxRng.next() - 0.5) * 180, 6, [PAL.P3, PAL.P4, PAL.C4, PAL.N8], 3); if (k > 0.98) { c.w.dark = false; c.sfx('glass_shatter'); } };
  },
  onHit(e, part, dmg) { if (part?.id === 'chest') e.v.absorb! += dmg; },
  draw(g, e, x, y) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x + 20, y, 120, PAL.P2, 0.35);
    g.globalCompositeOperation = 'source-over';
    drawSprite(g, SPR.golem_torso!, 0, x + 45, y + 12);
    // arms
    for (const id of ['fistU', 'fistL']) {
      const f = P(e, id);
      if (!f.alive) continue;
      const sx = x + 0, sy = y + (id === 'fistU' ? -40 : 40);
      g.fillStyle = PAL.N3; stampLine(g, sx, sy, x + f.ox + 10, y + f.oy, 10);
      g.fillStyle = PAL.P2; stampLine(g, sx, sy, x + f.ox + 10, y + f.oy, 4);
    }
    const ch = P(e, 'chest');
    const glow = Math.min(1, e.v.absorb! / 100);
    if (glow > 0.1) { g.globalCompositeOperation = 'lighter'; drawGlow(g, x + ch.ox, y + ch.oy, 18 + glow * 20, PAL.P3, glow); g.globalCompositeOperation = 'source-over'; }
    drawSprite(g, SPR.golem_chest!, glow > 0.6 && (e.age >> 2) % 2 ? 1 : 0, x + ch.ox, y + ch.oy);
    const head = P(e, 'head');
    if (head.alive) partSprite(g, 'golem_head', e.v.visor ? (e.v.charge ? 2 : 1) : 0, head, x, y);
    for (const id of ['fistU', 'fistL']) {
      const f = P(e, id);
      if (f.alive) partSprite(g, 'golem_fist', f.data!.glow ? 1 : 0, f, x, y);
    }
  },
  *script(e, c) {
    yield* c.moveTo(410, 135, 200, 'outCubic');
    c.bossReady();
    const head = P(e, 'head'), U = P(e, 'fistU'), D = P(e, 'fistL');
    const phase = () => (U.alive && D.alive ? 1 : U.alive || D.alive ? 2 : 3);
    // visor / eye laser
    c.thread((function* () {
      yield 120;
      for (;;) {
        const ph = phase();
        if (ph === 3) { e.v.visor = 1; head.armored = false; return; }
        e.v.visor = 1; head.armored = false;
        const open = ph === 1 ? 120 : 150;
        yield 20;
        e.v.charge = 1;
        const hx = e.x + head.ox, hy = e.y + head.oy;
        if (ph === 1) c.laser(hx, hy, c.aim(hx, hy), { width: 6, tele: 40, dur: 30 });
        else {
          // refracted through the chest crystal
          const cx = e.x - 40, cy = e.y + 6;
          const tele = c.tele(50);
          const h = c.w.addHazard('laser', { width: 5, tele, dur: 40, owner: e, sound: 'laser_fire' });
          if (h) { h.np = 2; h.pts[0] = hx; h.pts[1] = hy; h.pts[2] = cx; h.pts[3] = cy; }
          c.telegraph('line', hx, hy, cx, cy, tele);
          const a0 = c.aim(cx, cy);
          for (const da of [-15, 0, 15]) c.laser(cx, cy, a0 + da, { width: 4, tele, dur: 40, reflect: 2 });
        }
        yield 60;
        e.v.charge = 0;
        yield open - 80;
        if (phase() !== 3) { e.v.visor = 0; head.armored = true; }
        yield ph === 1 ? 180 : 90;
      }
    })());
    // chest refraction (punishes shooting the crystal)
    c.thread((function* () {
      for (;;) {
        if (e.v.absorb! >= 100) {
          e.v.absorb = 0;
          const cx = e.x - 40, cy = e.y + 6;
          for (const a of [160, 180, 200]) c.laser(cx, cy, a, { width: 4, tele: 50, dur: 40, reflect: 2 });
        }
        yield 4;
      }
    })());
    // fists
    let n = 0;
    while (phase() < 3) {
      yield c.iv(phase() === 1 ? 50 : 40);
      n++;
      if (phase() === 1 && n % 3 === 0) { yield* slam(e, c); continue; }
      const f = phase() === 1 ? (n % 2 ? U : D) : U.alive ? U : D;
      if (f.alive) yield* punch(e, c, f, phase() === 2);
    }
    // phase 3: crystal storm
    c.sfx('boss_phase');
    yield* c.moveTo(370, 135, 60, 'inOutSine');
    c.thread((function* () {
      for (;;) {
        yield c.iv(180);
        const x = 60 + c.rnd() * 240;
        const wx = c.w.camX + x, top = c.w.terrain.surfaceUp(wx, c.w.camY + 135) + 22;
        c.spawn('stalactite', x, top - c.w.camY, { anchored: true, wx, wy: top, p: { lead: 999 } });
      }
    })());
    c.thread((function* () {
      for (;;) { yield c.iv(70); c.nway(3, 30, 2.4, { kind: 'needle', ox: head.ox, oy: head.oy }); }
    })());
    for (let k = 0; ; k++) {
      c.ring(c.loop2 ? 20 : 16, 1.4, { start: (k % 2) * 11.25, ox: -40, oy: 6, scalable: false });
      yield c.iv(50);
    }
  },
});

export const _st2b = datan2;

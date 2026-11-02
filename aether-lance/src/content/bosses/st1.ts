// STAGE 1: MB1 GATEKEEPER, B1 WARDEN (docs/06_bosses.md).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy, type Part } from '../../game/entities';
import { dsin, datan2 } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import type { Ctx } from '../../game/script';

export function partSprite(g: CanvasRenderingContext2D, name: string, frame: number, p: Part, x: number, y: number): void {
  const s = SPR[name];
  if (!s) return;
  drawSprite(g, s, frame, x + p.ox, y + p.oy, p.flash > 0);
}

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

// ---- MB1 GATEKEEPER ---------------------------------------------------------------------------------------
defEnemy({
  id: 'gatekeeper', hp: 1, score: 10000, size: 'L', shape: box(10, 10), flags: EF.PERSISTENT, timeLimit: 30 * 60, bossName: 'GATEKEEPER', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    c.part('pT', 0, -87, box(28, 96), 1e9, { armored: true, score: 0 });
    c.part('pB', 0, 87, box(28, 96), 1e9, { armored: true, score: 0 });
    c.part('eT', -16, -50, box(14, 20), 350, { score: 2000 });
    c.part('eB', -16, 50, box(14, 20), 350, { score: 2000 });
    c.part('gate', 0, 0, box(6, 78), 1e9, { armored: true, score: 0 });
    e.o.bw = 50; e.o.bh = 230;
    e.v.offT = 0; e.v.offB = 0; e.v.glow = 0;
  },
  draw(g, e, x, y) {
    const pT = P(e, 'pT'), pB = P(e, 'pB');
    const pil = SPR.gk_pillar!;
    drawSprite(g, pil, 0, x + pT.ox, y + pT.oy);
    drawSprite(g, pil.flipY, 0, x + pB.ox, y + pB.oy);
    for (const id of ['eT', 'eB']) {
      const p = P(e, id);
      if (p.alive) partSprite(g, 'gk_emitter', (e.age >> 3) % 2, p, x, y);
      else { g.fillStyle = PAL.N1; g.fillRect(Math.round(x + p.ox - 6), Math.round(y + p.oy - 8), 10, 16); }
    }
    const gate = P(e, 'gate');
    if (gate.alive) {
      const sh = gate.shape as { h: number };
      const y0 = y + gate.oy - sh.h / 2, y1 = y + gate.oy + sh.h / 2;
      g.globalCompositeOperation = 'lighter';
      const gl = e.v.glow! > 0 ? 1 : 0.5;
      for (let k = -2; k <= 2; k++) {
        g.fillStyle = Math.abs(k) === 2 ? PAL.C1 : Math.abs(k) === 1 ? PAL.C3 : PAL.C5;
        for (let yy = y0; yy < y1; yy += 2) if (fxRng.next() < 0.75 * gl + 0.2) g.fillRect(Math.round(x + k + Math.sin((yy + e.age * 3) * 0.2) * 1.2), Math.round(yy), 1, 2);
      }
      drawGlow(g, x, y + gate.oy, 30, PAL.C3, 0.35 * gl);
      g.globalCompositeOperation = 'source-over';
    }
  },
  *script(e, c) {
    e.flags |= EF.INVULN;
    yield* c.moveTo(380, 135, 90, 'outCubic');
    e.flags &= ~EF.INVULN;
    const upd = () => {
      const pT = P(e, 'pT'), pB = P(e, 'pB'), eT = P(e, 'eT'), eB = P(e, 'eB'), gate = P(e, 'gate');
      pT.oy = -87 + e.v.offT!; eT.oy = -50 + e.v.offT!;
      pB.oy = 87 + e.v.offB!; eB.oy = 50 + e.v.offB!;
      const top = -39 + e.v.offT!, bot = 39 + e.v.offB!;
      gate.oy = (top + bot) / 2;
      (gate.shape as { h: number }).h = bot - top;
    };
    c.thread((function* () {
      for (let i = 0; ; i++) {
        const tAlive = c.partAlive('eT'), bAlive = c.partAlive('eB');
        if (tAlive !== bAlive) {
          const o = 30 * dsin(i * 2);
          if (tAlive) e.v.offT = o; else e.v.offB = o;
        }
        if (e.v.glow! > 0) e.v.glow!--;
        upd();
        yield;
      }
    })());
    c.thread((function* () {
      let which = 0;
      yield 40;
      for (;;) {
        const both = c.partAlive('eT') && c.partAlive('eB');
        const id = both ? (which++ % 2 ? 'eT' : 'eB') : c.partAlive('eT') ? 'eT' : 'eB';
        const p = P(e, id);
        if (p.alive) c.nway(both ? 3 : 5, both ? 24 : 48, 2.0, { ox: p.ox - 6, oy: p.oy });
        yield c.iv(60);
      }
    })());
    c.thread((function* () {
      yield 90;
      for (;;) {
        e.v.glow = c.tele(30);
        yield c.tele(30);
        const gy = c.p.alive ? c.p.y : 135;
        const gate = P(e, 'gate');
        if (gate.alive) {
          c.wall(e.x - 6, 39, 9, 24, 1.4, 180, gy, 2, { sfx: 'enemy_fire_m' });
          if (c.loop2) { yield 30; c.wall(e.x - 6, 39, 9, 24, 1.4, 180, gy, 2, { sfx: null }); }
        }
        yield c.iv(150);
      }
    })());
    while (c.partAlive('eT') || c.partAlive('eB')) yield;
    P(e, 'gate').alive = false;
    yield 20;
    c.w.killEnemy(e);
  },
});

// ---- B1 WARDEN --------------------------------------------------------------------------------------------
const HULL = [box(186, 52, 8, 0), box(110, 72, 14, 0), box(40, 18, -86, 0)];

function* wardenPhase2(e: Enemy, c: Ctx) {
  for (let f = 0; f <= 5; f++) { e.v.shut = f; yield 10; }
  c.sfx('boss_phase');
  const core = P(e, 'core');
  core.armored = false;
  const fastK = () => (core.hp < core.maxHp * 0.3 ? 0.75 : 1);
  if (c.loop2) c.thread((function* () { for (;;) { yield c.iv(90); c.nway(5, 40, 2.4, { kind: 'needle', ox: core.ox, oy: core.oy }); } })());
  while (core.alive) {
    const k = fastK();
    // a. ring burst
    for (let i = 0; i < 3; i++) { c.ring(12, 1.6, { kind: 'orb', start: i * 15, ox: core.ox, oy: core.oy, scalable: true }); yield Math.round(20 * k); }
    yield Math.round(40 * k);
    // b. spiral
    const arms = k < 1 ? 3 : 2;
    let a = 180;
    for (let t = 0; t < 90; t += 4) {
      for (let m = 0; m < arms; m++) c.bullet(e.x + core.ox, e.y + core.oy, a + (m * 360) / arms, 1.8, 'pellet');
      if (t % 8 === 0) c.sfx('enemy_fire_s');
      a += 7;
      yield 4;
    }
    yield Math.round(40 * k);
    // c. ram
    const tele = c.tele(40);
    c.telegraph('band', 0, e.y - 46, 480, e.y + 46, tele);
    e.v.ramGlow = tele;
    yield tele;
    e.v.ram = 1;
    yield* c.moveTo(420, e.y, 30, 'outQuad');
    c.sfx('lancer_dash');
    yield* c.moveTo(220, e.y, 30, 'inQuad');
    c.shake(0.3);
    yield* c.moveTo(330, e.y, 60, 'inOutSine');
    e.v.ram = 0;
    yield Math.round(40 * k);
  }
}

defEnemy({
  id: 'warden', hp: 1, score: 30000, size: 'B', shape: box(10, 10), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN, timeLimit: 120 * 60, bossName: 'WARDEN-CLASS CARRIER', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    c.part('prow', -86, 0, box(26, 14), 250, { score: 3000 });
    c.part('hatchU', -11, -17, box(34, 12), 300, { score: 3000 });
    c.part('hatchL', -11, 19, box(34, 12), 300, { score: 3000 });
    c.part('tur1', 4, -36, box(12, 8), 80, { score: 2000 });
    c.part('tur2', 40, -34, box(12, 8), 80, { score: 2000 });
    c.part('core', 44, 1, circle(10), 1200, { armored: true, score: 0, contact: false });
    e.o.contact = HULL;
    e.o.armorShapes = HULL;
    e.o.bw = 200; e.o.bh = 90;
    e.v.shut = 0; e.v.hatchU = 0; e.v.hatchL = 0;
    P(e, 'core').onDestroy = () => c.killBoss(150);
  },
  draw(g, e, x, y) {
    const hull = SPR.warden_hull!;
    // engine glow
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x + 108, y - 7, 14 + (e.age % 6), PAL.O5, 0.7);
    drawGlow(g, x + 108, y + 11, 14 + ((e.age + 3) % 6), PAL.O5, 0.7);
    g.globalCompositeOperation = 'source-over';
    drawSprite(g, hull, 0, x, y);
    // core + shutter
    const core = P(e, 'core');
    if (core.alive) {
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, x + core.ox, y + core.oy, 18, PAL.T3, 0.5 + 0.2 * Math.sin(e.age * 0.2));
      g.globalCompositeOperation = 'source-over';
      partSprite(g, 'warden_core', (e.age >> 3) % 2, core, x, y);
    }
    drawSprite(g, SPR.warden_shutter!, e.v.shut!, x + core.ox, y + core.oy);
    for (const id of ['hatchU', 'hatchL'] as const) {
      const p = P(e, id);
      partSprite(g, 'warden_hatch', p.alive ? (e.v[id]! > 0 ? 1 : 0) : 2, p, x, y);
    }
    const prow = P(e, 'prow');
    if (prow.alive) partSprite(g, 'warden_prow', e.v.ramGlow! > 0 && (e.age >> 2) % 2 ? 1 : (e.age >> 4) % 2, prow, x, y);
    else { g.fillStyle = PAL.N1; g.fillRect(Math.round(x + prow.ox - 10), Math.round(y - 5), 18, 10); }
    for (const id of ['tur1', 'tur2']) {
      const p = P(e, id);
      if (!p.alive) { g.fillStyle = PAL.N1; g.fillRect(Math.round(x + p.ox - 5), Math.round(y + p.oy), 10, 3); continue; }
      const a = (e.o.ta as number | undefined) ?? 180;
      g.fillStyle = PAL.N6;
      stampLine(g, x + p.ox, y + p.oy, x + p.ox + Math.cos((a * Math.PI) / 180) * 8, y + p.oy + Math.sin((a * Math.PI) / 180) * 8, 2);
      drawSprite(g, SPR.dome!, 0, x + p.ox, y + p.oy + 1, p.flash > 0);
    }
    if (e.v.ramGlow! > 0) e.v.ramGlow!--;
  },
  *script(e, c) {
    yield* c.moveTo(330, 135, 240, 'outCubic');
    c.bossReady();
    let p2 = false;
    const t0 = c.frame;
    // hover
    c.thread((function* () {
      for (let i = 0; ; i++) {
        if (!e.v.ram) e.y = 135 + 30 * dsin(i * 1.2);
        e.o.ta = datan2(c.p.y - (e.y - 35), c.p.x - (e.x + 20));
        yield;
      }
    })());
    // prow gun
    c.thread((function* () {
      yield 50;
      for (;;) {
        if (c.partAlive('prow')) c.nway(3, 24, 2.0, { kind: 'orb', ox: -98, oy: 0 });
        yield c.iv(70);
      }
    })());
    // deck turrets
    c.thread((function* () {
      yield 20;
      for (;;) {
        for (const id of ['tur1', 'tur2']) {
          const p = P(e, id);
          if (p.alive) c.aimed(2.2, { ox: p.ox, oy: p.oy - 3 });
          yield c.iv(50);
        }
      }
    })());
    // hatches
    c.thread((function* () {
      yield 120;
      for (;;) {
        for (const id of ['hatchU', 'hatchL'] as const) {
          const p = P(e, id);
          if (!p.alive || p2) continue;
          e.v[id] = 30;
          for (let i = 0; i < 30; i++) { e.v[id]!--; yield; }
          e.v[id] = 40;
          const n = c.loop2 ? 5 : 3;
          for (let k = 0; k < n; k++) {
            if (!p.alive) break;
            c.spawn('dart', e.x + p.ox - 10, e.y + p.oy, { behavior: 'homing', p: { a0: id === 'hatchU' ? 200 : 160 } });
            yield 10;
          }
          e.v[id] = 0;
          yield 60;
        }
        yield c.iv(120);
      }
    })());
    while (!(!c.partAlive('hatchU') && !c.partAlive('hatchL')) && c.frame - t0 < 50 * 60) yield;
    p2 = true;
    e.v.hatchU = 0; e.v.hatchL = 0;
    yield* wardenPhase2(e, c);
  },
});

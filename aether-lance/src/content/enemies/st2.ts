// Stage 2 enemies: Z13 SHARD MITE, Z14 PRISM EYE, Z15 GEODE, M03 SPINNER, stalactite hazard.
import { defEnemy } from '../../game/registry';
import { EF, box, circle } from '../../game/entities';
import { dcos, dsin } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { SPR } from '../sprites/registry';
import { drawCarrierGlow } from './common';
import { PAL } from '../../render/palette';

defEnemy({
  id: 'shardmite', hp: 2, score: 150, size: 'S', shape: circle(6), explosion: 'crystal',
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'shardmite', e.v.shake ? (e.age >> 1) % 2 : 0, x + (e.v.shake ? ((e.age % 2) * 2 - 1) : 0), y, e.flipY); },
  *script(e, c) {
    e.o.light = 20;
    while (!(c.p.alive && Math.abs(c.p.x - e.x) < 100 && e.x < 470 && e.onScreenAt >= 0)) yield;
    e.v.shake = 1;
    yield 15;
    e.v.shake = 0;
    const a = c.aim();
    // detach from the wall
    e.anchored = false;
    for (;;) { e.x += dcos(a) * 3; e.y += dsin(a) * 3; yield; }
  },
});

defEnemy({
  id: 'prismeye', hp: 10, score: 800, size: 'M', shape: circle(9), explosion: 'crystal',
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'prismeye', e.v.charge ? 1 : 0, x, y, e.flipY); },
  *script(e, c) {
    e.o.light = 36;
    yield 40 + ((e.uid * 23) % 50);
    let first = e.v.first ?? 0;
    for (;;) {
      if (c.can(true)) {
        const tele = first ? 90 : 60;
        first = 0;
        e.v.charge = 1;
        const a = c.aim();
        c.laser(e.x, e.y, a, { width: 4, tele, dur: 40, reflect: 2 });
        yield c.tele(tele) + 40;
        e.v.charge = 0;
      }
      yield c.iv(e.v.rate ?? 180);
    }
  },
});

defEnemy({
  id: 'geode', hp: 15, score: 600, size: 'M', shape: circle(10), explosion: 'crystal', flags: EF.NO_REVENGE,
  init(e) { e.anchored = true; },
  draw(g, e, x, y) {
    const rots = SPR.geode!.rotations(16);
    const s = rots[((Math.round(e.angle / 22.5) % 16) + 16) % 16]!;
    drawSprite(g, s, 0, x, y, e.flash > 0);
  },
  *script(e) {
    e.o.light = 24;
    e.vx = e.v.vx ?? -0.2; e.vy = e.v.vy ?? 0;
    for (;;) { e.angle += 1; yield; }
  },
  onDeath(e, c) {
    if (c.w.suppressFire > 0) return;
    for (let k = 0; k < 6; k++) c.w.spawnBullet(e.x, e.y, k * 60 + 30, 1.6, 'shard', { bounce: 1 });
    c.sfx('crystal_ping');
  },
});

defEnemy({
  id: 'spinner', hp: 220, score: 4000, size: 'M', shape: circle(18), explosion: 'large',
  draw(g, e, x, y) {
    const rots = SPR.spinner!.rotations(32);
    const s = rots[((Math.round(e.angle / 11.25) % 32) + 32) % 32]!;
    if (e.carrier) { g.globalAlpha = 0.5 + 0.4 * Math.sin(e.age * 0.2); drawSprite(g, s, 0, x, y, true); g.globalAlpha = 1; }
    drawSprite(g, s, 0, x, y, e.flash > 0);
  },
  *script(e, c) {
    e.o.light = 50;
    e.noOffscreenKill = true;
    yield* c.moveTo(e.v.tx ?? 380, e.y, 90, 'outCubic');
    c.thread((function* () { for (;;) { e.angle = (e.angle + 1.5) % 360; yield; } })());
    for (let cycle = 0; cycle < 9; cycle++) {
      const beat = c.w.stage.beatBpm ? 1 : 0;
      for (let t = 0; t < 60; t += 6) {
        for (let k = 0; k < 4; k++) {
          const a = e.angle + k * 90;
          c.bullet(e.x + dcos(a) * 18, e.y + dsin(a) * 18, a, 1.6, 'pellet');
        }
        if (t % 12 === 0) c.sfx('enemy_fire_s');
        yield beat ? c.w.framesToBeat(0.25) : 6;
      }
      yield beat ? c.w.framesToBeat(2) : 60;
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(2, e.vx + 0.03); yield; }
  },
});

defEnemy({
  id: 'stalactite', hp: 1, score: 0, size: 'S', shape: box(10, 36), flags: EF.INVULN | EF.NO_REVENGE | EF.NO_SCORE, explosion: 'crystal',
  draw(g, e, x, y) {
    const sh = e.v.shake ? ((e.age % 2) * 2 - 1) : 0;
    drawSprite(g, SPR.stalactite!, 0, x + sh, y);
  },
  *script(e, c) {
    e.anchored = true;
    const lead = e.v.lead ?? 80;
    while (!(c.p.alive && e.x - c.p.x < lead && e.x < 460)) { if (e.x < -20) return; yield; }
    const floor = c.w.terrain.surfaceDown(e.wx, e.wy + 24, 300) - c.w.camY;
    const tele = c.tele(50);
    c.telegraph('shadow', e.x, floor - 1, e.x, floor, tele, 14);
    e.v.shake = 1;
    yield tele;
    e.v.shake = 0;
    let vy = 1;
    for (let i = 0; i < 200; i++) {
      vy = Math.min(4, vy + 0.3);
      e.wy += vy;
      if (c.w.terrain.solid(e.wx, e.wy + 18)) break;
      yield;
    }
    c.w.fx.explosion(e.x, e.y + 16, 'crystal');
    c.sfx('crystal_ping');
    c.shake(0.08);
    if (c.w.diff === 'hard' || c.w.diff === 'ordeal' || c.loop2) for (let k = 0; k < 3; k++) c.w.spawnBullet(e.x, e.y + 10, -60 - k * 30, 1.5, 'shard', { bounce: 0 });
    c.w.removeEnemy(e, false);
  },
});

export const _st2 = PAL;

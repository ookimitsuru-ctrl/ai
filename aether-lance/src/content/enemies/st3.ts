// Stage 3 enemies: Z16 SPORE, Z17 BROOD POD, Z18 TENDRIL, Z19 LEECH, organic carrier.
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dcos, dsin, turnToward } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { SPR } from '../sprites/registry';
import { drawCarrierGlow } from './common';

defEnemy({
  id: 'spore', hp: 1, score: 30, size: 'S', shape: circle(3.5), sprite: 'spore', anim: 6, flags: EF.NO_REVENGE, explosion: 'organic', deathSound: 'organic_pop',
  *script(e, c) {
    let a = e.v.a ?? c.aim();
    const sp = e.v.sp ?? 1.2;
    const life = e.v.life ?? 240;
    for (let i = 0; i < life; i++) {
      if (e.v.home !== 0) a = turnToward(a, c.aim(), 2);
      e.x += dcos(a) * sp; e.y += dsin(a) * sp;
      yield;
    }
    c.w.fx.explosion(e.x, e.y, 'tiny');
    c.w.removeEnemy(e, false);
  },
});

defEnemy({
  id: 'broodpod', hp: 20, score: 1000, size: 'M', shape: box(22, 18), anim: 0, explosion: 'organic',
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'broodpod', e.frame, x, y, e.flipY); },
  *script(e, c) {
    e.o.light = 20;
    const s = e.flipY ? 1 : -1;
    yield 30 + ((e.uid * 17) % 40);
    for (;;) {
      yield c.iv(70);
      if (!c.can()) continue;
      e.frame = 1; yield 20; e.frame = 0;
      const base = c.aim(e.x, e.y + s * 8);
      for (let k = -1; k <= 1; k++) c.spawn('spore', e.x, e.y + s * 8, { p: { a: base + k * 30 } });
      c.sfx('organic_pop');
    }
  },
});

// tendril: the entity sits at its root; segments + tip are parts
const SEG = 8, SEGL = 10;
defEnemy({
  id: 'tendril', hp: 1, score: 1200, size: 'M', shape: box(4, 4), flags: EF.NO_REVENGE, explosion: 'organic',
  init(e, c) {
    for (let i = 0; i < SEG; i++) c.part('s' + i, 0, 0, circle(4.5), 1e9, { armored: true, score: 0 });
    const tip = c.part('tip', 0, 0, circle(6.5), 12, { score: 0 });
    tip.onDestroy = () => c.w.killEnemy(e);
    e.v.len = 1; e.v.aimBias = 0;
  },
  draw(g, e, x, y) {
    for (let i = 0; i < SEG; i++) { const p = e.parts![i]!; drawSprite(g, SPR.tendril_seg!, 0, x + p.ox, y + p.oy); }
    const tip = e.parts![SEG]!;
    if (e.carrier) { g.globalAlpha = 0.6 + 0.4 * Math.sin(e.age * 0.2); drawSprite(g, SPR.tendril_tip!, 0, x + tip.ox, y + tip.oy, true); g.globalAlpha = 1; }
    drawSprite(g, SPR.tendril_tip!, e.v.glow ? 1 : 0, x + tip.ox, y + tip.oy, tip.flash > 0);
  },
  *script(e, c) {
    const ceil = (e.flags & EF.CEILING) !== 0;
    const base = ceil ? 90 : -90;
    const pose = () => {
      let a = base, px = 0, py = 0;
      const L = SEGL * e.v.len!;
      for (let i = 0; i < SEG; i++) {
        a += 12 * dsin(e.age * 2 + i * 35) * (i === 0 ? 0.3 : 1) / 2 + e.v.aimBias! / SEG;
        px += dcos(a) * L; py += dsin(a) * L;
        const p = e.parts![i]!; p.ox = px; p.oy = py;
      }
      const tip = e.parts![SEG]!;
      tip.ox = px + dcos(a) * 6; tip.oy = py + dsin(a) * 6;
    };
    c.thread((function* () { for (;;) { pose(); if (e.v.glow) e.v.glow--; yield; } })());
    c.thread((function* () {
      yield 40;
      for (;;) {
        yield c.iv(80);
        const tip = e.parts![SEG]!;
        if (!tip.alive) return;
        e.v.glow = 8;
        for (let k = 0; k < 2; k++) { c.aimed(1.8, { ox: tip.ox, oy: tip.oy }); yield 10; }
      }
    })());
    for (;;) {
      const tip = e.parts![SEG]!;
      const d = Math.hypot(c.p.x - (e.x + tip.ox), c.p.y - (e.y + tip.oy));
      if (c.p.alive && d < 110 && e.onScreenAt >= 0) {
        // telegraph: curl back
        const tele = c.tele(40);
        const target = c.aim(e.x + tip.ox, e.y + tip.oy);
        let bias = target - base; while (bias > 180) bias -= 360; while (bias < -180) bias += 360;
        bias = Math.max(-70, Math.min(70, bias));
        for (let i = 0; i < tele; i++) { e.v.len = 1 - 0.4 * (i / tele); yield; }
        for (let i = 0; i < 15; i++) { e.v.len = 0.6 + 0.9 * (i / 15); e.v.aimBias = bias * (i / 15); yield; }
        for (let i = 0; i < 30; i++) { e.v.len = 1.5 - 0.5 * (i / 30); e.v.aimBias = bias * (1 - i / 30); yield; }
        e.v.len = 1; e.v.aimBias = 0;
        yield 60;
      }
      yield;
    }
  },
});

defEnemy({
  id: 'leech', hp: 3, score: 250, size: 'S', shape: box(14, 7), sprite: 'leech', anim: 8, explosion: 'organic',
  *script(e) {
    const by = e.y, ph = e.v.phase ?? e.fIndex * 20;
    for (;;) { e.x -= e.v.speed ?? 1.4; e.y = by + 30 * dsin(((e.age + ph) * 360) / 80); yield; }
  },
  onDeath(e, c) {
    if (c.loop2 && c.w.suppressFire <= 0) for (let k = -1; k <= 1; k++) c.w.spawnBullet(e.x, e.y, c.aim(e.x, e.y) + k * 20, 1.5, 'pellet');
  },
});

defEnemy({
  id: 'podorganic', hp: 180, score: 3000, size: 'M', shape: box(46, 22), sprite: 'podorganic', anim: 12, explosion: 'organic',
  *script(e, c) {
    e.noOffscreenKill = true;
    yield* c.moveTo(e.v.tx ?? 390, e.y, 100, 'outCubic');
    for (let k = 0; k < 6; k++) {
      yield c.iv(90);
      if (c.can()) for (let j = 0; j < 3; j++) c.spawn('leech', e.x - 20, e.y + (j - 1) * 12, { p: { phase: j * 20, speed: 1.8 } });
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(1.8, e.vx + 0.03); yield; }
  },
});

export const _st3 = (e: Enemy) => e;

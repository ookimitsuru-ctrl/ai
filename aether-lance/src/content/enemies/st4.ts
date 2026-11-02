// Stage 4 enemies: Z20 GALE RAY, Z21 STORM SPRITE (+ pair controller), Z22 CLOUD DIVER, M04 SENTINEL.
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dsin } from '../../core/dmath';
import { drawCarrierGlow } from './common';
import { PAL } from '../../render/palette';

defEnemy({
  id: 'galeray', hp: 6, score: 400, size: 'S', shape: box(26, 10), sprite: 'galeray', anim: 10,
  *script(e, c) {
    const by = e.y;
    let t = 40 + (e.uid % 30);
    for (;;) {
      e.x -= e.v.speed ?? 1.6;
      e.y += c.w.wind * 2 * 0.5;
      e.y += (by + 12 * dsin(e.age * 3) - (e.y - 0)) * 0.02;
      if (--t <= 0) { t = c.iv(100); c.nway(5, 48, 1.8, { base: e.y < 150 ? 135 : 225 }); }
      yield;
    }
  },
});

defEnemy({
  id: 'stormsprite', hp: 2, score: 200, size: 'S', shape: circle(5), sprite: 'stormsprite', anim: 4,
  *script(e) { for (;;) { e.x += e.vx; e.y += e.vy; yield; } },
});

defEnemy({
  id: 'stormpair', hp: 1, score: 0, size: 'S', shape: box(2, 2), flags: EF.NO_CONTACT | EF.PASS_SHOTS | EF.NO_SCORE | EF.NO_FIRE,
  draw() { /* controller only */ },
  *script(e, c) {
    const dx = e.v.dx ?? 0, dy = e.v.dy ?? 70;
    const vx = -(e.v.speed ?? 1.2);
    const a = c.spawn('stormsprite', e.x - dx / 2, e.y - dy / 2, {});
    const b = c.spawn('stormsprite', e.x + dx / 2, e.y + dy / 2, {});
    if (!a || !b) { c.w.removeEnemy(e, false); return; }
    a.vx = b.vx = vx;
    if (e.carrier) { b.carrier = e.carrier; e.carrier = null; }
    const on = c.loop2 ? 50 : 40;
    const alive = () => a.active && !a.dead && b.active && !b.dead;
    while (alive()) {
      e.x = a.x; e.y = (a.y + b.y) / 2;
      // flicker (telegraph) 20f, on, off
      const h = c.w.addHazard('arc', { tele: 20, dur: on, owner: e, sound: '' });
      for (let i = 0; i < 20 + on && alive(); i++) {
        e.x = a.x;
        if (h) { h.np = 2; h.pts[0] = a.x; h.pts[1] = a.y; h.pts[2] = b.x; h.pts[3] = b.y; h.width = 6; }
        if (i === 20) c.sfx('lightning_warn', a.x);
        yield;
      }
      if (h) h.active = false;
      for (let i = 0; i < 40 && alive(); i++) { e.x = a.x; yield; }
      if (a.x < -40 && b.x < -40) break;
    }
    c.w.removeEnemy(e, false);
  },
});

defEnemy({
  id: 'clouddiver', hp: 4, score: 300, size: 'S', shape: box(16, 22), sprite: 'clouddiver', anim: 6,
  *script(e, c) {
    e.x = e.v.x ?? e.x; e.y = 300;
    const tele = c.tele(50);
    c.telegraph('shadow', e.x, 258, e.x, 258, tele, 20);
    for (let i = 0; i < tele; i++) { if (i % 5 === 0) c.w.fx.p('smoke', e.x + (c.w.frame % 7) - 3, 256, 0, -0.4, 20, 2, PAL.N6, { grow: 0.1 }); yield; }
    let fired = false;
    for (;;) {
      e.y -= 5;
      if (!fired && e.y < 160) {
        fired = true;
        if (c.loop2) { c.nway(3, 30, 1.8, { base: 180 }); c.nway(3, 30, 1.8, { base: 0 }); }
        else { c.aimed(1.8, { base: 180 }); c.aimed(1.8, { base: 0 }); }
      }
      yield;
    }
  },
});

defEnemy({
  id: 'sentinel', hp: 280, score: 5000, size: 'M', shape: box(26, 46), anim: 0, explosion: 'large',
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'sentinel', e.v.charge ? 1 : 0, x, y); },
  *script(e, c) {
    e.noOffscreenKill = true;
    yield* c.moveTo(e.v.tx ?? 410, e.y, 80, 'outCubic');
    for (let cyc = 0; cyc < 6; cyc++) {
      const tele = c.tele(45);
      e.v.charge = 1;
      for (let i = 0; i < tele; i++) {
        if (i < tele - 15 && c.p.alive) e.y += Math.max(-0.8, Math.min(0.8, c.p.y - e.y));
        if (i % 3 === 0) c.telegraph('line', e.x - 18, e.y, 0, e.y, 3, 1, 'O5');
        yield;
      }
      if (c.can()) {
        c.sfx('laser_fire');
        const h = c.w.addHazard('laser', { width: 10, tele: 0, dur: 60, owner: e });
        for (let i = 0; i < 60; i++) { if (h) { h.np = 2; h.pts[0] = e.x - 18; h.pts[1] = e.y; h.pts[2] = -10; h.pts[3] = e.y; } yield; }
      }
      e.v.charge = 0;
      yield c.iv(60);
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(2, e.vx + 0.03); yield; }
  },
});

export const _st4 = (e: Enemy) => e;

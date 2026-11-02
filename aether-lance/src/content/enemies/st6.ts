// Stage 6 enemies (beat-synced): Z27 SERAPH ring, Z28 ECHO, Z29 CANTOR, golden turret.
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dcos, dsin, datan2, turnToward } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { SPR } from '../sprites/registry';
import { drawCarrierGlow } from './common';

defEnemy({
  id: 'seraph', hp: 4, score: 500, size: 'S', shape: circle(7), sprite: 'seraph', anim: 12, flags: EF.PERSISTENT,
  *script() { for (;;) yield 60; },
});

defEnemy({
  id: 'seraphring', hp: 1, score: 0, size: 'S', shape: box(2, 2), flags: EF.NO_CONTACT | EF.PASS_SHOTS | EF.NO_SCORE | EF.PERSISTENT,
  draw(g, e, x, y) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y, 34, PAL.Y3, 0.2 + 0.2 * Math.max(0, 1 - (e.v.pulse ?? 0) / 10));
    g.globalCompositeOperation = 'source-over';
  },
  *script(e, c) {
    const kids: Enemy[] = [];
    const fid = c.w.fseq++;
    c.w.formations.set(fid, { n: 6, killed: 0, lost: 0, bonus: e.carrier, x: 0, y: 0, group: '' });
    e.carrier = null;
    for (let i = 0; i < 6; i++) {
      const k = c.spawn('seraph', e.x, e.y, {});
      if (k) { k.formation = fid; k.fIndex = i; kids.push(k); }
    }
    const by = e.y;
    let rot = 0;
    const tx = e.v.tx ?? 340;
    c.thread((function* () {
      yield c.w.framesToBeat(2);
      for (;;) {
        if (e.x < 470 && kids.some((k) => k.active && !k.dead)) {
          e.v.pulse = 0;
          for (const k of kids) if (k.active && !k.dead) c.bullet(e.x, e.y, datan2(k.y - e.y, k.x - e.x) + 8, 1.6, 'pellet');
          c.sfx('enemy_fire_s');
        }
        yield c.w.framesToBeat(c.loop2 ? 1 : 2);
      }
    })());
    for (let t = 0; ; t++) {
      rot += 1.2;
      if (e.x > tx) e.x -= 1.2; else e.x -= 0.25;
      e.y = by + 30 * dsin(t * 1.5);
      if (e.v.pulse !== undefined) e.v.pulse++;
      let alive = 0;
      kids.forEach((k, i) => {
        if (!k.active || k.dead) return;
        alive++;
        const a = rot + i * 60;
        k.x = e.x + dcos(a) * 40; k.y = e.y + dsin(a) * 40;
      });
      if (!alive || e.x < -60) { for (const k of kids) if (k.active) c.w.removeEnemy(k, false); c.w.removeEnemy(e, false); return; }
      yield;
    }
  },
});

defEnemy({
  id: 'echo', hp: 6, score: 800, size: 'S', shape: box(22, 8, 2, 0), flags: EF.NO_CONTACT | EF.PERSISTENT,
  draw(g, e, x, y) {
    const a = Math.min(1, e.age / 30) * (e.v.fade ?? 1);
    g.globalAlpha = 0.55 * a;
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y, 18, PAL.P3, 0.6);
    g.globalCompositeOperation = 'source-over';
    drawSprite(g, SPR.kestrel!, 2, x, y, true);
    g.globalAlpha = 0.45 * a;
    drawSprite(g, SPR.kestrel!, 2, x - 2, y, e.flash > 0);
    g.globalAlpha = 1;
    if (e.carrier) { g.globalAlpha = 0.5 + 0.4 * Math.sin(e.age * 0.2); g.fillStyle = PAL.G3; g.fillRect(Math.round(x - 12), Math.round(y - 9), 24, 1); g.globalAlpha = 1; }
  },
  *script(e, c) {
    const delay = c.loop2 ? 120 : 180;
    const pos = { x: 0, y: 0 };
    c.thread((function* () {
      yield 40;
      for (;;) { yield c.w.framesToBeat(2); if (e.age > 30 && e.v.fade === undefined) c.aimed(2.4, { kind: 'needle', ox: 12 }); }
    })());
    for (let t = 0; t < 600; t++) {
      c.w.pastPos(delay, pos);
      e.x = pos.x; e.y = pos.y;
      if (t === 30) e.flags &= ~EF.NO_CONTACT;
      yield;
    }
    e.flags |= EF.NO_CONTACT;
    for (let t = 30; t > 0; t--) { e.v.fade = t / 30; yield; }
    c.w.removeEnemy(e, false);
  },
});

defEnemy({
  id: 'cantor', hp: 12, score: 1000, size: 'M', shape: box(20, 30), sprite: 'cantor', anim: 0,
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'cantor', e.v.sing ? 1 : 0, x, y); },
  *script(e, c) {
    e.noOffscreenKill = true;
    yield* c.moveTo(e.v.tx ?? 400, e.y, 60, 'outCubic');
    for (let n = 0; n < 6; n++) {
      yield c.w.framesToBeat(4);
      if (!c.can()) continue;
      e.v.sing = 1;
      const a = c.aim();
      const side = n % 2 ? 1 : -1;
      c.waveArc(a, 30, { ox: -10, gapA: a + side * 14, gapHalf: 7 });
      yield 20;
      e.v.sing = 0;
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(1.6, e.vx + 0.03); yield; }
  },
});

defEnemy({
  id: 'goldturret', hp: 6, score: 300, size: 'S', shape: box(14, 10),
  draw(g, e, x, y) {
    const ax = dcos(e.angle), ay = dsin(e.angle);
    g.fillStyle = PAL.Y3; stampLine(g, x, y + (e.flipY ? 1 : -1), x + ax * 9, y + ay * 9, 2);
    if (e.v.glow) { g.globalCompositeOperation = 'lighter'; drawGlow(g, x + ax * 9, y + ay * 9, 6, PAL.R3, 0.8); g.globalCompositeOperation = 'source-over'; }
    drawCarrierGlow(g, e, 'goldturret', 0, x, y, e.flipY);
  },
  *script(e, c) {
    const ceil = e.flipY;
    e.angle = ceil ? 90 : -90;
    c.thread((function* () {
      for (;;) {
        const a = c.aim();
        e.angle = turnToward(e.angle, ceil ? Math.max(10, Math.min(170, a < -90 ? 170 : a)) : Math.min(-10, Math.max(-170, a > 90 ? -170 : a)), 3);
        if (e.v.glow) e.v.glow--;
        yield;
      }
    })());
    for (;;) {
      yield c.w.framesToBeat(4);
      e.v.glow = 8;
      c.aimed(2.2, { base: e.angle, ox: dcos(e.angle) * 10, oy: dsin(e.angle) * 10 });
    }
  },
});

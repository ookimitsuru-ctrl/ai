// Stage 5 enemies: Z23 PRESS, Z24 BELT GUN, Z25 WELDER, Z26 SCRAP, assembly-line wrapper, molten falls.
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dcos, dsin, turnToward } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { SPR } from '../sprites/registry';
import { drawCarrierGlow } from './common';

// dir: 0 down (from ceiling), 1 up (from floor), 2 left (from right wall), 3 right (from left wall)
const DV: [number, number][] = [[0, 1], [0, -1], [-1, 0], [1, 0]];

defEnemy({
  id: 'press', hp: 1, score: 0, size: 'M', shape: box(48, 18), flags: EF.INVULN | EF.NO_REVENGE | EF.NO_SCORE | EF.PERSISTENT, layer: 0,
  init(e) {
    const d = e.v.dir ?? (e.flipY ? 0 : 1);
    e.v.dir = d;
    if (d >= 2) e.shape = box(18, 48);
    e.anchored = true;
  },
  draw(g, e, x, y) {
    const d = e.v.dir!;
    const [dx, dy] = DV[d]!;
    const ext = e.v.ext ?? 0;
    const bx = x - dx * (ext + 9), by = y - dy * (ext + 9);
    const sh = e.v.shake ? ((e.age % 2) * 2 - 1) : 0;
    g.fillStyle = PAL.N4;
    if (d < 2) g.fillRect(Math.round(x - 6 + sh), Math.round(Math.min(by, y)), 12, Math.round(Math.abs(y - by)));
    else g.fillRect(Math.round(Math.min(bx, x)), Math.round(y - 6 + sh), Math.round(Math.abs(x - bx)), 12);
    g.fillStyle = PAL.N6;
    if (d < 2) g.fillRect(Math.round(x - 2 + sh), Math.round(Math.min(by, y)), 2, Math.round(Math.abs(y - by)));
    else g.fillRect(Math.round(Math.min(bx, x)), Math.round(y - 2 + sh), Math.round(Math.abs(x - bx)), 2);
    const rots = SPR.presshead!.rotations(4);
    const idx = d === 0 ? 0 : d === 1 ? 2 : d === 2 ? 1 : 3;
    drawSprite(g, d === 0 ? SPR.presshead! : rots[idx]!, 0, x + (d < 2 ? sh : 0), y + (d >= 2 ? sh : 0));
  },
  *script(e, c) {
    const d = e.v.dir!;
    const [dx, dy] = DV[d]!;
    const reach = e.v.reach ?? 80;
    const bx = e.wx, by = e.wy;
    const k = c.loop2 ? 0.8 : 1;
    yield (e.v.phase ?? 0);
    for (;;) {
      e.v.ext = 0; e.wx = bx; e.wy = by;
      yield Math.round(60 * k);
      const tele = Math.round(Math.max(15, c.w.cfg.teleMin * 0.5));
      e.v.shake = 1;
      // danger zone telegraph; it travels with the press (which scrolls with the terrain) so it shows where the
      // head will actually land, not where the press was when the warning started
      const tl = c.w.addTele('band', 0, 0, 0, 0, tele + 8);
      const place = () => {
        if (!tl || tl.life <= 0) return;
        const ext = e.v.ext ?? 0, sx = e.x - dx * ext, sy = e.y - dy * ext;
        if (d < 2) { tl.x1 = sx - 24; tl.y1 = sy; tl.x2 = sx + 24; tl.y2 = sy + dy * (reach + 9); }
        else { tl.x1 = sx; tl.y1 = sy - 24; tl.x2 = sx + dx * (reach + 9); tl.y2 = sy + 24; }
      };
      place();
      for (let i = 0; i < tele; i++) { yield; place(); }
      e.v.shake = 0;
      for (let i = 1; i <= 8; i++) { e.v.ext = (reach * i) / 8; e.wx = bx + dx * e.v.ext; e.wy = by + dy * e.v.ext; yield; place(); }
      if (e.x > -20 && e.x < 500 && e.y > -20 && e.y < 290) { c.sfx('press_slam'); c.shake(0.1); c.w.fx.sparks(e.x + dx * 9, e.y + dy * 9, 6, PAL.O5); }
      yield Math.round(30 * k);
      for (let i = 1; i <= 40; i++) { e.v.ext = reach * (1 - i / 40); e.wx = bx + dx * e.v.ext; e.wy = by + dy * e.v.ext; yield; }
    }
  },
});

defEnemy({
  id: 'beltgun', hp: 6, score: 300, size: 'S', shape: box(16, 10),
  draw(g, e, x, y) {
    const ax = dcos(e.angle), ay = dsin(e.angle);
    g.fillStyle = PAL.N5; stampLine(g, x, y, x + ax * 8, y + ay * 8, 2);
    drawCarrierGlow(g, e, 'beltgun', 0, x, y, e.flipY);
  },
  *script(e, c) {
    const ceil = e.flipY;
    e.angle = ceil ? 90 : -90;
    const belt = e.v.belt ?? (ceil ? 0.6 : -0.6);
    let t = 40 + (e.uid % 40);
    for (;;) {
      e.wx += belt;
      const a = c.aim();
      e.angle = turnToward(e.angle, ceil ? Math.max(10, Math.min(170, a < -90 ? 170 : a)) : Math.min(-10, Math.max(-170, a > 90 ? -170 : a)), 3);
      if (--t <= 0) { t = c.iv(90); c.aimed(2.2, { base: e.angle, ox: dcos(e.angle) * 9, oy: dsin(e.angle) * 9 }); }
      yield;
    }
  },
});

defEnemy({
  id: 'welder', hp: 5, score: 400, size: 'S', shape: circle(7), anim: 0,
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'welder', e.v.spark ? (e.age >> 1) % 2 : 0, x, y); },
  *script(e, c) {
    yield* c.moveTo(e.v.tx ?? 400, e.y, 50, 'outQuad');
    for (let cyc = 0; cyc < 5; cyc++) {
      for (let i = 0; i < 140; i++) {
        const dx = c.p.x - e.x, dy = c.p.y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < 60 || !c.p.alive) break;
        e.x += (dx / d) * 1.5; e.y += (dy / d) * 1.5;
        yield;
      }
      if (!c.can(true)) { yield 20; continue; }
      const a = c.aim();
      e.v.spark = 1;
      const tele = Math.max(20, c.w.cfg.teleMin / 2);
      for (let i = 0; i < tele; i++) { if (i % 3 === 0) c.w.fx.sparks(e.x - 6, e.y, 1, PAL.C4, a, 60, 1.5, 6); yield; }
      e.v.spark = 0;
      c.w.addHazard('flame', { x: e.x - 4, y: e.y, angle: a, w: 30, h: 48, tele: 0, dur: 40, owner: e });
      c.sfx('flame');
      yield 40 + 60;
    }
    for (;;) { e.x += 1.5; e.y -= 0.5; yield; }
  },
});

defEnemy({
  id: 'scrap', hp: 8, score: 200, size: 'S', shape: circle(10), flags: EF.NO_REVENGE,
  draw(g, e, x, y) {
    const rots = SPR.scrap!.rotations(16);
    drawSprite(g, rots[((Math.round(e.angle / 22.5) % 16) + 16) % 16]!, 0, x, y, e.flash > 0);
  },
  *script(e, c) {
    e.vx = e.v.vx ?? -2; e.vy = e.v.vy ?? -2;
    const gr = e.v.g ?? 0.12;
    for (let i = 0; i < 400; i++) {
      e.vy += gr;
      e.angle += 7;
      if (i > 6 && c.w.terrain.solid(e.x + e.vx + c.w.camX, e.y + e.vy + c.w.camY)) break;
      if (e.y > 280) { c.w.removeEnemy(e, false); return; }
      yield;
    }
    e.vx = e.vy = 0;
    c.w.fx.explosion(e.x, e.y, 'small');
    c.sfx('explode_s');
    if (c.w.suppressFire <= 0) for (let k = 0; k < 4; k++) c.w.spawnBullet(e.x, e.y - 4, -40 - k * 33, 1.6, 'chip');
    c.w.removeEnemy(e, false);
  },
});

/** Assembly line: enemy is built in the background, then comes alive (docs/05 §6.1 ⑤). */
defEnemy({
  id: 'assembly', hp: 1, score: 0, size: 'S', shape: box(4, 4), flags: EF.BACKGROUND | EF.NO_CONTACT | EF.PASS_SHOTS | EF.NO_SCORE | EF.NO_FIRE,
  draw(g, e, x, y) {
    const k = Math.min(1, e.age / 30);
    const spr = e.v.kind === 1 ? SPR.runner! : SPR.dart!;
    const c = spr.frameCanvas(0);
    const w = Math.max(2, Math.round(spr.w * (0.5 + 0.5 * k))), h = Math.max(2, Math.round(spr.h * (0.5 + 0.5 * k)));
    g.globalAlpha = 0.35 + 0.65 * k;
    g.drawImage(c, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    g.globalAlpha = 0.5 * (1 - k);
    g.fillStyle = '#000'; g.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), w, h);
    g.globalAlpha = 1;
    if (e.age % 6 < 3) { g.fillStyle = PAL.C4; g.fillRect(Math.round(x - w / 2 - 2), Math.round(y), 2, 1); }
  },
  *script(e, c) {
    e.anchored = true;
    yield 30;
    c.w.fx.ring(e.x, e.y, 14, PAL.C4, 10);
    c.w.fx.glow(e.x, e.y, 10, PAL.C4, 10);
    let n: Enemy | null;
    if (e.v.kind === 1) {
      const wy = c.w.terrain.surfaceDown(e.wx, e.wy - 10) - 7;
      n = c.spawn('runner', e.x, wy - c.w.camY, { anchored: true, wx: e.wx, wy });
      if (n) n.flags |= EF.GROUND;
    } else n = c.spawn('dart', e.x, e.y, { behavior: 'straight', p: { speed: 2.2 } });
    if (n) { n.carrier = e.carrier; n.onScreenAt = c.frame; n.entered = true; }
    c.w.removeEnemy(e, false);
  },
});

/** Controller for molten-metal falls: world-anchored columns cycling on/off with a bubbling telegraph. */
defEnemy({
  id: 'moltenfalls', hp: 1, score: 0, size: 'S', shape: box(2, 2), flags: EF.NO_CONTACT | EF.PASS_SHOTS | EF.NO_SCORE | EF.NO_FIRE | EF.PERSISTENT,
  draw(g, e, _x, _y, w) {
    // nozzles
    const n = e.v.n ?? 5;
    for (let i = 0; i < n; i++) {
      const x = Math.round(e.wx + i * (e.v.gap ?? 90) - w.camX);
      if (x < -20 || x > 500) continue;
      g.fillStyle = PAL.N2; g.fillRect(x - 10, Math.round((e.v.top ?? 40) - w.camY) - 6, 20, 8);
      g.fillStyle = PAL.O4; g.fillRect(x - 4, Math.round((e.v.top ?? 40) - w.camY) + 1, 8, 2);
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, x, (e.v.bottom ?? 232) - w.camY, 18, PAL.O4, 0.5);
      g.globalCompositeOperation = 'source-over';
    }
  },
  *script(e, c) {
    e.anchored = true;
    const n = e.v.n ?? 5, gap = e.v.gap ?? 90, top = e.v.top ?? 40, bottom = e.v.bottom ?? 232;
    const tele = Math.max(30, c.loop2 && c.w.diff !== 'easy' ? 30 : c.w.cfg.teleMin);
    const hz: (ReturnType<typeof c.w.addHazard>)[] = [];
    for (let f = 0; ; f++) {
      for (let i = 0; i < n; i++) {
        const ph = (f + i * 37) % 180;
        if (ph === 90 - tele) {
          hz[i] = c.w.addHazard('molten', { tele, dur: 90, owner: e, w: 14, h: bottom - top, y: top - c.w.camY, sound: 'flame' });
        }
        const h = hz[i];
        if (h && h.active) { h.x = e.wx + i * gap - c.w.camX - 7; h.y = top - c.w.camY; }
      }
      if (e.wx + n * gap - c.w.camX < -40) { c.w.removeEnemy(e, false); return; }
      yield;
    }
  },
});

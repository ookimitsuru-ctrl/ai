// Common enemies Z01–Z12 and medium M01–M02 (docs/04_enemies.md §2.1, §2.3).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dcos, dsin, datan2, turnToward } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { stampLine, drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { SPR } from '../sprites/registry';
import type { Ctx } from '../../game/script';
import type { World } from '../../game/world';
import { carrierColor } from '../../render/worldRender';

// ---- helpers ---------------------------------------------------------------------------------------
export function drawCarrierGlow(g: CanvasRenderingContext2D, e: Enemy, sprName: string, fr: number, x: number, y: number, flip = false): void {
  let s = SPR[sprName];
  if (!s) return;
  if (flip) s = s.flipY;
  if (e.carrier) {
    g.globalAlpha = 0.55 + 0.45 * Math.sin(e.age * 0.21);
    const gl = s.glow(carrierColor(e.carrier));
    g.drawImage(gl, (fr % s.frames) * s.w, 0, s.w + 2, s.h + 2, Math.round(x - s.w / 2) - 1, Math.round(y - s.h / 2) - 1, s.w + 2, s.h + 2);
    g.globalAlpha = 1;
  }
  drawSprite(g, s, fr, x, y, e.flash > 0);
}

/** Snap an anchored ground enemy to the surface under/over it. Returns false if no surface nearby. */
function resnap(e: Enemy, w: World, h: number): boolean {
  const t = w.terrain;
  if (e.flags & EF.CEILING) {
    const top = e.wy - h / 2 - 1;
    if (t.solid(e.wx, top)) {
      let k = 0; while (k < 18 && t.solid(e.wx, top + k + 1)) k++;
      if (k >= 18) return false;
      e.wy += k + 1 - 1; return true;
    }
    let k = 0; while (k < 18 && !t.solid(e.wx, top - k)) k++;
    if (k >= 18) return false;
    e.wy -= k; return true;
  }
  const bot = e.wy + h / 2;
  if (t.solid(e.wx, bot - 1)) {
    let k = 0; while (k < 18 && t.solid(e.wx, bot - 1 - k)) k++;
    if (k >= 18) return false;
    e.wy -= k; return true;
  }
  let k = 0; while (k < 18 && !t.solid(e.wx, bot + k)) k++;
  if (k >= 18) return false;
  e.wy += k; return true;
}

// ---- Z01 DART -------------------------------------------------------------------------------------
defEnemy({
  id: 'dart', hp: 1, score: 100, size: 'S', shape: box(14, 8), sprite: 'dart', anim: 10, flags: EF.FRONT_ONLY,
  behaviors: {
    *straight(e, c) {
      const sp = e.v.speed ?? 2.2;
      let fired = false;
      for (;;) { e.x -= sp; if (!fired && c.fires() && e.x < 400) fired = c.aimed(2.0); yield; }
    },
    *sine(e, c) {
      const by = e.y, amp = e.v.amp ?? 24, per = e.v.per ?? 90, sp = e.v.speed ?? 2.0, ph = e.v.phase ?? 0;
      let fired = false;
      for (;;) {
        e.x -= sp;
        e.y = by + amp * dsin((e.age * 360) / per + ph);
        if (!fired && c.fires() && e.x < 400) fired = c.aimed(2.0);
        yield;
      }
    },
    *dive(e, c) {
      let a = 180;
      const sp = e.v.speed ?? 2.4;
      let fired = false;
      for (;;) {
        if (e.x < 330 && c.p.alive) a = turnToward(a, c.aim(), 0.6);
        e.x += dcos(a) * sp; e.y += dsin(a) * sp;
        if (!fired && c.fires() && e.x < 380) fired = c.aimed(2.0);
        yield;
      }
    },
    *ambush(e, c) {
      yield* c.moveTo(e.v.tx ?? 380, e.y, 40, 'outQuad');
      yield 20;
      c.aimed(2.0);
      yield 30;
      const up = e.y > 135 ? 1 : -1;
      for (;;) { e.x -= 1.2; e.y += up * 2.5; yield; }
    },
    *behind(e, c) {
      const sp = e.v.speed ?? 2.6;
      for (;;) { e.x += sp; if (e.x > 470 && c.fires()) { c.aimed(2.0); e.fireMask = 0; } yield; }
    },
    *homing(e, c) {
      // launched from a carrier: leaves the hatch then curves toward the player
      let a = e.v.a0 ?? 180;
      for (let i = 0; ; i++) {
        if (i > 20 && i < 150) a = turnToward(a, c.aim(), 1.6);
        e.x += dcos(a) * 2.3; e.y += dsin(a) * 2.3;
        yield;
      }
    },
  },
});

// ---- Z02 SWIRL --------------------------------------------------------------------------------------
defEnemy({
  id: 'swirl', hp: 1, score: 150, size: 'S', shape: circle(6), sprite: 'swirl', anim: 3, flags: EF.FRONT_ONLY,
  behaviors: {
    *loop(e, c) {
      const dir = e.v.dir ?? (e.y < 135 ? -1 : 1);
      const tx = e.v.tx ?? 320;
      while (e.x > tx) { e.x -= 2.4; yield; }
      const r = 40, cx = e.x, cy = e.y - r * dir;
      for (let a = 90; a < 450; a += 3) {
        e.x = cx + r * dcos(a);
        e.y = cy + r * dsin(a) * dir;
        if (a === 270 && c.fires()) c.aimed(2.0);
        yield;
      }
      const ex = dir > 0 ? -150 : 150;
      for (;;) { e.x += dcos(ex) * 2.4; e.y += dsin(ex) * 2.4; yield; }
    },
  },
});

// ---- Z03 HOPPER -----------------------------------------------------------------------------------------
defEnemy({
  id: 'hopper', hp: 3, score: 200, size: 'S', shape: box(14, 12), sprite: 'hopper', anim: 0,
  *script(e, c) {
    const ceil = (e.flags & EF.CEILING) !== 0;
    const s = ceil ? -1 : 1;
    for (;;) {
      e.frame = 0; yield 12;
      e.frame = 1; yield 8;
      e.frame = 2;
      let vy = -4 * s;
      const vx = (c.p.x < e.x ? -1.2 : 1.2) - (c.w.waiting ? 0 : 0);
      for (let i = 0; i < 120; i++) {
        e.wx += vx; e.wy += vy; vy += 0.15 * s;
        if ((s > 0 && vy > 0) || (s < 0 && vy < 0)) {
          const foot = e.wy + (6 + 1) * s;
          if (c.w.terrain.solid(e.wx, foot)) { resnap(e, c.w, 14); break; }
        }
        yield;
      }
      e.frame = 3;
      if (c.can()) c.nway(3, 40, 1.8, { base: ceil ? 90 : -90, oy: -4 * s });
      yield 8;
    }
  },
});

// ---- Z04 TURRET -------------------------------------------------------------------------------------------
function turretDraw(twin: boolean) {
  return (g: CanvasRenderingContext2D, e: Enemy, x: number, y: number) => {
    const ceil = e.flipY;
    const s = ceil ? -1 : 1;
    const px = x, py = y + 1 * s;
    const ax = dcos(e.angle), ay = dsin(e.angle);
    const glow = (e.v.glow ?? 0) > 0;
    const off = twin ? [-3, 3] : [0];
    for (const o of off) {
      const bx = px + -ay * o, by = py + ax * o;
      g.fillStyle = PAL.N5; stampLine(g, bx, by, bx + ax * 9, by + ay * 9, 2);
      g.fillStyle = glow ? PAL.N8 : PAL.T3; g.fillRect(Math.round(bx + ax * 9) - 1, Math.round(by + ay * 9) - 1, 2, 2);
      if (glow) { g.globalCompositeOperation = 'lighter'; drawGlow(g, bx + ax * 9, by + ay * 9, 6, PAL.R3, 0.8); g.globalCompositeOperation = 'source-over'; }
    }
    drawCarrierGlow(g, e, twin ? 'turret2' : 'turret', 0, x, y, ceil);
  };
}

function* turretScript(e: Enemy, c: Ctx, twin: boolean) {
  const ceil = (e.flags & EF.CEILING) !== 0;
  const wall = (e.flags & EF.WALL) !== 0;
  e.angle = ceil ? 90 : wall ? 180 : -90;
  c.thread((function* () {
    for (;;) {
      const a = c.aim();
      let t = a;
      if (!wall) {
        if (ceil) t = Math.max(10, Math.min(170, a < -90 ? 170 : a));
        else t = Math.min(-10, Math.max(-170, a > 90 ? -170 : a));
      }
      e.angle = turnToward(e.angle, t, 3);
      if (e.v.glow) e.v.glow--;
      yield;
    }
  })());
  yield 30 + ((e.uid * 37) % 40);
  for (;;) {
    yield c.iv(e.v.rate ?? 90) - 12;
    if (!c.can(true)) { yield 10; continue; }
    e.v.glow = 12;
    yield 12;
    const ox = dcos(e.angle) * 10, oy = dsin(e.angle) * 10;
    if (twin) {
      c.aimed(2.2, { base: e.angle, ox: ox - dsin(e.angle) * 3, oy: oy + dcos(e.angle) * 3, force: false });
      yield 8;
      c.aimed(2.2, { base: e.angle, ox: ox + dsin(e.angle) * 3, oy: oy - dcos(e.angle) * 3 });
    } else c.aimed(2.2, { base: e.angle, ox, oy });
  }
}

defEnemy({ id: 'turret', hp: 6, score: 300, size: 'S', shape: box(14, 10), draw: turretDraw(false), script: (e, c) => turretScript(e, c, false) });
defEnemy({ id: 'turret2', hp: 8, score: 400, size: 'S', shape: box(18, 10), draw: turretDraw(true), script: (e, c) => turretScript(e, c, true) });

// ---- Z05 HATCH / Z06 MOTH ------------------------------------------------------------------------------------
defEnemy({
  id: 'hatch', hp: 30, score: 1500, size: 'M', shape: box(30, 12), sprite: 'hatch', anim: 0, flags: EF.ARMORED,
  *script(e, c) {
    const ceil = (e.flags & EF.CEILING) !== 0;
    while (Math.abs(c.p.x - e.x) > 200 || e.x > 470) yield;
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let f = 0; f <= 5; f++) { e.frame = f; yield 4; }
      e.flags &= ~EF.ARMORED;
      for (let k = 0; k < 5; k++) {
        if (c.can()) c.spawn('moth', e.x, e.y + (ceil ? 8 : -8), { p: { up: ceil ? 1 : -1 } });
        yield 24;
      }
      e.flags |= EF.ARMORED;
      for (let f = 5; f >= 0; f--) { e.frame = f; yield 4; }
      yield 60;
    }
  },
});

defEnemy({
  id: 'moth', hp: 1, score: 50, size: 'S', shape: circle(4), sprite: 'moth', anim: 4, flags: EF.NO_REVENGE,
  *script(e, c) {
    let a = (e.v.up ?? -1) < 0 ? -90 : 90;
    for (let i = 0; ; i++) {
      if (i < 120 && i > 6) a = turnToward(a, c.aim(), 2);
      e.x += dcos(a) * 1.8; e.y += dsin(a) * 1.8;
      yield;
    }
  },
});

// ---- Z07 MINE ---------------------------------------------------------------------------------------------------
defEnemy({
  id: 'mine', hp: 4, score: 200, size: 'S', shape: circle(6), sprite: 'mine', anim: 0, flags: EF.NO_REVENGE,
  init(e) { e.anchored = true; },
  *script(e, c) {
    e.vx = e.v.vx ?? -0.15; e.vy = e.v.vy ?? 0;
    for (;;) {
      e.frame = (e.age >> 4) % 2;
      const p = c.p;
      if (p.alive && Math.abs(p.x - e.x) < 56 && Math.abs(p.y - e.y) < 56 && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 < 56 * 56 && e.onScreenAt >= 0) break;
      yield;
    }
    c.sfx('mine_arm');
    for (let i = 0; i < 30; i++) { e.frame = 2 + ((i >> 1) % 2); yield; }
    c.ring(8, 1.5, { start: 22.5, force: false });
    c.w.fx.explosion(e.x, e.y, 'small');
    c.sfx('explode_s');
    c.w.removeEnemy(e, false);
  },
});

// ---- Z08 LANCER --------------------------------------------------------------------------------------------------
defEnemy({
  id: 'lancer', hp: 4, score: 300, size: 'S', shape: box(20, 7), sprite: 'lancer', anim: 0,
  *script(e, c) {
    yield* c.moveTo(e.v.tx ?? 400, e.y, 40, 'outQuad');
    const ty = c.p.alive ? c.p.y : e.y;
    const tele = c.tele(30);
    c.telegraph('line', e.x - 12, ty, 0, ty, tele, 1, 'O5');
    e.frame = 1;
    yield* c.moveTo(e.x, ty, tele, 'inOutSine');
    c.sfx('lancer_dash');
    for (;;) { e.x -= 6; if (e.age % 2 === 0) c.w.fx.p('trail', e.x + 12, e.y, 1, 0, 10, 2, PAL.O5, { add: true }); yield; }
  },
});

// ---- Z09 SHELL ------------------------------------------------------------------------------------------------------
defEnemy({
  id: 'shell', hp: 8, score: 500, size: 'M', shape: box(22, 16), sprite: 'shell', anim: 12, hitSound: 'hit_enemy',
  init(e) { e.armorFront = -1; },
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'shell', (e.age >> 4) % 2, x, y); if (e.armorFront > 0) { /* facing back */ } },
  *script(e, c) {
    yield 30;
    for (;;) {
      for (let i = 0; i < 120; i++) {
        e.x -= 0.8 * (e.armorFront < 0 ? 1 : -0.5);
        if (c.p.alive && c.p.x > e.x + 10 && e.armorFront < 0) e.armorFront = 1;
        else if (c.p.alive && c.p.x < e.x - 10 && e.armorFront > 0) e.armorFront = -1;
        yield;
      }
      const base = e.armorFront < 0 ? c.aim() : c.aim();
      c.nway(3, 30, 1.6, { kind: 'orb', base });
    }
  },
});

// ---- Z10 WEAVER --------------------------------------------------------------------------------------------------------
defEnemy({
  id: 'weaver', hp: 2, score: 200, size: 'S', shape: box(16, 10), sprite: 'weaver', anim: 10,
  *script(e, c) {
    const by = e.y, ph = e.v.phase ?? 0;
    for (;;) {
      e.x -= e.v.speed ?? 1.6;
      e.y = by + 50 * dsin((e.age * 3) + ph);
      if (e.age % c.iv(40) === 0 && c.can()) c.aimed(1.2, { base: e.y < 160 ? 135 : 225, sfx: null });
      yield;
    }
  },
});

// ---- Z11 DEBRIS -----------------------------------------------------------------------------------------------------------
function debrisDef(id: string, hp: number, score: number, r: number, child: string | null) {
  defEnemy({
    id, hp, score, size: r > 10 ? 'M' : 'S', shape: circle(r * 0.8), flags: EF.NO_REVENGE, explosion: r > 10 ? 'medium' : 'small',
    init(e) { e.anchored = true; },
    draw(g, e, x, y) {
      const base = SPR[id]!;
      const rots = base.rotations(16);
      const i = ((Math.round(e.angle / 22.5) % 16) + 16) % 16;
      const s = rots[i]!;
      if (e.carrier) {
        g.globalAlpha = 0.55 + 0.45 * Math.sin(e.age * 0.21);
        g.drawImage(s.glow(carrierColor(e.carrier)), Math.round(x - s.w / 2) - 1, Math.round(y - s.h / 2) - 1);
        g.globalAlpha = 1;
      }
      drawSprite(g, s, 0, x, y, e.flash > 0);
    },
    *script(e) {
      e.vx = e.v.vx ?? -0.25; e.vy = e.v.vy ?? 0;
      const spin = e.v.spin ?? 1.5;
      for (;;) { e.angle += spin; yield; }
    },
    onDeath(e, c) {
      if (!child) return;
      for (const s of [-1, 1]) {
        const a = 180 + 45 * s;
        c.spawn(child, e.x, e.y, { p: { vx: dcos(a) * 1.2 - 0.1, vy: dsin(a) * 1.2, spin: 3 * s } });
      }
    },
  });
}
debrisDef('debrisS', 1, 50, 5, null);
debrisDef('debrisM', 5, 150, 10, 'debrisS');
debrisDef('debrisL', 12, 300, 15, 'debrisM');

// ---- Z12 RUNNER ------------------------------------------------------------------------------------------------------------
defEnemy({
  id: 'runner', hp: 6, score: 400, size: 'S', shape: box(22, 12), sprite: 'runner', anim: 0,
  draw(g, e, x, y) { drawCarrierGlow(g, e, 'runner', (e.age >> 2) % 4, x, y, e.flipY); },
  *script(e, c) {
    const ceil = (e.flags & EF.CEILING) !== 0;
    let t = 40;
    for (;;) {
      const dir = c.p.x < e.x ? -1 : 1;
      const step = e.v.speed ?? 1.0;
      const oldX = e.wx;
      e.wx += dir * step;
      if (!resnap(e, c.w, 14)) e.wx = oldX;
      if (--t <= 0) {
        t = c.iv(100);
        if (c.can()) { c.aimed(2.0, { oy: ceil ? 4 : -4 }); }
        yield 8;
        if (c.can()) c.aimed(2.0, { oy: ceil ? 4 : -4 });
      }
      yield;
    }
  },
});

// ---- M01 BULWARK ----------------------------------------------------------------------------------------------------------------
defEnemy({
  id: 'bulwark', hp: 250, score: 5000, size: 'M', shape: box(60, 30), explosion: 'large',
  init(e, c) {
    c.part('hull', 0, 0, box(62, 28), 250, { score: 0 });
    c.part('t1', -8, -22, box(12, 8), 30, { score: 500 });
    c.part('t2', 14, -22, box(12, 8), 30, { score: 500 });
    c.getPart('hull').onDestroy = () => c.w.killEnemy(e);
    e.o.armorShapes = [];
  },
  draw(g, e, x, y) {
    drawCarrierGlow(g, e, 'bulwark', e.v.glow ? 1 : 0, x, y);
    for (const id of ['t1', 't2']) {
      const p = e.parts!.find((q) => q.id === id)!;
      if (!p.alive) { g.fillStyle = PAL.N1; g.fillRect(Math.round(x + p.ox - 5), Math.round(y + p.oy + 1), 10, 3); continue; }
      const a = datan2(e.o.py as number - (y + p.oy), (e.o.px as number) - (x + p.ox));
      g.fillStyle = PAL.N6; stampLine(g, x + p.ox, y + p.oy, x + p.ox + Math.cos((a * Math.PI) / 180) * 8, y + p.oy + Math.sin((a * Math.PI) / 180) * 8, 2);
      drawSprite(g, SPR.dome!, 0, x + p.ox, y + p.oy + 1, p.flash > 0);
    }
  },
  *script(e, c) {
    e.noOffscreenKill = true;
    yield* c.moveTo(360, e.y, 90, 'outCubic');
    const by = e.y;
    c.thread((function* () {
      for (let i = 0; ; i++) { e.y = by + 10 * dsin(i * 2); e.o.px = c.p.x; e.o.py = c.p.y; yield; }
    })());
    c.thread((function* () {
      yield 30;
      for (;;) {
        for (const id of ['t1', 't2']) {
          const p = e.parts!.find((q) => q.id === id)!;
          if (p.alive && c.can()) c.aimed(2.0, { ox: p.ox, oy: p.oy - 2 });
          yield c.iv(40);
        }
      }
    })());
    for (let t = 0; t < 1200; t += 150) {
      yield c.iv(150) - 20;
      e.v.glow = 1; yield 20; e.v.glow = 0;
      c.nway(5, 60, 1.6, { kind: 'orb', ox: -30, sfx: 'enemy_fire_m' });
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(2, e.vx + 0.03); yield; }
  },
});

// ---- M02 CARRIER POD --------------------------------------------------------------------------------------------------------------
defEnemy({
  id: 'carrierpod', hp: 180, score: 3000, size: 'M', shape: box(46, 22), sprite: 'carrierpod', anim: 12, explosion: 'large',
  *script(e, c) {
    e.noOffscreenKill = true;
    yield* c.moveTo(e.v.tx ?? 390, e.y, 100, 'outCubic');
    for (let k = 0; k < 6; k++) {
      yield c.iv(90);
      if (c.can()) for (let j = 0; j < 3; j++) { c.spawn('dart', e.x - 20, e.y + (j - 1) * 10, { behavior: 'straight', p: { speed: 2.6 } }); }
    }
    e.noOffscreenKill = false;
    for (;;) { e.vx = Math.min(1.8, e.vx + 0.03); yield; }
  },
});

export const _commonLoaded = true;

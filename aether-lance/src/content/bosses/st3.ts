// STAGE 3: MB3 GRUB, B3 MATRIARCH (docs/06_bosses.md).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy } from '../../game/entities';
import { dcos, dsin, datan2 } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { drawGlow } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import { partSprite } from './st1';

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

// ---- MB3 GRUB ----------------------------------------------------------------------------------------------
const HOLES: [number, number][] = [[70, 34], [410, 34], [70, 236], [410, 236]];
const ROUTES: [number, number, number, number][] = [[3, 0, 240, 150], [1, 2, 240, 120], [2, 1, 200, 110], [0, 3, 260, 160]];
const NSEG = 6;

defEnemy({
  id: 'grub', hp: 1, score: 15000, size: 'L', shape: box(6, 6), flags: EF.PERSISTENT | EF.NO_CONTACT, timeLimit: 40 * 60, bossName: 'GRUB', explosion: 'organic',
  init(e, c) {
    e.noOffscreenKill = true;
    const head = c.part('head', 0, 0, circle(13), 900, { armored: true, score: 0 });
    head.onDestroy = () => c.w.killEnemy(e);
    for (let i = 0; i < NSEG; i++) {
      c.part('b' + i, 0, 0, circle(12), 1e9, { armored: true, score: 0 });
      c.part('u' + i, 0, 0, circle(4.5), 60, { score: 1000, contact: false });
    }
    e.x = 240; e.y = 135;
    e.o.trail = [] as number[];
    e.o.bw = 300; e.o.bh = 200;
    e.v.hidden = 1;
  },
  draw(g, e, x, y) {
    for (const [hx, hy] of HOLES) {
      g.fillStyle = PAL.N0;
      g.beginPath(); g.ellipse(hx, hy, 24, 12, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.F0; g.fillRect(hx - 18, hy - 1, 36, 2);
    }
    if (e.v.bulgeIdx! >= 0 && e.v.bulgeT! > 0) {
      const [hx, hy] = HOLES[e.v.bulgeIdx!]!;
      g.fillStyle = PAL.F2;
      g.beginPath(); g.ellipse(hx, hy, 26, 14 + Math.sin(e.age * 0.6) * 2, 0, 0, Math.PI * 2); g.fill();
    }
    if (e.v.hidden) return;
    for (let i = NSEG - 1; i >= 0; i--) {
      const b = P(e, 'b' + i), u = P(e, 'u' + i);
      drawSprite(g, SPR.grub_seg!, u.alive ? (u.flash > 0 ? 1 : 0) : 2, x + b.ox, y + b.oy);
    }
    const h = P(e, 'head');
    const rots = SPR.grub_head!;
    drawSprite(g, rots, h.armored ? 0 : 1, x + h.ox, y + h.oy, h.flash > 0);
  },
  *script(e, c) {
    const head = P(e, 'head');
    const trail = e.o.trail as number[];
    e.v.bulgeIdx = -1;
    const place = () => {
      for (let i = 0; i < NSEG; i++) {
        const k = Math.min(trail.length / 2 - 1, (i + 1) * 9);
        const bx = trail[k * 2] ?? -999, by = trail[k * 2 + 1] ?? -999;
        const b = P(e, 'b' + i), u = P(e, 'u' + i);
        b.ox = bx - e.x; b.oy = by - e.y; u.ox = b.ox; u.oy = b.oy - 7;
      }
    };
    // pustule fire
    c.thread((function* () {
      for (;;) {
        yield c.iv(50);
        if (e.v.hidden) continue;
        for (let i = 0; i < NSEG; i++) {
          const u = P(e, 'u' + i);
          if (!u.alive || u.ox < -900) continue;
          const nx = e.x + u.ox, ny = e.y + u.oy;
          if (nx < 0 || nx > 480 || ny < 0 || ny > 270) continue;
          c.bullet(nx, ny, datan2(ny - 135, nx - 240), 1.5, 'pellet');
        }
        c.sfx('enemy_fire_s');
      }
    })());
    for (let r = 0; ; r++) {
      const [a, b, cx, cy] = ROUTES[r % ROUTES.length]!;
      const [ax, ay] = HOLES[a]!, [bx, by] = HOLES[b]!;
      e.v.bulgeIdx = a; e.v.bulgeT = 60;
      for (let i = 0; i < c.tele(60); i++) {
        if (i % 6 === 0) c.w.fx.smoke(ax, ay, 2, 4);
        yield;
      }
      e.v.bulgeT = 0; e.v.bulgeIdx = -1;
      e.v.hidden = 0;
      trail.length = 0;
      let fired = 0;
      const total = 180 + NSEG * 9;
      for (let t = 0; t <= total; t++) {
        const k = Math.min(1, t / 180);
        const hx = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * cx + k * k * bx;
        const hy = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * cy + k * k * by;
        trail.unshift(hx, hy);
        if (trail.length > 200) trail.length = 200;
        head.ox = hx - e.x; head.oy = hy - e.y;
        const dx = trail.length >= 4 ? hx - trail[2]! : -1, dy = trail.length >= 4 ? hy - trail[3]! : 0;
        const toP = datan2(c.p.y - hy, c.p.x - hx), dir = datan2(dy, dx);
        let dd = toP - dir; while (dd > 180) dd -= 360; while (dd < -180) dd += 360;
        head.armored = !(Math.abs(dd) < 60 && t < 180);
        if (!head.armored && fired < 2 && t % 40 === 20) { fired++; c.nway(5, 40, 1.8, { kind: 'orb', x: hx, y: hy, base: toP }); }
        if (t >= 180) head.ox = -9999;
        place();
        yield;
      }
      e.v.hidden = 1;
      head.armored = true;
      yield 60;
    }
  },
});

// ---- B3 MATRIARCH ------------------------------------------------------------------------------------------
defEnemy({
  id: 'matriarch', hp: 1, score: 70000, size: 'B', shape: box(10, 10), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN, timeLimit: 150 * 60, bossName: 'MATRIARCH', explosion: 'organic',
  init(e, c) {
    e.noOffscreenKill = true;
    const eye = c.part('eye', 0, 0, circle(15), 3000, { armored: true, score: 0, contact: false });
    eye.onDestroy = () => c.killBoss(150);
    for (let k = 0; k < 4; k++) c.part('pet' + k, 0, 0, box(40, 26), 1e9, { armored: true, score: 3000 });
    e.o.contact = [box(96, 128, 0, 0)];
    e.o.armorShapes = [box(96, 48, 0, -40), box(96, 48, 0, 40), box(40, 128, 30, 0)];
    e.o.bw = 130; e.o.bh = 150;
    e.v.pa = 0; e.v.open = 0; e.v.detached = 0; e.v.ocx = 300; e.v.ocy = 135;
    e.o.deathFx = (k: number) => { if (fxRng.next() < 0.5) c.w.fx.drops(e.x + (fxRng.next() - 0.5) * 100, e.y + (fxRng.next() - 0.5) * 120, 10, [PAL.T3, PAL.G3, PAL.F3, PAL.G4]); void k; };
  },
  draw(g, e, x, y) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y, 90, PAL.T2, 0.3 + 0.1 * Math.sin(e.age * 0.08));
    g.globalCompositeOperation = 'source-over';
    const pulse = Math.sin(e.age * (e.v.p3 ? 0.3 : 0.1));
    drawSprite(g, SPR.mat_body!, 0, x + pulse, y);
    const eye = P(e, 'eye');
    if (eye.alive) partSprite(g, 'mat_eye', e.v.open ? (e.v.firing ? 2 : 1) : 0, eye, x, y);
    for (let k = 0; k < 4; k++) {
      const p = P(e, 'pet' + k);
      if (!p.alive) continue;
      const s = SPR.mat_petal!;
      const ang = Math.atan2(p.oy - (e.v.detached ? e.v.ocy! - e.y : 0), p.ox - (e.v.detached ? e.v.ocx! - e.x : 0));
      const rots = s.rotations(16);
      const i = ((Math.round((ang * 180) / Math.PI / 22.5) % 16) + 16) % 16;
      drawSprite(g, rots[i]!, 0, x + p.ox, y + p.oy, p.flash > 0);
    }
  },
  *script(e, c) {
    const eye = P(e, 'eye');
    const pets = [0, 1, 2, 3].map((k) => P(e, 'pet' + k));
    pets.forEach((p, k) => { const a = k * 90; p.ox = 70 * dcos(a); p.oy = 70 * dsin(a) * 0.9; });
    yield* c.moveTo(380, 135, 200, 'outCubic');
    c.bossReady();
    const ratio = () => eye.hp / eye.maxHp;
    // petal motion
    c.thread((function* () {
      for (;;) {
        if (!e.v.detached) {
          e.v.pa = (e.v.pa! + 0.5) % 360;
          pets.forEach((p, k) => { const a = e.v.pa! + k * 90; p.ox = 70 * dcos(a); p.oy = 70 * dsin(a) * 0.9; });
        } else {
          e.v.pa = (e.v.pa! + 0.7) % 360;
          pets.forEach((p, k) => {
            const a = e.v.pa! + k * 90;
            const tx = e.v.ocx! + 110 * dcos(a) - e.x, ty = e.v.ocy! + 110 * dsin(a) * 0.95 - e.y;
            p.ox += (tx - p.ox) * 0.05; p.oy += (ty - p.oy) * 0.05;
          });
        }
        yield;
      }
    })());
    // eye open/close + fan
    c.thread((function* () {
      for (;;) {
        const p2 = e.v.detached ? 1 : 0;
        e.v.open = 1; eye.armored = false;
        e.v.firing = 1;
        for (let w = 0; w < 3; w++) { c.nway(7, 72, 1.8, { kind: 'orb', ox: eye.ox - 10 }); yield 15; }
        e.v.firing = 0;
        yield (p2 ? 120 : 90) - 45;
        if (!e.v.p3) { e.v.open = 0; eye.armored = true; }
        yield p2 ? 90 : 150;
      }
    })());
    // spawn leeches & spores (P1)
    c.thread((function* () {
      yield 100;
      while (!e.v.detached) {
        for (const p of pets) for (let j = 0; j < (c.loop2 ? 3 : 2); j++) if (c.can()) c.spawn('leech', e.x + p.ox, e.y + p.oy + j * 8, { p: { speed: 1.6, phase: j * 20 } });
        yield c.iv(150);
        for (let k = 0; k < 6; k++) c.spawn('spore', e.x - 40, e.y + (k - 2.5) * 16, { p: { a: 180 + (k - 2.5) * 20 } });
        yield c.iv(150);
      }
    })());
    while (ratio() > 0.6) yield;
    // P2: petals detach and orbit
    c.sfx('boss_phase');
    e.v.detached = 1;
    pets.forEach((p) => { p.armored = false; p.hp = p.maxHp = 200; });
    c.thread((function* () {
      for (let i = 0; ; i++) {
        yield c.iv(30);
        const p = pets[i % 4]!;
        if (p.alive) c.spawn('spore', e.x + p.ox, e.y + p.oy, { p: { sp: 1.3 } });
      }
    })());
    c.thread((function* () {
      for (;;) { yield c.iv(100); c.aimed(1.4, { kind: 'globeSplit', ox: -30, sfx: 'enemy_fire_m' }); }
    })());
    while (ratio() > 0.25) yield;
    // P3: spiral + tentacles
    c.sfx('boss_phase');
    e.v.p3 = 1; e.v.open = 1; eye.armored = false;
    c.thread((function* () {
      for (;;) {
        yield c.iv(150);
        const x = Math.max(30, Math.min(330, c.p.alive ? c.p.x : 200));
        const fromTop = c.rnd() < 0.5;
        const tele = c.tele(45);
        c.telegraph('vband', x, 0, x, 270, tele, 24, 'O5');
        yield tele;
        c.w.addHazard('column', { x: x - 12, y: fromTop ? 0 : 270 - 140, w: 24, h: 140, tele: 0, dur: 40, color: 1, owner: e });
        c.sfx('organic_pop');
        c.shake(0.15);
      }
    })());
    const arms = c.loop2 ? 4 : 3;
    for (;;) {
      let a = c.rnd() * 360;
      for (let t = 0; t < 120; t += 6) {
        for (let m = 0; m < arms; m++) c.bullet(e.x - 10, e.y, a + (m * 360) / arms, 1.3, 'pellet');
        if (t % 12 === 0) c.sfx('enemy_fire_s');
        a += 5;
        yield 6;
      }
      yield 60;
    }
  },
});

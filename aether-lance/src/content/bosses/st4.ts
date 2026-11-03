// STAGE 4: MB4 STORMCALLER, B4 TEMPEST LEVIATHAN (docs/06_bosses.md).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy, type Part } from '../../game/entities';
import { dcos, dsin, datan2, turnToward } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { drawGlow, stampLine, lightningPts } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import { partSprite } from './st1';
import type { Ctx } from '../../game/script';

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

// ---- MB4 STORMCALLER ------------------------------------------------------------------------------------
defEnemy({
  id: 'stormcaller', hp: 1, score: 18000, size: 'L', shape: box(6, 6), flags: EF.PERSISTENT, timeLimit: 40 * 60, bossName: 'STORMCALLER', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    const core = c.part('core', 0, 0, box(28, 54), 1000, { score: 0 });
    core.onDestroy = () => c.w.killEnemy(e);
    for (let k = 0; k < 4; k++) c.part('rod' + k, 0, 0, box(10, 28), 150, { score: 2000 });
    e.o.bw = 120; e.o.bh = 120;
    e.v.ra = 0;
  },
  draw(g, e, x, y) {
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y, 50, PAL.C3, 0.35 + 0.15 * Math.sin(e.age * 0.3));
    g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 4; k++) { const p = P(e, 'rod' + k); if (p.alive) partSprite(g, 'callerrod', 0, p, x, y); }
    const core = P(e, 'core');
    if (core.alive) partSprite(g, 'callercore', e.v.charge ? 1 : (e.age >> 3) % 2, core, x, y);
  },
  *script(e, c) {
    e.flags |= EF.INVULN;
    const rods = [0, 1, 2, 3].map((k) => P(e, 'rod' + k));
    c.thread((function* () {
      for (;;) {
        e.v.ra = (e.v.ra! + 0.5) % 360;
        rods.forEach((p, k) => { const a = e.v.ra! + k * 90; p.ox = 50 * dcos(a); p.oy = 50 * dsin(a); });
        yield;
      }
    })());
    yield* c.moveTo(370, 135, 90, 'outCubic');
    e.flags &= ~EF.INVULN;
    // lightning calls
    c.thread((function* () {
      yield 60;
      const offs = [0, -40, 40, -80];
      for (;;) {
        const alive = rods.filter((r) => r.alive).length;
        if (alive > 0 && c.p.alive) {
          const px = c.p.x;
          for (let i = 0; i < alive; i++) c.w.lightning(Math.max(10, Math.min(470, px + offs[i]!)), c.tele(50));
          e.v.charge = 50;
        }
        yield c.iv(120);
        if (e.v.charge) e.v.charge = 0;
      }
    })());
    // electric fence between adjacent rods
    c.thread((function* () {
      yield 90;
      for (;;) {
        const hs: { h: ReturnType<typeof c.w.addHazard>; a: Part; b: Part }[] = [];
        for (let k = 0; k < 4; k++) {
          const a = rods[k]!, b = rods[(k + 1) % 4]!;
          if (a.alive && b.alive) hs.push({ h: c.w.addHazard('arc', { tele: 20, dur: 40, owner: e, width: 5 }), a, b });
        }
        for (let i = 0; i < 60; i++) {
          for (const { h, a, b } of hs) {
            if (!h) continue;
            if (!a.alive || !b.alive) { h.active = false; continue; }
            h.np = 2; h.pts[0] = e.x + a.ox; h.pts[1] = e.y + a.oy; h.pts[2] = e.x + b.ox; h.pts[3] = e.y + b.oy;
          }
          yield;
        }
        yield 60;
      }
    })());
    // wind
    c.thread((function* () {
      let s = 1;
      for (;;) { c.w.windFrom = c.w.wind; c.w.windTarget = 0.4 * s; c.w.windRamp = 0; c.w.windRampLen = 40; c.w.windWarn = 50; c.w.windDir = s; s = -s; yield 240; }
    })());
    // ring / needles
    for (;;) {
      yield c.iv(140);
      if (rods.some((r) => r.alive)) c.ring(16, 1.4, { kind: 'orb', start: c.rnd() * 22.5, gapAt: c.aim() + 180, gapN: 1 });
      else { c.nway(5, 48, 2.6, { kind: 'needle' }); yield 70; c.nway(5, 48, 2.6, { kind: 'needle' }); }
    }
  },
  onDeath(_e, c) { c.w.windTarget = 0; c.w.windFrom = c.w.wind; c.w.windRamp = 0; c.w.windRampLen = 60; c.w.windWarn = 0; },
});

// ---- B4 TEMPEST LEVIATHAN ------------------------------------------------------------------------------------
const NS = 12;
const SPACING = 13;

function segs(e: Enemy): Part[] { return e.parts!.filter((p) => p.id.startsWith('s')); }

function* swim(e: Enemy, c: Ctx, pts: [number, number][], speed = 2.6) {
  const head = P(e, 'head');
  for (const [tx, ty] of pts) {
    for (let guard = 0; guard < 600; guard++) {
      const hx = e.x + head.ox, hy = e.y + head.oy;
      const want = datan2(ty - hy, tx - hx);
      e.v.dir = turnToward(e.v.dir!, want, 3.2);
      head.ox += dcos(e.v.dir!) * speed; head.oy += dsin(e.v.dir!) * speed;
      if ((tx - hx) ** 2 + (ty - hy) ** 2 < 24 * 24) break;
      yield;
    }
  }
}

defEnemy({
  id: 'leviathan', hp: 1, score: 90000, size: 'B', shape: box(6, 6), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN | EF.NO_CONTACT, timeLimit: 180 * 60, bossName: 'TEMPEST LEVIATHAN', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    e.x = 240; e.y = 135;
    const head = c.part('head', 330, -75, box(70, 42), 3600, { score: 0 });
    head.onDestroy = () => c.killBoss(160);
    for (let i = 0; i < NS; i++) c.part('s' + i, 400, -75, circle(12), 60, { score: 1500, data: { solidDead: 1 } });
    c.part('tail', 400, -75, box(34, 30), 1e9, { armored: true, score: 0 });
    e.o.trail = [] as number[];
    e.v.dir = 180; e.v.mouth = 0;
    e.o.bw = 400; e.o.bh = 220;
    e.o.deathFx = (k: number) => {
      const i = Math.floor(k * (NS + 2));
      const ss = segs(e);
      const p = ss[NS - 1 - Math.min(NS - 1, i)];
      if (p && (c.w.frame % 8 === 0)) { c.w.fx.explosion(e.x + p.ox, e.y + p.oy, 'medium'); c.sfx('explode_m', e.x + p.ox); }
      const head = P(e, 'head');
      if (k > 0.7) head.oy += 1.5;
      if (k > 0.97 && c.w.frame % 4 === 0) { c.flash(0.6, '#fffbe0'); c.sfx('thunder'); }
    };
  },
  draw(g, e, x, y) {
    const head = P(e, 'head');
    const ss = segs(e);
    const tail = P(e, 'tail');
    const elec = e.v.elec ? 1 : 0;
    drawSprite(g, SPR.lev_tail!.rotations(16)[((Math.round((e.o.tailA as number ?? 0) / 22.5) % 16) + 16) % 16]!, 0, x + tail.ox, y + tail.oy);
    for (let i = NS - 1; i >= 0; i--) {
      const p = ss[i]!;
      drawSprite(g, SPR.lev_seg!, p.alive ? (e.v.wave === i ? 1 : 0) : 2, x + p.ox, y + p.oy, p.flash > 0);
    }
    if (elec) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = PAL.C4;
      for (let i = 0; i + 1 < NS; i++) {
        const a = ss[i]!, b = ss[i + 1]!;
        const pts = lightningPts(x + a.ox, y + a.oy, x + b.ox, y + b.oy, 3, 5, () => fxRng.next());
        for (let k = 0; k + 3 < pts.length; k += 2) stampLine(g, pts[k]!, pts[k + 1]!, pts[k + 2]!, pts[k + 3]!, 1);
      }
      g.globalCompositeOperation = 'source-over';
    }
    const rot = SPR.lev_head!;
    const hd = e.v.dir!;
    const facingRight = Math.abs(((hd % 360) + 360) % 360 - 0) < 90 || ((hd % 360) + 360) % 360 > 270;
    const s = facingRight ? rot.flipX : rot;
    drawSprite(g, s, e.v.mouth ? 1 : 0, x + head.ox, y + head.oy, head.flash > 0);
    if (e.v.mouth) { g.globalCompositeOperation = 'lighter'; drawGlow(g, x + head.ox + (facingRight ? 30 : -30), y + head.oy + 1, 16, PAL.Y3, 0.7); g.globalCompositeOperation = 'source-over'; }
  },
  *script(e, c) {
    const head = P(e, 'head');
    const ss = segs(e);
    const tail = P(e, 'tail');
    const trail = e.o.trail as number[];
    // body follows the head's path
    c.thread((function* () {
      for (;;) {
        trail.unshift(head.ox, head.oy);
        if (trail.length > (NS + 3) * SPACING * 2) trail.length = (NS + 3) * SPACING * 2;
        for (let i = 0; i < NS; i++) {
          const k = Math.min(trail.length / 2 - 1, (i + 1) * SPACING + 3);
          ss[i]!.ox = trail[k * 2]!; ss[i]!.oy = trail[k * 2 + 1]!;
        }
        const k = Math.min(trail.length / 2 - 1, (NS + 1) * SPACING + 6);
        const k2 = Math.max(0, k - 4);
        tail.ox = trail[k * 2]!; tail.oy = trail[k * 2 + 1]!;
        e.o.tailA = datan2(trail[k2 * 2 + 1]! - tail.oy, trail[k2 * 2]! - tail.ox) + 180;
        head.dmgMul = e.v.mouth ? 1.5 : 0.5;
        const r = e.v.elec ? 18 : 12;
        for (const s of ss) (s.shape as { r: number }).r = r;
        yield;
      }
    })());
    // entrance: swim in along the top
    e.v.dir = 180;
    yield* swim(e, c, [[300 - 240, 70 - 135]], 2.4);
    e.flags &= ~EF.INVULN;
    c.bossReady();
    const segsAlive = () => ss.filter((s) => s.alive).length;
    const ratio = () => head.hp / head.maxHp;
    // turret wave + mouth
    c.thread((function* () {
      for (let n = 0; ; n++) {
        yield c.iv(120);
        if (e.v.coil) continue;
        for (let i = 0; i < NS; i++) {
          const s = ss[i]!;
          e.v.wave = i;
          if (s.alive) c.aimed(1.8, { ox: s.ox, oy: s.oy - 6, sfx: i % 3 ? null : 'enemy_fire_s' });
          yield 6;
        }
        e.v.wave = -1;
        if (n % 2 === 1 && !e.v.breath) {
          e.v.mouth = 1;
          const hx = e.x + head.ox, hy = e.y + head.oy;
          c.nway(5, 40, 2.4, { kind: 'needle', x: hx, y: hy });
          yield 90;
          e.v.mouth = 0;
        }
      }
    })());
    const R = (x: number, y: number): [number, number] => [x - 240, y - 135];
    for (let loop = 0; ; loop++) {
      const p2 = segsAlive() <= 6 || ratio() < 0.6;
      const p3 = ratio() < 0.25;
      if (!p2) {
        yield* swim(e, c, [R(80, 70), R(70, 200), R(560, 210)]);
        c.w.behindWarning(80);
        yield 60;
        head.ox = -320 - 240; head.oy = 80 - 135; e.v.dir = 0; trail.length = 0;
        yield* swim(e, c, [R(400, 80), R(410, 200), R(-120, 200)]);
        head.ox = 600 - 240; head.oy = 70 - 135; e.v.dir = 180; trail.length = 0;
        continue;
      }
      if (p3) {
        // electrified coil
        c.sfx('boss_phase');
        e.v.elec = 1; e.v.coil = 1;
        yield* swim(e, c, [R(240, -65)]);
        let ang = -90, rad = 200;
        for (let t = 0; t < 300; t++) {
          if (t < 240) rad = 200 - 80 * (t / 240);
          ang += 1.4;
          const tx = 240 + dcos(ang) * rad, ty = 135 + dsin(ang) * rad;
          e.v.dir = ang + 90;
          head.ox = tx - 240; head.oy = ty - 135;
          if (t % 30 === 0 && t > 40) c.nway(3, 30, 2.0, { kind: 'pellet', x: tx, y: ty, base: datan2(135 - ty, 240 - tx) });
          if (t % 60 === 30) for (const s of ss) if (s.alive) c.bullet(e.x + s.ox, e.y + s.oy, datan2(-s.oy, -s.ox), 1.4, 'pellet');
          yield;
        }
        e.v.coil = 0;
        yield* swim(e, c, [R(560, 40)], 3.2);
        e.v.elec = 0;
      }
      // dive + storm breath
      yield* swim(e, c, [R(300, 340)], 3);
      for (let k = 0; k < 3; k++) { if (c.p.alive) c.w.lightning(Math.max(10, Math.min(470, c.p.x + (k - 1) * 60)), c.tele(50)); yield 25; }
      head.ox = 440 - 240; head.oy = 330 - 135; e.v.dir = -100; trail.length = 0;
      yield* swim(e, c, [R(380, 180)], 3);
      e.v.mouth = 1; e.v.breath = 1;
      const hx = () => e.x + head.ox - 30, hy = () => e.y + head.oy;
      const base = c.aim(hx(), hy());
      const streams = c.loop2 ? 11 : 9;
      for (let t = 0; t < 60; t += 4) {
        const sweep = base - 10 + (20 * t) / 60;
        for (let k = 0; k < streams; k++) c.bullet(hx(), hy(), sweep - 30 + (60 * k) / (streams - 1), 2.4, 'needle');
        if (t % 8 === 0) c.sfx('enemy_fire_m');
        yield 4;
      }
      e.v.mouth = 0; e.v.breath = 0;
      yield* swim(e, c, [R(240, 60), R(-140, 60)], 3);
      head.ox = 600 - 240; head.oy = 80 - 135; e.v.dir = 180; trail.length = 0;
      yield* swim(e, c, [R(320, 80)], 2.6);
      void p3;
    }
  },
});

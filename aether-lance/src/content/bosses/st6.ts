// STAGE 6: MB6 ANTIPHON, B6 THE CHOIR (docs/06_bosses.md). Everything here is synced to the beat (24f).
import { defEnemy } from '../../game/registry';
import { EF, box, circle, type Enemy, type Part } from '../../game/entities';
import { dcos, dsin, datan2 } from '../../core/dmath';
import { drawSprite } from '../../render/sprite';
import { drawGlow, drawRing, stampLine } from '../../render/draw';
import { PAL } from '../../render/palette';
import { fxRng } from '../../core/rng';
import { SPR } from '../sprites/registry';
import { partSprite } from './st1';
import { parseSong } from '../../audio/sequencer';
import { final2 } from '../music/songs3';
import type { Ctx } from '../../game/script';

const P = (e: Enemy, id: string) => e.parts!.find((p) => p.id === id)!;

// ---- MB6 ANTIPHON -------------------------------------------------------------------------------------
defEnemy({
  id: 'antiphon', hp: 1, score: 25000, size: 'L', shape: box(6, 6), flags: EF.PERSISTENT | EF.NO_CONTACT, timeLimit: 45 * 60, bossName: 'ANTIPHON', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    c.part('A', 0, -70, circle(18), 900, { score: 4000 });
    c.part('B', 0, 70, circle(18), 900, { score: 4000 });
    e.o.bw = 80; e.o.bh = 200;
    e.v.rev = 0;
  },
  draw(g, e, x, y) {
    for (const id of ['A', 'B']) {
      const p = P(e, id);
      if (p.alive) {
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, x + p.ox, y + p.oy, 30, id === 'A' ? PAL.Y3 : PAL.C3, 0.35);
        g.globalCompositeOperation = 'source-over';
        partSprite(g, 'antiphon', id === 'A' ? 1 : 0, p, x, y);
      } else if (e.v.rev! > 0) {
        g.fillStyle = PAL.N3; g.fillRect(Math.round(x + p.ox - 10), Math.round(y + p.oy - 10), 20, 20);
        const k = e.v.rev! / 300;
        drawRing(g, x + p.ox, y + p.oy, 10 + k * 20, (e.age >> 2) % 2 ? PAL.O5 : PAL.N8, 2);
      }
    }
  },
  *script(e, c) {
    e.flags |= EF.INVULN;
    yield* c.moveTo(370, 135, 80, 'outCubic');
    e.flags &= ~EF.INVULN;
    const A = P(e, 'A'), B = P(e, 'B');
    let swap = 1;
    // motion + revive countdown
    c.thread((function* () {
      for (let t = 0; ; t++) {
        e.x = 370 + 20 * dsin(t * 1.3);
        if (!e.v.crossing) { A.oy = -70 * swap; B.oy = 70 * swap; }
        if (A.alive !== B.alive) {
          if (e.v.rev === 0) e.v.rev = 300;
          e.v.rev!--;
          if (e.v.rev! <= 0) {
            const dead = A.alive ? B : A;
            dead.alive = true; dead.hp = dead.maxHp / 2;
            c.sfx('boss_phase'); c.flash(0.2);
            e.v.rev = 0;
          }
        } else e.v.rev = 0;
        yield;
      }
    })());
    yield c.w.framesToBeat(4);
    let beat = 0, ringRot = 0;
    while (A.alive || B.alive) {
      const b = beat % 4;
      if ((b === 0 || b === 2) && A.alive) { c.ring(8, 1.6, { start: ringRot, ox: A.ox, oy: A.oy, force: false }); ringRot += 22.5; }
      if ((b === 1 || b === 3) && B.alive) c.nway(3, 30, 2.2, { kind: 'needle', ox: B.ox, oy: B.oy });
      beat++;
      if (beat % 8 === 7) {
        // telegraph the crossing one beat ahead
        c.telegraph('line', e.x + A.ox, e.y + A.oy, e.x + A.ox, e.y - A.oy, 24, 1, 'O5');
      }
      if (beat % 8 === 0) {
        e.v.crossing = 1;
        const a0 = A.oy, b0 = B.oy;
        for (let i = 1; i <= 24; i++) { A.oy = a0 + (-2 * a0) * (i / 24); B.oy = b0 + (-2 * b0) * (i / 24); yield; }
        swap = -swap;
        e.v.crossing = 0;
        yield c.w.framesToBeat(1);
        continue;
      }
      yield c.w.framesToBeat(1);
    }
    c.w.killEnemy(e);
  },
});

// ---- B6 THE CHOIR -----------------------------------------------------------------------------------------
const melody = (() => {
  const s = parseSong(final2);
  const tr = s.tracks.find((t) => t.name === 'lead')!.data;
  const ev = tr.events.map((n) => ({ tick: n.tick, midi: n.midi }));
  const center = ev.reduce((a, n) => a + n.midi, 0) / Math.max(1, ev.length);
  return { ev, total: s.total, loop: s.loop, center };
})();

function songTickAt(c: Ctx): number {
  const t = (c.w.frame - c.w.musicStartFrame) * 2;
  const { total, loop } = melody;
  if (t < total || loop < 0) return t;
  return loop + ((t - total) % (total - loop));
}

defEnemy({
  id: 'choir', hp: 1, score: 200000, size: 'B', shape: box(6, 6), flags: EF.PERSISTENT | EF.BOSS | EF.INVULN, timeLimit: 0, bossName: 'THE CHOIR', explosion: 'large',
  init(e, c) {
    e.noOffscreenKill = true;
    c.part('core', 0, 0, circle(20), 1600, { armored: true, score: 50000 });
    for (let i = 0; i < 8; i++) c.part('o' + i, 0, 0, circle(7), 80, { score: 1500 });
    for (let i = 0; i < 4; i++) c.part('n' + i, 0, 0, circle(8), 120, { armored: true, score: 2000 });
    e.v.form = 1; e.v.ra = 0; e.v.rb = 0;
    e.o.bw = 120; e.o.bh = 160;
    e.o.deathFx = (k: number) => {
      c.w.flash(Math.min(0.9, k * 0.9), '#ffffff', 0.01);
      if (fxRng.next() < 0.4) c.w.fx.ring(e.x, e.y, 40 + k * 200, PAL.Y4, 30, 2);
      if (k > 0.5 && !e.v.resolved) { e.v.resolved = 1; c.w.music({ cmd: 'play', id: 'resolve' }); }
      c.p.autoDrive = false;
    };
  },
  draw(g, e, x, y) {
    const form = e.v.form!;
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, x, y, form === 3 ? 30 : 110, form === 3 ? PAL.R2 : PAL.Y3, form === 3 ? 0.4 : 0.25 + 0.15 * Math.sin(e.age * 0.26));
    g.globalCompositeOperation = 'source-over';
    if (form === 1 || e.v.trans) {
      // halo rings
      for (const [r, col] of [[90, PAL.Y2], [50, PAL.N6]] as const) drawRing(g, x, y, r, col, 1);
      for (const p of e.parts!) if (p.id[0] === 'o' || p.id[0] === 'n') { if (p.alive) partSprite(g, 'choir_node', p.armored ? 0 : 1, p, x, y); }
      const core = P(e, 'core');
      if (core.alive || e.v.trans) partSprite(g, 'choir_core', core.armored ? 0 : 1, core, x, y);
      if (e.v.trans) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = PAL.Y4; g.globalAlpha = Math.min(1, e.v.trans / 60);
        g.fillRect(Math.round(x - 6), 0, 12, 270);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    } else if (form === 2) {
      const open = e.v.wingsOpen ? 1 : 0;
      for (const id of ['wU', 'wL']) {
        const w = e.parts!.find((p) => p.id === id);
        if (!w) continue;
        const s = id === 'wU' ? SPR.cantor_wing! : SPR.cantor_wing!.flipY;
        if (w.alive) drawSprite(g, s, open, x + w.ox, y + w.oy, w.flash > 0);
      }
      const body = P(e, 'body');
      drawSprite(g, SPR.cantor_body!, e.v.sing ? 1 : 0, x + body.ox, y + body.oy, body.flash > 0);
    } else if (form === 3) {
      const core = P(e, 'sil');
      if (core.alive) {
        // trail
        g.fillStyle = PAL.R3;
        if (e.v.dash) stampLine(g, x + core.ox - (e.v.dx ?? 0) * 6, y + core.oy - (e.v.dy ?? 0) * 6, x + core.ox, y + core.oy, 3);
        partSprite(g, 'silence', (e.age >> 2) % 2, core, x, y);
      }
    }
  },
  *script(e, c) {
    c.w.dark = false;
    yield* c.moveTo(360, 135, 180, 'outCubic');
    c.bossReady();
    const core = P(e, 'core');
    const outer = e.parts!.filter((p) => p.id[0] === 'o');
    const inner = e.parts!.filter((p) => p.id[0] === 'n');
    // ring motion
    const ringT = c.thread.bind(c);
    ringT((function* () {
      for (;;) {
        if (e.v.form === 1) {
          e.v.ra = (e.v.ra! + 0.6) % 360; e.v.rb = (e.v.rb! - 1.0 + 360) % 360;
          outer.forEach((p, i) => { const a = e.v.ra! + i * 45; p.ox = 90 * dcos(a); p.oy = 90 * dsin(a); });
          inner.forEach((p, i) => { const a = e.v.rb! + i * 90; p.ox = 50 * dcos(a); p.oy = 50 * dsin(a); });
          if (outer.every((p) => !p.alive)) for (const p of inner) p.armored = false;
          if (inner.every((p) => !p.alive)) core.armored = false;
          const cur = [...outer, ...inner, core];
          e.o.barV = cur.reduce((a, p) => a + (p.alive ? p.hp : 0), 0); e.o.barM = cur.reduce((a, p) => a + p.maxHp, 0);
        }
        yield;
      }
    })());
    // ---------------- FORM 1: HALO ----------------
    yield c.w.framesToBeat(4);
    let beat = 0, oi = 0, ir = 0;
    while (core.alive) {
      const b = beat % 4;
      // outer nodes take turns
      for (let k = 0; k < 8; k++) {
        const p = outer[(oi + k) % 8]!;
        if (p.alive) { c.nway(c.loop2 ? 5 : 3, 30, 1.8, { ox: p.ox, oy: p.oy }); oi = (oi + k + 1) % 8; break; }
      }
      if (b === 0) { for (const p of inner) if (p.alive && !p.armored) c.ring(8, 1.5, { ox: p.ox, oy: p.oy, start: ir, sfx: null }); ir += 15; }
      if (!core.armored) {
        if (b === 0 || b === 2) c.ring(16, 1.5, { kind: 'orb', start: ir });
        else c.nway(3, 24, 2.4, { kind: 'needle' });
      }
      beat++;
      yield c.w.framesToBeat(1);
    }
    // ---------------- transformation ----------------
    c.w.cancelBullets(true);
    e.flags |= EF.INVULN;
    c.sfx('boss_phase');
    c.w.music({ cmd: 'stop', fade: 1 });
    for (let t = 1; t <= 180; t++) { e.v.trans = t; if (t % 20 === 0) c.w.fx.ring(e.x, e.y, 60 + t, PAL.Y4, 20, 2); yield; }
    e.v.trans = 0;
    for (const p of [...outer, ...inner]) p.alive = false;
    core.alive = false;
    e.v.form = 2;
    const body = c.part('body', 0, 0, box(40, 110), 3600, { score: 70000, dmgMul: 0.5 });
    const wU = c.part('wU', -6, -60, box(30, 70), 400, { score: 3000 });
    const wL = c.part('wL', -6, 60, box(30, 70), 400, { score: 3000 });
    e.flags &= ~EF.INVULN;
    c.w.music({ cmd: 'play', id: 'final2' });
    c.w.musicId = 'final2'; c.w.musicStartFrame = c.w.frame; c.w.setBeatOrigin();
    // ---------------- FORM 2: CANTOR ----------------
    let prev = songTickAt(c);
    c.thread((function* () {
      for (;;) {
        if (e.v.form !== 2) return;
        const open = !wU.alive && !wL.alive ? true : !!e.v.wingsOpen;
        body.dmgMul = open ? 1 : 0.5;
        e.o.barV = (body.alive ? body.hp : 0) + (wU.alive ? wU.hp : 0) + (wL.alive ? wL.hp : 0); e.o.barM = body.maxHp + wU.maxHp + wL.maxHp;
        // melody bullets
        const now = songTickAt(c);
        const half = body.hp < body.maxHp / 2;
        for (const n of melody.ev) {
          const hit = now >= prev ? n.tick >= prev && n.tick < now : n.tick >= prev || n.tick < now;
          if (!hit) continue;
          const da = (n.midi - melody.center) * 4;
          e.v.sing = 6;
          c.bullet(e.x - 12, e.y - 44, 180 + da, c.loop2 ? 2.2 : 1.8, 'pellet');
          if (half) c.bullet(e.x - 12, e.y - 44, 180 - da, c.loop2 ? 2.2 : 1.8, 'pellet');
        }
        prev = now;
        if (e.v.sing) e.v.sing--;
        yield;
      }
    })());
    let bar = 0;
    yield c.w.framesToBeat(4);
    while (body.alive) {
      const ph = bar % 4;
      e.v.wingsOpen = ph >= 2 ? 1 : 0;
      const a = c.aim(e.x - 12, e.y - 30);
      const side = bar % 2 ? 1 : -1;
      c.waveArc(a, 30, { ox: -12, oy: -30, gapA: a + side * 14, gapHalf: 7 });
      if (body.hp < body.maxHp / 2) c.waveArc(a + 180 * 0 - side * 25, 22, { ox: -12, oy: 30, gapA: a - side * 30, gapHalf: 6 });
      if (ph === 2) for (const w of [wU, wL]) if (w.alive) c.nway(7, 70, 2.0, { kind: 'needle', ox: w.ox, oy: w.oy });
      bar++;
      yield c.w.framesToBeat(4);
    }
    // ---------------- FORM 3: SILENCE ----------------
    e.v.form = 3;
    for (const p of [wU, wL]) p.alive = false;
    c.w.cancelBullets(true);
    c.w.music({ cmd: 'stop', fade: 0.05 });
    e.flags |= EF.INVULN;
    c.flash(0.6, '#000000');
    yield 90;
    const sil = c.part('sil', 0, 0, circle(10), 1500, { score: 80000 });
    sil.onDestroy = () => { c.p.autoDrive = false; c.killBoss(220); };
    e.flags &= ~EF.INVULN;
    c.p.autoDrive = true;
    // heartbeat (speeds up as it weakens)
    c.thread((function* () {
      for (;;) {
        if (!sil.alive) return;
        c.sfx('heartbeat');
        yield Math.round(70 - 40 * (1 - sil.hp / sil.maxHp));
      }
    })());
    c.thread((function* () { for (;;) { sil.dmgMul = c.p.driving ? 2 : 1; e.o.barV = sil.alive ? sil.hp : 0; e.o.barM = sil.maxHp; yield; } })());
    for (;;) {
      // pick a destination, telegraph the dash line
      const cx = e.x + sil.ox, cy = e.y + sil.oy;
      const tx = 160 + c.rnd() * 300, ty = 30 + c.rnd() * 210;
      c.telegraph('line', cx, cy, tx, ty, c.tele(40), 1, 'R3');
      yield c.tele(40);
      e.v.dash = 1;
      const dx = (tx - cx) / 20, dy = (ty - cy) / 20;
      e.v.dx = dx; e.v.dy = dy;
      const perp = datan2(dy, dx) + 90;
      c.sfx('lancer_dash');
      for (let i = 0; i < 20; i++) {
        sil.ox += dx; sil.oy += dy;
        if (i % 4 === 0) {
          const n = c.loop2 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            c.w.spawnBullet(e.x + sil.ox, e.y + sil.oy, perp + (k ? 180 : 0), 0.8, 'pellet');
            if (!c.loop2) c.w.spawnBullet(e.x + sil.ox, e.y + sil.oy, perp + 180, 0.8, 'pellet');
          }
        }
        yield;
      }
      e.v.dash = 0;
      yield 20;
    }
  },
});

export const _st6b = (p: Part) => p;

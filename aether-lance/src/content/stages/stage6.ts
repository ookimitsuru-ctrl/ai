// STAGE 6 — CHOIR CORE (docs/05_stages.md §7). BPM 150: one beat = 24 frames; enemies fire on the beat.
import { s, sp, ground, scroll, section, item, call, type StageDef, type TimelineEv } from '../../game/stage';
import type { World } from '../../game/world';
import type { DynSolid } from '../../game/terrain';

const ev: TimelineEv[] = [
  section(0, 'A'),
  sp(s(5), 'dart', 135, { behavior: 'straight', count: 5, interval: 10, p: { speed: 3.4 } }),
  sp(s(12), 'dart', 110, { behavior: 'straight', count: 5, interval: 10, p: { speed: 3.4 } }),
  sp(s(16), 'lancer', 135), sp(s(22), 'lancer', 150),
  sp(s(26), 'dart', 135, { behavior: 'straight', count: 5, interval: 10, p: { speed: 3.4 }, bonus: 'arms' }),
  scroll(s(33), 0.6, 120),
  section(s(35), 'B'),
  sp(s(36), 'seraphring', 110),
  ground(s(40), 'goldturret', 'floor'), ground(s(44), 'goldturret', 'ceil'),
  sp(s(48), 'seraphring', 160, { bonus: 'wisp' }),
  ground(s(52), 'goldturret', 'floor'), ground(s(56), 'goldturret', 'ceil'),
  sp(s(60), 'cantor', 80), sp(s(64), 'spinner', 135, { carrier: 'drive' }), sp(s(66), 'cantor', 190), sp(s(72), 'cantor', 135),
  sp(s(78), 'seraphring', 135, { loop2: true }),
  { at: s(85), type: 'checkpoint', id: 'cp1' },
  section(s(85), 'C'),
  sp(s(86), 'echo', 135), sp(s(92), 'echo', 135), sp(s(98), 'echo', 135, { carrier: 'aegis' }),
  sp(s(95), 'seraphring', 135),
  scroll(s(107), 0, 150),
  { at: s(110), type: 'midboss', id: 'antiphon', drop: 'drive' },
  scroll(s(110) + 1, 0.6, 90),
  { at: s(145), type: 'checkpoint', id: 'cp2' },
  section(s(145), 'E'),
  sp(s(150), 'sentinel', 135), sp(s(162), 'sentinel', 100),
  item(s(158), 'arms', 494, 135),
  section(s(175), 'E2'),
  sp(s(176), 'cantor', 90), sp(s(182), 'cantor', 180), sp(s(186), 'seraphring', 135),
  item(s(190), 'armsChip', 494, 135),
  section(s(195), 'F'),
  call(s(195), (w: World) => { w.stageData.silence = 1; w.music({ cmd: 'stop', fade: 6 }); }, true),
  item(s(198), 'aegis', 494, 110), item(s(202), 'drive', 494, 160),
  { at: s(210), type: 'checkpoint', id: 'cp3' },
  call(s(210), (w: World) => { w.stageData.silence = 0; }, true),
  { at: s(210), type: 'boss', id: 'choir' },
];

export const stage6: StageDef = {
  id: 6, nameEn: 'CHOIR CORE', nameJa: '聖歌核', briefKey: 'st6.brief', bgm: 'st6', bossBgm: 'final1', bossName: 'THE CHOIR',
  theme: 'choir', bgId: 'choir', beatBpm: 150, scroll0: 2.0, events: ev,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(85) }, { id: 'cp2', at: s(145) }, { id: 'cp3', at: s(210) }],
  midbossAt: s(110), bossAt: s(210),
  fillers: [
    { id: 'dart', behavior: 'straight', count: 5, interval: 10, p: { speed: 3.4 } },
    { id: 'dart', behavior: 'sine', count: 5, interval: 14, p: { phase: 0 } },
  ],
  onUpdate(w) {
    // resonance walls: two halves alternate every 2 beats; they light up one beat before turning solid
    const b = w.beatIndex();
    const ph = ((((w.frame - w.beatOrigin) % w.beatLen) + w.beatLen) % w.beatLen) / w.beatLen;
    const p = w.player;
    for (const d of w.terrain.dyn) {
      if (d.kind !== 'rhythm') continue;
      const q = ((b % 4) + 4) % 4;
      const want = d.phase === 0 ? q < 2 : q >= 2;
      d.glow = (d.phase === 0 ? q === 3 : q === 1) ? ph : 0;
      if (want && !d.solid) {
        const sx = d.x0 - w.camX, sy = d.y! - w.camY;
        const inside = p.alive && p.x + 9 > sx && p.x - 9 < sx + (d.x1 - d.x0) && p.y + 4 > sy && p.y - 4 < sy + d.h!;
        if (!inside) d.solid = true;
      } else if (!want) d.solid = false;
    }
    if (w.stageData.silence && w.frame % 60 === 0 && w.phase === 'play') w.sfx('heartbeat');
  },
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    // A: slipstream — the whole corridor snakes up and down
    const fl: [number, number][] = [[R(1), 0]], cl: [number, number][] = [[R(1), 0]];
    for (let t = 2; t <= 33; t += 0.5) {
      const c = 135 + 35 * Math.sin((t - 2) * 0.55);
      fl.push([R(t), 190 - c]); cl.push([R(t), c - 80]);
    }
    fl.push([R(34), 20]); cl.push([R(34), 20]);
    b.floor(fl); b.ceil(cl);
    // B–C: cathedral nave
    b.floor([[R(34), 20], [R(96), 20], [R(97), 0]]);
    b.ceil([[R(34), 20], [R(96), 20], [R(97), 0]]);
    for (let k = 0; k < 12; k++) { const x = R(36) + k * 160; b.rect(x, 270 - 20 - 10, 14, 10); b.rect(x, 20, 14, 10); }
    // midboss arena (open) then E: resonance shafts
    b.floor([[R(146), 0], [R(147), 30], [R(194), 30], [R(195), 20], [R(216) + 600, 20]]);
    b.ceil([[R(146), 0], [R(147), 30], [R(194), 30], [R(195), 20], [R(216) + 600, 20]]);
    const dyn = b.t.dyn;
    for (let k = 0; k < 9; k++) {
      const x = R(148) + k * 82;
      const upper: DynSolid = { kind: 'rhythm', x0: x, x1: x + 14, y: 30, h: 108, phase: k % 2 === 0 ? 0 : 1, solid: false, glow: 0 };
      const lower: DynSolid = { kind: 'rhythm', x0: x, x1: x + 14, y: 132, h: 108, phase: k % 2 === 0 ? 1 : 0, solid: false, glow: 0 };
      dyn.push(upper, lower);
    }
    for (let k = 0; k < 6; k++) { const x = R(176) + k * 90; dyn.push({ kind: 'rhythm', x0: x, x1: x + 14, y: 20, h: 115, phase: k % 2 ? 0 : 1, solid: false, glow: 0 }, { kind: 'rhythm', x0: x, x1: x + 14, y: 135, h: 115, phase: k % 2 ? 1 : 0, solid: false, glow: 0 }); }
  },
};

// STAGE 5 — FOUNDRY (docs/05_stages.md §6) — includes a vertical lift shaft.
import { s, sp, ground, scroll, section, item, call, scrollProfile, type StageDef, type TimelineEv } from '../../game/stage';
import { MAT, type TerrainBuilder, type Profile } from '../../game/terrain';
import type { World } from '../../game/world';

const base: TimelineEv[] = [
  section(0, 'A'),
  ground(s(4), 'runner', 'floor'), ground(s(7), 'runner', 'floor'), ground(s(10), 'runner', 'floor'),
  sp(s(6), 'welder', 90), sp(s(9), 'welder', 180),
  sp(s(12), 'dart', 120, { behavior: 'straight', count: 5, interval: 14, bonus: 'arms' }),
  ground(s(20), 'hatch', 'floor', 30), ground(s(24), 'hatch', 'ceil', 30),
  ground(s(22), 'turret', 'ceil'), ground(s(26), 'turret', 'floor'), ground(s(28), 'turret', 'ceil'), ground(s(31), 'turret', 'floor'),
  sp(s(35), 'bulwark', 135, { carrier: 'wisp' }),
  sp(s(47), 'dart', 90, { behavior: 'sine', count: 5, interval: 16 }),
  section(s(55), 'B'),
  { at: s(55), type: 'scrollV', vx: 0, vy: -0.8, over: 90 },
  sp(s(60), 'dart', -20, { x: 160, behavior: 'fall', count: 5, interval: 14, fireMask: 0b01010 }),
  sp(s(66), 'dart', -20, { x: 320, behavior: 'fall', count: 5, interval: 14, p: { phase: 90 } }),
  sp(s(72), 'welder', -20, { x: 240 }),
  sp(s(76), 'dart', -20, { x: 240, behavior: 'fall', count: 5, interval: 14, bonus: 'arms' }),
  sp(s(84), 'dart', -20, { x: 180, behavior: 'fall', count: 5, interval: 14, loop2: true }),
  { at: s(90), type: 'scrollV', vx: 0.8, vy: 0, over: 90 },
  { at: s(95), type: 'checkpoint', id: 'cp1' },
  section(s(95), 'C'),
  ground(s(96), 'beltgun', 'floor'), ground(s(99), 'beltgun', 'ceil'), ground(s(102), 'beltgun', 'floor'),
  ground(s(105), 'beltgun', 'ceil'), ground(s(108), 'beltgun', 'floor'), ground(s(111), 'beltgun', 'ceil'),
  ground(s(98), 'hopper', 'floor'), ground(s(104), 'hopper', 'floor'), ground(s(110), 'hopper', 'floor'),
  ground(s(100), 'press', 'ceil', 30, { p: { reach: 110 } }), ground(s(106), 'press', 'ceil', 30, { p: { reach: 110, phase: 40 } }), ground(s(112), 'press', 'ceil', 30, { p: { reach: 110, phase: 80 } }),
  section(s(115), 'C2'),
  sp(s(115), 'shell', 120), sp(s(118), 'shell', 170), sp(s(121), 'shell', 140),
  sp(s(117), 'welder', 90), sp(s(120), 'welder', 200, { carrier: 'aegis' }), sp(s(123), 'welder', 110),
  scroll(s(132), 0, 150),
  { at: s(135), type: 'midboss', id: 'assemblyarm', drop: 'arms' },
  scroll(s(135) + 1, 0.8, 90),
  { at: s(165), type: 'checkpoint', id: 'cp2' },
  section(s(165), 'E'),
  call(s(165), (w: World) => { w.haze = 1; }, true),
  ground(s(167), 'turret', 'ceil'), ground(s(172), 'turret', 'floor'), ground(s(179), 'turret', 'ceil'), ground(s(184), 'turret', 'floor'),
  item(s(176), 'arms', 494, 140),
  call(s(190), (w: World) => { w.haze = 0; }, true),
  section(s(190), 'F'),
  sp(s(191), 'assembly', 80, { x: 420, count: 5, interval: 12, p: { kind: 0 } }),
  ground(s(193), 'assembly', 'floor', -80, { p: { kind: 1 } }),
  sp(s(196), 'assembly', 190, { x: 400, count: 5, interval: 12, p: { kind: 0 } }),
  ground(s(198), 'assembly', 'floor', -60, { p: { kind: 1 }, carrier: 'subChip' }),
  ground(s(201), 'assembly', 'floor', -100, { p: { kind: 1 } }),
  ground(s(204), 'assembly', 'floor', -70, { p: { kind: 1 } }),
  item(s(200), 'armsChip', 494, 120),
  scroll(s(212), 0.3, 120),
  { at: s(215), type: 'checkpoint', id: 'cp3' },
  { at: s(215), type: 'boss', id: 'anvil' },
];

// world-space positions for the vertical shaft
const prof = scrollProfile({ scroll0: 0.8, events: base } as StageDef);
const Xs = prof.X(s(56.5)), Yf = prof.Y(s(91.5));
const extra: TimelineEv[] = [];
// side presses in the shaft + a falling-in molten controller for the smelter
for (const [t, left] of [[60, true], [66, false], [72, true], [79, false]] as const) {
  extra.push({ at: s(t), type: 'spawn', id: 'press', y: 0, wx: left ? Xs + 89 : Xs + 391, wy: prof.Y(s(t)) - 40, p: { dir: left ? 3 : 2, reach: 120 } });
}
extra.push({ at: s(68), type: 'item', kind: 'drive', x: 100, y: 40 });
extra.push({ at: s(169), type: 'spawn', id: 'moltenfalls', y: 0, wx: prof.X(s(169)) + 520, wy: Yf, p: { n: 5, gap: 88, top: Yf + 36, bottom: Yf + 234 } });

const ev = [...base, ...extra].sort((a, b) => a.at - b.at);

function skinFloor(b: TerrainBuilder, p: Profile, mat: number, bottom: number, skin = 5): void {
  b.floor(p, { mat, bottom });
  b.floor(p.map(([x, h]) => [x, Math.max(0, h - skin)] as [number, number]), { mat: MAT.ROCK, bottom });
}
function skinCeil(b: TerrainBuilder, p: Profile, mat: number, top: number, skin = 5): void {
  b.ceil(p, { mat, top });
  b.ceil(p.map(([x, h]) => [x, Math.max(0, h - skin)] as [number, number]), { mat: MAT.ROCK, top });
}

export const stage5: StageDef = {
  id: 5, nameEn: 'FOUNDRY', nameJa: '鋳造廠', briefKey: 'st5.brief', bgm: 'st5', bossBgm: 'boss', bossName: 'ANVIL',
  theme: 'foundry', bgId: 'foundry', scroll0: 0.8, events: ev, worldTop: Math.floor(Yf) - 300, worldBottom: 272,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(95) }, { id: 'cp2', at: s(165) }, { id: 'cp3', at: s(215) }],
  midbossAt: s(135), bossAt: s(215),
  onUpdate(w) {
    const p = w.player;
    let push = w.stageData.forcePush ?? 0;
    if (!push && p.alive) {
      for (let k = 4; k < 16; k += 3) {
        const m1 = w.terrain.get(p.x + w.camX, p.y + w.camY + k), m2 = w.terrain.get(p.x + w.camX, p.y + w.camY - k);
        if (m1 === MAT.CONV_L) { push = -0.6; break; }
        if (m2 === MAT.CONV_R) { push = 0.6; break; }
      }
    }
    w.conveyorPush = push;
  },
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    // A: loading dock up to the shaft
    b.floor([[R(1), 0], [R(3), 30], [R(50), 30], [Xs + 600, 30]], { rough: 0 });
    b.ceil([[R(17), 0], [R(19), 30], [R(50), 30], [Xs + 80, 30]], { rough: 0 });
    for (const t of [5, 9, 14]) b.rect(R(t), 270 - 30 - 14, 22, 14);
    // shaft walls (world space)
    b.rect(Xs - 80, Yf - 320, 160, 320 - Yf + 30);                // left wall up to the corridor ceiling
    b.rect(Xs + 400, Yf + 236, 200, 272 - (Yf + 236));            // right wall up to the upper floor
    b.clear(Xs + 66, prof.Y(s(68)) + 40 - 8, 14, 18);              // alcove (DRIVE)
    for (let y = Math.floor(Yf); y < 260; y += 48) { b.rect(Xs + 76, y, 6, 3, MAT.CONV_R); b.rect(Xs + 398, y + 24, 6, 3, MAT.CONV_L); }
    // upper corridor after the shaft
    const top = Yf, bottom = Yf + 272;
    b.ceil([[Xs - 80, 30], [R(114), 30], [R(116), 24], [R(216) + 600, 24]], { top });
    b.floor([[Xs + 400, 36], [R(94), 36], [R(95), 30], [R(114), 30], [R(116), 24], [R(160), 24], [R(166), 30], [R(205), 30], [R(207), 12], [R(216) + 600, 12]], { bottom });
    // C1: conveyors (floor pushes left, ceiling pushes right)
    skinFloor(b, [[R(95.5), 30], [R(113.5), 30]], MAT.CONV_L, bottom);
    skinCeil(b, [[R(95.5), 30], [R(113.5), 30]], MAT.CONV_R, top);
    // midboss conveyor floor (scrap source)
    skinFloor(b, [[R(125), 24], [R(160), 24]], MAT.CONV_L, bottom);
    // E: smelter vats on the floor
    for (const t of [170, 175, 180, 185]) b.rect(R(t), bottom - 30 - 8, 30, 8);
  },
};

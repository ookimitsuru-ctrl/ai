// STAGE 3 — HIVE GARDEN (docs/05_stages.md §4)
import { s, sp, ground, scroll, section, item, call, type StageDef, type TimelineEv } from '../../game/stage';
import { MAT } from '../../game/terrain';

const ev: TimelineEv[] = [
  section(0, 'A'),
  sp(s(4), 'leech', 90, { count: 4, interval: 14 }),
  sp(s(9), 'leech', 180, { count: 4, interval: 14, bonus: 'arms' }),
  ground(s(16), 'broodpod', 'ceil'), ground(s(21), 'broodpod', 'ceil'),
  sp(s(18), 'dart', 150, { behavior: 'sine', count: 5, interval: 18, fireMask: 0b10001 }),
  sp(s(28), 'podorganic', 135, { carrier: 'wisp' }),
  section(s(40), 'B'),
  ground(s(41), 'tendril', 'floor'), ground(s(44), 'tendril', 'ceil'), ground(s(47), 'tendril', 'floor'), ground(s(50), 'tendril', 'ceil'),
  sp(s(45), 'lancer', 110), sp(s(52), 'lancer', 170),
  ground(s(60), 'tendril', 'floor'), ground(s(63), 'tendril', 'ceil'), ground(s(66), 'tendril', 'floor'),
  ground(s(61), 'broodpod', 'ceil'), ground(s(67), 'broodpod', 'floor'),
  item(s(64), 'drive', 494, 135),
  section(s(75), 'C'),
  sp(s(78), 'leech', 135, { count: 4, interval: 14 }),
  item(s(85.6), 'arms', 494, 135),
  sp(s(90), 'leech', 100, { count: 4, interval: 14, loop2: true }),
  { at: s(100), type: 'checkpoint', id: 'cp1' },
  section(s(100), 'C2'),
  ground(s(100), 'broodpod', 'ceil'), ground(s(103), 'broodpod', 'floor'), ground(s(106), 'broodpod', 'ceil'), ground(s(109), 'broodpod', 'floor'),
  sp(s(102), 'leech', 80, { count: 4, interval: 14 }), sp(s(108), 'leech', 190, { count: 4, interval: 14 }),
  ground(s(104), 'tendril', 'floor', 24, { loop2: true }),
  scroll(s(117), 0, 150),
  { at: s(120), type: 'midboss', id: 'grub', drop: 'armsChip' },
  scroll(s(120) + 1, 0.7, 90),
  { at: s(155), type: 'checkpoint', id: 'cp2' },
  section(s(155), 'E'),
  sp(s(158), 'spore', 100, { p: { home: 0, sp: 0.9, life: 600, a: 180 } }),
  sp(s(160), 'leech', 135, { count: 4, interval: 14, bonus: 'aegis' }),
  sp(s(163), 'spore', 160, { p: { home: 0, sp: 0.9, life: 600, a: 180 } }),
  sp(s(167), 'leech', 120, { count: 4, interval: 14 }),
  sp(s(170), 'spore', 130, { p: { home: 0, sp: 0.8, life: 700, a: 180 } }),
  sp(s(173), 'leech', 150, { count: 4, interval: 14, loop2: true }),
  section(s(178), 'E2'),
  ground(s(179), 'tendril', 'floor'), ground(s(181.5), 'tendril', 'ceil'), ground(s(184), 'tendril', 'floor'), ground(s(186.5), 'tendril', 'ceil'),
  section(s(190), 'F'),
  ground(s(190), 'broodpod', 'ceil'), ground(s(192), 'broodpod', 'floor'), ground(s(194), 'broodpod', 'ceil', 24, { carrier: 'subChip' }),
  ground(s(196), 'broodpod', 'floor'), ground(s(198), 'broodpod', 'ceil'), ground(s(200), 'broodpod', 'floor'),
  sp(s(195), 'lancer', 100), sp(s(199), 'lancer', 180),
  call(s(212), (w) => { w.stageData.calm = 1; }),
  scroll(s(212), 0.3, 120),
  { at: s(215), type: 'checkpoint', id: 'cp3' },
  { at: s(215), type: 'boss', id: 'matriarch' },
];

export const stage3: StageDef = {
  id: 3, nameEn: 'HIVE GARDEN', nameJa: '蝕苑', briefKey: 'st3.brief', bgm: 'st3', bossBgm: 'boss', bossName: 'MATRIARCH',
  theme: 'flesh', bgId: 'hive', scroll0: 0.7, events: ev,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(100) }, { id: 'cp2', at: s(155) }, { id: 'cp3', at: s(215) }],
  midbossAt: s(120), bossAt: s(215),
  fillers: [
    { id: 'leech', count: 4, interval: 14 },
    { id: 'dart', behavior: 'sine', count: 4, interval: 16, p: { phase: 0 } },
    { id: 'spore', p: { home: 0, sp: 0.9, life: 600, a: 180 } },
  ],
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    b.floor([[R(1), 0], [R(3), 26], [R(38), 26], [R(40), 34], [R(72), 34], [R(75), 40], [R(98), 40], [R(100), 30], [R(107), 30], [R(109), 30]], { rough: 8, seed: 31 });
    b.ceil([[R(14), 0], [R(16), 30], [R(38), 30], [R(40), 34], [R(72), 34], [R(75), 40], [R(98), 40], [R(100), 30], [R(107), 30], [R(109), 30]], { rough: 10, seed: 32 });
    // roots on the floor
    for (const t of [6, 12, 25, 33]) b.spike(R(t), 270 - 26, 12, 18, -1);
    // C1: regenerating flesh walls (3 tiles thick) — must be carved through
    for (const t of [77, 84, 91]) {
      for (let col = 0; col < 3; col++) for (let row = 0; row < 12; row++) {
        b.breakable(R(t) + col * 16, 40 + row * 16, 16, 16, 6, 180, 'flesh');
      }
    }
    // midboss arena with burrow holes
    b.floor([[R(109), 30], [R(111), 22], [R(150), 22], [R(152), 0]], { rough: 4, seed: 33 });
    b.ceil([[R(109), 30], [R(111), 22], [R(150), 22], [R(152), 0]], { rough: 4, seed: 34 });
    // E: peristaltic tunnel (dynamic walls) + static backing
    b.floor([[R(153), 0], [R(155), 77], [R(178), 77], [R(179), 40], [R(189), 40], [R(190), 30], [R(201), 30], [R(202), 24], [R(216) + 520, 24]], { rough: 3, seed: 35 });
    b.ceil([[R(153), 0], [R(155), 75], [R(178), 75], [R(179), 40], [R(189), 40], [R(190), 30], [R(201), 30], [R(202), 24], [R(216) + 520, 24]], { rough: 3, seed: 36 });
    b.t.dyn.push({ kind: 'wave', x0: R(155), x1: R(178), floorY: 195, ceilY: 75, amp: 16, period: 120, k: 1.6 });
    void MAT;
  },
};

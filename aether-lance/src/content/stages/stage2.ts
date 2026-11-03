// STAGE 2 — PRISM CAVERN (docs/05_stages.md §3)
import { s, sp, ground, scroll, section, item, type StageDef, type TimelineEv } from '../../game/stage';
import { MAT, type TerrainBuilder, type Profile } from '../../game/terrain';

const ev: TimelineEv[] = [
  section(0, 'A'),
  sp(s(4), 'swirl', 80, { behavior: 'loop', count: 6, interval: 12, bonus: 'arms', p: { dir: -1 } }),
  ground(s(14), 'shardmite', 'ceil'), ground(s(15.5), 'shardmite', 'floor'), ground(s(17), 'shardmite', 'ceil'), ground(s(18.5), 'shardmite', 'floor'),
  sp(s(16), 'dart', 135, { behavior: 'sine', count: 5, interval: 18, p: { amp: 30 }, fireMask: 0b01010 }),
  ground(s(24), 'turret', 'floor'), ground(s(26), 'turret', 'ceil'), ground(s(28), 'turret', 'floor'), ground(s(30), 'turret', 'ceil'),
  sp(s(25), 'debrisM', 100, { p: { vx: -0.3, vy: 0.05 } }), sp(s(27), 'debrisM', 170, { p: { vx: -0.25, vy: -0.05 } }),
  sp(s(29), 'debrisM', 80, { p: { vx: -0.35 } }), sp(s(31), 'debrisM', 190, { p: { vx: -0.3 } }),
  section(s(35), 'B'),
  ground(s(36), 'prismeye', 'ceil', 20, { p: { first: 1 } }),
  ground(s(42), 'prismeye', 'floor', 20),
  ground(s(50), 'shardmite', 'floor'), ground(s(53), 'shardmite', 'floor'),
  item(s(52.6), 'wisp', 494, 72),
  ground(s(61), 'prismeye', 'floor', 20), ground(s(64), 'prismeye', 'ceil', 20), ground(s(67), 'prismeye', 'floor', 20),
  sp(s(62), 'shell', 120), sp(s(66), 'shell', 170, { carrier: 'drive' }),
  ground(s(65), 'shardmite', 'ceil', 24, { loop2: true }),
  section(s(75), 'C'),
  sp(s(75), 'geode', 80, { p: { vx: -0.15, vy: 0.08 } }), sp(s(78), 'geode', 190, { p: { vx: -0.2, vy: -0.08 } }),
  sp(s(80), 'spinner', 135, { carrier: 'armsChip' }),
  sp(s(83), 'geode', 135, { p: { vx: -0.1 } }),
  sp(s(88), 'dart', 70, { behavior: 'dive', count: 5, interval: 16 }),
  { at: s(95), type: 'checkpoint', id: 'cp1' },
  section(s(95), 'D'),
  // upper route
  ground(s(98), 'turret', 'ceil', 24, { y: 80 }), ground(s(101), 'turret', 'floor', 24, { y: 100 }), ground(s(104), 'turret', 'ceil', 24, { y: 80 }),
  ground(s(108), 'turret', 'floor', 24, { y: 100 }), ground(s(112), 'turret', 'ceil', 24, { y: 80 }), ground(s(115), 'turret', 'floor', 24, { y: 100 }),
  ground(s(100), 'shardmite', 'ceil', 24, { y: 80 }), ground(s(110), 'shardmite', 'ceil', 24, { y: 80 }),
  item(s(104), 'arms', 494, 70), item(s(114), 'drive', 494, 74),
  // lower route
  sp(s(99), 'shell', 200), sp(s(106), 'shell', 205), sp(s(113), 'shell', 198),
  sp(s(109), 'dart', 200, { behavior: 'straight', count: 5, interval: 16 }),
  item(s(118), 'aegis', 494, 200),
  sp(s(123), 'swirl', 135, { behavior: 'loop', count: 6, interval: 12, p: { dir: 1 }, fireMask: 0b100100 }),
  scroll(s(132), 0, 150),
  { at: s(135), type: 'midboss', id: 'twinlens', drop: 'wisp' },
  scroll(s(135) + 1, 0.6, 90),
  { at: s(165), type: 'checkpoint', id: 'cp2' },
  section(s(165), 'F'),
  ...[166, 168.5, 171, 173.5, 176, 178.5, 181, 183].map((t, i) => ground(s(t), 'stalactite', 'ceil', 30 + (i % 3) * 40, { p: { lead: 80 + (i % 2) * 40 } })),
  ...[167, 172, 177, 182].map((t, i) => ground(s(t), 'shardmite', i % 2 ? 'ceil' : 'floor')),
  ground(s(174), 'stalactite', 'ceil', 60, { loop2: true }), ground(s(179), 'stalactite', 'ceil', 20, { loop2: true }),
  section(s(185), 'F2'),
  ground(s(186), 'prismeye', 'ceil', 20), ground(s(189.5), 'prismeye', 'floor', 20), ground(s(193), 'prismeye', 'ceil', 20), ground(s(196.5), 'prismeye', 'floor', 20),
  sp(s(191), 'shell', 135, { carrier: 'subChip' }),
  section(s(203), 'G'),
  sp(s(203), 'dart', 135, { behavior: 'sine', count: 5, interval: 18, bonus: 'wisp', p: { amp: 46 } }),
  scroll(s(212), 0.3, 120),
  { at: s(215), type: 'checkpoint', id: 'cp3' },
  { at: s(215), type: 'boss', id: 'golem' },
];

function crystalFloor(b: TerrainBuilder, p: Profile, rough: number, seed: number, skin = 6): void {
  b.floor(p, { mat: MAT.CRYSTAL, rough, seed });
  b.floor(p.map(([x, h]) => [x, Math.max(0, h - skin)] as [number, number]), { mat: MAT.ROCK, rough, seed });
}
function crystalCeil(b: TerrainBuilder, p: Profile, rough: number, seed: number, skin = 6): void {
  b.ceil(p, { mat: MAT.CRYSTAL, rough, seed });
  b.ceil(p.map(([x, h]) => [x, Math.max(0, h - skin)] as [number, number]), { mat: MAT.ROCK, rough, seed });
}

export const stage2: StageDef = {
  id: 2, nameEn: 'PRISM CAVERN', nameJa: '晶洞', briefKey: 'st2.brief', bgm: 'st2', bossBgm: 'boss', bossName: 'LUMEN GOLEM',
  theme: 'cave', bgId: 'cave', dark: true, scroll0: 0.6, events: ev,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(95) }, { id: 'cp2', at: s(165) }, { id: 'cp3', at: s(215) }],
  midbossAt: s(135), bossAt: s(215),
  fillers: [
    { id: 'swirl', behavior: 'loop', count: 5, interval: 12, p: { dir: 1 } },
    { id: 'dart', behavior: 'sine', count: 4, interval: 18, p: { phase: 0 } },
    { id: 'geode', p: { vx: -0.2, vy: 0 } },
  ],
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    // A: entrance
    b.floor([[R(2), 0], [R(4), 34], [R(34), 34], [R(35), 40], [R(50), 40], [R(51), 34], [R(72), 34], [R(74), 14], [R(94), 14], [R(96), 30], [R(120), 30], [R(122), 18]], { rough: 9, seed: 2 });
    b.ceil([[R(2), 0], [R(4), 36], [R(34), 36], [R(35), 40], [R(50), 40], [R(51), 36], [R(72), 36], [R(74), 14], [R(94), 14], [R(96), 30], [R(120), 30], [R(122), 18]], { rough: 9, seed: 3 });
    // B1: crystal corridor
    crystalFloor(b, [[R(35), 40], [R(50), 40]], 4, 11);
    crystalCeil(b, [[R(35), 40], [R(50), 40]], 4, 12);
    // B2: rock island + breakable crystal wall on the upper path
    b.blob(R(54), 130, 30, 7, MAT.ROCK, 0.15);
    b.poly([R(50.5), 130, R(52), 112, R(57), 110, R(58.5), 130, R(57), 150, R(52), 150]);
    for (let k = 0; k < 4; k++) b.breakable(R(52.2), 41 + k * 17, 14, 17, 20, 0, 'crystal');
    // crystal patches
    for (const t of [8, 17, 26, 62, 69]) { b.spike(R(t), 270 - 30, 18, 26, -1, MAT.CRYSTAL); b.spike(R(t + 3), 34, 16, 22, 1, MAT.CRYSTAL); }
    // D: branch island
    b.poly([R(97), 135, R(99), 116, R(110), 112, R(119), 115, R(121), 135, R(119), 156, R(110), 158, R(99), 154]);
    crystalFloor(b, [[R(122), 18], [R(165), 18]], 3, 21, 5);
    crystalCeil(b, [[R(122), 18], [R(165), 18]], 3, 22, 5);
    // F1: collapse
    b.floor([[R(164), 18], [R(166), 30], [R(184), 30], [R(186), 24]], { rough: 6, seed: 5 });
    crystalCeil(b, [[R(164), 18], [R(166), 42], [R(184), 42], [R(186), 24]], 6, 6, 8);
    // F2: mirror hall
    crystalFloor(b, [[R(186), 24], [R(200), 24], [R(201), 20]], 2, 31, 8);
    crystalCeil(b, [[R(186), 24], [R(200), 24], [R(201), 20]], 2, 32, 8);
    for (let k = 0; k < 6; k++) {
      const x = R(187) + k * 85;
      if (k % 2 === 0) b.poly([x, 246, x + 34, 214, x + 40, 218, x + 8, 250], MAT.CRYSTAL);
      else b.poly([x, 24, x + 34, 56, x + 40, 52, x + 8, 20], MAT.CRYSTAL);
    }
    // G + boss arena
    crystalFloor(b, [[R(200), 20], [R(216) + 520, 20]], 2, 41, 6);
    crystalCeil(b, [[R(200), 20], [R(216) + 520, 20]], 2, 42, 6);
  },
};

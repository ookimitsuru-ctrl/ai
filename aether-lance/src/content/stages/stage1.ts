// STAGE 1 — ORBITAL RING (docs/05_stages.md §2)
import { s, sp, ground, scroll, section, item, type StageDef, type TimelineEv } from '../../game/stage';
import { MAT } from '../../game/terrain';

const ev: TimelineEv[] = [
  section(0, 'A'),
  sp(s(4), 'dart', 90, { behavior: 'sine', count: 5, interval: 18, fireMask: 0b10100 }),
  sp(s(8), 'dart', 180, { behavior: 'sine', count: 5, interval: 18, bonus: 'arms', p: { phase: 180 } }),
  sp(s(13), 'swirl', 70, { behavior: 'loop', count: 6, interval: 12, fireMask: 0b001010, p: { dir: -1 } }),
  sp(s(18), 'dart', 50, { behavior: 'dive', count: 5, interval: 18 }),
  sp(s(18) + 6, 'dart', 220, { behavior: 'dive', count: 5, interval: 18, fireMask: 0b00100 }),
  sp(s(24), 'swirl', 200, { behavior: 'loop', count: 6, interval: 12, bonus: 'wisp', p: { dir: 1 }, fireMask: 0b010100 }),
  section(s(30), 'B'),
  sp(s(30), 'debrisL', 80, { p: { vx: -0.2, vy: 0.05 } }),
  sp(s(31), 'debrisM', 200, { p: { vx: -0.35, vy: -0.08 } }),
  sp(s(33), 'mine', 120),
  sp(s(34), 'debrisM', 40, { p: { vx: -0.3, vy: 0.1 } }),
  sp(s(36), 'mine', 210),
  sp(s(37), 'debrisL', 175, { p: { vx: -0.15, vy: -0.05 } }),
  sp(s(40), 'lancer', 70),
  sp(s(41), 'lancer', 200),
  sp(s(42), 'mine', 150),
  sp(s(44), 'mine', 60),
  sp(s(45), 'debrisM', 230, { p: { vx: -0.4 } }),
  sp(s(48), 'debrisL', 130, { carrier: 'drive', p: { vx: -0.2 } }),
  sp(s(49), 'debrisM', 60, { p: { vx: -0.3, vy: 0.06 } }),
  sp(s(51), 'debrisM', 215, { p: { vx: -0.3, vy: -0.06 } }),
  sp(s(55), 'weaver', 100, { count: 4, interval: 24 }),
  sp(s(57), 'dart', 60, { behavior: 'ambush', count: 3, interval: 14, dy: 75, bonus: 'wisp' }),
  sp(s(60), 'lancer', 135, { loop2: true }),
  section(s(65), 'C'),
  sp(s(65), 'bulwark', 135, { carrier: 'armsChip' }),
  sp(s(68), 'weaver', 60, { count: 2, interval: 30 }),
  sp(s(72), 'weaver', 210, { count: 2, interval: 30, p: { phase: 180 } }),
  sp(s(80), 'dart', 100, { behavior: 'sine', count: 5, interval: 18, p: { amp: 40 } }),
  { at: s(85), type: 'checkpoint', id: 'cp1' },
  section(s(85), 'D'),
  sp(s(86), 'dart', 100, { x: -20, behavior: 'behind', count: 3, interval: 20, warn: true, fireMask: 0b100 }),
  ground(s(89), 'turret', 'floor'),
  ground(s(93), 'turret', 'floor'),
  ground(s(97), 'turret', 'floor'),
  sp(s(98), 'dart', 70, { behavior: 'sine', count: 5, interval: 18 }),
  ground(s(103), 'turret', 'ceil'),
  ground(s(105), 'hatch', 'floor', 30),
  ground(s(108), 'turret', 'ceil'),
  ground(s(110), 'hopper', 'floor'),
  ground(s(112), 'runner', 'floor', 24, { carrier: 'subChip' }),
  ground(s(114), 'hopper', 'floor'),
  ground(s(116), 'runner', 'floor'),
  ground(s(117), 'hopper', 'floor'),
  ground(s(118), 'runner', 'ceil', 24, { loop2: true }),
  item(s(118), 'arms', 494, 224),
  ground(s(119), 'turret2', 'floor'),
  ground(s(121), 'turret2', 'ceil'),
  sp(s(124), 'dart', 135, { behavior: 'straight', count: 5, interval: 14, p: { speed: 2.6 } }),
  scroll(s(132), 0, 150),
  { at: s(135), type: 'midboss', id: 'gatekeeper', drop: 'drive' },
  scroll(s(135) + 1, 0.75, 90),
  { at: s(165), type: 'checkpoint', id: 'cp2' },
  section(s(165), 'F'),
  sp(s(166), 'weaver', 110, { count: 4, interval: 30 }),
  ground(s(170), 'turret2', 'floor'),
  sp(s(172), 'dart', 200, { x: -20, behavior: 'behind', count: 3, interval: 20, warn: true, loop2: true }),
  ground(s(175), 'turret2', 'ceil'),
  sp(s(180), 'carrierpod', 135),
  sp(s(184), 'dart', 200, { x: -20, behavior: 'behind', count: 5, interval: 16, warn: true, fireMask: 0b01010 }),
  sp(s(190), 'swirl', 135, { behavior: 'loop', count: 6, interval: 12, bonus: 'aegis', p: { dir: 1 } }),
  ground(s(192), 'hopper', 'floor'),
  ground(s(195), 'hopper', 'floor'),
  sp(s(194), 'mine', 90),
  sp(s(197), 'mine', 180),
  section(s(205), 'G'),
  sp(s(203), 'dart', 135, { behavior: 'sine', count: 5, interval: 18, bonus: 'arms', p: { amp: 50 } }),
  scroll(s(212), 0.3, 120),
  { at: s(215), type: 'checkpoint', id: 'cp3' },
  { at: s(215), type: 'boss', id: 'warden' },
];

export const stage1: StageDef = {
  id: 1, nameEn: 'ORBITAL RING', nameJa: '軌道環', briefKey: 'st1.brief', bgm: 'st1', bossBgm: 'boss', bossName: 'WARDEN-CLASS CARRIER',
  theme: 'hull', bgId: 'orbit', scroll0: 0.75, events: ev,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(85) }, { id: 'cp2', at: s(165) }, { id: 'cp3', at: s(215) }],
  midbossAt: s(135), bossAt: s(215),
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    // D: ring exterior hull
    b.floor([[R(85), 0], [R(87.5), 48], [R(95), 48], [R(95.5), 56], [R(101), 56], [R(101.5), 48], [R(107), 48], [R(108), 64], [R(116), 64], [R(117), 60], [R(122), 60], [R(124), 0]], { mat: MAT.ROCK });
    b.ceil([[R(99), 0], [R(101.5), 72], [R(110), 72], [R(111), 64], [R(115), 64], [R(116.5), 100], [R(122), 100], [R(123.5), 0]]);
    // plating gaps and crates
    for (const t of [90, 94.5, 99.5]) b.clear(R(t), 270 - 48, 16, 30);
    b.rect(R(106), 270 - 64, 28, 16);
    b.rect(R(113.5), 270 - 76, 20, 12);
    b.clear(R(118) - 4, 270 - 64, 44, 26); // recess with hidden ARMS
    // F: hangar interior
    b.floor([[R(166), 0], [R(167.5), 40], [R(198), 40], [R(200), 0]]);
    b.ceil([[R(166), 0], [R(167.5), 40], [R(179), 40], [R(180), 20], [R(190), 20], [R(191), 40], [R(198), 40], [R(200), 0]]);
    for (let k = 0; k < 6; k++) {
      const x = R(169) + k * 150;
      if (k % 2 === 0) b.rect(x, 270 - 40 - 70, 22, 72); else b.rect(x, 38, 22, 72);
      b.rect(x - 4, k % 2 === 0 ? 270 - 40 - 74 : 106, 30, 4);
    }
  },
};

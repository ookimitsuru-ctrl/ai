// STAGE 4 — STORM CROWN (docs/05_stages.md §5)
import { s, sp, ground, scroll, section, item, call, type StageDef, type TimelineEv } from '../../game/stage';

const wind = (at: number, v: number, over = 40, warn = 60): TimelineEv => ({ at, type: 'wind', v, over, warn });
const bolts = (at: number, xs: number[], aim = false): TimelineEv => ({ at, type: 'bolts', xs, aim, warn: 50 });
const pair = (at: number, y: number, dx: number, dy: number, o: { carrier?: 'drive'; loop2?: boolean } = {}) => sp(at, 'stormpair', y, { p: { dx, dy }, ...o });

const ev: TimelineEv[] = [
  { at: 0, type: 'bg', vx: 1.5 },
  section(0, 'A'),
  sp(s(4), 'galeray', 80), sp(s(6), 'galeray', 140), sp(s(8), 'galeray', 200),
  sp(s(10), 'dart', 90, { behavior: 'sine', count: 5, interval: 14, p: { speed: 2.6 } }),
  sp(s(14), 'dart', 190, { behavior: 'sine', count: 5, interval: 14, p: { speed: 2.6, phase: 180 }, bonus: 'arms' }),
  sp(s(20), 'clouddiver', 0, { x: 320 }), sp(s(23), 'clouddiver', 0, { x: 220 }), sp(s(26), 'clouddiver', 0, { x: 380 }), sp(s(29), 'clouddiver', 0, { x: 260 }),
  sp(s(22), 'weaver', 110, { count: 4, interval: 20, p: { speed: 2 } }),
  wind(s(35), -0.3),
  sp(s(36), 'galeray', 90), sp(s(38), 'galeray', 170, { carrier: 'wisp' }), sp(s(40), 'galeray', 60), sp(s(42), 'galeray', 210),
  wind(s(48), 0, 40, 0),
  section(s(50), 'B'),
  pair(s(50), 135, 0, 90), pair(s(54), 100, 60, 60), pair(s(58), 170, -60, 60), pair(s(62), 135, 0, 120),
  sp(s(52), 'mine', 80), sp(s(56), 'mine', 200), sp(s(60), 'mine', 60), sp(s(64), 'mine', 220),
  sp(s(70), 'sentinel', 135, { carrier: 'drive' }),
  pair(s(72), 70, 0, 60), pair(s(78), 200, 0, 60),
  section(s(90), 'C'),
  wind(s(90), 0.6),
  bolts(s(91), [120, 300]), bolts(s(93), [200, 380]), bolts(s(95), [60, 260]),
  sp(s(92), 'lancer', 90), sp(s(95), 'lancer', 180), sp(s(98), 'lancer', 135),
  wind(s(96), 0, 40, 0),
  pair(s(100), 135, 0, 100, { loop2: true }),
  { at: s(110), type: 'checkpoint', id: 'cp1' },
  section(s(110), 'C2'),
  wind(s(110), -0.5), bolts(s(112), [0], true),
  sp(s(112), 'galeray', 120), sp(s(114), 'galeray', 200),
  wind(s(116), 0.5), bolts(s(117), [0, 80], true),
  sp(s(118), 'galeray', 80),
  wind(s(122), -0.5), bolts(s(123), [-60, 40], true),
  sp(s(124), 'galeray', 160),
  wind(s(128), 0, 40, 0), bolts(s(127), [0], true), bolts(s(129), [-40], true),
  section(s(130), 'D'),
  ground(s(130.6), 'turret2', 'floor', 35, { y: 120 }), ground(s(132.6), 'turret', 'floor', 30, { y: 60 }),
  ground(s(134.6), 'turret2', 'floor', 40, { y: 180, carrier: 'subChip' }), ground(s(136.6), 'turret', 'floor', 32, { y: 100 }),
  ground(s(138.6), 'turret2', 'floor', 35, { y: 150 }), ground(s(139.8), 'turret', 'floor', 27, { y: 40 }),
  ground(s(141.6), 'turret2', 'floor', 36, { y: 120 }), ground(s(142.8), 'turret', 'floor', 30, { y: 190 }),
  item(s(136), 'arms', 494, 196),
  scroll(s(147), 0, 150),
  { at: s(150), type: 'midboss', id: 'stormcaller', drop: 'aegis' },
  scroll(s(150) + 1, 1.5, 60),
  { at: s(180), type: 'checkpoint', id: 'cp2' },
  section(s(180), 'F'),
  wind(s(180), 0, 30, 0),
  sp(s(181), 'dart', 80, { behavior: 'straight', count: 5, interval: 12, p: { speed: 2.4, group: 1 } }),
  sp(s(185), 'dart', 190, { behavior: 'straight', count: 5, interval: 12, p: { speed: 2.4, group: 1 } }),
  sp(s(189), 'dart', 135, { behavior: 'straight', count: 5, interval: 12, p: { speed: 2.4, group: 1 } }),
  call(s(194), (w) => { if ((w.stats.groupKills.get('1') ?? 0) >= 3) { w.spawnItem('oneUp', 470, 135); w.sfx('pickup_wisp'); } }),
  section(s(195), 'F2'),
  wind(s(195), 0.8), bolts(s(196), [0, 120], true),
  sp(s(197), 'clouddiver', 0, { x: 300 }), sp(s(199), 'clouddiver', 0, { x: 200, carrier: 'drive' }),
  wind(s(201), -0.8), bolts(s(202), [-80, 0, 80], true),
  sp(s(203), 'clouddiver', 0, { x: 350 }), sp(s(205), 'clouddiver', 0, { x: 250 }),
  wind(s(207), 0.8), bolts(s(208), [-40, 60], true),
  sp(s(208), 'clouddiver', 0, { x: 320 }), sp(s(210), 'clouddiver', 0, { x: 180 }),
  wind(s(212), 0, 60, 0),
  { at: s(215), type: 'checkpoint', id: 'cp3' },
  { at: s(215), type: 'boss', id: 'leviathan' },
];

export const stage4: StageDef = {
  id: 4, nameEn: 'STORM CROWN', nameJa: '嵐冠', briefKey: 'st4.brief', bgm: 'st4', bossBgm: 'boss', bossName: 'TEMPEST LEVIATHAN',
  theme: 'ruins', bgId: 'storm', scroll0: 1.5, events: ev,
  checkpoints: [{ id: 'start', at: 0 }, { id: 'cp1', at: s(110) }, { id: 'cp2', at: s(180) }, { id: 'cp3', at: s(215) }],
  midbossAt: s(150), bossAt: s(215),
  build(b, X) {
    const R = (t: number) => X(s(t)) + 480;
    // D: floating ruins of a cloud city
    const isl = (t: number, y: number, w: number, h: number, seed: number) => {
      const x = R(t);
      b.poly([x, y, x + w, y, x + w - 6, y + h * 0.6, x + w * 0.6, y + h, x + w * 0.3, y + h * 0.9, x + 6, y + h * 0.5]);
      // broken pillars on top
      b.rect(x + 8, y - 14 - (seed % 3) * 4, 6, 16);
      b.rect(x + w - 16, y - 8, 6, 10);
      b.rect(x + 4, y - 2, w - 8, 3);
    };
    isl(130.6, 140, 70, 34, 1); isl(132.6, 80, 60, 30, 2); isl(134.6, 200, 80, 30, 3); isl(136.6, 120, 64, 36, 4);
    isl(138.6, 170, 70, 30, 5); isl(139.8, 60, 54, 26, 6); isl(141.6, 140, 72, 36, 7); isl(142.8, 210, 60, 24, 8);
  },
};

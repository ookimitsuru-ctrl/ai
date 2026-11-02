// Player ship, drones, bullets, items.
import { fromStrings } from '../../render/sprite';
import { build, reg } from './registry';
import type { PalKey } from '../../render/palette';

export function buildCommon(): void {
  // ---- KESTREL (30×14), frames: bank -2,-1,0,+1,+2 -------------------------------------------
  reg('kestrel', build(32, 16, 5, (b, f, M) => {
    const bank = f - 2; // -2 up .. +2 down
    const wingBot = 13 + (bank > 0 ? 1 : bank < 0 ? bank * 0.8 : 0);
    const wingBack = bank > 0 ? 5 : 6;
    // lower delta wing (behind body)
    b.poly([10, 9, 19, 9, 12 - bank * 0.5, wingBot, wingBack, wingBot], M.armorL);
    // far wing visible when banking down
    if (bank > 0) b.poly([11, 5, 17, 5, 12, 2.2 - bank * 0.3, 8, 2.2 - bank * 0.3], M.armor);
    // dorsal fin
    b.poly([4, 5.5, 7, 1.2 + (bank < 0 ? 0.6 : 0), 9.5, 1.2 + (bank < 0 ? 0.6 : 0), 11.5, 5.2], M.armorL);
    // fuselage
    b.poly([3, 5, 10, 4, 18, 4.3, 24, 5.8, 27, 7.2, 24, 8.6, 18, 9.6, 10, 10, 3, 9.6], M.hull);
    // engine block
    b.rect(1, 5, 3, 5, M.dark);
    // lance barrel
    b.line(24, 7, 30, 7, M.armorL);
    // canopy
    b.ellipse(19.5, 5.6 + bank * 0.15, 3.4, 1.7, M.glass);
    // details
    b.pxLine(8, 7 + (bank > 0 ? 0 : 0), 20, 7, 'C3');
    b.px(30, 7, 'N8');
    b.px(2, 6, 'O5'); b.px(2, 7, 'O6'); b.px(2, 8, 'O5');
    b.px(12, 5, 'N8'); b.px(13, 5, 'N8');
  }));

  // ---- WISP drone (12×12, 6 frames) ---------------------------------------------------------------
  reg('wisp', build(14, 14, 6, (b, f, M) => {
    b.circle(7, 7, 3.4, M.glowC);
    const a = (f / 6) * Math.PI;
    for (let t = 0; t < 40; t++) {
      const u = (t / 40) * Math.PI * 2;
      const x = 7 + Math.cos(u) * 5.6 * Math.cos(a) - Math.sin(u) * 2 * Math.sin(a);
      const y = 7 + Math.cos(u) * 5.6 * Math.sin(a) * 0.5 + Math.sin(u) * 2 * Math.cos(a);
      if (Math.sin(u) < 0 || Math.hypot(x - 7, y - 7) > 3.6) b.px(Math.round(x), Math.round(y), Math.sin(u) > 0 ? 'C4' : 'C2');
    }
    b.px(6, 6, 'N8');
  }, null));

  // ---- enemy bullets ------------------------------------------------------------------------------
  reg('pellet', fromStrings({
    map: { K: 'R0', M: 'R2', P: 'R3', W: 'N8' },
    frames: [
      ['.KKKK.', 'KMPPMK', 'KPWWPK', 'KPWWPK', 'KMPPMK', '.KKKK.'],
      ['.KKKK.', 'KPMMPK', 'KMWWMK', 'KMWWMK', 'KPMMPK', '.KKKK.'],
    ],
  }));
  reg('chip', fromStrings({ map: { K: 'R0', P: 'R3', W: 'N8' }, frames: [['.KK.', 'KPWK', 'KWPK', '.KK.'], ['.KK.', 'KWPK', 'KPWK', '.KK.']] }));
  reg('orb', build(12, 12, 2, (b, f, M) => {
    b.circle(6, 6, 4.6 - f * 0.4, M.glowR);
    b.px(5, 5, 'N8'); b.px(6, 5, 'N8'); b.px(5, 6, 'N8'); b.px(6, 6, f ? 'R4' : 'N8');
  }, 'R0'));
  reg('globe', build(18, 18, 4, (b, f, M) => {
    b.circle(9, 9, 6.8 + Math.sin((f / 4) * Math.PI * 2) * 0.6, M.glowR);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + f * 0.4;
      b.px(Math.round(9 + Math.cos(a) * 7.6), Math.round(9 + Math.sin(a) * 7.6), 'R2');
    }
    b.circle(9, 9, 2.4, M.white);
  }, 'R0'));
  reg('needle', build(12, 6, 1, (b, _f, M) => {
    b.poly([1, 3, 4, 1.5, 11, 3, 4, 4.5], M.glowR);
    b.pxLine(4, 3, 10, 3, 'N8');
  }, 'R0'));
  reg('missile', build(14, 8, 1, (b, _f, M) => {
    b.poly([2, 2.5, 9, 2.5, 13, 4, 9, 5.5, 2, 5.5], M.armorL);
    b.poly([2, 1, 4, 2.5, 4, 5.5, 2, 7], M.armor);
    b.px(12, 4, 'R3'); b.px(11, 4, 'R2'); b.px(11, 3, 'R3'); b.px(11, 5, 'R3');
  }, 'R0'));
  reg('shard', build(9, 9, 1, (b, _f, M) => {
    b.poly([4.5, 0.5, 8.5, 7.5, 0.5, 7.5], M.crystal);
    b.px(4, 4, 'R4'); b.px(4, 5, 'R3');
  }, 'R1'));

  // ---- items -----------------------------------------------------------------------------------------
  const gem = (name: string, ramp: 'rust' | 'glowC' | 'green' | 'gold', hi: PalKey) => {
    reg(name, build(16, 16, 8, (b, f, M) => {
      const mat = ramp === 'rust' ? b.mat({ ramp: ['O0', 'O1', 'O2', 'O3', 'O4', 'O6'], bevel: 2, shine: 'N8' })
        : ramp === 'glowC' ? b.mat({ ramp: ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'], bevel: 2, shine: 'N8' })
          : ramp === 'green' ? b.mat({ ramp: ['G0', 'G1', 'G2', 'G3', 'G4'], bevel: 2, shine: 'N8' })
            : b.mat({ ramp: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4'], bevel: 2, shine: 'N8' });
      const dark = b.mat({ ramp: ramp === 'rust' ? ['O0', 'O1', 'O2'] : ramp === 'glowC' ? ['C0', 'C1', 'C2'] : ramp === 'green' ? ['G0', 'G1', 'G2'] : ['Y0', 'Y1', 'Y2'], bevel: 2 });
      void M;
      const ridge = 4 + ((f * 1.0) % 8);
      b.poly([8, 1, 14, 8, 8, 15, 2, 8], mat);
      // rotating facet
      b.poly([ridge > 8 ? 8 : 2 + ridge * 0.75, 8, 8, 1, ridge, 8, 8, 15], dark);
      b.pxLine(8, 2, 8, 14, hi);
      if (f % 4 === 0) { b.px(6, 5, 'N8'); b.px(7, 4, 'N8'); }
    }));
  };
  gem('item_arms', 'rust', 'O6');
  gem('item_wisp', 'glowC', 'C5');
  gem('item_aegis', 'green', 'G4');
  reg('item_drive', build(14, 18, 4, (b, f, M) => {
    b.ellipse(7, 9, 5, 7.5, M.gold);
    b.rect(2, 7, 10, 4, M.armorL);
    b.pxLine(3, 9, 10, 9, f % 2 ? 'Y4' : 'O5');
    b.px(5, 4, 'N8'); b.px(5, 5, 'N8');
  }));
  reg('item_chip', build(18, 18, 1, (b, _f, M) => {
    b.rect(1, 1, 16, 16, M.white);
    b.rect(3, 3, 12, 12, M.armorL);
  }));
  reg('item_subchip', build(18, 18, 1, (b, _f, M) => {
    b.rect(1, 1, 16, 16, M.crystal);
    b.rect(3, 3, 12, 12, M.purple);
  }));
  reg('item_1up', build(16, 16, 1, (b, _f, M) => {
    b.circle(8, 8, 6.5, M.white);
  }));
  reg('star', fromStrings({
    map: { Y: 'Y3', W: 'Y4', O: 'Y1' },
    frames: [['..O...', '..Y...', 'OYWYO.', '..Y...', '..O...', '......'], ['......', '.O.O..', '..W...', '.O.O..', '......', '......']],
  }));
  reg('lostwisp', build(14, 14, 1, (b, _f, M) => { b.circle(7, 7, 3.4, M.glowC); }, null));
}

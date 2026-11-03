// Player ship, drones, bullets, items.
import { fromStrings } from '../../render/sprite';
import { build, reg } from './registry';
import type { PalKey } from '../../render/palette';

export function buildCommon(): void {
  // ---- KESTREL Mk.II (40×20), frames: bank -2,-1,0,+1,+2 (v1.1 redesign) ------------------------------
  // Heavy space fighter: white armour with red bands, twin propellant tanks (the far one shows above the hull),
  // long laser cannons on the wing tips above and below, twin blue ion engines at the rear.
  reg('kestrel', build(40, 20, 5, (b, f, M) => {
    const bank = f - 2; // -2 up .. +2 down (seen a little more from above / below)
    const red = b.mat({ ramp: ['O0', 'O1', 'O2'], bevel: 2 });
    const tank = b.mat({ ramp: ['N4', 'N5', 'N6', 'N7', 'N8'], bevel: 4, shine: 'N8' });
    const tankFar = b.mat({ ramp: ['N3', 'N4', 'N5', 'N6'], bevel: 3 });
    const yU = 3 + bank * 0.35, yL = 17.5 + bank * 0.2;            // cannon lines
    const yF = 6.2 + bank * 0.35, yN = 13.6 - bank * 0.15;          // tank centre lines
    // upper (far) wing strut + cannon
    b.poly([14, yU + 0.6, 19, yU + 0.6, 21, 8.2, 16, 8.2], M.plate);
    b.rect(12, Math.round(yU - 1), 8, 2, M.armorL);
    b.line(19, Math.round(yU), 36, Math.round(yU), M.armorL);
    b.rect(31, Math.round(yU) - 1, 2, 2, M.dark);
    // far propellant tank (behind the hull)
    b.ellipse(15.5, yF, 7.8, 2.5, tankFar);
    b.rect(17, Math.round(yF - 2.2), 2, 4, red);
    // twin ion engines
    b.rect(3, 7, 5, 3, M.dark); b.rect(3, 11, 5, 3, M.dark);
    b.rect(2, 7, 1, 3, M.glowC); b.rect(2, 11, 1, 3, M.glowC);
    // fuselage: long armoured wedge with a sharp nose
    b.poly([6, 8, 13, 7.4, 22, 7.6, 28, 8.4, 34, 9.4, 39.5, 10.5, 34, 11.4, 28, 12.1, 22, 12.6, 13, 12.7, 6, 12.3], M.hull);
    b.poly([27, 9.6, 35, 10.2, 35, 10.8, 27, 10.9], red);              // red nose stripe
    // canopy on the spine
    b.ellipse(25, 8.1 + bank * 0.1, 3.9, 1.25, M.glass);
    // lower (near) wing strut
    b.poly([12, yL - 0.6, 18, yL - 0.6, 20, 14, 15, 14], M.plate);
    // near propellant tank with its red band
    b.ellipse(15, yN, 8, 3.1, tank);
    b.rect(17, Math.round(yN - 2.8), 2, 6, red);
    b.rect(7, Math.round(yN - 1), 1, 2, M.dark);                  // tank rear valve
    // lower cannon (nearest)
    b.rect(11, Math.round(yL) - 1, 8, 2, M.armorL);
    b.line(18, Math.round(yL), 35, Math.round(yL), M.armorL);
    b.rect(30, Math.round(yL) - 1, 2, 2, M.dark);
    // panel lines and details
    b.pxLine(11, Math.round(yN) - 2, 11, Math.round(yN) + 2, 'N4');
    b.pxLine(22, Math.round(yN) - 2, 22, Math.round(yN) + 1, 'N4');
    b.pxLine(29, 11, 33, 11, 'N3');
    b.px(37, Math.round(yU), 'C4'); b.px(36, Math.round(yL), 'C4'); // cannon muzzles
    b.px(1, 8, 'C5'); b.px(1, 12, 'C5');                          // engine cores
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

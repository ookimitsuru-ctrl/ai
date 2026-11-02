// Stage 4 (STORM CROWN) sprites.
import { build, reg } from './registry';

export function buildEnemies4(): void {
  reg('galeray', build(30, 18, 2, (b, f, M) => {
    const flap = f ? 2 : 0;
    b.poly([1, 9, 10, 4 - flap, 22, 1 + flap, 29, 9, 22, 17 - flap, 10, 14 + flap], M.armorL);
    b.poly([6, 9, 14, 6, 24, 7, 26, 9, 24, 11, 14, 12], M.blue);
    b.line(26, 9, 29, 9, M.armor);
    b.circle(7, 9, 1.6, M.glowC);
  }));
  reg('stormsprite', build(14, 14, 2, (b, f, M) => {
    b.circle(7, 7, 4.5, M.armor);
    b.circle(7, 7, 2.6, f ? M.glowY : M.glowC);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + (f ? 0.4 : 0); b.px(Math.round(7 + Math.cos(a) * 6), Math.round(7 + Math.sin(a) * 6), 'C4'); }
  }));
  reg('clouddiver', build(22, 26, 2, (b, f, M) => {
    b.poly([11, 1, 18, 8, 19, 22, 11, 25, 3, 22, 4, 8], M.armor);
    b.poly([11, 4, 15, 9, 15, 19, 11, 21, 7, 19, 7, 9], M.blue);
    b.poly([2, 14, 0, 24, 5, 20], M.armorL); b.poly([20, 14, 22, 24, 17, 20], M.armorL);
    b.circle(11, 7, 2, f ? M.glowY : M.glowC);
  }));
  reg('sentinel', build(38, 50, 2, (b, f, M) => {
    b.rect(10, 2, 24, 46, M.steel);
    b.rect(14, 6, 16, 38, M.armor);
    b.poly([10, 18, 2, 22, 2, 28, 10, 32], M.armorL);
    b.circle(5, 25, 3.2, f ? M.glowR : M.glowC);
    for (let k = 0; k < 5; k++) b.px(22, 10 + k * 7, 'C4');
  }));
  reg('callercore', build(34, 60, 2, (b, f, M) => {
    b.poly([17, 0, 32, 14, 30, 46, 17, 59, 4, 46, 2, 14], M.steel);
    b.poly([17, 10, 25, 20, 24, 40, 17, 50, 10, 40, 9, 20], f ? M.glowY : M.glowC);
    b.circle(17, 30, 4, M.white);
  }));
  reg('callerrod', build(12, 30, 1, (b, _f, M) => {
    b.rect(3, 4, 6, 24, M.armorL);
    b.poly([6, 0, 10, 5, 2, 5], M.gold);
    b.circle(6, 27, 3, M.glowC);
  }));
  // ---- LEVIATHAN ----
  reg('lev_head', build(84, 60, 2, (b, f, M) => {
    b.poly([2, 30, 18, 12, 50, 4, 78, 10, 84, 30, 78, 50, 50, 56, 18, 48], M.steel);
    b.poly([20, 14, 50, 8, 74, 14, 66, 24, 30, 22], M.armorL);
    if (f) { b.poly([2, 30, 22, 22, 40, 30, 22, 40], M.dark); b.poly([6, 30, 22, 25, 34, 30, 22, 35], M.glowY); }
    else b.pxLine(4, 30, 34, 31, 'N1');
    b.circle(44, 22, 4, M.glowC);
    for (let k = 0; k < 4; k++) b.rect(54 + k * 6, 40, 3, 8, M.plate);
  }, 'auto'));
  reg('lev_seg', build(30, 28, 3, (b, f, M) => {
    b.ellipse(15, 14, 13.5, 12.5, f === 2 ? M.dark : M.steel);
    b.rect(5, 6, 20, 4, M.plate);
    if (f < 2) { b.ellipse(15, 5, 5, 3.5, M.armorL); b.circle(15, 4, 1.8, f ? M.glowY : M.glowC); }
    b.pxLine(15, 12, 15, 25, 'N2');
  }, 'auto'));
  reg('lev_tail', build(44, 44, 1, (b, _f, M) => {
    b.poly([4, 22, 20, 14, 42, 0, 36, 22, 42, 44, 20, 30], M.armorL);
    b.poly([18, 20, 34, 6, 32, 22, 34, 38], M.gold);
  }, 'auto'));
}

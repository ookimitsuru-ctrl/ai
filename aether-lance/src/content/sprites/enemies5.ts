// Stage 5 (FOUNDRY) sprites.
import { build, reg } from './registry';

export function buildEnemies5(): void {
  reg('presshead', build(50, 20, 1, (b, _f, M) => {
    b.rect(1, 2, 48, 16, M.steel);
    b.rect(1, 14, 48, 4, M.armorL);
    for (let k = 0; k < 6; k++) b.rect(3 + k * 8, 15, 4, 3, k % 2 ? M.dark : M.gold);
    b.rect(18, 0, 14, 4, M.armor);
  }, 'auto'));
  reg('welder', build(20, 20, 2, (b, f, M) => {
    b.circle(11, 10, 7, M.armor);
    b.rect(1, 8, 8, 4, M.armorL);
    b.circle(2, 10, 1.6, f ? M.glowC : M.glowO);
    b.circle(13, 8, 2.2, M.glowT);
    b.poly([10, 2, 18, 0, 16, 5], M.plate); b.poly([10, 18, 18, 20, 16, 15], M.plate);
  }));
  reg('scrap', build(26, 26, 1, (b, _f, M) => {
    b.poly([3, 8, 12, 2, 23, 6, 24, 18, 14, 24, 4, 20], M.rust);
    b.rect(8, 8, 10, 3, M.steel); b.rect(12, 14, 8, 4, M.plate);
    b.px(18, 9, 'O5');
  }, 'auto'));
  reg('beltgun', build(18, 14, 1, (b, _f, M) => {
    b.rect(1, 9, 16, 5, M.dark);
    b.ellipse(9, 9, 7, 6, M.rust);
    b.rect(0, 9, 18, 1, 0);
    b.circle(9, 6, 1.8, M.glowO);
  }));
  // ---- ASSEMBLY ARM ----
  reg('arm_base', build(46, 26, 1, (b, _f, M) => {
    b.rect(2, 2, 42, 14, M.steel); b.rect(14, 14, 18, 12, M.armor);
    for (let k = 0; k < 5; k++) b.rect(4 + k * 8, 4, 4, 3, M.gold);
  }, 'auto'));
  reg('arm_joint', build(30, 30, 2, (b, f, M) => {
    b.circle(15, 15, 12, M.steel);
    b.circle(15, 15, 6, f ? M.glowO : M.glowT);
  }, 'auto'));
  reg('arm_claw', build(40, 34, 2, (b, f, M) => {
    b.rect(14, 0, 12, 14, M.armor);
    b.poly([8, 12, 32, 12, 38, 30 - (f ? 6 : 0), 30, 33 - (f ? 6 : 0), 28, 20, 12, 20, 10, 33 - (f ? 6 : 0), 2, 30 - (f ? 6 : 0)], M.steel);
    b.circle(20, 16, 3, M.glowO);
  }, 'auto'));
  // ---- ANVIL ----
  reg('anvil_core', build(70, 70, 2, (b, f, M) => {
    b.rect(4, 4, 62, 62, M.steel);
    b.rect(10, 10, 50, 50, M.armor);
    b.circle(35, 35, 17, f ? M.glowY : M.glowO);
    b.circle(35, 35, 8, M.white);
    for (let k = 0; k < 4; k++) { b.rect(4 + k * 18, 0, 8, 6, M.gold); b.rect(4 + k * 18, 64, 8, 6, M.gold); }
  }, 'auto'));
  reg('anvil_arm', build(44, 22, 2, (b, f, M) => {
    b.rect(10, 6, 34, 10, M.steel);
    b.poly([0, 4, 12, 0, 14, 22, 0, 18], M.armorL);
    b.circle(5, 11, 3, f ? M.glowC : M.glowO);
  }, 'auto'));
}

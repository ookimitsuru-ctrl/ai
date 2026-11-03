// Stage 6 (CHOIR CORE) sprites.
import { build, reg } from './registry';

export function buildEnemies6(): void {
  reg('seraph', build(18, 18, 2, (b, f, M) => {
    b.poly([9, 1, 16, 9, 9, 17, 2, 9], M.white);
    b.poly([9, 4, 13, 9, 9, 14, 5, 9], M.gold);
    b.circle(9, 9, 2.2, f ? M.glowY : M.glowC);
    b.poly([0, 4, 4, 7, 2, 9], M.armorL); b.poly([18, 4, 14, 7, 16, 9], M.armorL);
  }, 'N3'));
  reg('cantor', build(26, 34, 2, (b, f, M) => {
    b.rect(5, 4, 16, 28, M.white);
    b.rect(8, 8, 10, 20, M.gold);
    b.ellipse(13, 6, 6, 4, M.white);
    b.ellipse(7, 16, 3, 5 + (f ? 1 : 0), f ? M.glowY : M.dark);
    for (let k = 0; k < 3; k++) b.px(13, 12 + k * 6, 'C4');
  }, 'N4'));
  reg('goldturret', build(18, 12, 1, (b, _f, M) => {
    b.ellipse(9, 11, 7.5, 7, M.white);
    b.rect(0, 11, 18, 1, 0);
    b.rect(2, 9, 14, 2, M.gold);
    b.circle(9, 7, 2, M.glowY);
  }, 'N4'));
  // ---- ANTIPHON ----
  reg('antiphon', build(50, 50, 2, (b, f, M) => {
    b.poly([25, 1, 49, 25, 25, 49, 1, 25], M.white);
    b.poly([25, 8, 42, 25, 25, 42, 8, 25], M.gold);
    b.circle(25, 25, 9, f ? M.glowY : M.glowC);
    b.circle(25, 25, 4, M.white);
  }, 'N3'));
  // ---- THE CHOIR ----
  reg('choir_core', build(48, 48, 2, (b, f, M) => {
    b.circle(24, 24, 22, M.white);
    b.circle(24, 24, 17, M.gold);
    b.circle(24, 24, 12, f ? M.glowY : M.glowC);
    b.circle(24, 24, 5, M.white);
  }, 'N3'));
  reg('choir_node', build(16, 16, 2, (b, f, M) => {
    b.poly([8, 0, 16, 8, 8, 16, 0, 8], M.white);
    b.circle(8, 8, 3.5, f ? M.glowY : M.glowC);
  }, 'N3'));
  reg('cantor_body', build(70, 120, 2, (b, f, M) => {
    b.poly([35, 0, 50, 16, 46, 40, 58, 118, 12, 118, 24, 40, 20, 16], M.white);
    b.poly([35, 44, 48, 116, 22, 116], M.gold);
    b.ellipse(35, 14, 10, 13, M.white);
    b.ellipse(33, 20, 4, 3, f ? M.glowY : M.glowR);
    b.circle(35, 60, 6, M.glowC);
  }, 'N3'));
  reg('cantor_wing', build(48, 96, 2, (b, f, M) => {
    const open = f === 1;
    if (open) b.poly([2, 4, 46, 30, 40, 92, 10, 60], M.white);
    else b.poly([30, 2, 46, 30, 40, 92, 24, 60], M.white);
    for (let k = 0; k < 5; k++) b.line(open ? 6 + k * 7 : 30 + k * 3, 10 + k * 14, 42, 34 + k * 10, M.gold);
  }, 'N3'));
  reg('silence', build(26, 26, 2, (b, f, M) => {
    b.circle(13, 13, 11, M.dark);
    b.circle(13, 13, 7, f ? M.glowR : M.white);
    b.circle(13, 13, 3, M.dark);
  }, 'N0'));
}

// Stage 3 (HIVE GARDEN) sprites.
import { build, reg } from './registry';

export function buildEnemies3(): void {
  reg('spore', build(10, 10, 2, (b, f, M) => {
    b.circle(5, 5, f ? 3.6 : 3.1, M.glowT);
    b.px(4, 4, 'N8');
  }, 'T0'));
  reg('broodpod', build(26, 24, 2, (b, f, M) => {
    const sw = f ? 1.2 : 0;
    b.ellipse(13, 13, 11 + sw, 9 + sw, M.flesh);
    b.ellipse(13, 7, 5, 3, M.dark);
    b.circle(13, 6, 2.2, M.glowT);
    for (const [x, y] of [[6, 14], [19, 15], [10, 19], [16, 10]] as const) b.px(x, y, 'T3');
    b.pxLine(5, 11, 9, 17, 'F3'); b.pxLine(21, 12, 17, 18, 'F3');
  }, 'F0'));
  reg('tendril_tip', build(18, 18, 2, (b, f, M) => {
    b.ellipse(9, 9, 7, 6, M.flesh);
    b.poly([2, 5, 0, 0, 6, 4], M.bone); b.poly([2, 13, 0, 18, 6, 14], M.bone);
    b.circle(7, 9, f ? 3 : 2.4, M.glowT);
  }, 'F0'));
  reg('tendril_seg', build(12, 12, 1, (b, _f, M) => {
    b.circle(6, 6, 5, M.flesh);
    b.px(4, 4, 'F3');
  }, 'F0'));
  reg('leech', build(18, 10, 2, (b, f, M) => {
    for (let k = 0; k < 4; k++) b.circle(4 + k * 3.5, 5 + (f && k % 2 ? 1 : 0), 3.4 - k * 0.4, M.flesh);
    b.circle(3, 5, 1.3, M.glowT);
    b.px(15, 5, 'F3');
  }, 'F0'));
  reg('podorganic', build(52, 34, 2, (b, f, M) => {
    b.ellipse(26, 17, 24, 13, M.flesh);
    for (let k = 0; k < 5; k++) b.ellipse(12 + k * 7, 17, 3, 11, M.bone);
    b.circle(44, 17, 4, f ? M.glowC : M.glowT);
    b.circle(8, 17, 3, M.dark);
  }, 'F0'));
  // ---- GRUB ----
  reg('grub_head', build(42, 36, 2, (b, f, M) => {
    b.ellipse(22, 18, 19, 16, M.flesh);
    b.poly([2, 10, 10, 6, 10, 12], M.bone); b.poly([2, 26, 10, 30, 10, 24], M.bone);
    if (f) { b.ellipse(9, 18, 7, 8, M.dark); b.ellipse(8, 18, 4, 5, M.glowR); }
    else b.ellipse(8, 18, 4, 2, M.dark);
    b.circle(20, 9, 2, M.glowT); b.circle(20, 27, 2, M.glowT);
  }, 'F0'));
  reg('grub_seg', build(32, 32, 3, (b, f, M) => {
    b.circle(16, 16, 13.5, M.flesh);
    for (let k = 0; k < 3; k++) b.ellipse(11 + k * 5, 16, 1.6, 12, M.bone);
    if (f === 0) b.circle(16, 9, 4, M.glowG);
    else if (f === 1) b.circle(16, 9, 4.5, M.glowT);
    else b.circle(16, 9, 3, M.dark);
  }, 'F0'));
  // ---- MATRIARCH ----
  reg('mat_body', build(124, 144, 1, (b, _f, M) => {
    b.ellipse(62, 72, 54, 68, M.flesh);
    for (let k = 0; k < 7; k++) b.ellipse(62, 72, 54 - k * 2, 68 - k * 9, k % 2 ? M.flesh : M.green);
    b.ellipse(62, 72, 30, 36, M.flesh);
    b.ellipse(62, 72, 22, 26, M.dark);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.circle(62 + Math.cos(a) * 44, 72 + Math.sin(a) * 56, 2, M.glowT); }
  }, 'F0'));
  reg('mat_eye', build(40, 40, 3, (b, f, M) => {
    if (f === 0) { b.ellipse(20, 20, 17, 17, M.bone); b.pxLine(4, 20, 36, 20, 'F0'); }
    else { b.circle(20, 20, 17, M.white); b.circle(20, 20, f === 2 ? 10 : 8, M.glowR); b.circle(20, 20, 3.5, M.dark); b.px(16, 15, 'N8'); }
  }, 'F0'));
  reg('mat_petal', build(66, 42, 1, (b, _f, M) => {
    b.poly([2, 21, 20, 4, 50, 2, 64, 21, 50, 40, 20, 38], M.bone);
    b.poly([10, 21, 24, 10, 48, 9, 56, 21, 48, 33, 24, 32], M.flesh);
    b.pxLine(10, 21, 56, 21, 'T3');
  }, 'F0'));
}

// Stage 2 (PRISM CAVERN) sprites.
import { build, reg } from './registry';

export function buildEnemies2(): void {
  reg('shardmite', build(16, 14, 2, (b, f, M) => {
    for (const [x1, x2] of [[4, 1], [8, 7], [12, 15]] as const) { b.line(x1, 8, x2, 13 - (f && x1 === 8 ? 1 : 0), M.armor); b.line(x1, 6, x2, 1 + (f && x1 === 4 ? 1 : 0), M.armor); }
    b.poly([2, 7, 7, 3, 13, 4, 15, 7, 13, 10, 7, 11], M.crystal);
    b.circle(5, 7, 1.6, M.glowC);
    b.px(10, 5, 'P4');
  }));
  reg('prismeye', build(24, 24, 2, (b, f, M) => {
    b.poly([12, 0, 22, 6, 23, 18, 12, 23, 1, 18, 2, 6], M.crystal);
    b.circle(12, 12, 7, M.white);
    b.circle(11, 12, 4.4, f ? M.glowR : M.glowP);
    b.circle(10, 12, 1.6, M.dark);
    b.px(9, 10, 'N8');
  }));
  reg('geode', build(28, 28, 1, (b, _f, M) => {
    const pts: number[] = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const r = 9 + ((k * 37) % 5); pts.push(14 + Math.cos(a) * r, 14 + Math.sin(a) * r); }
    b.poly(pts, M.stone);
    for (const [a, l] of [[0.3, 7], [1.5, 6], [2.6, 8], [3.9, 6], [5.1, 7]] as const) {
      const x = 14 + Math.cos(a) * 8, y = 14 + Math.sin(a) * 8;
      b.poly([x - Math.sin(a) * 3, y + Math.cos(a) * 3, x + Math.cos(a) * l, y + Math.sin(a) * l, x + Math.sin(a) * 3, y - Math.cos(a) * 3], M.crystal);
    }
    b.circle(14, 14, 3, M.glowP);
  }));
  reg('spinner', build(44, 44, 1, (b, _f, M) => {
    b.rect(18, 2, 8, 40, M.armor);
    b.rect(2, 18, 40, 8, M.armor);
    b.circle(22, 22, 9, M.steel);
    b.circle(22, 22, 4.5, M.glowP);
    for (const [x, y] of [[22, 4], [22, 40], [4, 22], [40, 22]] as const) b.circle(x, y, 2.6, M.crystal);
  }));
  reg('stalactite', build(16, 42, 1, (b, _f, M) => {
    b.poly([1, 0, 15, 0, 9, 41, 7, 41], M.crystal);
    b.poly([5, 0, 9, 0, 8, 30], M.crystalC);
  }));
  reg('lens', build(34, 34, 2, (b, f, M) => {
    b.circle(17, 17, 15, M.armorL);
    b.circle(17, 17, 11, f ? M.glowC : M.crystalC);
    b.circle(14, 14, 3, M.white);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.circle(17 + Math.cos(a) * 13, 17 + Math.sin(a) * 13, 1.5, M.crystal); }
  }));
  // ---- LUMEN GOLEM ----
  reg('golem_torso', build(150, 200, 1, (b, _f, M) => {
    b.poly([40, 10, 120, 0, 150, 30, 150, 200, 20, 200, 10, 140, 30, 60], M.stone);
    b.poly([60, 30, 110, 20, 130, 60, 120, 130, 60, 140, 40, 90], M.crystal);
    b.poly([20, 150, 70, 140, 110, 170, 100, 200, 20, 200], M.stone);
    b.poly([120, 0, 135, -2, 150, 10, 150, 30], M.crystalC);
    b.poly([10, 140, 0, 160, 20, 170], M.crystal);
  }, 'auto'));
  reg('golem_head', build(46, 42, 3, (b, f, M) => {
    b.poly([6, 10, 22, 0, 40, 4, 46, 22, 38, 40, 10, 40, 0, 26], M.stone);
    b.poly([22, 0, 30, -4, 40, 4], M.crystal);
    if (f === 0) b.rect(6, 16, 26, 9, M.crystal); // visor closed
    else if (f === 1) { b.rect(6, 15, 26, 11, M.dark); b.circle(17, 20, 5, M.glowR); b.px(15, 18, 'N8'); }
    else { b.rect(6, 15, 26, 11, M.dark); b.circle(17, 20, 6, M.glowR); b.circle(17, 20, 2.5, M.white); }
  }, 'auto'));
  reg('golem_fist', build(46, 40, 2, (b, f, M) => {
    b.poly([4, 8, 20, 2, 40, 4, 46, 20, 40, 36, 20, 38, 4, 32, 0, 20], M.stone);
    for (let k = 0; k < 4; k++) b.rect(2, 8 + k * 7, 10, 5, M.crystal);
    if (f) b.circle(30, 20, 6, M.glowP);
  }, 'auto'));
  reg('golem_chest', build(38, 44, 2, (b, f, M) => {
    b.poly([19, 0, 38, 12, 34, 34, 19, 44, 4, 34, 0, 12], f ? M.glowP : M.crystal);
    b.poly([19, 6, 30, 14, 19, 36, 8, 14], M.crystalC);
    b.px(15, 10, 'N8'); b.px(16, 9, 'N8');
  }, 'auto'));
}

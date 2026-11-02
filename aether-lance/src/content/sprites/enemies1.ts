// Sprites for common enemies (stage 1 set) and stage 1 midboss/boss parts.
import { build, reg } from './registry';

export function buildEnemies1(): void {
  reg('dart', build(18, 12, 2, (b, f, M) => {
    b.poly([1, 6, 8, 1.5, 16.5, 2.5, 12.5, 6, 16.5, 9.5, 8, 10.5], M.armor);
    b.poly([5, 6, 9, 4, 13, 4.5, 11, 6, 13, 7.5, 9, 8], M.plate);
    b.circle(6.5, 6, 1.7, f ? M.glowC : M.glowT);
    b.px(15, 3, 'N6'); b.px(15, 9, 'N4');
  }));

  reg('swirl', build(18, 18, 4, (b, f, M) => {
    const a0 = (f / 4) * (Math.PI / 2);
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2;
      const x1 = 9 + Math.cos(a) * 8, y1 = 9 + Math.sin(a) * 8;
      const x2 = 9 + Math.cos(a + 0.7) * 4, y2 = 9 + Math.sin(a + 0.7) * 4;
      const x3 = 9 + Math.cos(a - 0.3) * 3, y3 = 9 + Math.sin(a - 0.3) * 3;
      b.poly([x3, y3, x1, y1, x2, y2], M.armorL);
    }
    b.circle(9, 9, 4.6, M.armor);
    b.circle(9, 9, 2.2, M.glowT);
  }));

  reg('hopper', build(18, 16, 4, (b, f, M) => {
    const crouch = f === 1 ? 2 : f === 3 ? 1 : 0;
    const jump = f === 2;
    const by = 6 + crouch;
    const ly = jump ? 12 : 15;
    b.line(6, by + 2, jump ? 3 : 4, ly, M.armorL, 2);
    b.line(12, by + 2, jump ? 15 : 14, ly, M.armorL, 2);
    b.ellipse(9, by, 6.5, 4.4, M.armor);
    b.rect(5, by - 1, 8, 2, M.plate);
    b.circle(5, by, 1.6, M.glowT);
    b.px(4, ly, 'N7'); b.px(14, ly, 'N7');
  }));

  reg('turret', build(18, 12, 1, (b, _f, M) => {
    b.ellipse(9, 11, 7.5, 7, M.armor);
    b.rect(0, 11, 18, 1, 0);
    b.rect(2, 9, 14, 2, M.plate);
    b.circle(9, 7, 2.2, M.glowT);
  }));
  reg('turret2', build(22, 12, 1, (b, _f, M) => {
    b.ellipse(11, 11, 9.5, 7, M.armor);
    b.rect(0, 11, 22, 1, 0);
    b.rect(2, 9, 18, 2, M.plate);
    b.circle(8, 7, 1.8, M.glowT); b.circle(14, 7, 1.8, M.glowT);
  }));

  reg('hatch', build(34, 18, 6, (b, f, M) => {
    b.rect(1, 3, 32, 15, M.armor);
    b.rect(4, 6, 26, 12, M.dark);
    if (f > 0) b.ellipse(17, 14, 9, 6, M.glowT);
    const open = f * 2.4;
    b.rect(4 - open, 5, 13, 13, M.plate);
    b.rect(17 + open, 5, 13, 13, M.plate);
    b.rect(0, 3, 4, 15, M.armor); b.rect(30, 3, 4, 15, M.armor);
    b.pxLine(2, 4, 31, 4, 'N5');
    b.px(10 - open, 10, 'O5'); b.px(24 + open, 10, 'O5');
  }));

  reg('moth', build(12, 12, 2, (b, f, M) => {
    const up = f === 0;
    b.poly([6, 6, 11, up ? 1 : 4, 9, 6], M.armorL);
    b.poly([6, 6, 11, up ? 11 : 8, 9, 6], M.armorL);
    b.ellipse(5, 6, 3.5, 2.2, M.armor);
    b.circle(3, 6, 1.2, M.glowO);
  }));

  reg('mine', build(18, 18, 4, (b, f, M) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      b.line(9 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, 9 + Math.cos(a) * 8, 9 + Math.sin(a) * 8, M.armorL);
    }
    b.circle(9, 9, 5.2, M.armor);
    b.circle(9, 9, 2.2, f >= 2 ? M.glowR : f === 1 ? M.glowC : M.glowT);
  }));

  reg('lancer', build(24, 12, 2, (b, f, M) => {
    b.poly([1, 6, 10, 3, 22, 3.5, 23, 6, 22, 8.5, 10, 9], M.armor);
    b.poly([14, 3.5, 20, 0.5, 22, 3.5], M.armorL);
    b.poly([14, 8.5, 20, 11.5, 22, 8.5], M.armorL);
    b.rect(10, 5, 10, 2, M.plate);
    if (f) b.poly([0, 6, 4, 4.5, 4, 7.5], M.glowO);
    b.circle(12, 6, 1.4, M.glowT);
  }));

  reg('shell', build(26, 20, 2, (b, f, M) => {
    b.ellipse(14, 10, 10.5, 8, M.teal);
    b.ellipse(10, 10, 8.5, 8.5, M.armor);
    b.pxLine(5, 4, 5, 16, 'N1'); b.pxLine(9, 2, 9, 18, 'N1');
    b.circle(20, 10, 2.6, f ? M.glowC : M.glowT);
    b.circle(16, 5, 1.2, M.glowT);
  }));

  reg('weaver', build(20, 14, 2, (b, f, M) => {
    b.poly([1, 7, 6, 3, 14, 4 + f, 19, 2, 19, 12, 14, 10 - f, 6, 11], M.armor);
    b.rect(6, 6, 8, 2, M.plate);
    b.circle(5, 7, 1.6, M.glowT);
    b.px(17, 4, 'O5'); b.px(17, 10, 'O5');
  }));

  const rock = (name: string, r: number, seed: number) => {
    reg(name, build(Math.ceil(r * 2 + 4), Math.ceil(r * 2 + 4), 1, (b, _f, M) => {
      const c = r + 2;
      const pts: number[] = [];
      let s = seed;
      const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      const n = 11;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const rr = r * (0.72 + rnd() * 0.28); pts.push(c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
      b.poly(pts, M.stone);
      if (r > 6) { b.ellipse(c + r * 0.3, c - r * 0.2, r * 0.25, r * 0.2, M.plate); b.rect(Math.round(c - r * 0.5), Math.round(c + r * 0.2), Math.round(r * 0.5), 2, M.rust); }
    }));
  };
  rock('debrisL', 15, 7);
  rock('debrisM', 9.5, 13);
  rock('debrisS', 4.6, 5);

  reg('runner', build(26, 16, 4, (b, f, M) => {
    b.rect(2, 10, 22, 5, M.dark);
    for (let k = 0; k < 4; k++) b.circle(5 + k * 5.3, 12.5, 2, M.armorL);
    b.pxLine(3, 10, 23, 10, ((f % 2) ? 'N5' : 'N4'));
    b.poly([3, 10, 6, 5, 20, 5, 24, 10], M.armor);
    b.ellipse(12, 5, 5, 3.5, M.armorL);
    b.rect(0, 4, 8, 2, M.plate);
    b.circle(13, 4.5, 1.3, M.glowT);
  }));

  // ---- medium -------------------------------------------------------------------------------------
  reg('bulwark', build(68, 44, 2, (b, f, M) => {
    b.poly([2, 24, 12, 12, 40, 8, 64, 12, 66, 22, 64, 34, 40, 38, 12, 36], M.steel);
    b.poly([12, 14, 40, 11, 60, 14, 60, 18, 12, 18], M.armorL);
    b.rect(14, 26, 44, 4, M.plate);
    b.rect(60, 18, 6, 10, M.dark);
    b.ellipse(8, 24, 5, 5, M.armor);
    b.circle(5, 24, 2.8, f ? M.glowO : M.glowT);
    for (let k = 0; k < 6; k++) b.px(18 + k * 7, 33, 'C4');
    b.pxLine(14, 21, 58, 21, 'N2');
  }));
  reg('dome', build(14, 9, 1, (b, _f, M) => {
    b.ellipse(7, 8.5, 6, 6, M.armorL);
    b.rect(0, 8, 14, 1, 0);
    b.circle(7, 5, 1.5, M.glowT);
  }));
  reg('carrierpod', build(52, 34, 2, (b, f, M) => {
    b.ellipse(26, 17, 24, 12, M.steel);
    b.rect(8, 14, 36, 6, M.plate);
    b.ellipse(14, 17, 6, 7, M.dark);
    b.circle(44, 17, 4, f ? M.glowC : M.glowT);
    b.poly([30, 6, 42, 0.5, 46, 6], M.armor);
    b.poly([30, 28, 42, 33.5, 46, 28], M.armor);
    for (let k = 0; k < 5; k++) b.px(16 + k * 5, 11, 'C4');
  }));

  // ---- MB1 GATEKEEPER ----------------------------------------------------------------------------------
  reg('gk_pillar', build(36, 100, 1, (b, _f, M) => {
    b.rect(4, 0, 28, 100, M.steel);
    b.rect(8, 0, 20, 100, M.armor);
    for (let y = 6; y < 100; y += 14) b.rect(4, y, 28, 3, M.plate);
    b.rect(0, 84, 36, 16, M.armorL);
    b.pxLine(30, 0, 30, 99, 'N6');
  }));
  reg('gk_emitter', build(20, 24, 2, (b, f, M) => {
    b.ellipse(12, 12, 8, 11, M.armorL);
    b.ellipse(9, 12, 5, 8, M.dark);
    b.ellipse(8, 12, 3.4, 6, f ? M.glowC : M.glowT);
  }));

  // ---- B1 WARDEN (carrier) -------------------------------------------------------------------------------
  reg('warden_hull', build(212, 104, 1, (b, _f, M) => {
    // main hull
    b.poly([18, 52, 40, 30, 120, 22, 190, 26, 206, 40, 206, 66, 190, 78, 120, 84, 40, 76], M.steel);
    // upper deck & lower keel
    b.poly([60, 26, 120, 14, 170, 18, 176, 26], M.armorL);
    b.poly([60, 80, 120, 92, 160, 88, 168, 80], M.armor);
    // prow
    b.poly([2, 52, 22, 42, 40, 44, 40, 60, 22, 62], M.armor);
    // panel lines
    for (let x = 52; x < 190; x += 18) b.pxLine(x, 30, x - 4, 76, 'N2');
    b.pxLine(42, 52, 200, 52, 'N2');
    // hangar bays
    b.rect(78, 30, 34, 10, M.dark);
    b.rect(78, 66, 34, 10, M.dark);
    // engine block
    b.rect(192, 34, 18, 38, M.dark);
    b.rect(196, 38, 12, 8, M.glowO); b.rect(196, 60, 12, 8, M.glowO);
    // windows
    for (let k = 0; k < 9; k++) { b.px(126 + k * 7, 46, 'C4'); b.px(126 + k * 7, 59, 'C3'); }
    // core housing
    b.ellipse(150, 53, 16, 16, M.armor);
    b.ellipse(150, 53, 12, 12, M.dark);
  }, 'auto'));
  reg('warden_shutter', build(28, 30, 6, (b, f, M) => {
    const open = f * 2.4;
    b.rect(2 - open, 2, 12, 26, M.armorL);
    b.rect(14 + open, 2, 12, 26, M.armorL);
    b.pxLine(14 - open, 2, 14 - open, 27, 'N2');
    b.pxLine(13 + open, 2, 13 + open, 27, 'N2');
  }, 'auto'));
  reg('warden_core', build(22, 22, 2, (b, f, M) => {
    b.circle(11, 11, 9, f ? M.glowC : M.glowT);
    b.circle(11, 11, 4, M.white);
  }, 'T1'));
  reg('warden_prow', build(30, 20, 2, (b, f, M) => {
    b.rect(8, 4, 20, 12, M.armorL);
    b.rect(0, 7, 12, 6, M.armor);
    b.circle(3, 10, 2.4, f ? M.glowO : M.glowR);
  }));
  reg('warden_hatch', build(36, 14, 3, (b, f, M) => {
    b.rect(1, 1, 34, 12, M.armor);
    if (f === 1) b.ellipse(18, 7, 12, 4, M.glowT);
    else if (f === 0) { b.rect(3, 3, 14, 8, M.plate); b.rect(19, 3, 14, 8, M.plate); }
    else { b.rect(3, 3, 30, 8, M.dark); b.px(10, 6, 'O4'); b.px(25, 8, 'O3'); }
  }));
}

// HD edition terrain materials: continuous-colour surface shaders (in place of the pixel-art palette painters).
// Input: world position (continuous), material, depth below the surface d (game px), outward normal (ax, ay) and
// the light term lit (-1..1, light from the upper left). Output: linear 0..255 RGB in `out`.
import { PAL, type PalKey, hexToRgb } from './palette';
import { MAT } from '../game/terrain';
import { vnoise2, fbm } from '../content/backgrounds/common';

export interface SurfHD { x: number; y: number; mat: number; d: number; ax: number; ay: number; lit: number }
export type ShaderHD = (p: SurfHD, out: number[]) => void;

const C = (k: PalKey): [number, number, number] => hexToRgb(PAL[k]);
const sat = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = (a: number, b: number, v: number) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function mix(o: number[], a: readonly number[], b: readonly number[], t: number): void {
  o[0] = a[0]! + (b[0]! - a[0]!) * t; o[1] = a[1]! + (b[1]! - a[1]!) * t; o[2] = a[2]! + (b[2]! - a[2]!) * t;
}
function add(o: number[], c: readonly number[], k: number): void { o[0]! += c[0]! * k; o[1]! += c[1]! * k; o[2]! += c[2]! * k; }
function mul(o: number[], k: number): void { o[0]! *= k; o[1]! *= k; o[2]! *= k; }
/** distance (px) to the nearest grid line of period p */
const seam = (v: number, p: number) => { const m = ((v % p) + p) % p; return Math.min(m, p - m); };

/** Shared surface treatment: bevelled rim lit from the upper left, darker with depth. */
function rim(o: number[], p: SurfHD, light: readonly number[], dark: readonly number[], width = 2.2): void {
  const edge = 1 - ss(0, width, p.d);
  if (edge <= 0) return;
  if (p.lit > 0) add(o, light, edge * p.lit * 0.9);
  else mix(o, o, dark, edge * -p.lit * 0.7);
}

const hullBase = C('N3'), hullDark = C('N1'), hullLight = C('N5'), cyan = C('C3'), cyanHi = C('C4'), steelHi = C('N6');
const caveRock = C('P0'), caveRock2 = C('N1'), caveHi = C('P2'), cryA = C('P1'), cryB = C('P3'), cryC = C('C4'), cryHi = C('C5');
const fleshA = C('F1'), fleshB = C('F2'), fleshHi = C('F3'), fleshDeep = C('F0'), vein = C('T2'), veinHi = C('T3');
const stoneA = C('N4'), stoneB = C('N3'), stoneHi = C('N6'), moss = C('G2'), mossDk = C('G1'), mortar = C('N2');
const fdA = C('N3'), fdB = C('N2'), fdDk = C('N1'), haz = C('Y3'), hazDk = C('N0'), ember = C('O5'), bolt = C('N5');
const marble = C('N7'), marbleB = C('N6'), marbleDk = C('N5'), gold = C('Y3'), goldHi = C('Y4');

export const THEMES_HD: Record<string, ShaderHD> = {
  // ST1: station hull — brushed plates, AA seams, rivets, a few cyan running lights
  hull: (p, o) => {
    const { x, y, d } = p;
    const n = fbm(x * 0.05, y * 0.05, 3, 3);
    mix(o, hullDark, hullBase, sat(0.55 + n * 0.5 - Math.min(0.5, d * 0.015)));
    const brushed = vnoise2(x * 0.02, y * 1.3, 11) * 0.08;
    mul(o, 0.95 + brushed);
    const sx = seam(x, 40), sy = seam(y, 24);
    const s = Math.min(sx, sy);
    if (d > 2) {
      mul(o, 0.55 + 0.45 * ss(0.2, 1.1, s));       // dark seam
      if (s > 1.1 && s < 1.9 && (sx < sy ? (x % 40 + 40) % 40 < 20 : (y % 24 + 24) % 24 < 12)) add(o, steelHi, 0.12); // lit lip
      const rx = ((x % 40) + 40) % 40 - 4, ry = ((y % 24) + 24) % 24 - 4;
      const rv = Math.hypot(rx, ry);
      if (rv < 1.3) { mix(o, o, steelHi, ss(1.3, 0.6, rv) * 0.8); }
      const lx = ((x % 120) + 120) % 120, ly = ((y % 24) + 24) % 24;
      if (d > 5 && lx > 6 && lx < 12 && ly > 6 && ly < 8.5) { mix(o, cyan, cyanHi, ss(6, 9, lx)); }
    }
    rim(o, p, cyan, hullDark);
    if (p.d < 1.4 && p.lit > 0.25) add(o, cyanHi, (1.4 - p.d) * 0.35);
  },
  // ST2: dark cave rock and faceted crystal
  cave: (p, o) => {
    const { x, y, d } = p;
    if (p.mat === MAT.CRYSTAL) {
      const f = Math.sin((x + y * 2) * 0.16) * 0.5 + 0.5;
      const facet = Math.abs(Math.sin(x * 0.11 - y * 0.07)) ;
      mix(o, cryA, cryB, sat(0.3 + f * 0.5 + p.lit * 0.25 - d * 0.01));
      add(o, cryC, ss(0.85, 1, facet) * 0.35);
      if (d < 1.8) mix(o, o, p.lit > 0 ? cryHi : cryA, (1.8 - d) / 1.8 * Math.abs(p.lit));
      const sparkle = vnoise2(x * 0.5, y * 0.5, 9);
      if (sparkle > 0.86) add(o, cryHi, (sparkle - 0.86) * 4);
      return;
    }
    const n = fbm(x * 0.04, y * 0.04, 5, 4);
    mix(o, caveRock2, caveRock, sat(n * 1.2 - 0.1));
    const strata = vnoise2(x * 0.01, y * 0.15, 6);
    mul(o, 0.85 + strata * 0.3);
    rim(o, p, caveHi, caveRock2, 2.6);
  },
  // ST3: hive flesh — layered tissue, luminous veins, wet sheen on the surface
  flesh: (p, o) => {
    const { x, y, d } = p;
    const n = fbm(x * 0.05, y * 0.05, 7, 4);
    mix(o, fleshA, fleshB, sat(n * 1.3 - 0.2));
    mix(o, o, fleshDeep, sat((d - 4) / 18));
    const v = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 3) + Math.sin(y * 0.13 + x * 0.03);
    const vv = Math.abs(v);
    if (d > 3) { mix(o, o, vein, ss(0.16, 0.0, vv) * 0.85); add(o, veinHi, ss(0.05, 0.0, vv) * 0.4); }
    rim(o, p, fleshHi, fleshDeep, 3);
    if (d < 2.4 && p.lit > 0.2) add(o, [255, 220, 230], ss(2.4, 0.6, d) * (p.lit - 0.2) * 0.35); // wet highlight
  },
  // ST4: storm ruins — weathered stone blocks, mortar, moss on the lit tops
  ruins: (p, o) => {
    const { x, y, d } = p;
    const row = Math.floor(y / 10);
    const bx = x + (row % 2) * 10;
    const n = fbm(x * 0.08, y * 0.08, 13, 3);
    const blockTone = vnoise2(Math.floor(bx / 20), row, 21);
    mix(o, stoneB, stoneA, sat(0.25 + blockTone * 0.5 + n * 0.4));
    const s = Math.min(seam(bx, 20), seam(y, 10));
    if (d > 2) mix(o, mortar, o, ss(0.3, 1.2, s));
    rim(o, p, stoneHi, mortar, 2.4);
    if (p.lit > 0.3 && d < 5) mix(o, o, n > 0.5 ? moss : mossDk, ss(5, 1.5, d) * (p.lit - 0.3) * 1.2 * ss(0.35, 0.65, n));
  },
  // ST5: foundry — dark plating, bolts, hazard stripes along the edges, conveyor treads
  foundry: (p, o) => {
    const { x, y, d } = p;
    if (p.mat === MAT.CONV_L || p.mat === MAT.CONV_R) {
      const tread = ((x * 0.25) % 2 + 2) % 2;
      mix(o, fdDk, bolt, d < 3 ? ss(0.8, 1.2, tread) * 0.5 : 0.08);
      rim(o, p, steelHi, fdDk, 1.6);
      return;
    }
    const n = fbm(x * 0.06, y * 0.06, 17, 3);
    mix(o, fdB, fdA, sat(0.4 + n * 0.5));
    if (d > 2.4 && d < 5.6) {
      const band = (((x + y) / 8) % 2 + 2) % 2;
      const black = ss(0.94, 1.06, band) * (1 - ss(1.94, 2.0, band)) + (1 - ss(0, 0.06, band)) * 0.5;
      mix(o, haz, hazDk, sat(black));
      mul(o, 0.92 + n * 0.16);
    }
    if (d >= 5.6) {
      const s = Math.min(seam(x, 32), seam(y, 32));
      mul(o, 0.6 + 0.4 * ss(0.2, 1.0, s));
      const bx = ((x % 32) + 32) % 32, by = ((y % 32) + 32) % 32;
      for (const [cx, cy] of [[4, 4], [28, 4], [4, 28], [28, 28]] as const) { const r = Math.hypot(bx - cx, by - cy); if (r < 1.4) mix(o, o, bolt, ss(1.4, 0.5, r)); }
    }
    rim(o, p, ember, fdDk, 1.8);
  },
  // ST6: choir — pale marble with gold inlay crosses
  choir: (p, o) => {
    const { x, y, d } = p;
    const n = fbm(x * 0.03, y * 0.03, 23, 4);
    const veins = Math.abs(Math.sin(x * 0.05 + n * 6));
    mix(o, marbleB, marble, sat(0.4 + n * 0.6));
    mix(o, o, marbleDk, ss(0.08, 0.0, veins) * 0.5);
    const px = ((x % 48) + 48) % 48, py = ((y % 32) + 32) % 32;
    if (d > 3) {
      const inlay = Math.min(px > 14 && px < 34 ? Math.abs(py - 16) : 9, py > 6 && py < 26 ? Math.abs(px - 24) : 9);
      if (inlay < 1.2) mix(o, o, gold, ss(1.2, 0.5, inlay));
      if (inlay < 0.45) add(o, goldHi, 0.25);
      const s = Math.min(seam(x, 48), seam(y, 32));
      mul(o, 0.82 + 0.18 * ss(0.2, 1.0, s));
    }
    rim(o, p, goldHi, marbleDk, 2.2);
  },
};

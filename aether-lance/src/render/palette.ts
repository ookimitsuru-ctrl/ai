// Master palette (docs/07_visual.md §2.1)
export const PAL = {
  N0: '#0b0d17', N1: '#141a2e', N2: '#1f2a44', N3: '#2d3c5e', N4: '#44587e', N5: '#6a7fa3', N6: '#97a9c6', N7: '#c6d2e3', N8: '#f2f6fb',
  C0: '#0e2a4a', C1: '#135e8a', C2: '#1c8ac0', C3: '#33b7e8', C4: '#7fe0ff', C5: '#d4f7ff',
  O0: '#3d1408', O1: '#6e2510', O2: '#a33a14', O3: '#d9601c', O4: '#f58f2a', O5: '#ffbf4d', O6: '#ffe39a',
  R0: '#2a0614', R1: '#9e1050', R2: '#e0207a', R3: '#ff4fa3', R4: '#ffc2e0',
  G0: '#0f3324', G1: '#1b5e3a', G2: '#2f9a52', G3: '#5ed16b', G4: '#b2f28a',
  P0: '#24123d', P1: '#3e1f6b', P2: '#6a35a8', P3: '#9c62e0', P4: '#cfa6ff',
  Y0: '#4a3206', Y1: '#8a6210', Y2: '#c9961c', Y3: '#f2cc4a', Y4: '#fff2a8',
  T0: '#0c2f2f', T1: '#12555a', T2: '#1e8d8c', T3: '#41c9b4',
  F0: '#2b0f1e', F1: '#4f1d33', F2: '#6d3a4e', F3: '#8f6170',
} as const;

export type PalKey = keyof typeof PAL;

const rgbCache = new Map<string, [number, number, number]>();
export function hexToRgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const v = parseInt(hex.slice(1), 16);
    c = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export function rgb(key: PalKey): [number, number, number] {
  return hexToRgb(PAL[key]);
}

export function rgba(key: PalKey, a: number): string {
  const [r, g, b] = rgb(key);
  return `rgba(${r},${g},${b},${a})`;
}

/** 4×4 Bayer matrix, values 0..15 → thresholds (v+0.5)/16 */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

import { Sprite, SB, type Material } from '../../render/sprite';
import type { PalKey } from '../../render/palette';

export const SPR: Record<string, Sprite> = {};

export function reg(name: string, s: Sprite): Sprite {
  SPR[name] = s;
  return s;
}

export function spr(name: string): Sprite {
  const s = SPR[name];
  if (!s) throw new Error('sprite missing: ' + name);
  return s;
}

/** Build a multi-frame sprite from a per-frame builder callback. */
export function build(w: number, h: number, frames: number, fn: (b: SB, f: number, M: Mats) => void, outline: PalKey | 'auto' | null = 'N1'): Sprite {
  const list: HTMLCanvasElement[] = [];
  for (let f = 0; f < frames; f++) {
    const b = new SB(w, h);
    const M = mats(b);
    fn(b, f, M);
    list.push(b.render({ outline }));
  }
  return Sprite.fromCanvases(list);
}

export type Mats = ReturnType<typeof mats>;

export function mats(b: SB) {
  const m = (d: Material) => b.mat(d);
  return {
    armor: m({ ramp: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'], bevel: 3 }),
    armorL: m({ ramp: ['N3', 'N4', 'N5', 'N6', 'N7', 'N8'], bevel: 3 }),
    hull: m({ ramp: ['N3', 'N4', 'N5', 'N6', 'N7', 'N8'], bevel: 3, shine: 'N8' }),
    dark: m({ ramp: ['N0', 'N1', 'N2', 'N3'], bevel: 2 }),
    plate: m({ ramp: ['N2', 'N3', 'N4', 'N5'], bevel: 2 }),
    glowT: m({ ramp: ['T1', 'T2', 'T3', 'C5'], bevel: 2, emissive: true }),
    glowC: m({ ramp: ['C1', 'C2', 'C3', 'C4', 'C5'], bevel: 2, emissive: true }),
    glowO: m({ ramp: ['O2', 'O3', 'O4', 'O5', 'O6'], bevel: 2, emissive: true }),
    glowY: m({ ramp: ['Y1', 'Y2', 'Y3', 'Y4'], bevel: 2, emissive: true }),
    glowP: m({ ramp: ['P1', 'P2', 'P3', 'P4'], bevel: 2, emissive: true }),
    glowG: m({ ramp: ['G1', 'G2', 'G3', 'G4'], bevel: 2, emissive: true }),
    glowR: m({ ramp: ['R1', 'R2', 'R3', 'R4'], bevel: 2, emissive: true }),
    glass: m({ ramp: ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'], bevel: 2, shine: 'N8' }),
    rust: m({ ramp: ['O0', 'O1', 'O2', 'O3', 'O4'], bevel: 3 }),
    gold: m({ ramp: ['Y0', 'Y1', 'Y2', 'Y3', 'Y4'], bevel: 3, shine: 'N8' }),
    teal: m({ ramp: ['T0', 'T1', 'T2', 'T3'], bevel: 3 }),
    crystal: m({ ramp: ['P0', 'P1', 'P2', 'P3', 'P4'], bevel: 3, shine: 'N8' }),
    crystalC: m({ ramp: ['C0', 'C1', 'C2', 'C3', 'C4'], bevel: 3, shine: 'C5' }),
    flesh: m({ ramp: ['F0', 'F1', 'F2', 'F3'], bevel: 4 }),
    green: m({ ramp: ['G0', 'G1', 'G2', 'G3'], bevel: 3 }),
    white: m({ ramp: ['N4', 'N5', 'N6', 'N7', 'N8'], bevel: 4, shine: 'N8' }),
    bone: m({ ramp: ['N4', 'N5', 'Y2', 'Y3', 'Y4'], bevel: 3 }),
    purple: m({ ramp: ['P0', 'P1', 'P2', 'P3'], bevel: 3 }),
    blue: m({ ramp: ['C0', 'C1', 'C2', 'C3'], bevel: 3 }),
    steel: m({ ramp: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'], bevel: 4, dither: true }),
    stone: m({ ramp: ['N2', 'N3', 'N4', 'N5', 'N6'], bevel: 3 }),
  };
}

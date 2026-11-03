// MML authoring helpers (generate repetitive parts programmatically).

export const rep = (s: string, n: number): string => Array.from({ length: n }, () => s).join(' ');

/** Driving octave-bass bar in 8ths: r r R r r r R r */
export const bass8 = (root: string, o = 2): string => `o${o} ${root} ${root} o${o + 1} ${root} o${o} ${root} ${root} ${root} o${o + 1} ${root} o${o} ${root}`;

/** Root–fifth quarter-note bass bar. */
export const bass4 = (root: string, fifth: string, o = 2, o5 = o): string => `o${o} ${root}4 o${o5} ${fifth}4 o${o} ${root}4 o${o5} ${fifth}4`;

/** Half-note bass (slow songs). */
export const bass2 = (a: string, b: string, o = 2): string => `o${o} ${a}2 ${b}2`;

/** 16th-note arpeggio over one bar: notes like ['e','g','b'] in octave o (top note +1 octave). */
export const arp16 = (n: string[], o = 4): string => {
  const [a, b, c] = n as [string, string, string];
  return `o${o} l16 ${a} ${b} ${c} > ${a} < ${c} ${b} ${a} ${b} ${c} > ${a} < ${c} ${b} ${a} ${b} ${c} ${b} l8`;
};

/** 8th-note broken chord (up-down) for one bar. */
export const arp8 = (n: string[], o = 4): string => {
  const [a, b, c] = n as [string, string, string];
  return `o${o} l8 ${a} ${b} ${c} > ${a} < ${c} ${b} ${a} ${b}`;
};

/** Whole-note chord. */
export const chord = (n: string[], o = 4, len = '1'): string => `o${o} {${n.join(' ')}}${len}`;

export const CH: Record<string, string[]> = {
  Em: ['e', 'g', 'b'], C: ['c', 'e', 'g'], D: ['d', 'f+', 'a'], Bm: ['<b>', 'd', 'f+'], Am: ['<a>', 'c', 'e'], B7: ['<b>', 'd+', 'f+'], B7s: ['<b>', 'e', 'f+'],
  Dm: ['d', 'f', 'a'], Bb: ['<b->', 'd', 'f'], Gm: ['<g>', '<b->', 'd'], A: ['<a>', 'c+', 'e'], G: ['<g>', '<b>', 'd'], F: ['c', 'f', 'a'],
  Cm: ['c', 'e-', 'g'], Db: ['d-', 'f', 'a-'], Ab: ['c', 'e-', 'a-'], Gmaj: ['d', 'g', 'b'], Fm: ['c', 'f', 'a-'],
  'F#m': ['c+', 'f+', 'a'], E: ['<b>', 'e', 'g+'], 'C#m': ['c+', 'e', 'g+'], 'F#': ['c+', 'f+', 'a+'], 'F#s': ['c+', 'f+', 'b'],
  Eb: ['e-', 'g', 'b-'], D7: ['d', 'f+', 'c'], Gmin: ['d', 'g', 'b-'], Bmaj: ['d+', 'f+', 'b'],
};

/** Chord notes but with bracket-octave notation stripped for arps: '<b>' means b in the octave below. */
export function arpC(name: string, o = 4, kind: '16' | '8' = '16'): string {
  const n = CH[name]!;
  return kind === '16' ? arp16(n, o) : arp8(n, o);
}

export function padC(name: string, o = 4, len = '1'): string {
  return chord(CH[name]!, o, len);
}

export const DR = {
  rock: '{c f+}8 f+8 {d f+}8 f+8 {c f+}8 {c f+}8 {d f+}8 f+8',
  rockFill: '{c f+}8 f+8 {d f+}8 f+8 d16 d16 e16 e16 d8 {b c}8',
  kick4: 'c4 c4 c4 c4',
  half: '{c f+}4 f+8 f+8 {d f+}4 f+8 f+8',
  fast: '{c f+}16 f+16 f+16 f+16 {d f+}16 f+16 f+16 {c f+}16 {c f+}16 f+16 f+16 f+16 {d f+}16 f+16 {d f+}16 f+16',
  fastFill: '{c f+}16 f+16 f+16 f+16 {d f+}16 f+16 f+16 {c f+}16 d16 d16 e16 e16 d16 d16 {b c}8',
  four: '{c a+}8 f+8 {c d f+}8 f+8 {c a+}8 f+8 {c d f+}8 f+8',
  driveHat: '{f+}16 f+16 {c+ f+}16 f+16 f+16 f+16 {c+ f+}16 f+16 f+16 f+16 {c+ f+}16 f+16 f+16 f+16 {c+ f+}16 c+16',
  crashBar: '{b c}2 r2',
};

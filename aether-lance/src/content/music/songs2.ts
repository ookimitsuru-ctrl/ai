// Original compositions: stages 2–6 and final boss.
import type { SongDef } from '../../audio/sequencer';
import { rep, arpC, padC, bass8, CH } from './util';

const R2: Record<string, [string, number]> = { 'F#m': ['f+', 2], D: ['d', 2], E: ['e', 2], 'C#m': ['c+', 2], Bm: ['b', 1], A: ['a', 1] };
const A2 = ['F#m', 'D', 'E', 'C#m', 'F#m', 'D', 'E', 'C#m'];
const B2 = ['Bm', 'C#m', 'D', 'E', 'Bm', 'C#m', 'D', 'E'];
const softBeat = '{c f+}8 f+8 f+8 f+8 {g+ f+}8 f+8 f+8 {c f+}8';
export const st2: SongDef = {
  id: 'st2', title: 'Glass Labyrinth', bpm: 120,
  tracks: {
    lead: `t120 @lead_fm v11 q7 l8
      r1 r1 r1 r1
      L
      o5 c+4. f+8 a4 g+8 f+8 | o5 f+4 e8 d8 a2 | o5 g+4. e8 b4 a8 g+8 | o5 g+2. r4 |
      o5 c+4. f+8 a4 o6 c+8 d8 | o6 c+4 o5 b8 a8 f+4 a8 b8 | o5 b4. a8 g+4 e8 g+8 | o5 f+2 e2 |
      o5 d4. f+8 b4 a8 f+8 | o5 e4. g+8 o6 c+4 o5 b8 g+8 | o5 a4 f+8 a8 o6 d4 c+8 o5 a8 | o5 b2. r4 |
      o6 d4 c+8 o5 b8 f+4 d8 f+8 | o6 e4 d8 c+8 o5 g+4 e8 g+8 | o5 a4. b8 o6 c+4 d8 e8 | o6 e2 o5 b4 g+4 |`,
    bell: `@bell v8
      ${arpC('F#m', 5, '8')} ${arpC('D', 5, '8')} ${arpC('E', 5, '8')} ${arpC('C#m', 5, '8')}
      L
      ${A2.map((c) => arpC(c, 5, '8')).join(' ')} ${B2.map((c) => arpC(c, 5, '8')).join(' ')}`,
    pad: `@strings v8
      ${padC('F#m')} ${padC('D')} ${padC('E')} ${padC('C#m')}
      L
      ${A2.map((c) => padC(c)).join(' ')} ${B2.map((c) => padC(c)).join(' ')}`,
    bass: `@bass_fm v11 q7
      ${['F#m', 'D', 'E', 'C#m'].map((c) => `o${R2[c]![1]} ${R2[c]![0]}2 ${R2[c]![0]}2`).join(' ')}
      L
      ${[...A2, ...B2].map((c) => `o${R2[c]![1]} ${R2[c]![0]}4. ${R2[c]![0]}8 r8 ${R2[c]![0]}8 ${R2[c]![0]}4`).join(' ')}`,
    drums: `@drums v9
      r1 r1 ${rep('c4 r4 c4 r4', 1)} ${softBeat}
      L
      ${rep(softBeat, 15)} {c f+}8 f+8 d16 d16 e16 e16 d8 {b c}8 r4`,
    drive: `@drums v8 r1 r1 r1 r1 L ${rep('f+16 f+16 c+16 f+16 f+16 f+16 c+16 f+16 f+16 f+16 c+16 f+16 f+16 c+16 c+16 f+16', 16)}`,
  },
  drive: ['drive'],
  sends: { bell: { rev: 0.3, del: 0.2 }, lead: { rev: 0.25, del: 0.18 } },
  vol: { bell: 0.7 },
};

// ---- STAGE 3: Living Garden (7/8, 2+2+3) ----
const A3 = ['Cm', 'Ab', 'Fm', 'Gmaj', 'Cm', 'Ab', 'Fm', 'Gmaj'];
const B3 = ['Ab', 'Fm', 'Cm', 'Cm', 'Ab', 'Fm', 'Gmaj', 'Gmaj'];
const R3: Record<string, [string, number]> = { Cm: ['c', 2], Ab: ['a-', 1], Fm: ['f', 1], Gmaj: ['g', 1] };
const arp7 = (c: string) => { const [a, b, d] = CH[c]!; return `o4 l8 ${a} ${b} ${d} > ${a} < ${d} ${b} ${d}`; };
const beat7 = '{c f}8 f8 {g f}8 f8 {c f}8 g8 f8';
const beat7b = '{c f}8 f8 {g f}8 {c f}8 {c f}8 g8 {d f}8';
export const st3: SongDef = {
  id: 'st3', title: 'Living Garden', bpm: 144, meter: 168,
  tracks: {
    lead: `t144 @lead_pulse v11 q6 l8
      r2&4. r2&4.
      L
      o5 g4 e-4 c4. | o5 a-4 o6 c4 e-4. | o6 f4 e-4 c4. | o5 b4 o6 d4 o5 g4. |
      o5 g8 a-8 g4 e-8 d8 c8 | o5 e-4 f8 g8 a-4. | o5 a-8 g8 f4 c4. | o5 d4 o4 b4 g4. |
      @lead_fm o6 c4. e-4 a-4 | o6 a-4. g4 f4 | o6 g4 e-4 c4. | o6 c2 r4. |
      o6 e-4. a-4 c4 | o6 f4. e-4 d4 | o5 b4. o6 d4 f4 | o6 g4 f4 d4. @lead_pulse |`,
    arp: `@arp_tri v8 ${arp7('Cm')} ${arp7('Cm')} L ${[...A3, ...B3].map(arp7).join(' ')}`,
    pad: `@pad_soft v9 o4 {c e- g}2&4. {c e- g}2&4. L ${[...A3, ...B3].map((c) => `o4 {${CH[c]!.join(' ')}}2&4.`).join(' ')}`,
    bass: `@bass_fm v12 q6 ${[...'cc'].map(() => 'o2 c4 c4 o1 g4.').join(' ')} L ${[...A3, ...B3].map((c) => { const [r, o] = R3[c]!; return `o${o} ${r}4 ${r}8 ${r}8 o${o + 1} ${r}4.`; }).join(' ')}`,
    drums: `@drums v11 ${beat7} ${beat7b} L ${rep(beat7, 7)} ${beat7b} ${rep(beat7, 7)} ${beat7b}`,
    drive: `@drums v8 r2&4. r2&4. L ${rep('f16 f16 {c+ f}16 f16 f16 f16 {c+ f}16 f16 f16 f16 f16 {c+ f}16 f16 f16', 16)}`,
  },
  drive: ['drive'],
  sends: { lead: { rev: 0.2, del: 0.12 } },
};

// ---- STAGE 4: Tempest Crown (A minor, 180) ----
const A4 = ['Am', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Em'];
const B4 = ['F', 'G', 'Am', 'Am', 'F', 'G', 'E', 'E'];
const R4: Record<string, [string, number]> = { Am: ['a', 1], F: ['f', 1], G: ['g', 1], Em: ['e', 2], E: ['e', 2] };
export const st4: SongDef = {
  id: 'st4', title: 'Tempest Crown', bpm: 180,
  tracks: {
    lead: `t180 @lead_saw v12 q7 l8
      r1 r1 r1 o5 e8 a8 o6 c8 e8 a4 g+4
      L
      o6 a4. g8 e4 c8 e8 | o6 f4. e8 c4 o5 a8 o6 c8 | o6 d4. c8 o5 b4 g8 b8 | o5 e2 g4 b4 |
      o6 a4. b8 o7 c4 o6 b8 a8 | o6 a4 f8 a8 o7 c4 d8 c8 | o6 b4. a8 g4 d8 g8 | o6 e2. r4 |
      o6 c4 c8 d8 e4 f8 e8 | o6 d4 d8 e8 f4 g8 f8 | o6 e4 a8 g8 e4 c8 e8 | o6 a2. r4 |
      o6 f4 a8 o7 c8 f4 e8 c8 | o6 g4 b8 o7 d8 g4 f8 d8 | o6 e4 g+8 b8 o7 e4 d8 o6 b8 | o6 g+2 b4 o7 e4 |`,
    arp: `@arp v7 ${arpC('Am', 4)} ${arpC('F', 4)} ${arpC('G', 4)} ${arpC('E', 4)} L ${[...A4, ...B4].map((c) => arpC(c, 4)).join(' ')}`,
    pad: `@pad v8 ${padC('Am')} ${padC('F')} ${padC('G')} ${padC('E')} L ${[...A4, ...B4].map((c) => padC(c)).join(' ')}`,
    bass: `@bass_pulse v13 q6 ${['a', 'f', 'g', 'e'].map((r) => bass8(r, r === 'e' ? 2 : 1)).join(' ')} L ${[...A4, ...B4].map((c) => bass8(R4[c]![0], R4[c]![1])).join(' ')}`,
    drums: `@drums v12 ${rep('{c f+}8 f+8 {d f+}8 {c f+}8 f+8 {c f+}8 {d f+}8 f+8', 3)} ${'{c f+}8 d8 d8 d8 e16 e16 e16 e16 {d+ b}4'} L ${rep('{c f+}8 f+8 {d f+}8 {c f+}8 f+8 {c f+}8 {d f+}8 f+8', 7)} {c f+}8 d8 d8 d8 e16 e16 e16 e16 {d+ b}4 ${rep('{c f+}8 f+8 {d f+}8 {c f+}8 f+8 {c f+}8 {d f+}8 f+8', 7)} {c f+}8 d8 d8 d8 e16 e16 e16 e16 {d+ b}4`,
    drive: `@drums v8 r1 r1 r1 r1 L ${rep('a+8 c+8 a+8 c+8 a+8 c+8 a+8 c+8', 16)}`,
  },
  drive: ['drive'],
};

export const _cs = { CH, bass8 };

// Original compositions: main theme, stage 1, boss, jingles, name entry, ending.
import type { SongDef } from '../../audio/sequencer';
import { rep, bass8, arpC, padC, DR, bass4 } from './util';

const A_ST1 = ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B7'];
const B_ST1 = ['C', 'D', 'Em', 'Em', 'C', 'D', 'B7s', 'B7'];
const ROOT: Record<string, string> = { Em: 'e', C: 'c', D: 'd', Bm: 'b', Am: 'a', B7: 'b', B7s: 'b', Dm: 'd', Bb: 'b-', Gm: 'g', A: 'a', G: 'g', Cm: 'c', Db: 'd-', Ab: 'a-', F: 'f', 'F#m': 'f+', E: 'e', 'C#m': 'c+', 'F#': 'f+', 'F#s': 'f+', Fm: 'f', Eb: 'e-', Gmaj: 'g', D7: 'd' };
const lowRoot = (c: string) => ['b', 'a', 'b-', 'a-'].includes(ROOT[c]!) ? 1 : 2;

export const st1: SongDef = {
  id: 'st1', title: 'Breaking Orbit', bpm: 150,
  tracks: {
    lead: `t150 @lead_saw v12 q7 l8
      r1 r1 r1 o5 b8 o6 e8 g8 b8 o7 e4 r4
      L
      o5 e4 g8 b8 o6 e4 o5 b8 g8 | o5 g4. e8 o6 c4 o5 b8 g8 | o5 f+4 a8 o6 d8 f+4 e8 d8 | o5 b2 a8 f+8 d8 f+8 |
      o5 e4 g8 b8 o6 e8 f+8 g8 e8 | o6 g4. e8 c4 o5 b8 o6 c8 | o6 c4 o5 a8 e8 a4 b8 o6 c8 | o5 b4 o6 d+8 f+8 b4 a4 |
      o6 e2 d8 c8 o5 b8 o6 c8 | o6 d2 c8 o5 b8 a8 b8 | o5 g4 b8 o6 e8 g4 f+8 e8 | o6 e2. r4 |
      o6 e4 g8 e8 c4 e8 g8 | o6 f+4 a8 f+8 d4 f+8 a8 | o6 b4. a8 g4 f+8 e8 | o5 b2 o6 d+4 f+4 |`,
    lead2: `@arp v7 l8
      r1 r1 ${arpC('Em', 4)} ${arpC('B7', 4)}
      L
      ${A_ST1.map((c) => arpC(c, 4)).join(' ')}
      ${B_ST1.map((c) => arpC(c, 4)).join(' ')}`,
    pad: `@pad v9
      ${padC('Em')} ${padC('Em')} ${padC('C')} ${padC('B7')}
      L
      ${A_ST1.map((c) => padC(c)).join(' ')} ${B_ST1.map((c) => padC(c)).join(' ')}`,
    bass: `@bass_pulse v13 q6
      ${bass8('e')} ${bass8('e')} ${bass8('c')} ${bass8('b', 1)}
      L
      ${A_ST1.map((c) => bass8(ROOT[c]!, lowRoot(c))).join(' ')}
      ${B_ST1.map((c) => bass8(ROOT[c]!, lowRoot(c))).join(' ')}`,
    drums: `@drums v13
      ${DR.kick4} ${DR.kick4} ${DR.rock} ${DR.rockFill}
      L
      ${rep(DR.rock, 7)} ${DR.rockFill} ${rep(DR.rock, 7)} ${DR.rockFill}`,
    drive: `@drums v10
      r1 r1 r1 r1
      L
      ${rep(DR.driveHat, 16)}`,
  },
  drive: ['drive'],
  vol: { lead2: 0.8 },
};

const A_BOSS = ['Cm', 'Db', 'Cm', 'Bb', 'Cm', 'Db', 'Cm', 'Bb'];
const B_BOSS = ['Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Bb', 'Gmaj', 'Gmaj'];
export const boss: SongDef = {
  id: 'boss', title: 'Collision Course', bpm: 150,
  tracks: {
    lead: `t150 @brass v13 q6 l8
      r1 r1
      L
      o5 g4 g8 a-8 g4 f8 e-8 | o5 f4 f8 g-8 f4 e-8 d-8 | o5 e-4 g8 o6 c8 o5 b-4 g8 e-8 | o5 f2. r4 |
      o5 g4 g8 a-8 g4 o6 c8 d8 | o6 e-4 d-8 c8 o5 b-4 a-8 f8 | o5 g4 c8 e-8 g4 o6 c4 | o5 b-2 o6 d4 f4 |
      @lead_saw q7 o6 c4. e-8 a-4 g8 f8 | o6 d4. f8 b-4 a-8 g8 | o6 g2 f8 e-8 d8 e-8 | o6 c2. r4 |
      o6 e-4 a-8 e-8 c4 e-8 a-8 | o6 f4 b-8 f8 d4 f8 b-8 | o6 b4. o7 d8 o6 b4 g8 f8 | o5 b2 o6 d4 f4 @brass q6 |`,
    lead2: `@arp v7
      ${arpC('Cm', 4)} ${arpC('Db', 4)}
      L
      ${A_BOSS.map((c) => arpC(c, 4)).join(' ')} ${B_BOSS.map((c) => arpC(c, 4)).join(' ')}`,
    pad: `@strings v8
      ${padC('Cm')} ${padC('Db')}
      L
      ${A_BOSS.map((c) => padC(c)).join(' ')} ${B_BOSS.map((c) => padC(c)).join(' ')}`,
    bass: `@bass_dist v12 q5
      o2 c c o3 c o2 c d- c o3 c o2 c | o2 c c o3 c o2 c d- c o3 c o2 b-
      L
      ${A_BOSS.map((c) => (c === 'Cm' ? 'o2 c c o3 c o2 c d- c o3 c o2 c' : bass8(ROOT[c]!, lowRoot(c)))).join(' ')}
      ${B_BOSS.map((c) => bass8(ROOT[c]!, c === 'Gmaj' ? 1 : lowRoot(c))).join(' ')}`,
    drums: `@drums v13
      ${DR.fast} ${DR.fastFill}
      L
      ${rep(DR.fast, 7)} ${DR.fastFill} ${rep(DR.fast, 7)} ${DR.fastFill}`,
    drive: `@drums v9 r1 r1 L ${rep('{c+}8 r8 {c+ a+}8 r8 {c+}8 r8 {c+ a+}8 c+8', 16)}`,
  },
  drive: ['drive'],
};

const A_T = ['Dm', 'Bb', 'C', 'Am', 'Gm', 'Bb', 'C', 'D'];
const B_T = ['G', 'A', 'D', 'Bm', 'G', 'A', 'D', 'D'];
export const title: SongDef = {
  id: 'title', title: 'Aether Lance', bpm: 120,
  tracks: {
    lead: `t120 @lead_saw v12 q7 l8
      r1 r1 r1 r2 o5 a8 o6 c8 d8 e8
      L
      o5 d4. a8 a4 g8 f8 | o5 f4 g8 a8 b-4 a8 g8 | o5 g4. e8 c4 e8 g8 | o5 a2. r4 |
      o5 b-4. a8 g4 f8 g8 | o5 a4 f8 d8 f4 a8 o6 c8 | o6 d4. c8 o5 b-4 a8 g8 | o5 g2 f+2 |
      o6 d4. o5 b8 g4 b8 o6 d8 | o6 e4. c+8 o5 a4 o6 c+8 e8 | o6 f+2 e8 d8 c+8 d8 | o5 b2. r4 |
      o6 g4 f+8 e8 d4 e8 f+8 | o6 e4 d8 c+8 o5 a4 o6 c+8 e8 | o6 d4. a8 a4 g8 f+8 | o6 d2 c4 o5 a4 |`,
    lead2: `@lead_pulse v8 q6 l8
      r1 r1 r1 r1
      L
      o4 a4. f8 f4 e8 d8 | o4 d4 e8 f8 f4 f8 e8 | o4 e4. c8 o3 g4 o4 c8 e8 | o4 e2. r4 |
      o4 g4. f8 d4 d8 e8 | o4 f4 d8 o3 b-8 o4 d4 f8 a8 | o4 b-4. a8 g4 f8 e8 | o4 d2 d2 |
      o5 b4. g8 d4 g8 b8 | o5 c+4. o4 a8 e4 a8 o5 c+8 | o5 d2 c+8 o4 b8 a8 b8 | o4 f+2. r4 |
      o5 d4 d8 c+8 o4 b4 o5 c+8 d8 | o5 c+4 o4 b8 a8 e4 a8 o5 c+8 | o4 a4. f+8 f+4 e8 d8 | o4 a2 a4 f+4 |`,
    arp: `@harp v8
      ${arpC('Dm', 4, '8')} ${arpC('Bb', 4, '8')} ${arpC('C', 4, '8')} ${arpC('A', 4, '8')}
      L
      ${A_T.map((c) => arpC(c, 4, '8')).join(' ')} ${B_T.map((c) => arpC(c, 4, '8')).join(' ')}`,
    pad: `@pad v9
      ${padC('Dm')} ${padC('Bb')} ${padC('C')} ${padC('A')}
      L
      ${A_T.map((c) => padC(c)).join(' ')} ${B_T.map((c) => padC(c)).join(' ')}`,
    bass: `@bass_fm v12 q7
      ${bass4('d', 'a', 2, 2)} ${bass4('b-', 'f', 1, 2)} ${bass4('c', 'g', 2, 2)} ${bass4('a', 'e', 1, 2)}
      L
      ${bass4('d', 'a', 2, 2)} ${bass4('b-', 'f', 1, 2)} ${bass4('c', 'g', 2, 2)} ${bass4('a', 'e', 1, 2)}
      ${bass4('g', 'd', 1, 2)} ${bass4('b-', 'f', 1, 2)} ${bass4('c', 'g', 2, 2)} ${bass4('d', 'a', 2, 2)}
      ${bass4('g', 'd', 1, 2)} ${bass4('a', 'e', 1, 2)} ${bass4('d', 'a', 2, 2)} ${bass4('b', 'f+', 1, 2)}
      ${bass4('g', 'd', 1, 2)} ${bass4('a', 'e', 1, 2)} ${bass4('d', 'a', 2, 2)} ${bass4('d', 'a', 2, 2)}`,
    drums: `@drums v11
      r1 r1 ${DR.kick4} ${DR.rockFill}
      L
      ${rep(DR.half, 7)} ${DR.rockFill} ${rep(DR.rock, 7)} ${DR.rockFill}`,
  },
  vol: { lead2: 0.75, arp: 0.8 },
};

export const jingle_clear: SongDef = {
  id: 'jingle_clear', title: 'Stage Clear', bpm: 132, noLoop: true,
  tracks: {
    lead: `t132 @lead_saw v13 q7 l8 o5 d8 f+8 a8 o6 d8 f+4 e8 d8 | o6 e4 c+8 e8 a4. r8 | o6 d2. r4 |`,
    lead2: `@lead_pulse v9 l8 o5 a8 o5 d8 f+8 a8 o6 d4 c+8 o5 a8 | o5 a4 a8 o6 c+8 e4. r8 | o5 a2. r4 |`,
    pad: `@pad v10 ${padC('D')} ${padC('A')} o4 {d f+ a}2. r4`,
    bass: `@bass_fm v12 o2 d2 a2 | o2 a2 e2 | o2 d2. r4`,
    drums: `@drums v12 c8 c8 d8 c8 c8 c8 d4 | c8 c8 d8 c8 d16 d16 d16 d16 d4 | {b c}2. r4`,
  },
};

export const jingle_gameover: SongDef = {
  id: 'jingle_gameover', title: 'Game Over', bpm: 80, noLoop: true,
  tracks: {
    lead: `t80 @lead_pulse v11 q7 l4 o5 a g f e | o5 d c+ d2 | r1`,
    pad: `@pad_soft v10 ${padC('Dm')} o3 {g b- o4 d}2 o3 {a o4 c+ e}2 | ${padC('Dm')}`,
    bass: `@bass_tri v11 o2 d1 | o2 g2 a2 | o2 d1`,
  },
};

export const name_entry: SongDef = {
  id: 'name_entry', title: 'Hall of Pilots', bpm: 100,
  tracks: {
    lead: `t100 @bell v10 q8 l8
      L
      o5 c4 f8 a8 o6 c4 o5 a8 f8 | o5 b-4 g8 b-8 o6 d4 c8 o5 b-8 | o5 a4 f8 a8 o6 c4. o5 a8 | o5 g2. r4 |
      o5 f4 a8 o6 c8 f4 e8 d8 | o6 d4 o5 b-8 g8 b-4 o6 d8 e8 | o6 c4 o5 a8 f8 g4. e8 | o5 f2. r4 |`,
    pad: `@pad_soft v9 L ${['F', 'Bb', 'F', 'C', 'F', 'Bb', 'C', 'F'].map((c) => padC(c === 'Bb' ? 'Bb' : c)).join(' ')}`,
    bass: `@bass_tri v10 L o2 f2 c2 | o1 b-2 o2 f2 | o2 f2 c2 | o2 c2 g2 | o2 f2 c2 | o1 b-2 o2 f2 | o2 c2 g2 | o2 f2 c2`,
    drums: `@drums v8 L ${rep('c4 f+8 f+8 g4 f+8 f+8', 8)}`,
  },
};

export const ending: SongDef = {
  id: 'ending', title: 'Dawn over the Ring', bpm: 100,
  tracks: {
    lead: `t100 @lead_saw v11 q8 l8
      r1 r1
      L
      o5 d4. a8 a4 g8 f+8 | o5 f+4 g8 a8 b4 a8 g8 | o5 g4. e8 c+4 e8 g8 | o5 a2. r4 |
      o5 b4. a8 g4 f+8 g8 | o5 a4 f+8 d8 f+4 a8 o6 c+8 | o6 d4. c+8 o5 b4 a8 g8 | o5 a2 f+2 |
      o6 d4. o5 b8 g4 b8 o6 d8 | o6 e4. c+8 o5 a4 o6 c+8 e8 | o6 f+2 e8 d8 c+8 d8 | o5 b2. r4 |
      o6 g4 f+8 e8 d4 e8 f+8 | o6 e4 d8 c+8 o5 a4 o6 c+8 e8 | o6 d4. a8 a4 g8 f+8 | o6 d1 |`,
    arp: `@harp v8 ${arpC('D', 4, '8')} ${arpC('A', 4, '8')} L ${['D', 'G', 'A', 'D', 'G', 'D', 'A', 'D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D', 'D'].map((c) => arpC(c === 'G' ? 'Gmaj' : c, 4, '8')).join(' ')}`,
    pad: `@strings v9 ${padC('D')} ${padC('A')} L ${['D', 'G', 'A', 'D', 'G', 'D', 'A', 'D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D', 'D'].map((c) => padC(c === 'G' ? 'Gmaj' : c)).join(' ')}`,
    bass: `@bass_fm v11 o2 d1 o1 a1 L ${['d', 'g', 'a', 'd', 'g', 'd', 'a', 'd', 'g', 'a', 'd', 'b', 'g', 'a', 'd', 'd'].map((r) => `o${['g', 'a', 'b'].includes(r) ? 1 : 2} ${r}2 ${r}2`).join(' ')}`,
    drums: `@drums v9 r1 r1 L ${rep(DR.half, 15)} {b c}1`,
  },
};

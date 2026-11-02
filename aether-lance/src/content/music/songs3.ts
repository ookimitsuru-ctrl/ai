// Original compositions: stage 6, final boss (HALO, CANTOR), resolution chord.
// All at BPM 150 → one beat = exactly 24 frames (stage 6 beat sync, docs/08 §6).
import type { SongDef } from '../../audio/sequencer';
import { rep, arpC, padC, bass8, CH } from './util';

const RT: Record<string, [string, number]> = {
  Bm: ['b', 1], G: ['g', 1], Gmaj: ['g', 1], D: ['d', 2], A: ['a', 1], Em: ['e', 2], 'F#s': ['f+', 2], 'F#': ['f+', 2], C: ['c', 2], Am: ['a', 1], B: ['b', 1], 'F#m': ['f+', 2], E: ['e', 2],
};
const g = (c: string) => (c === 'G' ? 'Gmaj' : c === 'B' ? 'Bmaj' : c);
const beat4 = '{c f+}8 f+8 {d f+}8 f+8 {c f+}8 f+8 {d f+}8 {c f+}8';
const fill4 = '{c f+}8 f+8 {d f+}8 f+8 d16 d16 e16 e16 {c d}8 {b c}8';

const A6 = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A'];
const B6 = ['Em', 'G', 'F#s', 'F#', 'Em', 'G', 'F#s', 'F#'];
export const st6: SongDef = {
  id: 'st6', title: 'Choir', bpm: 150,
  tracks: {
    lead: `t150 @lead_fm v11 q7 l8
      r1 r1 r1 r1
      L
      o5 f+4. b8 o6 d4 c+8 o5 b8 | o5 b4 a8 g8 d2 | o5 a4. f+8 a4 o6 d8 e8 | o6 c+2. r4 |
      o6 d4. c+8 o5 b4 f+8 b8 | o6 d4 e8 d8 o5 b4 g8 b8 | o6 f+4. e8 d4 c+8 d8 | o6 e2 c+4 o5 a4 |
      o6 e4. f+8 g4 f+8 e8 | o6 d4. e8 d4 o5 b8 g8 | o5 b4. o6 c+8 d4 c+8 o5 b8 | o5 a+2. r4 |
      o6 g4. a8 b4 a8 g8 | o6 f+4. g8 f+4 d8 o5 b8 | o6 c+4 o5 b8 o6 c+8 d4 e4 | o6 c+2 o5 a+4 f+4 |`,
    choir: `@choir v10 ${padC('Bm', 4)} ${padC('Gmaj', 4)} ${padC('D', 4)} ${padC('A', 4)} L ${[...A6, ...B6].map((c) => padC(g(c), 4)).join(' ')}`,
    organ: `@organ v8 r1 r1 r1 r1 L ${[...A6, ...B6].map((c) => padC(g(c), 3)).join(' ')}`,
    bell: `@bell v7 ${rep(arpC('Bm', 5, '8'), 2)} ${arpC('D', 5, '8')} ${arpC('A', 5, '8')} L ${[...A6, ...B6].map((c) => arpC(g(c), 5, '8')).join(' ')}`,
    bass: `@bass_fm v12 q7 ${['b', 'g', 'd', 'a'].map((r) => `o${r === 'd' ? 2 : 1} ${r}2 ${r}2`).join(' ')} L ${[...A6, ...B6].map((c) => bass8(RT[c]![0], RT[c]![1])).join(' ')}`,
    drums: `@drums v11 ${rep('c4 r4 c4 r4', 2)} ${beat4} ${fill4} L ${rep(beat4, 7)} ${fill4} ${rep(beat4, 7)} ${fill4}`,
    drive: `@drums v8 r1 r1 r1 r1 L ${rep('f+16 f+16 c+16 f+16 f+16 f+16 c+16 f+16 f+16 f+16 c+16 f+16 f+16 c+16 c+16 f+16', 16)}`,
  },
  drive: ['drive'],
  sends: { choir: { rev: 0.4 }, bell: { rev: 0.3, del: 0.15 }, lead: { rev: 0.25, del: 0.12 } },
  vol: { organ: 0.8, bell: 0.7 },
};

const AF1 = ['Bm', 'Bm', 'G', 'A', 'Bm', 'Bm', 'Em', 'F#'];
const BF1 = ['G', 'A', 'Bm', 'Bm', 'G', 'A', 'F#s', 'F#'];
const four = '{c a+}8 f+8 {c d f+}8 f+8 {c a+}8 f+8 {c d f+}8 {c f+}8';
export const final1: SongDef = {
  id: 'final1', title: 'HALO', bpm: 150,
  tracks: {
    lead: `t150 @brass v13 q6 l8
      r1 r1
      L
      o5 b4 b8 o6 c+8 d4 c+8 o5 b8 | o5 f+2 b4 o6 d4 | o6 d4 d8 e8 d4 o5 b8 g8 | o5 a2. r4 |
      o5 b4 b8 o6 c+8 d4 e8 f+8 | o6 f+2 e4 d4 | o6 e4. d8 o5 b4 g8 b8 | o5 a+2 o6 c+4 e4 |
      @lead_saw q7 o6 d4. e8 f+4 g8 f+8 | o6 e4. f+8 a4 g8 e8 | o6 f+2 d4 o5 b4 | o5 b2. r4 |
      o6 g4. f+8 e4 d8 e8 | o6 f+4. e8 c+4 o5 a8 o6 c+8 | o6 b4. a8 f+4 e8 c+8 | o6 c+2 o5 a+4 f+4 @brass q6 |`,
    choir: `@choir v10 ${padC('Bm', 4)} ${padC('Bm', 4)} L ${[...AF1, ...BF1].map((c) => padC(g(c), 4)).join(' ')}`,
    arp: `@arp v7 ${rep(arpC('Bm', 4), 2)} L ${[...AF1, ...BF1].map((c) => arpC(g(c), 4)).join(' ')}`,
    bass: `@bass_dist v12 q5 ${rep(bass8('b', 1), 2)} L ${[...AF1, ...BF1].map((c) => bass8(RT[c]![0], RT[c]![1])).join(' ')}`,
    drums: `@drums v13 ${rep('c4 c4 c4 c4', 1)} ${fill4} L ${rep(four, 7)} ${fill4} ${rep(four, 7)} ${fill4}`,
    drive: `@drums v8 r1 r1 L ${rep('c+16 f+16 c+16 f+16', 64)}`,
  },
  drive: ['drive'],
  sends: { choir: { rev: 0.35 } },
};

const AF2 = ['Em', 'C', 'D', 'Bm', 'Em', 'C', 'Am', 'B'];
const BF2 = ['Bm', 'G', 'A', 'F#m', 'Bm', 'G', 'Em', 'F#'];
export const final2: SongDef = {
  id: 'final2', title: 'CANTOR', bpm: 150,
  tracks: {
    lead: `t150 @lead_fm v12 q6 l8
      r1 r1
      L
      o5 e8 g8 b8 o6 e8 d4 o5 b4 | o5 c8 e8 g8 o6 c8 o5 b4 g4 | o5 d8 f+8 a8 o6 d8 c+4 o5 a4 | o5 b8 a8 f+8 d8 f+2 |
      o5 e8 g8 b8 o6 e8 g4 f+4 | o6 e8 d8 c8 o5 g8 e4 g4 | o5 a8 o6 c8 e8 a8 g4 e4 | o6 d+4 f+4 b4 a4 |
      o5 b8 o6 d8 f+8 b8 a4 f+4 | o6 g8 f+8 e8 d8 o5 b4 g4 | o5 a8 o6 c+8 e8 a8 g4 e4 | o6 f+8 e8 c+8 o5 a8 f+2 |
      o5 f+8 b8 o6 d8 f+8 b4 a4 | o6 g4 f+8 e8 d4 o5 b4 | o5 e8 g8 b8 o6 e8 g4 b4 | o6 a+4 f+4 c+4 o5 a+4 |`,
    choir: `@choir v11 ${padC('Em', 4)} ${padC('Bmaj', 4)} L ${[...AF2, ...BF2].map((c) => padC(g(c), 4)).join(' ')}`,
    organ: `@organ v8 r1 r1 L ${[...AF2, ...BF2].map((c) => padC(g(c), 3)).join(' ')}`,
    bass: `@bass_fm v12 q7 ${bass8('e', 2)} ${bass8('b', 1)} L ${[...AF2, ...BF2].map((c) => bass8(RT[c]![0], RT[c]![1])).join(' ')}`,
    drums: `@drums v12 ${beat4} ${fill4} L ${rep(beat4, 7)} ${fill4} ${rep(beat4, 7)} ${fill4}`,
    drive: `@drums v8 r1 r1 L ${rep('f+16 f+16 c+16 f+16', 64)}`,
  },
  drive: ['drive'],
  sends: { choir: { rev: 0.4 }, lead: { rev: 0.25 } },
};

export const resolve: SongDef = {
  id: 'resolve', title: 'Resolution', bpm: 100, noLoop: true,
  tracks: {
    choir: `t100 @choir v12 o4 {d f+ a}1^1`,
    pad: `@strings v10 o3 {d a}1^1`,
    bell: `@bell v9 o5 d4 f+4 a4 o6 d4 | o6 f+2 a2`,
    bass: `@bass_fm v10 o2 d1^1`,
  },
};

export const _s3 = CH;

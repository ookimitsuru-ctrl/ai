// Every song: all tracks must have the same length and loop point, and lengths must be whole bars.
import { describe, it, expect } from 'vitest';
import { ALL_SONGS } from '../../src/content/music/index';
import { parseMML, expandRepeats } from '../../src/audio/mml';
import { parseSong } from '../../src/audio/sequencer';

describe('MML parser', () => {
  it('parses lengths, dots, ties, octaves and chords', () => {
    const t = parseMML('o4 l8 c d4 e4. f&f16 > g < a {c e g}2 r1');
    expect(t.events[0]!.midi).toBe(60);
    expect(t.events[1]!.dur).toBe(48);
    expect(t.events[2]!.dur).toBe(72);
    expect(t.events[3]!.dur).toBe(24 + 12);
    expect(t.events[4]!.midi).toBe(79);
    expect(t.events.filter((e) => e.tick === t.events[6]!.tick).length).toBe(3);
    expect(t.total).toBe(24 + 48 + 72 + 36 + 24 + 24 + 96 + 192);
  });
  it('expands repeats with a last-pass break', () => {
    expect(expandRepeats('[a/b]3').replace(/\s+/g, '')).toBe('ababa');
  });
});

describe('songs', () => {
  for (const def of Object.values(ALL_SONGS)) {
    it(`${def.id}: tracks aligned`, () => {
      const s = parseSong(def);
      for (const tr of s.tracks) {
        expect(tr.data.total, `${def.id}.${tr.name} total`).toBe(s.total);
        if (!def.noLoop) expect(tr.data.loop, `${def.id}.${tr.name} loop`).toBe(s.loop);
      }
      expect(s.total % (def.meter ?? 192), `${def.id} whole bars`).toBe(0);
    });
  }
});

// Replays: encoding round-trips exactly, and re-feeding a recorded input log reproduces the run (docs/11 §7–8).
import { describe, it, expect } from 'vitest';
import '../../src/content/index';
import { ALL_STAGES } from '../../src/content/stages/index';
import { World } from '../../src/game/world';
import { botInput } from '../../src/game/bot';
import { IB, type InputFrame } from '../../src/game/player';
import { encodeFrames, decodeFrames, quantise, MENU_OK, MENU_NO } from '../../src/game/replay';
import type { StageDef } from '../../src/game/stage';

function hash(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(w.frame); mix(w.score); mix(w.player.x); mix(w.player.y); mix(w.player.lv); mix(w.rank); mix(w.rng.s);
  for (const e of w.enemies.items) if (e.active) { mix(e.x); mix(e.y); mix(e.hp); }
  for (const b of w.bullets.items) if (b.active) { mix(b.x); mix(b.y); }
  return h.toString(16);
}

const mkWorld = (stage: StageDef) => new World({ stage, diff: 'normal', loop: 1, mode: 'arcade', respawn: 'inplace', god: false, shotMode: 'hold' });

describe('replay encoding', () => {
  it('round-trips bits, run lengths, touch and analog values', () => {
    const frames: InputFrame[] = [];
    for (let i = 0; i < 500; i++) frames.push(quantise({ bits: IB.SHOT | (i > 100 ? IB.UP : 0), tdx: 0, tdy: 0, ax: 0, ay: 0 }));
    for (let i = 0; i < 50; i++) frames.push(quantise({ bits: IB.TOUCH | IB.SHOT, tdx: Math.sin(i) * 7.3, tdy: -Math.cos(i) * 2.1, ax: 0, ay: 0 }));
    for (let i = 0; i < 50; i++) frames.push(quantise({ bits: IB.ANALOG | MENU_OK | MENU_NO | (3 << IB.SPD_SHIFT), tdx: 0, tdy: 0, ax: Math.sin(i * 0.3), ay: -0.5 }));
    const enc = encodeFrames(frames);
    const dec = decodeFrames(enc);
    expect(dec).toEqual(frames);
    // keyboard-only stretches compress to almost nothing
    expect(encodeFrames(frames.slice(0, 500)).length).toBeLessThan(16);
  });

  it('rejects truncated data', () => {
    const enc = encodeFrames([quantise({ bits: IB.TOUCH, tdx: 1000, tdy: -1000, ax: 0, ay: 0 })]);
    expect(() => decodeFrames(enc.slice(0, 4))).toThrow();
  });
});

describe('replay playback', () => {
  for (const st of ALL_STAGES.slice(0, 3)) {
    it(`stage ${st.id}: a recorded run replays to the same state`, () => {
      // record: the autopilot plays (mortal), with some touch input mixed in
      const a = mkWorld(st);
      const log: InputFrame[] = [];
      for (let f = 0; f < 4000; f++) {
        const b = botInput(a);
        const inp = quantise(f % 600 < 60 ? { bits: (b.bits & ~0xf) | IB.TOUCH, tdx: Math.sin(f * 0.1) * 3.33, tdy: Math.cos(f * 0.07) * 2.71, ax: 0, ay: 0 } : { ...b });
        log.push(inp);
        a.update(inp);
        a.events.length = 0; a.sfxQ.length = 0; a.musicQ.length = 0;
      }
      // replay from the stored form
      const frames = decodeFrames(encodeFrames(log));
      const b = mkWorld(st);
      for (const inp of frames) { b.update(inp); b.events.length = 0; b.sfxQ.length = 0; b.musicQ.length = 0; }
      expect(hash(b)).toBe(hash(a));
      expect(b.score).toBe(a.score);
    }, 60000);
  }
});

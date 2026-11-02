// Headless simulation: the autopilot (god mode) plays each stage to the end; must clear without errors,
// and two runs with identical input must produce identical state (determinism, docs/02 §8).
import { describe, it, expect } from 'vitest';
import '../../src/content/enemies/common';
import '../../src/content/bosses/st1';
import { ALL_STAGES } from '../../src/content/stages/index';
import { World, type WorldEvent } from '../../src/game/world';
import { botInput } from '../../src/game/bot';
import type { StageDef } from '../../src/game/stage';

function hash(w: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(w.frame); mix(w.score); mix(w.player.x); mix(w.player.y); mix(w.player.lv); mix(w.rank); mix(w.rng.s);
  for (const e of w.enemies.items) if (e.active) { mix(e.x); mix(e.y); mix(e.hp); }
  for (const b of w.bullets.items) if (b.active) { mix(b.x); mix(b.y); }
  return h.toString(16);
}

function play(stage: StageDef, maxFrames = 60 * 60 * 8): { w: World; events: WorldEvent[]; frames: number } {
  const w = new World({ stage, diff: 'normal', loop: 1, mode: 'arcade', respawn: 'inplace', god: true,
    loadout: { weapon: 'pulse', lv: 4, sub: 'seeker', subLv: 1, drones: 3, formation: 'wing', barrier: 0, speedLv: 2 } });
  const events: WorldEvent[] = [];
  let f = 0;
  for (; f < maxFrames; f++) {
    w.update(botInput(w));
    events.push(...w.events);
    w.events.length = 0;
    w.sfxQ.length = 0; w.musicQ.length = 0;
    if (events.some((e) => e.type === 'stageClear')) break;
  }
  return { w, events, frames: f };
}

describe('stage simulation', () => {
  for (const st of ALL_STAGES) {
    it(`stage ${st.id} can be cleared by the autopilot`, () => {
      const r = play(st);
      const clear = r.events.find((e) => e.type === 'stageClear');
      expect(clear, `stage ${st.id} not cleared in ${r.frames} frames (t=${r.w.t}, phase=${r.w.phase})`).toBeTruthy();
      expect(r.w.stats.kills).toBeGreaterThan(30);
    }, 120000);
    it(`stage ${st.id} is deterministic`, () => {
      const a = play(st, 3000), b = play(st, 3000);
      expect(hash(a.w)).toBe(hash(b.w));
    }, 60000);
  }
});

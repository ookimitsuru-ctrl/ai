// Every midboss and boss must be beatable with a mid-game loadout (Lv3, two drones, no sub weapon) and every main
// weapon: the autopilot (invincible) has to destroy each within its time limit. Guards against unreachable weak
// points, stuck phases, broken weapons (the v1.0 RAY never hit) and bosses that are simply too tough.
import { describe, it, expect } from 'vitest';
import '../../src/content/index';
import { ALL_STAGES } from '../../src/content/stages/index';
import { World } from '../../src/game/world';
import { botInput } from '../../src/game/bot';

describe('bosses are beatable with a mid-game loadout', () => {
  for (const st of ALL_STAGES) {
    for (const start of ['midboss', 'boss'] as const) {
      for (const weapon of ['pulse', 'fan', 'ray'] as const) {
        it(`stage ${st.id} ${start} (${weapon})`, () => {
          const w = new World({ stage: st, diff: 'normal', loop: 1, mode: 'arcade', respawn: 'inplace', god: true, startAt: start,
            loadout: { weapon, lv: 3, sub: null, subLv: 0, drones: 2, formation: 'wing', barrier: 0, speedLv: 2 } });
          let res = 'timeout';
          for (let f = 0; f < 60 * 60 * 7; f++) {
            w.update(botInput(w));
            for (const e of w.events) if (e.type === 'stageClear') res = e.bossBonus ? 'defeated' : 'escaped';
            w.events.length = 0; w.sfxQ.length = 0; w.musicQ.length = 0;
            if (start === 'midboss' && f > 120 && !w.waiting) { res = w.midboss?.killedByPlayer ? 'defeated' : 'escaped'; break; }
            if (res !== 'timeout') break;
          }
          expect(res).toBe('defeated');
        }, 120000);
      }
    }
  }
});

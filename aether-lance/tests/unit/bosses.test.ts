// Every midboss and boss must be beatable: the autopilot (max power, invincible) defeats each
// within its time limit — guards against unreachable weak points / stuck phases.
import { describe, it, expect } from 'vitest';
import '../../src/content/index';
import { ALL_STAGES } from '../../src/content/stages/index';
import { World } from '../../src/game/world';
import { botInput } from '../../src/game/bot';

describe('bosses are beatable', () => {
  for (const st of ALL_STAGES) {
    for (const start of ['midboss', 'boss'] as const) {
      it(`stage ${st.id} ${start}`, () => {
        const w = new World({ stage: st, diff: 'normal', loop: 1, mode: 'arcade', respawn: 'inplace', god: true, startAt: start,
          loadout: { weapon: 'pulse', lv: 5, sub: 'seeker', subLv: 2, drones: 4, formation: 'wing', barrier: 0, speedLv: 2 } });
        let res = 'timeout';
        for (let f = 0; f < 60 * 60 * 6; f++) {
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
});

// Respawn placement: in stage 5's vertical shaft the usual entry point (60, 135) is inside the shaft wall, which used
// to kill the ship again as soon as its invulnerability ran out (v1.2.0 fix: World.entrySpot).
import { describe, it, expect } from 'vitest';
import '../../src/content/index';
import { ALL_STAGES } from '../../src/content/stages/index';
import { World } from '../../src/game/world';
import { botInput } from '../../src/game/bot';
import { terrainHit } from '../../src/game/player';
import { PLAYER } from '../../src/data/balance';

describe('respawn placement', () => {
  it('stage 5 shaft: the ship respawns clear of the walls and stays clear', () => {
    const st = ALL_STAGES.find((s) => s.id === 5)!;
    const w = new World({ stage: st, diff: 'normal', loop: 1, mode: 'arcade', respawn: 'inplace', god: true,
      loadout: { weapon: 'pulse', lv: 4, sub: null, subLv: 0, drones: 2, formation: 'wing', barrier: 0, speedLv: 2 } });
    // fly until well inside the vertical shaft
    let shaft = 0;
    for (let f = 0; f < 60 * 120 && shaft < 120; f++) {
      w.update(botInput(w));
      w.events.length = 0; w.sfxQ.length = 0; w.musicQ.length = 0;
      if (Math.abs(w.scrollVY) > 0.5 && Math.abs(w.scrollVX) < 0.2) shaft++;
    }
    expect(shaft, 'never reached the vertical shaft').toBeGreaterThanOrEqual(120);
    expect(!!terrainHit(w, 60, 135), 'the old fixed spot should be inside the wall here').toBe(true);
    const at = w.entrySpot();
    const horizon = PLAYER.respawnEnter + PLAYER.respawnInvuln + 60;
    const cam0 = [w.camX, w.camY];
    for (let k = 0; k <= horizon; k += 6) {
      w.camX = w.profile.X(w.t + k); w.camY = w.profile.Y(w.t + k);
      expect(terrainHit(w, at.x, at.y), `terrain at (${at.x}, ${at.y}) after ${k} frames`).toBeNull();
    }
    [w.camX, w.camY] = cam0;
  }, 120000);
});

// Attract demo: the autopilot plays stage 1 (docs/09_ui.md §3.3).
import { GameScene } from './game';
import { newRun } from '../app';
import { botInput } from '../game/bot';

export class DemoScene extends GameScene {
  override readonly id = 'DemoScene';
  constructor() {
    const run = newRun('practice', 'normal', 'inplace');
    run.god = true;
    run.loadout = { weapon: 'pulse', lv: 3, sub: 'seeker', subLv: 1, drones: 2, formation: 'wing', barrier: 0, speedLv: 2 };
    super(run, undefined, (w) => botInput(w), 90 * 60);
  }
}

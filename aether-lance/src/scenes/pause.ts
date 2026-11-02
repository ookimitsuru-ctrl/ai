// Pause overlay (docs/09_ui.md §3.8).
import { scenes, type Scene } from '../core/scene';
import { input } from '../core/input';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL, rgba } from '../render/palette';
import { audio } from '../audio/engine';
import { t } from '../i18n/index';
import { Menu, Confirm, panel } from '../ui/menu';
import { OptionsScene } from './options';
import { TitleScene } from './title';
import type { GameScene } from './game';
import { ControlsPanel } from './options';

export class PauseScene implements Scene {
  transparent = true;
  t = 0;
  menu: Menu;
  confirm = new Confirm();
  showControls = false;
  constructor(private game: GameScene) {
    const items = [
      { label: 'RESUME', desc: () => t('pause.resume'), action: () => this.close() },
      { label: 'OPTIONS', desc: () => t('pause.options'), action: () => scenes.push(new OptionsScene(true)) },
      { label: 'CONTROLS', desc: () => t('pause.controls'), action: () => { this.showControls = true; } },
      ...(game.run.mode === 'practice' ? [{ label: 'RETRY', desc: () => t('pause.retry'), action: () => { audio.setPauseFilter(false); scenes.goto(() => new (game.constructor as new (r: typeof game.run) => GameScene)({ ...game.run }), 30); } }] : []),
      { label: 'QUIT TO TITLE', desc: () => t('pause.quit'), action: () => this.confirm.open(t('confirm.quit'), () => { audio.setPauseFilter(false); audio.stopMusic(0.3); scenes.goto(() => new TitleScene(), 30); }) },
    ];
    this.menu = new Menu(items, 240, 150, 13);
  }
  enter(): void {
    const w = this.game.world;
    audio.loopStopAll();
    if (w.stage.beatBpm) audio.music?.pause(); else audio.setPauseFilter(true);
  }
  close(): void {
    const w = this.game.world;
    if (w.stage.beatBpm) audio.music?.resume(); else audio.setPauseFilter(false);
    this.game.resumeFromPause();
    scenes.pop();
  }
  update(): void {
    this.t++;
    if (this.showControls) { if (input.menuConfirm() || input.menuCancel() || input.pointer.clicked) { this.showControls = false; audio.sfx('menu_cancel'); } return; }
    if (this.confirm.active) { this.confirm.update(); return; }
    if (input.hit('pause') && this.t > 5) { this.close(); return; }
    if (this.menu.update() === 'cancel') this.close();
  }
  render(): void {
    const h = renderer.hud;
    h.fillStyle = rgba('N0', 0.6); h.fillRect(0, 0, 480, 270);
    const f = font();
    if (this.showControls) { new ControlsPanel().draw(h); return; }
    f.draw(h, 'PAUSE', 240, 40, 'N8', 3, 'center', 'N1');
    const p = this.game.world.player;
    panel(h, 120, 76, 240, 50, 0.7);
    f.draw(h, `${p.weapon.toUpperCase()} LV${p.lv}`, 132, 84, 'C4');
    f.draw(h, p.sub ? `${p.sub === 'bomb' ? 'G.BOMB' : 'SEEKER'} LV${p.subLv}` : 'NO SUB', 132, 96, 'P4');
    f.draw(h, `WISP ×${p.drones} ${p.formation.toUpperCase()}`, 348, 84, 'N7', 1, 'right');
    f.draw(h, `SPD ${p.speedLv}  AEGIS ${p.barrier}`, 348, 96, 'N7', 1, 'right');
    // progress bar
    const w = this.game.world;
    const prog = Math.min(1, w.t / Math.max(1, w.stage.bossAt));
    h.fillStyle = PAL.N3; h.fillRect(132, 112, 216, 4);
    h.fillStyle = PAL.C3; h.fillRect(132, 112, Math.round(216 * prog), 4);
    for (const cp of w.stage.checkpoints) { h.fillStyle = PAL.N8; h.fillRect(132 + Math.round((216 * cp.at) / w.stage.bossAt), 110, 1, 8); }
    this.menu.draw(h, this.t);
    this.menu.drawDesc(236);
    this.confirm.draw(h, this.t, t('confirm.yes'), t('confirm.no'));
  }
}

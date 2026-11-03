// Boot, Title, Main menu and Difficulty select (docs/09_ui.md §3.1–3.5).
import { scenes, type Scene } from '../core/scene';
import { HD } from '../core/hd';
import { input } from '../core/input';
import { save, DIFFS, type Difficulty } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL } from '../render/palette';
import { audio } from '../audio/engine';
import { t } from '../i18n/index';
import { backdrop } from './backdrop';
import { Menu, panel } from '../ui/menu';
import { hiScore, newRun, VERSION } from '../app';
import { GameScene } from './game';
import { OptionsScene } from './options';
import { RankingScene, CreditsScene } from './records';
import { PracticeScene } from './practice';
import { DemoScene } from './demo';

export { VERSION };

/** The silent-switch hint only matters on iPhone / iPad. */
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export class BootScene implements Scene {
  readonly id = 'BootScene';
  t = 0;
  update(): void {
    this.t++;
    if (this.t > 20 && (input.anyPressed || input.pointer.clicked)) {
      audio.unlock();
      scenes.goto(() => new TitleScene(), 30);
    }
  }
  render(): void {
    const g = renderer.game;
    g.fillStyle = PAL.N0; g.fillRect(0, 0, 480, 270);
    const f = font();
    const h = renderer.hud;
    f.draw(h, 'AETHER LANCE', 240, 110, 'N7', 2, 'center');
    if ((this.t >> 5) % 2 === 0) f.draw(h, t('boot.tap'), 240, 150, 'C4', 1, 'center');
    if (!save.data.progress.seenIntro && IOS) renderer.text(t('boot.ios'), 240, 230, { size: 7, align: 'center', color: 'N5' });
  }
}

export class TitleScene implements Scene {
  readonly id = 'TitleScene';
  t = 0;
  idle = 0;
  enter(): void {
    if (audio.currentSong() !== 'title') audio.playMusic('title', 1.2);
    if (!save.data.progress.seenIntro) { save.data.progress.seenIntro = true; }
  }
  resume(): void { this.idle = 0; if (audio.currentSong() !== 'title') audio.playMusic('title', 1.0); }
  update(): void {
    this.t++;
    this.idle++;
    if (input.anyPressed || input.pointer.clicked) this.idle = 0;
    if (this.t > 30 && (input.menuConfirm() || input.hit('pause') || input.pointer.clicked)) {
      audio.sfx('menu_confirm');
      scenes.push(new MainMenuScene());
    }
    if (this.idle > 30 * 60) { this.idle = 0; scenes.goto(() => new DemoScene(), 30); }
  }
  render(): void {
    const g = renderer.game;
    backdrop.draw(g);
    const h = renderer.hud;
    backdrop.drawLogo(h, 64, this.t);
    renderer.text(t('title.sub'), 240, HD ? 108 : 100, { size: 10, align: 'center', color: 'C4' });
    const f = font();
    if ((this.t >> 5) % 2 === 0) f.draw(h, t('title.press'), 240, 170, 'N8', 1, 'center', 'N0');
    f.draw(h, 'HI ' + String(hiScore('normal')).padStart(10, '0'), 240, 4, 'N6', 1, 'center');
    f.draw(h, VERSION, 474, 260, 'N4', 1, 'right');
    f.draw(h, '© 2026', 6, 260, 'N4');
  }
}

export class MainMenuScene implements Scene {
  readonly id = 'MainMenuScene';
  t = 0;
  menu: Menu;
  constructor() {
    const P = save.data.progress;
    this.menu = new Menu([
      { label: 'ARCADE', desc: () => t('menu.arcade'), action: () => scenes.push(new DifficultyScene('arcade')) },
      { label: 'PRACTICE', desc: () => t('menu.practice'), action: () => scenes.push(new PracticeScene()) },
      { label: () => (P.bossRushUnlocked ? 'BOSS RUSH' : '? ? ?'), desc: () => (P.bossRushUnlocked ? t('menu.bossrush') : t('menu.bossrush.locked')), enabled: () => P.bossRushUnlocked, action: () => scenes.push(new DifficultyScene('bossrush')) },
      { label: 'RANKING', desc: () => t('menu.ranking'), action: () => scenes.push(new RankingScene()) },
      { label: 'OPTIONS', desc: () => t('menu.options'), action: () => scenes.push(new OptionsScene()) },
      { label: 'CREDITS', desc: () => t('menu.credits'), action: () => scenes.push(new CreditsScene()) },
    ], 240, 139, 14);
  }
  update(): void {
    this.t++;
    if (this.menu.update() === 'cancel') scenes.pop();
  }
  render(): void {
    const g = renderer.game;
    backdrop.draw(g, 0.25);
    const h = renderer.hud;
    backdrop.drawLogo(h, 40, this.t);
    renderer.text(t('title.sub'), 240, HD ? 84 : 76, { size: 9, align: 'center', color: 'C4' });
    panel(h, 150, 128, 180, 96, 0.6);
    this.menu.draw(h, this.t);
    this.menu.drawDesc(236);
  }
}

export class DifficultyScene implements Scene {
  readonly id = 'DifficultyScene';
  t = 0;
  sel = 1;
  respawn: 'inplace' | 'checkpoint' = 'inplace';
  row = 0;
  constructor(public mode: 'arcade' | 'bossrush') {}
  unlocked(d: Difficulty): boolean { return d !== 'ordeal' || save.data.progress.ordealUnlocked; }
  update(): void {
    this.t++;
    if (input.repeat('left')) { if (this.row === 0) this.sel = (this.sel + 3) % 4; else this.respawn = this.respawn === 'inplace' ? 'checkpoint' : 'inplace'; audio.sfx('menu_move'); }
    if (input.repeat('right')) { if (this.row === 0) this.sel = (this.sel + 1) % 4; else this.respawn = this.respawn === 'inplace' ? 'checkpoint' : 'inplace'; audio.sfx('menu_move'); }
    if (input.repeat('up') || input.repeat('down')) { if (this.mode === 'arcade') { this.row = 1 - this.row; audio.sfx('menu_move'); } }
    const p = input.pointer;
    if (p.clicked) {
      if (p.y > 70 && p.y < 190) { const i = Math.floor((p.x - 24) / 108); if (i >= 0 && i < 4) { if (this.sel === i && this.row === 0) this.start(); else { this.sel = i; this.row = 0; audio.sfx('menu_move'); } } }
      else if (p.y >= 196 && p.y < 222 && this.mode === 'arcade') { this.row = 1; this.respawn = p.x < 240 ? 'inplace' : 'checkpoint'; audio.sfx('menu_move'); }
    }
    if (input.menuConfirm()) this.start();
    if (input.menuCancel()) { audio.sfx('menu_cancel'); scenes.pop(); }
  }
  start(): void {
    const d = DIFFS[this.sel]!;
    if (!this.unlocked(d)) { audio.sfx('menu_cancel'); return; }
    audio.sfx('menu_confirm');
    const run = newRun(this.mode, d, this.mode === 'bossrush' ? 'inplace' : this.respawn);
    if (this.mode === 'bossrush') { run.startAt = 'cp3'; run.loadout = { weapon: 'pulse', lv: 4, sub: 'seeker', subLv: 1, drones: 2, formation: 'wing', barrier: 0, speedLv: 2 }; }
    audio.stopMusic(0.8);
    scenes.goto(() => new GameScene(run), 40);
  }
  render(): void {
    const g = renderer.game;
    backdrop.draw(g, 0.45);
    const h = renderer.hud;
    const f = font();
    f.draw(h, this.mode === 'bossrush' ? 'BOSS RUSH — SELECT DIFFICULTY' : 'SELECT DIFFICULTY', 240, 30, 'N8', 1, 'center');
    const info: Record<Difficulty, [string, string]> = {
      easy: ['×5', 'NO TERRAIN MISS'], normal: ['×3', 'STANDARD'], hard: ['×3', 'FAST BULLETS'], ordeal: ['×2', 'LOOP 2 START'],
    };
    DIFFS.forEach((d, i) => {
      const x = 24 + i * 108, y = 70;
      const on = i === this.sel;
      const un = this.unlocked(d);
      panel(h, x, y, 100, 116, on ? 0.85 : 0.55);
      if (on && this.row === 0) { h.fillStyle = PAL.C3; h.fillRect(x, y, 100, 2); h.fillRect(x, y + 114, 100, 2); }
      f.draw(h, un ? d.toUpperCase() : '? ? ?', x + 50, y + 12, on ? 'N8' : 'N5', 2, 'center');
      if (un) {
        f.draw(h, 'LIVES ' + info[d][0], x + 50, y + 44, 'C4', 1, 'center');
        f.draw(h, info[d][1], x + 50, y + 58, 'N6', 1, 'center');
        f.draw(h, 'HI', x + 10, y + 92, 'N5');
        f.draw(h, String(hiScore(d)), x + 90, y + 92, 'N7', 1, 'right');
      } else f.draw(h, 'LOCKED', x + 50, y + 50, 'N4', 1, 'center');
    });
    const d = DIFFS[this.sel]!;
    renderer.text(this.unlocked(d) ? t(('diff.' + d) as 'diff.easy') : t('diff.locked'), 240, 190, { size: 8, align: 'center', color: 'N6' });
    if (this.mode === 'arcade') {
      f.draw(h, 'RESPAWN', 120, 206, this.row === 1 ? 'N8' : 'N5', 1, 'center');
      f.draw(h, '◀ ' + (this.respawn === 'inplace' ? 'IN-PLACE' : 'CHECKPOINT') + ' ▶', 290, 206, this.row === 1 ? 'C4' : 'N6', 1, 'center');
      renderer.text(this.respawn === 'inplace' ? t('diff.inplace') : t('diff.checkpoint'), 240, 222, { size: 7, align: 'center', color: 'N5' });
    }
    f.draw(h, 'Z/ENTER: START   X/ESC: BACK', 240, 252, 'N4', 1, 'center');
  }
}

// Name entry, ranking, credits (docs/09_ui.md §3.11–3.13).
import { scenes, type Scene } from '../core/scene';
import { input } from '../core/input';
import { save, persist, insertRank, DIFFS, type Difficulty, type RankEntry } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL } from '../render/palette';
import { audio } from '../audio/engine';
import { t } from '../i18n/index';
import { panel } from '../ui/menu';
import { backdrop } from './backdrop';
import { TitleScene } from './title';
import { storeReplay, replayInfo, loadReplay, type RunState } from '../app';
import { GameScene, fmtTime } from './game';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?★♥ ';

export class NameEntryScene implements Scene {
  readonly id = 'NameEntryScene';
  t = 0;
  name: string[];
  pos = 0;
  ci: number[];
  done = false;
  constructor(private board: Difficulty | 'bossrush', private score: number, private run: RunState, private time = false) {
    const last = save.data.lastName.padEnd(3, 'A').slice(0, 3);
    this.name = [...last];
    this.ci = this.name.map((c) => Math.max(0, CHARS.indexOf(c)));
  }
  enter(): void { audio.playMusic('name_entry', 0.5); }
  update(): void {
    this.t++;
    if (this.done) return;
    if (this.t > 30 * 60) { this.commit(); return; }
    if (input.repeat('up')) { this.ci[this.pos] = (this.ci[this.pos]! + 1) % CHARS.length; audio.sfx('menu_move'); }
    if (input.repeat('down')) { this.ci[this.pos] = (this.ci[this.pos]! + CHARS.length - 1) % CHARS.length; audio.sfx('menu_move'); }
    if (input.repeat('right')) { this.pos = Math.min(3, this.pos + 1); audio.sfx('menu_move'); }
    if (input.repeat('left')) { this.pos = Math.max(0, this.pos - 1); audio.sfx('menu_move'); }
    for (const ch of input.typed) {
      if (ch === '\b') { this.pos = Math.max(0, this.pos - 1); continue; }
      if (ch === '\n') { this.commit(); return; }
      const up = ch.toUpperCase();
      const i = CHARS.indexOf(up);
      if (i >= 0 && this.pos < 3) { this.ci[this.pos] = i; this.pos++; audio.sfx('menu_move'); }
    }
    const p = input.pointer;
    if (p.clicked) {
      const gx = Math.floor((p.x - 64) / 22), gy = Math.floor((p.y - 150) / 18);
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 3) {
        const i = gy * 16 + gx;
        if (i === CHARS.length) { this.commit(); return; }
        if (i < CHARS.length && this.pos < 3) { this.ci[this.pos] = i; this.pos++; audio.sfx('menu_move'); }
      }
      return;
    }
    if (input.hit('confirm') || input.hit('shot')) {
      if (this.pos >= 3) { this.commit(); return; }
      this.pos++; audio.sfx('menu_confirm');
    }
    if (input.hit('cancel') || input.hit('drive')) { this.pos = Math.max(0, this.pos - 1); audio.sfx('menu_cancel'); }
  }
  commit(): void {
    if (this.done) return;
    this.done = true;
    const name = this.ci.map((i) => CHARS[i]!).join('');
    save.data.lastName = name;
    const r = this.run;
    const flags: string[] = [];
    if (r.continues > 0) flags.push('C×' + r.continues);
    if (r.respawn === 'checkpoint') flags.push('CP');
    if (r.assist) flags.push('ASSIST');
    const reach = r.mode === 'bossrush' ? 'ALL' : r.stage >= 6 && r.loop >= 2 ? 'ALL 2' : `${r.loop >= 2 ? '2-' : ''}${r.stage}`;
    const d = new Date();
    const entry: RankEntry = { name, score: this.score, reach, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, flags, weapon: r.loadout.weapon };
    const pos = insertRank(this.board, entry, this.time);
    // keep the replay of the best run on each board
    if (pos === 0) storeReplay(this.board, entry, r);
    delete r.rec;
    persist();
    audio.sfx('menu_confirm');
    scenes.goto(() => new RankingScene(this.board, pos), 40);
  }
  render(): void {
    backdrop.draw(renderer.game, 0.6);
    const h = renderer.hud;
    const f = font();
    f.draw(h, 'NAME ENTRY', 240, 30, 'N8', 2, 'center', 'N1');
    renderer.text(t('name.enter'), 240, 54, { size: 8, align: 'center', color: 'N6' });
    f.draw(h, this.time ? fmtTime(this.score) : String(this.score).padStart(10, '0'), 240, 72, 'Y4', 2, 'center', 'N1');
    for (let i = 0; i < 3; i++) {
      const x = 210 + i * 30;
      const on = i === this.pos && (this.t >> 3) % 2 === 0;
      f.draw(h, CHARS[this.ci[i]!]!, x, 100, on ? 'C4' : 'N8', 3, 'center', 'N1');
      h.fillStyle = i === this.pos ? PAL.C3 : PAL.N4; h.fillRect(x - 9, 126, 18, 2);
    }
    f.draw(h, 'END', 302, 108, this.pos >= 3 ? 'C4' : 'N5', 1, 'left');
    // character grid (touch)
    panel(h, 56, 144, 368, 62, 0.6);
    for (let i = 0; i <= CHARS.length; i++) {
      const gx = i % 16, gy = Math.floor(i / 16);
      f.draw(h, i === CHARS.length ? 'END' : CHARS[i] === ' ' ? '_' : CHARS[i]!, 75 + gx * 22, 152 + gy * 18, 'N6', 1, 'center');
    }
    f.draw(h, String(Math.max(0, 30 - Math.floor(this.t / 60))), 440, 30, 'N5', 1, 'right');
  }
}

export class RankingScene implements Scene {
  readonly id = 'RankingScene';
  t = 0;
  tab: number;
  /** replay of the #1 entry on the current board, if it is still the one on top */
  hasReplay = false;
  private replayTab = -1;
  constructor(board: Difficulty | 'bossrush' = 'normal', private highlight = -1) {
    this.tab = board === 'bossrush' ? 4 : DIFFS.indexOf(board);
  }
  boards: (Difficulty | 'bossrush')[] = [...DIFFS, 'bossrush'];
  private checkReplay(): void {
    if (this.replayTab === this.tab) return;
    this.replayTab = this.tab;
    const b = this.boards[this.tab]!;
    const info = replayInfo(b);
    const top = save.data.records[b][0];
    this.hasReplay = !!info && !!top && info.name === top.name && info.score === top.score && info.date === top.date;
  }
  private back(): void {
    audio.sfx('menu_cancel');
    if (scenes.stack.length > 1) scenes.pop(); else scenes.goto(() => new TitleScene(), 30);
  }
  private playReplay(): void {
    const board = this.boards[this.tab]!;
    const d = loadReplay(board);
    if (!d) { this.hasReplay = false; audio.sfx('menu_cancel'); return; }
    audio.sfx('menu_confirm');
    audio.stopMusic(0.6);
    const label = `${d.name}  ${board === 'bossrush' ? fmtTime(d.score) : d.score}`;
    scenes.goto(() => new GameScene(structuredClone(d.run), { frames: d.decoded, modes: d.modes, label, exit: () => new RankingScene(board) }), 40);
  }
  update(): void {
    this.t++;
    this.checkReplay();
    if (input.repeat('left')) { this.tab = (this.tab + 4) % 5; this.highlight = -1; audio.sfx('menu_move'); }
    if (input.repeat('right')) { this.tab = (this.tab + 1) % 5; this.highlight = -1; audio.sfx('menu_move'); }
    const p = input.pointer;
    if (p.clicked && p.y < 48) { const i = Math.floor((p.x - 40) / 80); if (i >= 0 && i < 5) { this.tab = i; this.highlight = -1; } p.clicked = false; }
    if (p.clicked && p.y >= 48) {
      // tap the top row (or the hint) to watch its replay, anywhere else to go back
      if (this.hasReplay && ((p.y >= 72 && p.y < 88) || p.y >= 240)) this.playReplay(); else this.back();
      return;
    }
    if (input.menuConfirm()) { if (this.hasReplay) this.playReplay(); else this.back(); return; }
    if (input.menuCancel()) this.back();
  }
  render(): void {
    backdrop.draw(renderer.game, 0.65);
    const h = renderer.hud;
    const f = font();
    f.draw(h, t('ranking.title'), 240, 12, 'N8', 2, 'center', 'N1');
    this.boards.forEach((b, i) => {
      const on = i === this.tab;
      panel(h, 40 + i * 80 + 1, 30, 78, 14, on ? 0.9 : 0.4);
      f.draw(h, b === 'bossrush' ? 'B.RUSH' : b.toUpperCase(), 40 + i * 80 + 40, 34, on ? 'N8' : 'N5', 1, 'center');
    });
    const board = this.boards[this.tab]!;
    const list = save.data.records[board];
    panel(h, 40, 52, 400, 184, 0.75);
    f.draw(h, 'RANK', 56, 60, 'N5'); f.draw(h, 'NAME', 100, 60, 'N5'); f.draw(h, board === 'bossrush' ? 'TIME' : 'SCORE', 250, 60, 'N5', 1, 'right');
    f.draw(h, 'REACH', 300, 60, 'N5', 1, 'center'); f.draw(h, 'DATE', 380, 60, 'N5', 1, 'center');
    list.forEach((e, i) => {
      const y = 76 + i * 15;
      const hl = i === this.highlight && (this.t >> 3) % 2 === 0;
      const col = hl ? 'Y4' : i === 0 ? 'Y3' : 'N7';
      f.draw(h, `${i + 1}`.padStart(2, ' '), 66, y, col, 1, 'right');
      f.draw(h, e.name, 100, y, col);
      f.draw(h, board === 'bossrush' ? fmtTime(e.score) : String(e.score), 250, y, col, 1, 'right');
      f.draw(h, e.reach, 300, y, 'N6', 1, 'center');
      f.draw(h, e.date.slice(2), 380, y, 'N5', 1, 'center');
      const wl = e.weapon === 'pulse' ? 'P' : e.weapon === 'fan' ? 'F' : 'R';
      f.draw(h, wl, 424, y, wl === 'P' ? 'C3' : wl === 'F' ? 'G3' : 'P3');
      if (e.flags.length) f.draw(h, e.flags.join(' '), 140, y, 'O5');
      if (i === 0 && this.hasReplay) f.draw(h, '▶', 46, y, (this.t >> 4) % 2 ? 'C4' : 'C3');
    });
    f.draw(h, this.hasReplay ? 'Z: WATCH REPLAY   X: BACK' : 'X: BACK', 240, 246, 'N4', 1, 'center');
  }
}

export class CreditsScene implements Scene {
  readonly id = 'CreditsScene';
  t = 0;
  update(): void {
    this.t++;
    if ((input.menuConfirm() || input.menuCancel() || input.pointer.clicked) && this.t > 20) { audio.sfx('menu_cancel'); scenes.pop(); }
  }
  render(): void {
    backdrop.draw(renderer.game, 0.6);
    const h = renderer.hud;
    const f = font();
    f.draw(h, 'CREDITS', 240, 24, 'N8', 2, 'center', 'N1');
    CREDITS.forEach(([a, b], i) => {
      f.draw(h, a, 240, 60 + i * 26, 'N5', 1, 'center');
      f.draw(h, b, 240, 72 + i * 26, 'N8', 1, 'center');
    });
  }
}

export const CREDITS: [string, string][] = [
  ['GAME DESIGN / PROGRAM', 'YOU'],
  ['GRAPHICS / MUSIC / SOUND', 'YOU'],
  ['DEVELOPED WITH', 'CLAUDE CODE'],
  ['FONT', 'DOTGOTHIC16 (SIL OFL 1.1)'],
  ['SPECIAL THANKS', 'AND YOU, PILOT.'],
];

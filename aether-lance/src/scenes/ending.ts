// Ending + staff roll (docs/01_concept.md §3.3).
import { scenes, type Scene } from '../core/scene';
import { blit, lw, lh } from '../core/hd';
import { input } from '../core/input';
import { rankPosition } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL } from '../render/palette';
import { drawSprite } from '../render/sprite';
import { drawGlow } from '../render/draw';
import { audio } from '../audio/engine';
import { t } from '../i18n/index';
import { Confirm } from '../ui/menu';
import { StarField } from '../content/backgrounds/common';
import { planetCanvas } from '../content/backgrounds/orbit';
import { SPR } from '../content/sprites/registry';
import { CREDITS, NameEntryScene } from './records';
import { TitleScene } from './title';
import { GameScene, fmtTime } from './game';
import type { RunState } from '../app';

export class EndingScene implements Scene {
  readonly id = 'EndingScene';
  t = 0;
  hold = 0;
  armed = false; // skip only after the button has been released once (no carry-over from gameplay)
  stars = new StarField(5);
  confirm = new Confirm();
  asked = false;
  constructor(private run: RunState, private trueEnd: boolean, private offerLoop2: boolean) {}
  enter(): void { audio.playMusic('ending', 2); }
  update(): void {
    this.t++;
    if (this.confirm.active) { this.confirm.update(); if (!this.confirm.active && this.asked) this.finish(); return; }
    const down = !!(input.held[4] || input.held[10] || input.pointer.down);
    if (!down) this.armed = true;
    if (down && this.armed) this.hold++; else this.hold = 0;
    const END = 60 * 75;
    if (this.hold > 60 || this.t > END) {
      if (this.offerLoop2 && !this.asked) {
        this.asked = true;
        this.confirm.open(t('ending.loop2'), () => {
          const r = this.run;
          r.loop = 2; r.stage = 1; r.startAt = 'start';
          audio.stopMusic(1);
          scenes.goto(() => new GameScene(r), 60);
        });
        return;
      }
      if (!this.asked) { this.asked = true; this.finish(); }
    }
  }
  finish(): void {
    if (scenes.busy) return;
    const r = this.run;
    const pos = rankPosition(r.diff, r.score);
    if (r.mode === 'arcade' && pos >= 0) scenes.goto(() => new NameEntryScene(r.diff, r.score, r), 60);
    else scenes.goto(() => new TitleScene(), 60);
  }
  render(): void {
    const g = renderer.game;
    const k = this.t;
    g.fillStyle = PAL.C0; g.fillRect(0, 0, 480, 270);
    // sunrise sky gradient
    for (let y = 0; y < 270; y += 2) { g.fillStyle = y < 90 ? PAL.N0 : y < 150 ? PAL.C0 : y < 200 ? PAL.C1 : PAL.C2; g.globalAlpha = 0.6; g.fillRect(0, y, 480, 2); }
    g.globalAlpha = 1;
    this.stars.draw(g, k * 0.3, 0, k);
    const pl = planetCanvas(true);
    blit(g, pl, Math.round(480 - lw(pl) + 60), 270 - lh(pl) + 50);
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, 60, 210, 120, PAL.Y3, 0.5 + Math.min(0.4, k / 2000));
    g.globalCompositeOperation = 'source-over';
    // ship
    const sx = Math.min(240, -30 + k * 0.8) + (k > 1400 ? (k - 1400) * 2 : 0);
    const sy = 150 + Math.sin(k * 0.02) * 6 - (k > 1400 ? (k - 1400) * 0.5 : 0);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = PAL.O5; g.fillRect(Math.round(sx - 24), Math.round(sy) - 1, 9, 3);
    drawGlow(g, sx - 18, sy, 10, PAL.O5, 0.6);
    g.globalCompositeOperation = 'source-over';
    drawSprite(g, SPR.kestrel!, 2, sx, sy);
    const h = renderer.hud;
    const f = font();
    const line = (txt: string, t0: number, y: number, size = 10) => {
      if (k < t0) return;
      const a = Math.min(1, (k - t0) / 60) * (k > t0 + 420 ? Math.max(0, 1 - (k - t0 - 420) / 60) : 1);
      if (a > 0) renderer.text(txt, 240, y, { size, align: 'center', alpha: a, color: 'N8' });
    };
    if (this.trueEnd) { line(t('ending.true1'), 120, 70, 12); line(t('ending.true2'), 300, 92, 12); }
    else { line(t('ending.1'), 120, 70, 12); line(t('ending.2'), 300, 92, 10); }
    // staff roll
    const rollT = k - 900;
    if (rollT > 0) {
      const y0 = 280 - rollT * 0.35;
      f.draw(h, 'AETHER LANCE', 240, y0, 'C4', 2, 'center', 'N1');
      CREDITS.forEach(([a, b], i) => { f.draw(h, a, 240, y0 + 50 + i * 36, 'N5', 1, 'center', 'N1'); f.draw(h, b, 240, y0 + 62 + i * 36, 'N8', 1, 'center', 'N1'); });
      const sy0 = y0 + 50 + CREDITS.length * 36 + 40;
      f.draw(h, t('stats.title'), 240, sy0, 'Y3', 1, 'center', 'N1');
      const r = this.run;
      const acc = r.shots > 0 ? Math.min(100, Math.round((r.kills / Math.max(1, r.shots)) * 100 * 4)) : 0;
      [['SCORE', String(r.score)], ['TIME', fmtTime(r.frames)], ['MISS', String(r.deaths)], ['KILLS', String(r.kills)], ['CONTINUES', String(r.continues)], ['EFFICIENCY', acc + '%']].forEach(([a, b], i) => {
        f.draw(h, a!, 200, sy0 + 16 + i * 12, 'N6', 1, 'right', 'N1'); f.draw(h, b!, 220, sy0 + 16 + i * 12, 'N8', 1, 'left', 'N1');
      });
      if (sy0 + 100 < 140) f.draw(h, 'THANK YOU FOR PLAYING', 240, Math.max(120, sy0 + 110), 'N8', 2, 'center', 'N1');
      if (this.offerLoop2 && sy0 + 140 < 200) f.draw(h, 'LOOP 2 — THE SONG REMAINS', 240, Math.max(160, sy0 + 150), 'O5', 1, 'center', 'N1');
    }
    if (this.hold > 0) { h.fillStyle = PAL.C3; h.fillRect(420, 258, Math.round((this.hold / 60) * 50), 3); }
    renderer.text(t('ending.skip'), 476, 248, { size: 7, align: 'right', color: 'N5' });
    this.confirm.draw(h, this.t, t('confirm.yes'), t('confirm.no'));
  }
}

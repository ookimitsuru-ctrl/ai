// In-game scene: runs a World per stage, overlays (intro card, WARNING, clear tally, continue), progression.
import { scenes, type Scene } from '../core/scene';
import { input, ACT } from '../core/input';
import { save, persist, rankPosition } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL, rgba } from '../render/palette';
import { audio } from '../audio/engine';
import { drawHud } from '../render/hud';
import { WorldView } from '../render/worldRender';
import { World, type WorldEvent } from '../game/world';
import { IB, type InputFrame } from '../game/player';
import { DIFFICULTY, SCORE, DRIVE } from '../data/balance';
import { STAGES, hiScore, vibrate, type RunState } from '../app';
import { t, type StrKey } from '../i18n/index';
import { panel } from '../ui/menu';
import { PauseScene } from './pause';
import { NameEntryScene } from './records';
import { EndingScene } from './ending';
import { PracticeScene } from './practice';
import { TitleScene } from './title';
import { Debug } from './debug';

interface Tally { lines: { label: string; value: number }[]; total: number; shown: number; t: number }

export class GameScene implements Scene {
  touchMode = 'game' as const;
  world!: World;
  view!: WorldView;
  t = 0;
  stageT = 0;
  warnT = 0;
  warnName = '';
  cpT = 0;
  tally: Tally | null = null;
  cont: { t: number } | null = null;
  ready = 0;
  over = false;
  slowFrames = 0;
  fpsAcc = 0;
  lastTime = performance.now();
  frameTimes: number[] = [];
  debug: Debug | null = null;
  recording: InputFrame[] = [];
  replay: InputFrame[] | null = null;
  replayIdx = 0;
  bossRushDone = false;

  source: ((w: World) => InputFrame) | null = null;
  demoFrames = 0;

  constructor(public run: RunState, replay?: InputFrame[], source?: (w: World) => InputFrame, demoFrames = 0) {
    this.replay = replay ?? null;
    this.source = source ?? null;
    this.demoFrames = demoFrames;
    if (location.search.includes('debug')) this.debug = new Debug(this);
    this.startStage();
  }

  get stageDef() { return STAGES[this.run.stage - 1]!; }

  startStage(): void {
    const r = this.run;
    const def = this.stageDef;
    const cfg = DIFFICULTY[r.diff];
    this.world = new World({
      stage: def, diff: r.diff, loop: r.loop, mode: r.mode, respawn: r.respawn,
      score: r.score, lives: r.lives < 0 ? cfg.lives - 1 : r.lives, extIdx: r.extIdx, loadout: r.loadout, drive: r.drive,
      startAt: r.startAt, god: r.god, shotMode: save.data.settings.shotMode,
    });
    this.world.continues = r.continues;
    this.world.renderHooks.wave = (x, y, rr, life, s) => renderer.addWave(x, y, rr, life, s);
    this.world.renderHooks.chroma = (v) => { renderer.chroma = Math.max(renderer.chroma, v); };
    this.view = new WorldView(this.world);
    this.view.hitboxes = !!this.debug?.hitboxes;
    this.stageT = r.startAt === 'start' || r.mode === 'bossrush' ? 0 : 200;
    this.tally = null;
    renderer.haze = 0;
    if (r.mode === 'arcade') {
      const P = save.data.progress;
      P.reachedStage[r.diff] = Math.max(P.reachedStage[r.diff], r.stage);
      if (r.loop >= 2) P.loop2Reached = true;
    }
    if (r.mode === 'bossrush') {
      const w = this.world;
      for (const [k, i] of [['arms', 0], ['wisp', 1], ['aegis', 2], ['drive', 3]] as const) w.spawnItem(k, 300 + i * 30, 80 + i * 36);
    }
  }

  // ---------------------------------------------------------------------------------------------
  private buildInput(): InputFrame {
    if (this.source) return this.source(this.world);
    if (this.replay) {
      const f = this.replay[this.replayIdx++] ?? { bits: 0, tdx: 0, tdy: 0, ax: 0, ay: 0 };
      return f;
    }
    const h = input.held, p = input.pressed;
    let bits = 0;
    if (h[ACT.up]) bits |= IB.UP;
    if (h[ACT.down]) bits |= IB.DOWN;
    if (h[ACT.left]) bits |= IB.LEFT;
    if (h[ACT.right]) bits |= IB.RIGHT;
    if (h[ACT.shot]) bits |= IB.SHOT;
    if (p[ACT.shot]) bits |= IB.SHOT_PRESS;
    if (p[ACT.drive]) bits |= IB.DRIVE;
    if (p[ACT.speedUp]) bits |= IB.SPD_UP;
    if (p[ACT.speedDown]) bits |= IB.SPD_DN;
    if (p[ACT.formation]) bits |= IB.FORM;
    for (const ch of input.typed) if (ch >= '1' && ch <= '4') bits |= (ch.charCodeAt(0) - 48) << IB.SPD_SHIFT;
    let tdx = 0, tdy = 0, ax = 0, ay = 0;
    if (input.touchActive && input.lastDevice === 'touch') { bits |= IB.TOUCH; tdx = input.touchDx; tdy = input.touchDy; }
    if (input.analogMove && (input.analogX || input.analogY) && input.lastDevice === 'pad') { bits |= IB.ANALOG; ax = input.analogX; ay = input.analogY; }
    return { bits, tdx, tdy, ax, ay };
  }

  update(): void {
    this.t++;
    this.stageT++;
    const w = this.world;
    if (this.debug) this.debug.update();
    if (!this.replay && !this.demoFrames && (input.hit('pause') || document.hidden) && !this.tally && !this.cont && !scenes.busy) {
      audio.sfx('pause');
      scenes.push(new PauseScene(this));
      return;
    }
    const demo = !!this.replay || this.demoFrames > 0;
    if (demo && ((input.anyPressed || input.pointer.clicked) && this.t > 10 || (this.demoFrames > 0 && this.t > this.demoFrames))) { if (!scenes.busy) { audio.stopMusic(0.5); scenes.goto(() => new TitleScene(), 30); } return; }
    if (this.ready > 0) { this.ready--; return; }
    if (this.cont) { this.updateContinue(); this.flush(); return; }
    if (this.debug?.paused && !this.debug.step) { this.flush(); return; }
    const inp = this.buildInput();
    if (!this.replay) this.recording.push(inp);
    if (this.tally) { this.updateTally(); w.update({ bits: inp.bits & ~(IB.DRIVE | IB.SHOT), tdx: inp.tdx, tdy: inp.tdy, ax: inp.ax, ay: inp.ay }); }
    else w.update(inp);
    if (this.debug?.step) this.debug.step = false;
    this.run.frames++;
    for (const ev of w.events) this.onEvent(ev);
    w.events.length = 0;
    if (this.warnT > 0) this.warnT--;
    if (this.cpT > 0) this.cpT--;
    // per-stage render state
    renderer.haze = (w.haze ?? 0);
    renderer.stepEffects();
    this.flush();
    this.autoQuality();
  }

  private flush(): void {
    const w = this.world;
    for (const s of w.sfxQ) {
      if (s.id.startsWith('__loopstop:')) audio.loopStop(s.id.slice(11));
      else if (s.id.startsWith('__loop:')) { const [, key, id] = s.id.split(':'); audio.loopStart(key!, id!); }
      else audio.sfx(s.id, s.x);
    }
    w.sfxQ.length = 0;
    for (const m of w.musicQ) {
      switch (m.cmd) {
        case 'play': audio.playMusic(m.id, m.fade ?? 0); if (!save.data.progress.heardSongs.includes(m.id)) save.data.progress.heardSongs.push(m.id); break;
        case 'stop': audio.stopMusic(m.fade ?? 0.05); break;
        case 'drive': audio.setDrive(m.on); break;
        case 'duck': audio.duck(m.db, m.sec); break;
        case 'tempo': audio.music?.setTempo(m.bpm); break;
      }
    }
    w.musicQ.length = 0;
    // keep the music locked to the game clock on beat-synced stages
    if (w.stage.beatBpm && audio.music && audio.currentSong() === w.musicId && this.t % 30 === 0) {
      const expected = ((w.frame - w.musicStartFrame) * w.stage.beatBpm * 48) / 3600;
      audio.music.syncTo(expected);
    }
  }

  private onEvent(ev: WorldEvent): void {
    const w = this.world;
    switch (ev.type) {
      case 'warning': this.warnT = 180; this.warnName = ev.name; break;
      case 'checkpoint': this.cpT = 60; break;
      case 'vibrate': vibrate(ev.ms); break;
      case 'death': this.run.deaths++; save.data.stats.deaths++; break;
      case 'stageClear': this.beginTally(ev.bossBonus); break;
      case 'gameOver': this.onGameOver(); break;
      default: break;
    }
    void w;
  }

  // ---- stage clear --------------------------------------------------------------------------------------
  private beginTally(bossBonus: boolean): void {
    const w = this.world;
    const lines: { label: string; value: number }[] = [];
    if (this.run.mode !== 'bossrush') {
      lines.push({ label: 'STAGE CLEAR', value: this.run.stage * SCORE.stageClear });
      if (w.stats.deaths === 0) lines.push({ label: 'NO MISS', value: SCORE.noMiss });
      if (bossBonus && w.bossLimit > 0 && w.stats.bossFrames < w.bossLimit / 2) lines.push({ label: 'BOSS TIME', value: Math.round(((w.bossLimit / 2 - w.stats.bossFrames) / 60) * SCORE.bossTimeK) });
      if (w.stats.itemsTotal > 0 && w.stats.itemsGot >= w.stats.itemsTotal) lines.push({ label: 'ITEMS', value: SCORE.items });
    } else {
      lines.push({ label: 'TIME', value: Math.round(this.run.frames / 60) });
    }
    let total = lines.reduce((a, l) => a + l.value, 0);
    if (w.loop >= 2 && this.run.mode !== 'bossrush') { total = Math.round(total * SCORE.loop2Mul); lines.push({ label: 'LOOP 2 ×1.5', value: total }); }
    if (this.run.mode === 'bossrush') total = 0;
    this.tally = { lines, total, shown: 0, t: 0 };
    audio.playMusic('jingle_clear');
  }

  private updateTally(): void {
    const T = this.tally!;
    T.t++;
    const skip = input.menuConfirm() && T.t > 30;
    if (skip) T.t = Math.max(T.t, 40 + T.lines.length * 30);
    if (T.t > 40 + T.lines.length * 30 && T.shown < T.total) {
      const step = Math.max(1, Math.ceil(T.total / 60));
      const add = Math.min(step, T.total - T.shown);
      T.shown += add;
      this.world.score += add;
      this.world.displayScore = this.world.score;
      if (T.t % 2 === 0) audio.sfx('tally');
    }
    const end = 40 + T.lines.length * 30 + 80 + 100;
    if ((T.t > end || (skip && T.shown >= T.total && T.t > 100)) && !scenes.busy) this.nextStage();
  }

  private carry(): void {
    const w = this.world, r = this.run;
    r.score = w.score; r.lives = w.lives; r.extIdx = w.extIdx; r.continues = w.continues;
    r.loadout = w.player.loadout(); r.drive = w.player.driving ? 0 : w.player.drive;
    r.kills += w.stats.kills; r.shots += w.stats.shots;
    save.data.stats.kills += w.stats.kills;
    save.data.stats.weaponUse[w.player.weapon]++;
  }

  private nextStage(): void {
    this.carry();
    const r = this.run;
    if (r.mode === 'practice') { persist(); scenes.goto(() => new PracticeScene(), 30); return; }
    const last = r.stage >= 6 || !STAGES[r.stage];
    if (!last) {
      r.stage++;
      if (r.mode !== 'bossrush') r.startAt = 'start';
      persist();
      scenes.transition(() => this.startStage(), 30);
      return;
    }
    // loop / ending
    const P = save.data.progress;
    if (r.mode === 'bossrush') {
      persist();
      scenes.goto(() => new NameEntryScene('bossrush', r.frames, r, true), 40);
      return;
    }
    const cfg = DIFFICULTY[r.diff];
    P.cleared[r.diff] = Math.max(P.cleared[r.diff], r.loop);
    P.bossRushUnlocked = true;
    if ((r.diff === 'hard' && r.loop >= 1) || (r.diff !== 'easy' && r.loop >= 2)) P.ordealUnlocked = true;
    persist();
    const trueEnd = r.loop >= 2 || r.diff === 'easy' || cfg.loops === 1;
    scenes.goto(() => new EndingScene(r, trueEnd && r.loop >= 2, !trueEnd), 60);
  }

  // ---- game over / continue ---------------------------------------------------------------------------------
  private onGameOver(): void {
    const r = this.run;
    const cfg = DIFFICULTY[r.diff];
    if (r.mode === 'practice') { audio.stopMusic(0.5); scenes.goto(() => new PracticeScene(), 40); return; }
    audio.stopMusic(0.3);
    audio.playMusic('jingle_gameover');
    if (r.mode === 'arcade' && this.world.continues < cfg.continues) this.cont = { t: 0 };
    else this.finish();
  }

  private updateContinue(): void {
    const c = this.cont!;
    c.t++;
    const left = 10 - Math.floor(c.t / 60);
    if (c.t % 60 === 0 && left >= 0) audio.sfx('countdown');
    if (c.t > 30 && (input.menuConfirm() || input.pointer.clicked)) {
      this.cont = null;
      audio.sfx('menu_confirm');
      this.run.continues++;
      save.data.stats.credits++;
      this.world.continueGame();
      const bossSong = this.world.phase === 'boss' && this.world.bossReady;
      audio.playMusic(bossSong ? this.world.stage.bossBgm : this.world.musicId || this.world.stage.bgm);
      return;
    }
    if (c.t > 30 && input.menuCancel()) c.t = Math.min(c.t + 60, 660);
    if (left < 0) { this.cont = null; this.finish(); }
  }

  private finish(): void {
    if (this.over) return;
    this.over = true;
    this.carry();
    persist();
    const r = this.run;
    const pos = rankPosition(r.diff, r.score);
    scenes.goto(() => (pos >= 0 && r.mode === 'arcade' ? new NameEntryScene(r.diff, r.score, r) : new TitleScene()), 60);
  }

  // ---- auto quality ------------------------------------------------------------------------------------------
  private autoQuality(): void {
    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;
    if (save.data.settings.quality !== 'auto') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (this.frameTimes.length === 120 && this.t % 60 === 0) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / 120;
      if (avg > 1000 / 55 && avg < 200) {
        if (this.world.fx.scale > 0.5) this.world.fx.scale = 0.5;
        else renderer.lowQuality = true;
        this.frameTimes.length = 0;
      }
    }
  }

  // ---- render --------------------------------------------------------------------------------------------------
  render(alpha: number): void {
    const st = save.data.settings;
    const g = renderer.game;
    const shake = st.shake === 'off' ? 0 : st.shake === 'half' ? 0.5 : 1;
    this.view.render(g, this.ready > 0 || this.cont ? 1 : alpha, { interp: st.interpolate, hitbox: st.showHitbox || !!this.debug?.hitboxes, emphasis: st.bulletEmphasis, flashReduce: st.flashReduce, shake, bgDim: st.bgDim });
    const h = renderer.hud;
    const w = this.world;
    const label = `${w.loop >= 2 ? '2-' : ''}${w.stage.id}-${w.section}`;
    drawHud(h, w, Math.max(hiScore(this.run.diff), 0), this.run.mode === 'practice' ? 'PRACTICE' : this.run.mode === 'bossrush' ? 'BOSS RUSH ' + fmtTime(this.run.frames) : label);
    const f = font();
    // stage intro card
    if (this.stageT < 240 && !this.tally) this.drawIntro(h);
    if (this.warnT > 0) this.drawWarning(h);
    if (this.cpT > 0) f.draw(h, t('checkpoint'), 470, 18, (this.cpT >> 3) % 2 ? 'C4' : 'N8', 1, 'right', 'N0');
    if (this.tally) this.drawTally(h);
    if (this.cont) this.drawContinue(h);
    if (this.ready > 0) f.draw(h, 'READY', 240, 128, (this.ready >> 2) % 2 ? 'N8' : 'C4', 2, 'center', 'N0');
    if (this.replay || this.demoFrames) { if ((this.t >> 5) % 2) f.draw(h, 'DEMO PLAY', 240, 220, 'N8', 2, 'center', 'N0'); f.draw(h, 'PRESS START', 240, 240, 'C4', 1, 'center', 'N0'); }
    if (this.world.player.state === 'gone' && !this.cont && !this.tally) f.draw(h, 'GAME OVER', 240, 128, 'N8', 3, 'center', 'N0');
    if (st.showFps || this.debug) this.drawFps(h);
    this.debug?.render(h);
    this.drawTouch();
  }

  private drawIntro(h: CanvasRenderingContext2D): void {
    const f = font();
    const k = this.stageT;
    const a = k < 200 ? 1 : 1 - (k - 200) / 40;
    h.globalAlpha = a;
    const def = this.stageDef;
    const title = `STAGE ${def.id}`;
    const n = Math.min(title.length, Math.floor(k / 2));
    f.draw(h, title.slice(0, n), 240, 92, 'N8', 3, 'center', 'N1');
    const nm = def.nameEn;
    const n2 = Math.max(0, Math.min(nm.length, Math.floor((k - 20) / 2)));
    f.draw(h, nm.slice(0, n2), 240, 124, 'C4', 2, 'center', 'N1');
    if (k > 50) {
      renderer.text(def.nameJa, 240, 146, { size: 10, align: 'center', color: 'N7', alpha: a });
      renderer.text(t(def.briefKey as StrKey), 240, 166, { size: 8, align: 'center', color: 'N6', alpha: a });
    }
    if (this.world.loop >= 2) f.draw(h, 'LOOP 2', 240, 76, 'O5', 1, 'center', 'N1');
    h.globalAlpha = 1;
  }

  private drawWarning(h: CanvasRenderingContext2D): void {
    const k = 180 - this.warnT;
    const f = font();
    const st = save.data.settings;
    const bandH = 24;
    if (this.world.stage.id === 6) { const vis2 = Math.min(1, k / 20, this.warnT / 20); h.globalAlpha = Math.min(1, k / 60) * vis2; f.draw(h, 'THE CHOIR', 240, 120, 'N8', 3, 'center'); h.globalAlpha = 1; void st; return; }
    const inT = Math.min(1, k / 20), outT = Math.min(1, this.warnT / 20);
    const vis = Math.min(inT, outT);
    const off = (k * 2) % 24;
    for (const y0 of [70, 176]) {
      h.fillStyle = rgba('N0', 0.7 * vis); h.fillRect(0, y0, 480, bandH);
      h.fillStyle = rgba('O4', 0.9 * vis);
      for (let x = -24 + (y0 === 70 ? off : -off); x < 504; x += 24) {
        h.beginPath(); h.moveTo(x, y0 + bandH); h.lineTo(x + 12, y0); h.lineTo(x + 20, y0); h.lineTo(x + 8, y0 + bandH); h.closePath(); h.fill();
      }
    }
    const blink = st.flashReduce ? true : (k >> 3) % 2 === 0;
    h.globalAlpha = vis;
    if (blink) f.draw(h, 'WARNING', 240, 110, 'O5', 4, 'center', 'N0');
    f.draw(h, this.warnName, 240, 150, 'N7', 1, 'center', 'N0');
    h.globalAlpha = 1;
  }

  private drawTally(h: CanvasRenderingContext2D): void {
    const T = this.tally!;
    const f = font();
    const slide = Math.min(1, T.t / 20);
    f.draw(h, this.run.mode === 'bossrush' ? 'BOSS DOWN' : 'STAGE CLEAR', 240 - (1 - slide) * 300, 70, 'N8', 3, 'center', 'N1');
    panel(h, 120, 100, 240, 30 + T.lines.length * 14, 0.7 * slide);
    T.lines.forEach((l, i) => {
      if (T.t < 40 + i * 30) return;
      f.draw(h, l.label, 132, 110 + i * 14, 'N6');
      const prog = Math.min(1, (T.t - 40 - i * 30) / 20);
      f.draw(h, this.run.mode === 'bossrush' && l.label === 'TIME' ? fmtTime(this.run.frames) : String(Math.round(l.value * prog)), 348, 110 + i * 14, 'N8', 1, 'right');
    });
    if (T.t > 40 + T.lines.length * 30 + 40) {
      f.draw(h, 'TOTAL', 132, 116 + T.lines.length * 14, 'Y3');
      f.draw(h, String(T.shown), 348, 116 + T.lines.length * 14, 'Y4', 1, 'right');
      if ((T.t >> 4) % 2) f.draw(h, t('clear.next') + ' ▶', 240, 200, 'C4', 1, 'center', 'N0');
    }
  }

  private drawContinue(h: CanvasRenderingContext2D): void {
    const c = this.cont!;
    const f = font();
    const left = Math.max(0, 10 - Math.floor(c.t / 60));
    h.fillStyle = rgba('N0', 0.5); h.fillRect(0, 0, 480, 270);
    f.draw(h, 'GAME OVER', 240, 80, 'N8', 3, 'center', 'N1');
    f.draw(h, t('gameover.continue'), 240, 120, 'C4', 2, 'center', 'N1');
    f.draw(h, String(left), 240, 146, left <= 3 ? 'O5' : 'N8', 4, 'center', 'N1');
    const cfg = DIFFICULTY[this.run.diff];
    const rem = cfg.continues >= 99 ? '∞' : String(cfg.continues - this.world.continues);
    renderer.text(`${t('gameover.credits')}: ${rem}`, 240, 186, { size: 8, align: 'center', color: 'N6' });
    f.draw(h, 'Z / TAP: CONTINUE', 240, 206, 'N5', 1, 'center');
  }

  private drawFps(h: CanvasRenderingContext2D): void {
    const ft = this.frameTimes;
    if (!ft.length) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    font().draw(h, `${Math.round(1000 / avg)}FPS`, 476, 246, 'N6', 1, 'right');
  }

  private drawTouch(): void {
    if (!input.touchActive) return;
    const o = renderer.overlay;
    renderer.cssTransform();
    for (const b of input.buttons) {
      const full = b.id === 'drive' && this.world.player.drive >= 100 && !this.world.player.driving;
      o.globalAlpha = b.held ? 0.7 : 0.35;
      o.fillStyle = full ? PAL.Y3 : PAL.N3;
      o.beginPath(); o.arc(b.cx, b.cy, b.r, 0, Math.PI * 2); o.fill();
      o.strokeStyle = full ? PAL.Y4 : PAL.N6; o.lineWidth = 2; o.stroke();
      o.globalAlpha = 0.9;
      o.fillStyle = PAL.N8;
      o.font = `${b.id === 'drive' ? 13 : 11}px "DotGothic16", sans-serif`;
      o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText(b.id === 'drive' ? 'DRIVE' : b.id === 'form' ? 'FORM' : 'II', b.cx, b.cy + 1);
    }
    if (input.dragIndicator.on) {
      o.globalAlpha = 0.25;
      o.strokeStyle = PAL.C4; o.lineWidth = 2;
      o.beginPath(); o.arc(input.dragIndicator.x, input.dragIndicator.y, 24, 0, Math.PI * 2); o.stroke();
    }
    o.globalAlpha = 1;
  }

  resumeFromPause(): void { this.ready = 30; }

  exit(): void { audio.loopStopAll(); }
}

export function fmtTime(frames: number): string {
  const s = Math.floor(frames / 60);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"${String(Math.floor(((frames % 60) * 100) / 60)).padStart(2, '0')}`;
}

export const _drive = DRIVE;

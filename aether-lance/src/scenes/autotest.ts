// Automated balance / device test (?autotest=<minutes>). The autopilot (mortal, not invincible) plays every stage in
// turn with the power level a player would normally have there, cycling difficulties and weapons, for the given time.
// Every observation is printed as one console line "ALTEST {json}" (the Android shell forwards these to logcat under
// the tag AetherLance), so a host script can follow the test live:
//   start   {pass, diff, stage, weapon, lv, drones}
//   death   {stage, sec, cause, phase, x, y, lives}
//   midboss {stage, result: defeated|escaped, sec}
//   boss    {stage, result, sec}
//   clear   {stage, sec, deaths, continues, score}
//   gameover{stage, sec, deaths}
//   fps     {avg, min, p5, stage}        every 30 s of real time
//   done    {minutes, attempts, perStage: {...}}
// Options: diff=normal,hard (comma list, cycled per pass), speed=1..4 (game speed), stages=1-6 (or 1,5 / 1-3,5), vol=0..10.
//   visibility {state}                   when the page is hidden / shown (the game pauses while hidden)
import { scenes, type Scene } from '../core/scene';
import { save, type Difficulty } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL, rgba } from '../render/palette';
import { audio } from '../audio/engine';
import { newRun, VERSION } from '../app';
import { plannerInput } from '../game/planner';
import { MENU_OK } from '../game/replay';
import { GameScene } from './game';
import type { World, WorldEvent } from '../game/world';
import type { PlayerLoadout } from '../game/entities';
import { HD } from '../core/hd';

declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

interface Agg { attempts: number; clears: number; deaths: number; continues: number; gameovers: number; causes: Record<string, number>; boss: { n: number; defeated: number; sec: number }; midboss: { n: number; defeated: number; sec: number }; stageSec: number }

const WEAPONS = ['pulse', 'fan', 'ray'] as const;

/** Power a player would normally have when entering each stage (docs/03 §5.7). */
function loadoutFor(stage: number, weapon: PlayerLoadout['weapon']): PlayerLoadout {
  const t: [number, number, number][] = [[1, 0, 0], [3, 2, 1], [4, 3, 1], [5, 4, 2], [5, 4, 2], [5, 4, 2]];
  const [lv, drones, subLv] = t[stage - 1]!;
  return { weapon, lv, sub: subLv ? 'seeker' : null, subLv, drones, formation: 'wing', barrier: 0, speedLv: 2 };
}

function log(o: Record<string, unknown>): void {
  console.log('ALTEST ' + JSON.stringify(o));
}

class Autotest {
  readonly endAt: number;
  pass = 0;
  stageIdx = 0;
  attempts = 0;
  agg: Record<string, Agg> = {};
  // per-attempt state
  cur: { stage: number; diff: Difficulty; deaths: number; t0: number; bossT0: number; midT0: number; lastMid: World['midboss']; clearedAt: number; ended: boolean } | null = null;
  // fps sampling
  private frames = 0;
  private worst = 0;
  private intervals: number[] = [];
  private lastRaf = 0;
  private lastFpsLog = 0;

  constructor(private minutes: number, private diffs: Difficulty[], private stages: number[]) {
    this.endAt = performance.now() + minutes * 60_000;
    const tick = (now: number) => {
      if (this.lastRaf) { const dt = now - this.lastRaf; this.frames++; this.intervals.push(dt); this.worst = Math.max(this.worst, dt); }
      this.lastRaf = now;
      if (now - this.lastFpsLog > 30_000) { this.logFps(now); this.lastFpsLog = now; }
      if (!this.finished) requestAnimationFrame(tick);
    };
    this.lastFpsLog = performance.now();
    requestAnimationFrame(tick);
  }
  finished = false;

  private logFps(now: number): void {
    if (!this.intervals.length) return;
    const avg = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    const sorted = [...this.intervals].sort((a, b) => b - a);
    const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? avg;
    log({ ev: 'fps', avg: +(1000 / avg).toFixed(1), min: +(1000 / this.worst).toFixed(1), p5: +(1000 / p5).toFixed(1), stage: this.cur?.stage ?? 0, t: Math.round((now - (this.endAt - this.minutes * 60_000)) / 1000) });
    this.intervals.length = 0; this.worst = 0;
  }

  private key(diff: Difficulty, stage: number): string { return `${diff}/${stage}`; }
  private a(diff: Difficulty, stage: number): Agg {
    const k = this.key(diff, stage);
    return (this.agg[k] ??= { attempts: 0, clears: 0, deaths: 0, continues: 0, gameovers: 0, causes: {}, boss: { n: 0, defeated: 0, sec: 0 }, midboss: { n: 0, defeated: 0, sec: 0 }, stageSec: 0 });
  }

  /** Next attempt (or the results screen when time is up). */
  next(): Scene {
    if (performance.now() >= this.endAt) return this.finish();
    const stage = this.stages[this.stageIdx % this.stages.length]!;
    const diff = this.diffs[this.pass % this.diffs.length]!;
    const weapon = WEAPONS[(this.pass + this.stageIdx) % WEAPONS.length]!;
    this.stageIdx++;
    if (this.stageIdx % this.stages.length === 0) this.pass++;
    const run = newRun('arcade', diff, 'inplace');
    run.stage = stage; run.startAt = 'start'; run.loadout = loadoutFor(stage, weapon);
    let scene: GameScene | null = null;
    const source = (w: World) => { const i = plannerInput(w); if (scene?.cont) i.bits |= MENU_OK; return i; };
    scene = new GameScene(run, undefined, source, 0);
    scene.debug = null;
    this.attempts++;
    this.a(diff, stage).attempts++;
    this.cur = { stage, diff, deaths: 0, t0: 0, bossT0: -1, midT0: -1, lastMid: null, clearedAt: -1, ended: false };
    log({ ev: 'start', pass: this.pass, diff, stage, weapon, lv: run.loadout.lv, drones: run.loadout.drones, version: VERSION, hd: HD });
    scene.onExit = () => this.next();
    scene.onWorldEvent = (g, ev) => this.event(g, ev);
    scene.onFrame = (g) => this.frame(g);
    return scene;
  }

  private sec(g: GameScene): number { return Math.round(g.world.frame / 6) / 10; }

  private event(g: GameScene, ev: WorldEvent): void {
    const c = this.cur!;
    const w = g.world, A = this.a(c.diff, c.stage);
    if (ev.type === 'death') {
      c.deaths++; A.deaths++;
      A.causes[ev.cause] = (A.causes[ev.cause] ?? 0) + 1;
      log({ ev: 'death', stage: c.stage, diff: c.diff, sec: this.sec(g), cause: ev.cause, phase: w.waiting ?? w.phase, x: Math.round(w.player.x), y: Math.round(w.player.y), lives: w.lives });
    } else if (ev.type === 'bossStart') {
      c.bossT0 = w.frame;
    } else if (ev.type === 'stageClear') {
      const sec = this.sec(g);
      if (c.bossT0 >= 0) {
        const bs = Math.round((w.frame - c.bossT0) / 6) / 10;
        A.boss.n++; A.boss.sec += bs; if (ev.bossBonus) A.boss.defeated++;
        log({ ev: 'boss', stage: c.stage, diff: c.diff, result: ev.bossBonus ? 'defeated' : 'escaped', sec: bs });
      }
      A.clears++; A.stageSec += sec; A.continues += w.continues;
      log({ ev: 'clear', stage: c.stage, diff: c.diff, sec, deaths: c.deaths, continues: w.continues, score: w.score });
      c.clearedAt = w.frame;
    } else if (ev.type === 'gameOver') {
      if (w.continues >= 3) { // the bot keeps continuing; give up on the stage after three credits
        A.gameovers++;
        log({ ev: 'gameover', stage: c.stage, diff: c.diff, sec: this.sec(g), deaths: c.deaths });
        c.ended = true;
      }
    }
  }

  private frame(g: GameScene): void {
    const c = this.cur!;
    const w = g.world, A = this.a(c.diff, c.stage);
    // midboss bookkeeping
    if (w.waiting === 'midboss' && w.midboss) { if (c.midT0 < 0) c.midT0 = w.frame; c.lastMid = w.midboss; }
    else if (c.midT0 >= 0) {
      const ms = Math.round((w.frame - c.midT0) / 6) / 10;
      const ok = !!c.lastMid?.killedByPlayer;
      A.midboss.n++; A.midboss.sec += ms; if (ok) A.midboss.defeated++;
      log({ ev: 'midboss', stage: c.stage, diff: c.diff, result: ok ? 'defeated' : 'escaped', sec: ms });
      c.midT0 = -1; c.lastMid = null;
    }
    // end of attempt: a moment after the clear, after giving up, or after 9 minutes of stage time
    const done = (c.clearedAt >= 0 && w.frame - c.clearedAt > 90) || c.ended || w.frame > 60 * 60 * 9 || performance.now() >= this.endAt;
    if (done && !scenes.busy) g.endSpectate();
  }

  finish(): Scene {
    this.finished = true;
    this.logFps(performance.now());
    log({ ev: 'done', minutes: this.minutes, attempts: this.attempts, perStage: this.agg });
    return new AutotestResults(this.agg, this.minutes, this.attempts);
  }
}

/** Summary table shown on the device when the test is over. */
class AutotestResults implements Scene {
  readonly id = 'AutotestResults';
  constructor(private agg: Record<string, Agg>, private minutes: number, private attempts: number) {}
  update(): void { /* idle */ }
  render(): void {
    const g = renderer.game, h = renderer.hud, f = font();
    g.fillStyle = PAL.N0; g.fillRect(0, 0, 480, 270);
    f.draw(h, `AUTOTEST DONE  ${this.minutes} MIN  ${this.attempts} ATTEMPTS`, 240, 12, 'N8', 1, 'center');
    f.draw(h, 'DIFF/ST  TRY CLR DTH CNT  BOSS      MID', 20, 30, 'N5');
    let y = 42;
    for (const [k, a] of Object.entries(this.agg).sort()) {
      const boss = a.boss.n ? `${a.boss.defeated}/${a.boss.n} ${(a.boss.sec / a.boss.n).toFixed(0)}S` : '-';
      const mid = a.midboss.n ? `${a.midboss.defeated}/${a.midboss.n} ${(a.midboss.sec / a.midboss.n).toFixed(0)}S` : '-';
      f.draw(h, `${k.toUpperCase().padEnd(8)} ${String(a.attempts).padStart(3)} ${String(a.clears).padStart(3)} ${String(a.deaths).padStart(3)} ${String(a.continues).padStart(3)}  ${boss.padEnd(9)} ${mid}`, 20, y, a.gameovers ? 'O5' : 'N7');
      y += 10;
      if (y > 260) break;
    }
    h.fillStyle = rgba('N0', 0); void h;
  }
}

/** Start the automated test from URL parameters (called by main.ts when ?autotest is present). */
export function startAutotest(params: URLSearchParams): void {
  const minutes = Math.max(1, Number(params.get('autotest')) || 60);
  const diffs = (params.get('diff') ?? 'normal,hard').split(',').filter((d): d is Difficulty => ['easy', 'normal', 'hard', 'ordeal'].includes(d));
  // stages: a range and/or list, e.g. 1-6, 5, 1,5 or 1-3,5
  const stages: number[] = [];
  for (const part of (params.get('stages') ?? '1-6').split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let s = a ?? 1; s <= (b ?? a ?? 6); s++) if (s >= 1 && s <= 6 && !stages.includes(s)) stages.push(s);
  }
  const speed = Math.max(1, Math.min(4, Number(params.get('speed')) || 1));
  (save.data.settings as { gameSpeed: number }).gameSpeed = Math.round(speed * 100); // not persisted: spectated runs never save
  const vol = params.get('vol');
  if (vol !== null) { audio.vol = { master: Math.max(0, Math.min(10, Number(vol))), bgm: 7, sfx: 6 }; audio.applyVolumes(); }
  audio.unlock();
  const t = new Autotest(minutes, diffs.length ? diffs : ['normal'], stages.length ? stages : [1, 2, 3, 4, 5, 6]);
  log({ ev: 'begin', minutes, diffs, stages, speed, version: VERSION, build: BUILD, hd: HD, ua: navigator.userAgent, screen: `${screen.width}x${screen.height}@${devicePixelRatio}` });
  // the game pauses itself while the page is hidden (screen off, app switch, fold): note it so a gap in the log is explained
  document.addEventListener('visibilitychange', () => log({ ev: 'visibility', state: document.visibilityState }));
  scenes.replaceNow(t.next());
}

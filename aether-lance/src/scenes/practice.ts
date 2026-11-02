// Practice mode setup (docs/09_ui.md §3.6).
import { scenes, type Scene } from '../core/scene';
import { save, DIFFS, type Difficulty, type WeaponType } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { audio } from '../audio/engine';
import { t } from '../i18n/index';
import { Menu, panel } from '../ui/menu';
import { backdrop } from './backdrop';
import { GameScene } from './game';
import { newRun, STAGES, type RunState } from '../app';
import type { Formation, SubType } from '../game/entities';

const STARTS: RunState['startAt'][] = ['start', 'cp1', 'midboss', 'cp2', 'cp3', 'boss'];
const DEFAULT_LOAD: Record<number, [number, number, number]> = { 1: [1, 0, 0], 2: [4, 2, 1], 3: [5, 3, 1], 4: [5, 4, 2], 5: [5, 4, 2], 6: [5, 4, 2] };

export class PracticeScene implements Scene {
  t = 0;
  menu: Menu;
  static st = { stage: 1, loop: 1, start: 0, weapon: 'pulse' as WeaponType, lv: 1, sub: null as SubType | null, subLv: 1, drones: 0, form: 'wing' as Formation, barrier: false, diff: 'normal' as Difficulty, god: false };
  constructor() {
    const S = PracticeScene.st;
    const maxStage = () => Math.max(1, ...DIFFS.map((d) => save.data.progress.reachedStage[d]), new URLSearchParams(location.search).has('debug') ? 6 : 1);
    const avail = () => Math.min(maxStage(), STAGES.length);
    const applyDefault = () => { const d = DEFAULT_LOAD[S.stage] ?? [1, 0, 0]; S.lv = d[0]; S.drones = d[1]; S.sub = d[2] ? 'seeker' : null; S.subLv = d[2] || 1; };
    const subs: (SubType | null)[] = [null, 'bomb', 'seeker'];
    this.menu = new Menu([
      { label: () => t('practice.stage'), value: () => String(S.stage), left: () => { S.stage = S.stage > 1 ? S.stage - 1 : avail(); applyDefault(); }, right: () => { S.stage = S.stage < avail() ? S.stage + 1 : 1; applyDefault(); } },
      { label: () => 'LOOP', value: () => String(S.loop), left: () => { S.loop = S.loop === 1 && save.data.progress.loop2Reached ? 2 : 1; }, right: () => { S.loop = S.loop === 1 && save.data.progress.loop2Reached ? 2 : 1; } },
      { label: () => t('practice.start'), value: () => STARTS[S.start]!.toUpperCase(), left: () => { S.start = (S.start + STARTS.length - 1) % STARTS.length; }, right: () => { S.start = (S.start + 1) % STARTS.length; } },
      { label: () => t('practice.weapon'), value: () => S.weapon.toUpperCase(), left: () => { S.weapon = cyc(['pulse', 'fan', 'ray'], S.weapon, -1); }, right: () => { S.weapon = cyc(['pulse', 'fan', 'ray'], S.weapon, 1); } },
      { label: () => t('practice.lv'), value: () => String(S.lv), left: () => { S.lv = Math.max(1, S.lv - 1); }, right: () => { S.lv = Math.min(5, S.lv + 1); } },
      { label: () => t('practice.sub'), value: () => (S.sub ? `${S.sub.toUpperCase()} LV${S.subLv}` : 'NONE'), left: () => { if (S.sub && S.subLv === 2) S.subLv = 1; else { S.sub = cyc(subs, S.sub, -1); S.subLv = S.sub ? 2 : 1; } }, right: () => { if (S.sub && S.subLv === 1) S.subLv = 2; else { S.sub = cyc(subs, S.sub, 1); S.subLv = 1; } } },
      { label: () => t('practice.drones'), value: () => String(S.drones), left: () => { S.drones = Math.max(0, S.drones - 1); }, right: () => { S.drones = Math.min(4, S.drones + 1); } },
      { label: () => t('practice.formation'), value: () => S.form.toUpperCase(), left: () => { S.form = cyc(['wing', 'trail', 'orbit'], S.form, -1); }, right: () => { S.form = cyc(['wing', 'trail', 'orbit'], S.form, 1); } },
      { label: () => t('practice.barrier'), value: () => (S.barrier ? 'ON' : 'OFF'), left: () => { S.barrier = !S.barrier; }, right: () => { S.barrier = !S.barrier; } },
      { label: () => t('practice.diff'), value: () => S.diff.toUpperCase(), left: () => { S.diff = cyc(this.diffs(), S.diff, -1); }, right: () => { S.diff = cyc(this.diffs(), S.diff, 1); } },
      { label: () => t('practice.god'), value: () => (S.god ? 'ON' : 'OFF'), left: () => { S.god = !S.god; }, right: () => { S.god = !S.god; } },
      { label: () => t('practice.go'), action: () => this.go() },
    ], 90, 52, 14, 'left', 300, 12);
  }
  diffs(): Difficulty[] { return DIFFS.filter((d) => d !== 'ordeal' || save.data.progress.ordealUnlocked); }
  go(): void {
    const S = PracticeScene.st;
    const run = newRun('practice', S.diff, 'inplace');
    run.stage = Math.min(S.stage, STAGES.length);
    run.loop = S.loop;
    run.startAt = STARTS[S.start]!;
    run.loadout = { weapon: S.weapon, lv: S.lv, sub: S.sub, subLv: S.sub ? S.subLv : 0, drones: S.drones, formation: S.form, barrier: S.barrier ? 3 : 0, speedLv: 2 };
    run.god = S.god;
    run.lives = 2;
    audio.stopMusic(0.5);
    scenes.goto(() => new GameScene(run), 30);
  }
  update(): void {
    this.t++;
    if (this.menu.update() === 'cancel') scenes.pop();
  }
  render(): void {
    backdrop.draw(renderer.game, 0.6);
    const h = renderer.hud;
    font().draw(h, 'PRACTICE', 240, 18, 'N8', 2, 'center', 'N1');
    panel(h, 70, 42, 340, 182, 0.8);
    const m = this.menu;
    const f = font();
    m.items.forEach((it, i) => {
      const y = m.y + i * m.gap;
      const on = i === m.sel;
      renderer.text(m.label(it), m.x, y - 1, { size: 8, color: on ? 'N8' : 'N5' });
      if (it.value) f.draw(h, '◀ ' + it.value() + ' ▶', m.x + m.width, y, on ? 'C4' : 'N6', 1, 'right');
      if (on) { h.fillStyle = '#33b7e8'; h.fillRect(m.x - 12, y + 2, 6, 2); }
    });
    f.draw(h, 'X/ESC: BACK', 240, 240, 'N4', 1, 'center');
  }
}

function cyc<T>(arr: readonly T[], v: T, d: number): T { const i = Math.max(0, arr.indexOf(v)); return arr[(i + d + arr.length) % arr.length]!; }

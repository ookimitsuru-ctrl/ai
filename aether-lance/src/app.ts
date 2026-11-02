// Application-level glue: settings application, stage list, run state.
import { save, persist, type Difficulty } from './core/save';
import { input } from './core/input';
import { renderer } from './render/renderer';
import { audio } from './audio/engine';
import type { StageDef } from './game/stage';
import type { PlayerLoadout } from './game/entities';

export const STAGES: StageDef[] = [];
export function registerStage(s: StageDef): void { STAGES[s.id - 1] = s; }

export function applySettings(): void {
  const st = save.data.settings;
  input.keys = structuredClone(st.keys);
  input.pad = structuredClone(st.pad);
  input.rebuildBindingCache();
  input.analogMove = st.analogMove;
  input.touchSensitivity = st.touchSensitivity;
  input.touchAlwaysFire = st.touchAlwaysFire;
  input.touchLeftHanded = st.touchLayout === 'left';
  renderer.settings.scaleMode = st.scaleMode;
  renderer.settings.scaleFilter = st.scaleFilter;
  renderer.settings.crt = st.crt;
  renderer.settings.scanline = st.scanline;
  renderer.settings.bloom = st.bloom;
  renderer.settings.quality = st.quality;
  renderer.bgDim = st.bgDim;
  renderer.layout();
  audio.vol = { master: st.volMaster, bgm: st.volBgm, sfx: st.volSfx };
  audio.applyVolumes();
}

export function saveSettings(): void {
  applySettings();
  persist();
}

export interface RunState {
  mode: 'arcade' | 'practice' | 'bossrush';
  diff: Difficulty;
  respawn: 'inplace' | 'checkpoint';
  stage: number;   // 1..6
  loop: number;    // 1..2
  score: number;
  lives: number;
  extIdx: number;
  continues: number;
  loadout: PlayerLoadout;
  drive: number;
  startAt: 'start' | 'cp1' | 'cp2' | 'cp3' | 'midboss' | 'boss';
  god: boolean;
  frames: number;       // total play frames (boss rush time)
  deaths: number;
  kills: number;
  shots: number;
  assist: boolean;
  practiceSingle: boolean;
}

export function newRun(mode: RunState['mode'], diff: Difficulty, respawn: RunState['respawn']): RunState {
  return {
    mode, diff, respawn, stage: 1, loop: diff === 'ordeal' ? 2 : 1, score: 0, lives: -1, extIdx: 0, continues: 0,
    loadout: { weapon: 'pulse', lv: 1, sub: null, subLv: 0, drones: 0, formation: 'wing', barrier: 0, speedLv: 2 },
    drive: 0, startAt: 'start', god: false, frames: 0, deaths: 0, kills: 0, shots: 0,
    assist: save.data.settings.gameSpeed < 100, practiceSingle: false,
  };
}

export function hiScore(diff: Difficulty): number {
  return save.data.records[diff][0]?.score ?? 0;
}

export function vibrate(ms: number): void {
  if (!save.data.settings.vibration) return;
  try { navigator.vibrate?.(ms); } catch { /* */ }
  try {
    const pad = input.findPad() as (Gamepad & { vibrationActuator?: { playEffect(t: string, o: object): void } }) | null;
    pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms * 2, strongMagnitude: 0.6, weakMagnitude: 0.4 });
  } catch { /* */ }
}

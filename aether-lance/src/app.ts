// Application-level glue: settings application, stage list, run state.
import { save, persist, type Difficulty } from './core/save';
import { HD } from './core/hd';
import { input } from './core/input';
import { renderer } from './render/renderer';
import { audio } from './audio/engine';
import type { StageDef } from './game/stage';
import type { PlayerLoadout } from './game/entities';
import { encodeFrames, decodeFrames, type Recorder, type StoredReplay } from './game/replay';
import type { InputFrame } from './game/player';

export const VERSION = 'v1.1.1';

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
  /** input recording for the replay of this run (not persisted with the run itself) */
  rec?: Recorder<RunState>;
}

export function newRun(mode: RunState['mode'], diff: Difficulty, respawn: RunState['respawn']): RunState {
  return {
    mode, diff, respawn, stage: 1, loop: diff === 'ordeal' ? 2 : 1, score: 0, lives: -1, extIdx: 0, continues: 0,
    loadout: { weapon: 'pulse', lv: 1, sub: null, subLv: 0, drones: 0, formation: 'wing', barrier: 0, speedLv: 2 },
    drive: 0, startAt: 'start', god: false, frames: 0, deaths: 0, kills: 0, shots: 0,
    assist: save.data.settings.gameSpeed < 100, practiceSingle: false,
  };
}

/** Copy of a run without its recorder (used as a replay's starting state). */
export function runSnapshot(r: RunState): RunState {
  const { rec: _rec, ...rest } = r;
  void _rec;
  return structuredClone(rest);
}

// ---- replays: best run per board (docs/09_ui.md §8) ----------------------------------------------------------
const replayKey = (board: string): string => (HD ? 'aetherlance.hd.replay.' : 'aetherlance.replay.') + board;
export const REPLAY_BOARDS = ['easy', 'normal', 'hard', 'ordeal', 'bossrush'] as const;

export function storeReplay(board: Difficulty | 'bossrush', entry: { name: string; score: number; date: string }, r: RunState): boolean {
  const rec = r.rec;
  if (!rec || rec.frames.length === 0) return false;
  const data: StoredReplay<RunState> = {
    version: 1, gameVersion: VERSION, board, name: entry.name, score: entry.score, date: entry.date,
    modes: rec.modes, run: rec.start, frames: rec.frames.length, input: encodeFrames(rec.frames),
  };
  try { localStorage.setItem(replayKey(board), JSON.stringify(data)); return true; } catch { return false; }
}

export function loadReplay(board: Difficulty | 'bossrush'): (StoredReplay<RunState> & { decoded: InputFrame[] }) | null {
  try {
    const raw = localStorage.getItem(replayKey(board));
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredReplay<RunState>;
    if (d.version !== 1 || d.gameVersion !== VERSION || typeof d.input !== 'string' || !Array.isArray(d.modes)) return null;
    const decoded = decodeFrames(d.input);
    if (decoded.length !== d.frames) return null;
    return { ...d, decoded };
  } catch { return null; }
}

/** Replay header only (cheap check for the ranking screen). */
export function replayInfo(board: Difficulty | 'bossrush'): { name: string; score: number; date: string } | null {
  try {
    const raw = localStorage.getItem(replayKey(board));
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredReplay<RunState>;
    return d.version === 1 && d.gameVersion === VERSION ? { name: d.name, score: d.score, date: d.date } : null;
  } catch { return null; }
}

export function eraseReplays(): void {
  for (const b of REPLAY_BOARDS) { try { localStorage.removeItem(replayKey(b)); } catch { /* */ } }
}

export function hiScore(diff: Difficulty): number {
  return save.data.records[diff][0]?.score ?? 0;
}

export function vibrate(ms: number): void {
  if (!save.data.settings.vibration) return;
  // the browser refuses (and logs an error) until the page has had a tap: skip it before that (e.g. attract demo, autotest)
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (!ua || ua.hasBeenActive) { try { navigator.vibrate?.(ms); } catch { /* */ } }
  try {
    const pad = input.findPad() as (Gamepad & { vibrationActuator?: { playEffect(t: string, o: object): void } }) | null;
    pad?.vibrationActuator?.playEffect('dual-rumble', { duration: ms * 2, strongMagnitude: 0.6, weakMagnitude: 0.4 });
  } catch { /* */ }
}

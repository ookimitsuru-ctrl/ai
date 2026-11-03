// Replay recording and compact storage (docs/11_appendix.md §7, docs/09_ui.md §8).
// A replay is the initial run state plus the exact InputFrame fed to the game on every simulated frame.
// The game logic is deterministic, so feeding the same frames reproduces the run.
// Storage: run-length encoded varints → base64. Touch / analog values are quantised *before* they reach
// the simulation (see quantise) so that a stored replay replays bit-for-bit.
import { IB, type InputFrame } from './player';

/** Bits outside the in-game set: menu decisions taken inside the game scene (tally skip, continue). */
export const MENU_OK = 1 << 15;
export const MENU_NO = 1 << 16;

const TQ = 16;  // touch delta resolution: 1/16 px
const AQ = 64;  // analog resolution: 1/64

/** Round touch / analog components to the storable resolution. Mutates and returns the frame. */
const q = (v: number, k: number): number => Math.round(v * k) / k + 0; // "+ 0" turns -0 into 0
export function quantise(f: InputFrame): InputFrame {
  if (f.bits & IB.TOUCH) { f.tdx = q(f.tdx, TQ); f.tdy = q(f.tdy, TQ); } else { f.tdx = 0; f.tdy = 0; }
  if (f.bits & IB.ANALOG) { f.ax = q(f.ax, AQ); f.ay = q(f.ay, AQ); } else { f.ax = 0; f.ay = 0; }
  return f;
}

export function sameFrame(a: InputFrame, b: InputFrame): boolean {
  return a.bits === b.bits && a.tdx === b.tdx && a.tdy === b.tdy && a.ax === b.ax && a.ay === b.ay;
}

const zig = (n: number): number => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzig = (n: number): number => (n % 2 ? -(n + 1) / 2 : n / 2);

function putVar(out: number[], v: number): void {
  v = Math.max(0, Math.floor(v));
  while (v >= 0x80) { out.push((v % 0x80) | 0x80); v = Math.floor(v / 0x80); }
  out.push(v);
}

function toB64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Encode frames as (bits, runLength[, touch][, analog]) records. */
export function encodeFrames(frames: InputFrame[]): string {
  const out: number[] = [];
  let i = 0;
  while (i < frames.length) {
    const f = frames[i]!;
    let n = 1;
    while (i + n < frames.length && sameFrame(frames[i + n]!, f)) n++;
    putVar(out, f.bits);
    putVar(out, n);
    if (f.bits & IB.TOUCH) { putVar(out, zig(Math.round(f.tdx * TQ))); putVar(out, zig(Math.round(f.tdy * TQ))); }
    if (f.bits & IB.ANALOG) { putVar(out, zig(Math.round(f.ax * AQ))); putVar(out, zig(Math.round(f.ay * AQ))); }
    i += n;
  }
  return toB64(out);
}

export function decodeFrames(b64: string): InputFrame[] {
  const bytes = fromB64(b64);
  let p = 0;
  const getVar = (): number => {
    let v = 0, mul = 1;
    for (;;) {
      if (p >= bytes.length) throw new Error('replay: truncated');
      const b = bytes[p++]!;
      v += (b & 0x7f) * mul;
      if (!(b & 0x80)) return v;
      mul *= 0x80;
    }
  };
  const out: InputFrame[] = [];
  while (p < bytes.length) {
    const bits = getVar();
    const n = getVar();
    let tdx = 0, tdy = 0, ax = 0, ay = 0;
    if (bits & IB.TOUCH) { tdx = unzig(getVar()) / TQ; tdy = unzig(getVar()) / TQ; }
    if (bits & IB.ANALOG) { ax = unzig(getVar()) / AQ; ay = unzig(getVar()) / AQ; }
    for (let k = 0; k < n; k++) out.push({ bits, tdx, tdy, ax, ay });
  }
  return out;
}

/** What gets written to localStorage under `aetherlance.replay.<board>`. */
export interface StoredReplay<Run = unknown> {
  version: 1;
  gameVersion: string;
  board: string;
  name: string;
  score: number;
  date: string;
  modes: ('hold' | 'toggle')[];  // shot mode used for each stage started, in order
  run: Run;            // run state at the first frame (copy)
  frames: number;
  input: string;       // encodeFrames()
}

/** In-progress recording carried on the run (survives the ending → loop 2 hand-off). */
export interface Recorder<Run = unknown> {
  start: Run;
  modes: ('hold' | 'toggle')[];
  frames: InputFrame[];
}

/** Append a frame, sharing the previous object when identical (keeps long recordings small in memory). */
export function recordFrame(rec: Recorder, f: InputFrame): void {
  const last = rec.frames[rec.frames.length - 1];
  rec.frames.push(last && sameFrame(last, f) ? last : f);
}

/** What a replay playback needs. */
export interface Playback {
  frames: InputFrame[];
  modes: ('hold' | 'toggle')[];
  label: string;
}

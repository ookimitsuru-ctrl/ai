// Look-ahead music sequencer (docs/08_audio.md §4.3, §5, §6).
import { parseMML, midiToFreq, TPQ, type TrackData } from './mml';
import { Instruments } from './patches';

export interface SongDef {
  id: string;
  title: string;
  bpm: number;
  tracks: Record<string, string>;
  drive?: string[];                       // tracks audible only during Lance Drive
  sends?: Record<string, { rev?: number; del?: number }>;
  vol?: Record<string, number>;
  noLoop?: boolean;
}

export interface ParsedSong {
  def: SongDef;
  tracks: { name: string; data: TrackData }[];
  total: number;
  loop: number;
}

const parsedCache = new Map<string, ParsedSong>();
export function parseSong(def: SongDef): ParsedSong {
  let p = parsedCache.get(def.id);
  if (!p) {
    const tracks = Object.entries(def.tracks).map(([name, src]) => ({ name, data: parseMML(src, name === 'drums' ? 'drums' : 'lead_pulse') }));
    const total = Math.max(...tracks.map((t) => t.data.total));
    const loops = tracks.map((t) => t.data.loop).filter((l) => l >= 0);
    p = { def, tracks, total, loop: def.noLoop ? -1 : loops.length ? Math.min(...loops) : 0 };
    parsedCache.set(def.id, p);
  }
  return p;
}

interface TrackState {
  name: string;
  data: TrackData;
  iter: number;
  idx: number;
  gain: GainNode;
  pan: StereoPannerNode;
  drive: boolean;
  lastNote: number;
}

export class MusicPlayer {
  private ins: Instruments;
  private song: ParsedSong | null = null;
  private songGain: GainNode | null = null;
  private tracks: TrackState[] = [];
  private startTime = 0; // audio time of tick 0
  private spt = 0.01;    // seconds per tick
  private bpm = 120;
  private paused = false;
  private pausedTick = 0;
  private driveOn = false;
  ended = false;
  currentId: string | null = null;

  constructor(private ctx: AudioContext, private out: AudioNode, private reverb: AudioNode, private delay: AudioNode) {
    this.ins = new Instruments(ctx);
  }

  get instruments(): Instruments { return this.ins; }

  play(def: SongDef, fadeIn = 0, startTick = 0): void {
    this.stop(fadeIn > 0 ? 0.6 : 0.05);
    const song = parseSong(def);
    this.song = song;
    this.currentId = def.id;
    this.ended = false;
    this.bpm = song.def.bpm;
    this.spt = 60 / (this.bpm * TPQ);
    const sg = this.ctx.createGain();
    const now = this.ctx.currentTime;
    sg.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, now);
    if (fadeIn > 0) sg.gain.linearRampToValueAtTime(1, now + fadeIn);
    sg.connect(this.out);
    this.songGain = sg;
    this.tracks = song.tracks.map((t) => {
      const gain = this.ctx.createGain();
      const drive = !!song.def.drive?.includes(t.name);
      gain.gain.value = (song.def.vol?.[t.name] ?? 1) * (drive && !this.driveOn ? 0 : 1);
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan).connect(sg);
      const snd = song.def.sends?.[t.name];
      const rev = snd?.rev ?? (t.name.startsWith('lead') || t.name === 'pad' ? 0.18 : t.name === 'drums' ? 0.05 : 0.1);
      const del = snd?.del ?? (t.name === 'lead' ? 0.14 : 0);
      if (rev > 0) { const s = this.ctx.createGain(); s.gain.value = rev; pan.connect(s).connect(this.reverb); }
      if (del > 0) { const s = this.ctx.createGain(); s.gain.value = del; pan.connect(s).connect(this.delay); }
      return { name: t.name, data: t.data, iter: 0, idx: 0, gain, pan, drive, lastNote: -1 };
    });
    this.startTime = now + 0.06 - startTick * this.spt;
    this.seek(startTick);
    this.paused = false;
  }

  stop(fade = 0.05): void {
    if (this.songGain) {
      const g = this.songGain;
      const now = this.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
      setTimeout(() => g.disconnect(), (fade + 0.5) * 1000);
    }
    this.songGain = null;
    this.song = null;
    this.tracks = [];
    this.currentId = null;
  }

  /** Position cursors at an absolute tick. */
  private seek(abs: number): void {
    const song = this.song!;
    for (const t of this.tracks) {
      const T = song.total, L = song.loop;
      let iter = 0, local = abs;
      if (L >= 0 && abs >= T) {
        const loopLen = T - L;
        iter = 1 + Math.floor((abs - T) / loopLen);
        local = L + ((abs - T) % loopLen);
      }
      t.iter = iter;
      let idx = 0;
      const ev = t.data.events;
      while (idx < ev.length && ev[idx]!.tick < local) idx++;
      if (iter > 0) while (idx < ev.length && ev[idx]!.tick < L) idx++;
      t.idx = idx;
    }
  }

  private base(t: TrackState): number {
    const song = this.song!;
    const T = song.total;
    if (t.iter === 0) return 0;
    return T + (t.iter - 1) * (T - song.loop) - song.loop;
  }

  currentTick(): number {
    if (!this.song) return 0;
    if (this.paused) return this.pausedTick;
    return (this.ctx.currentTime - this.startTime) / this.spt;
  }

  /** Schedule notes within the look-ahead window. Call often (every frame and from a timer). */
  pump(): void {
    if (!this.song || this.paused) return;
    const horizon = this.ctx.currentTime + 0.12;
    const song = this.song;
    let allDone = true;
    for (const t of this.tracks) {
      const ev = t.data.events;
      for (let guard = 0; guard < 512; guard++) {
        if (t.idx >= ev.length) {
          if (song.loop < 0 || ev.length === 0) break;
          t.iter++;
          t.idx = 0;
          while (t.idx < ev.length && ev[t.idx]!.tick < song.loop) t.idx++;
          if (t.idx >= ev.length) break;
        }
        const e = ev[t.idx]!;
        const abs = this.base(t) + e.tick;
        const when = this.startTime + abs * this.spt;
        if (when > horizon) { allDone = false; break; }
        t.idx++;
        if (when < this.ctx.currentTime - 0.05) continue; // too late, skip
        t.lastNote = when;
        const dur = e.gate * this.spt;
        if (e.inst === 'drums') this.ins.drum(((e.midi % 12) + 12) % 12, t.gain, when, e.vel);
        else this.ins.note(e.inst, t.gain, when, midiToFreq(e.midi), dur, e.vel);
        if (e.pan !== 0) t.pan.pan.setValueAtTime(e.pan, when);
      }
      if (t.idx < ev.length) allDone = false;
    }
    if (song.loop < 0 && allDone) {
      const endT = this.startTime + song.total * this.spt;
      if (this.ctx.currentTime > endT + 0.5) this.ended = true;
    }
  }

  pause(): void {
    if (!this.song || this.paused) return;
    this.pausedTick = this.currentTick();
    this.paused = true;
    if (this.songGain) {
      const now = this.ctx.currentTime;
      this.songGain.gain.cancelScheduledValues(now);
      this.songGain.gain.setValueAtTime(this.songGain.gain.value, now);
      this.songGain.gain.linearRampToValueAtTime(0, now + 0.03);
    }
  }

  resume(): void {
    if (!this.song || !this.paused) return;
    this.paused = false;
    const now = this.ctx.currentTime;
    this.startTime = now + 0.05 - this.pausedTick * this.spt;
    this.seek(Math.ceil(this.pausedTick));
    if (this.songGain) { this.songGain.gain.setValueAtTime(0, now); this.songGain.gain.linearRampToValueAtTime(1, now + 0.08); }
  }

  setDrive(on: boolean): void {
    this.driveOn = on;
    const now = this.ctx.currentTime;
    const beat = 60 / this.bpm;
    for (const t of this.tracks) {
      if (!t.drive) continue;
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(t.gain.gain.value, now);
      t.gain.gain.linearRampToValueAtTime(on ? (this.song?.def.vol?.[t.name] ?? 1) : 0, now + beat);
    }
  }

  setTempo(bpm: number): void {
    if (!this.song) return;
    const tick = this.currentTick();
    this.bpm = bpm;
    this.spt = 60 / (bpm * TPQ);
    this.startTime = this.ctx.currentTime - tick * this.spt;
  }

  /** Keep audio aligned to the game clock (game frames are the master clock). */
  syncTo(expectedTick: number): void {
    if (!this.song || this.paused) return;
    const diffSec = (this.currentTick() - expectedTick) * this.spt;
    if (Math.abs(diffSec) > 0.03 && Math.abs(diffSec) < 2) {
      const step = Math.max(-0.02, Math.min(0.02, diffSec));
      this.startTime += step;
    }
  }

  driftMs(expectedTick: number): number {
    return (this.currentTick() - expectedTick) * this.spt * 1000;
  }

  activity(track: string): number {
    const t = this.tracks.find((x) => x.name === track);
    if (!t || t.lastNote < 0) return 0;
    const dt = this.ctx.currentTime - t.lastNote;
    return dt < 0 ? 0 : Math.exp(-dt * 6);
  }
}

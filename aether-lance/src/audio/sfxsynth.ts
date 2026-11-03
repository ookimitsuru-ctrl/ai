// Offline JS synthesis of all sound effects into sample buffers (docs/08_audio.md §7).

type Wave = 'pulse' | 'square' | 'tri' | 'saw' | 'sine' | 'noise' | 'metal';

interface ToneOpts {
  wave: Wave; f0: number; f1?: number; curve?: 'exp' | 'lin'; duty?: number;
  at?: number; dur: number; vol?: number; attack?: number; decay?: 'exp' | 'lin' | 'hold';
  vib?: [number, number]; // rate Hz, depth semitones
  lp?: [number, number]; hp?: number; bp?: [number, number]; // filter (start,end) cutoff
  fm?: [number, number]; // ratio, index
  gate?: number;          // on/off rate (Hz) for gated sounds
}

export class SfxSynth {
  readonly sr: number;
  buf: Float32Array;
  private seed = 1;
  constructor(sr: number, seconds: number) {
    this.sr = sr;
    this.buf = new Float32Array(Math.ceil(sr * seconds));
  }
  private rnd(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return (this.seed / 0x7fffffff) * 2 - 1;
  }
  tone(o: ToneOpts): this {
    const sr = this.sr;
    const start = Math.floor((o.at ?? 0) * sr);
    const n = Math.floor(o.dur * sr);
    const vol = o.vol ?? 0.5;
    const att = Math.max(1, Math.floor((o.attack ?? 0.002) * sr));
    let ph = 0;
    let lpS = 0, svLow = 0, svBand = 0, hpPrev = 0, hpOut = 0;
    let metalLfsr = 1, metalCount = 0, metalVal = 1, noiseHold = 0, noiseCount = 0;
    let fmPh = 0;
    for (let i = 0; i < n && start + i < this.buf.length; i++) {
      const t = i / n;
      let f = o.f0;
      if (o.f1 !== undefined) f = o.curve === 'lin' ? o.f0 + (o.f1 - o.f0) * t : o.f0 * Math.pow(o.f1 / o.f0, t);
      if (o.vib) f *= Math.pow(2, (Math.sin((2 * Math.PI * o.vib[0] * i) / sr) * o.vib[1]) / 12);
      let s: number;
      if (o.fm) {
        fmPh += (f * o.fm[0]) / sr;
        const mod = Math.sin(2 * Math.PI * fmPh) * o.fm[1] * (1 - t * 0.7);
        ph += f / sr;
        s = Math.sin(2 * Math.PI * ph + mod);
      } else {
        ph += f / sr;
        const p = ph - Math.floor(ph);
        switch (o.wave) {
          case 'pulse': s = p < (o.duty ?? 0.25) ? 1 : -1; break;
          case 'square': s = p < 0.5 ? 1 : -1; break;
          case 'tri': s = 4 * Math.abs(p - 0.5) - 1; break;
          case 'saw': s = 2 * p - 1; break;
          case 'sine': s = Math.sin(2 * Math.PI * p); break;
          case 'noise': {
            // f controls sample-and-hold rate (lower = grittier)
            const hold = Math.max(1, Math.floor(sr / Math.max(100, f)));
            if (noiseCount++ % hold === 0) noiseHold = this.rnd();
            s = noiseHold;
            break;
          }
          case 'metal': {
            const hold = Math.max(1, Math.floor(sr / Math.max(100, f)));
            if (metalCount++ % hold === 0) { const bit = (metalLfsr ^ (metalLfsr >> 6)) & 1; metalLfsr = (metalLfsr >> 1) | (bit << 14); metalVal = metalLfsr & 1 ? 1 : -1; }
            s = metalVal;
            break;
          }
        }
      }
      if (o.lp) {
        const fc = o.lp[0] * Math.pow(o.lp[1] / o.lp[0], t);
        const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        lpS += a * (s - lpS);
        s = lpS;
      }
      if (o.bp) {
        const fc = o.bp[0];
        const ff = 2 * Math.sin((Math.PI * Math.min(fc, sr / 6)) / sr);
        const q = 1 / Math.max(0.5, o.bp[1]);
        svLow += ff * svBand;
        const high = s - svLow - q * svBand;
        svBand += ff * high;
        s = svBand;
      }
      if (o.hp) {
        const rc = 1 / (2 * Math.PI * o.hp), dt = 1 / sr, a = rc / (rc + dt);
        hpOut = a * (hpOut + s - hpPrev);
        hpPrev = s;
        s = hpOut;
      }
      let env = i < att ? i / att : 1;
      const d = o.decay ?? 'exp';
      if (d === 'exp') env *= Math.pow(1 - t, 2.2);
      else if (d === 'lin') env *= 1 - t;
      else env *= t > 0.9 ? (1 - t) * 10 : 1;
      if (o.gate && Math.sin(2 * Math.PI * o.gate * (i / sr)) < 0) env *= 0.08;
      this.buf[start + i]! += s * env * vol;
    }
    return this;
  }
  noise(o: Omit<ToneOpts, 'wave' | 'f0'> & { f0?: number }): this {
    return this.tone({ ...o, wave: 'noise', f0: o.f0 ?? 22050 });
  }
  /** Soft clip + normalise peak to `peak`. */
  finish(peak = 0.9): Float32Array {
    let m = 0;
    for (let i = 0; i < this.buf.length; i++) { const v = Math.tanh(this.buf[i]! * 1.2); this.buf[i] = v; m = Math.max(m, Math.abs(v)); }
    if (m > 0) { const k = peak / m; for (let i = 0; i < this.buf.length; i++) this.buf[i]! *= k; }
    // tiny fade-out to avoid clicks
    const f = Math.min(64, this.buf.length);
    for (let i = 0; i < f; i++) this.buf[this.buf.length - 1 - i]! *= i / f;
    return this.buf;
  }
}

export interface SfxDef { prio: number; max: number; minGap: number; vol: number; render: (sr: number) => Float32Array }

const S = (sr: number, sec: number) => new SfxSynth(sr, sec);
const arp = (s: SfxSynth, notes: number[], step: number, wave: Wave, vol: number, duty = 0.25, len = 1.4) => {
  notes.forEach((f, k) => s.tone({ wave, f0: f, at: k * step, dur: step * len, vol, duty }));
  return s;
};

export const SFX: Record<string, SfxDef> = {
  shot_pulse: { prio: 1, max: 2, minGap: 4, vol: 0.16, render: (sr) => S(sr, 0.045).tone({ wave: 'pulse', duty: 0.25, f0: 1250, f1: 820, dur: 0.045, vol: 0.6 }).finish() },
  shot_fan: { prio: 1, max: 2, minGap: 4, vol: 0.15, render: (sr) => S(sr, 0.055).tone({ wave: 'pulse', duty: 0.125, f0: 820, f1: 560, dur: 0.055, vol: 0.6 }).noise({ dur: 0.02, vol: 0.2, hp: 3000 }).finish() },
  shot_ray: { prio: 2, max: 2, minGap: 4, vol: 0.2, render: (sr) => S(sr, 0.11).tone({ wave: 'saw', f0: 900, f1: 2600, dur: 0.11, vol: 0.5, hp: 600 }).tone({ wave: 'sine', f0: 2000, f1: 3800, dur: 0.08, vol: 0.25 }).finish() },
  bomb_drop: { prio: 1, max: 2, minGap: 6, vol: 0.18, render: (sr) => S(sr, 0.07).tone({ wave: 'tri', f0: 340, f1: 150, dur: 0.07, vol: 0.7 }).finish() },
  bomb_explode: { prio: 2, max: 3, minGap: 3, vol: 0.32, render: (sr) => S(sr, 0.24).noise({ dur: 0.24, vol: 0.8, lp: [1200, 160], f0: 9000 }).tone({ wave: 'sine', f0: 110, f1: 40, dur: 0.18, vol: 0.6 }).finish() },
  seeker_launch: { prio: 1, max: 2, minGap: 6, vol: 0.16, render: (sr) => S(sr, 0.09).noise({ dur: 0.09, vol: 0.5, bp: [2400, 2] }).tone({ wave: 'sine', f0: 600, f1: 1000, dur: 0.08, vol: 0.4 }).finish() },
  lancer_dash: { prio: 2, max: 2, minGap: 6, vol: 0.26, render: (sr) => S(sr, 0.22).noise({ dur: 0.22, vol: 0.5, bp: [1500, 2] }).tone({ wave: 'saw', f0: 180, f1: 420, dur: 0.22, vol: 0.35, lp: [1600, 2400] }).finish() },
  hit_enemy: { prio: 2, max: 3, minGap: 3, vol: 0.2, render: (sr) => S(sr, 0.03).tone({ wave: 'pulse', duty: 0.5, f0: 1500, f1: 900, dur: 0.03, vol: 0.5 }).noise({ dur: 0.006, vol: 0.6 }).finish() },
  hit_armor: { prio: 2, max: 2, minGap: 4, vol: 0.2, render: (sr) => S(sr, 0.09).tone({ wave: 'sine', f0: 2400, fm: [1.41, 3], dur: 0.09, vol: 0.6 }).tone({ wave: 'sine', f0: 3300, dur: 0.06, vol: 0.25 }).finish() },
  explode_s: { prio: 3, max: 4, minGap: 2, vol: 0.34, render: (sr) => S(sr, 0.2).noise({ dur: 0.2, vol: 0.9, lp: [3500, 280], f0: 12000 }).tone({ wave: 'sine', f0: 130, f1: 40, dur: 0.16, vol: 0.7 }).finish() },
  explode_m: { prio: 3, max: 3, minGap: 3, vol: 0.42, render: (sr) => S(sr, 0.4).noise({ dur: 0.4, vol: 0.9, lp: [2800, 150], f0: 9000 }).noise({ dur: 0.3, vol: 0.5, lp: [900, 120], f0: 3000, at: 0.03 }).tone({ wave: 'sine', f0: 95, f1: 30, dur: 0.32, vol: 0.8 }).finish() },
  explode_l: { prio: 4, max: 2, minGap: 4, vol: 0.55, render: (sr) => S(sr, 0.8).noise({ dur: 0.8, vol: 0.9, lp: [2200, 90], f0: 8000 }).noise({ dur: 0.6, vol: 0.6, lp: [700, 80], f0: 2500, at: 0.05 }).tone({ wave: 'sine', f0: 75, f1: 24, dur: 0.7, vol: 0.9 }).finish() },
  boss_die: { prio: 5, max: 1, minGap: 30, vol: 0.7, render: (sr) => {
    const s = S(sr, 3.0);
    for (let k = 0; k < 3; k++) s.noise({ at: k * 0.18, dur: 0.9, vol: 0.8, lp: [2600, 90], f0: 8000 }).tone({ wave: 'sine', at: k * 0.18, f0: 80, f1: 25, dur: 0.8, vol: 0.8 });
    s.noise({ at: 0.3, dur: 2.6, vol: 0.5, lp: [400, 60], f0: 1500 });
    return s.finish();
  } },
  player_die: { prio: 5, max: 1, minGap: 30, vol: 0.55, render: (sr) => S(sr, 0.7).tone({ wave: 'saw', f0: 1600, f1: 70, dur: 0.55, vol: 0.45 }).noise({ dur: 0.6, vol: 0.8, lp: [5000, 200], f0: 14000 }).tone({ wave: 'sine', f0: 200, f1: 30, dur: 0.5, vol: 0.6 }).finish() },
  speed_change: { prio: 2, max: 1, minGap: 4, vol: 0.2, render: (sr) => arp(S(sr, 0.13), [1047, 1568], 0.05, 'pulse', 0.5).finish() },
  speed_down: { prio: 2, max: 1, minGap: 4, vol: 0.2, render: (sr) => arp(S(sr, 0.13), [1568, 1047], 0.05, 'pulse', 0.5).finish() },
  formation: { prio: 2, max: 1, minGap: 4, vol: 0.22, render: (sr) => arp(S(sr, 0.12), [880, 1175, 1760], 0.03, 'tri', 0.6).finish() },
  pickup_arms: { prio: 4, max: 1, minGap: 4, vol: 0.28, render: (sr) => arp(S(sr, 0.26), [523, 659, 784, 1047], 0.045, 'pulse', 0.5).tone({ wave: 'sine', f0: 2093, at: 0.16, dur: 0.1, vol: 0.3 }).finish() },
  pickup_wisp: { prio: 4, max: 1, minGap: 4, vol: 0.3, render: (sr) => S(sr, 0.35).tone({ wave: 'sine', f0: 1200, fm: [3.5, 2.5], dur: 0.35, vol: 0.6 }).tone({ wave: 'sine', f0: 1800, fm: [3.5, 1.5], at: 0.06, dur: 0.28, vol: 0.4 }).finish() },
  pickup_aegis: { prio: 4, max: 1, minGap: 4, vol: 0.28, render: (sr) => S(sr, 0.42).tone({ wave: 'sine', f0: 520, dur: 0.42, vol: 0.4, vib: [9, 0.2] }).tone({ wave: 'sine', f0: 780, dur: 0.42, vol: 0.35, vib: [9, 0.2] }).tone({ wave: 'sine', f0: 1560, dur: 0.3, vol: 0.15, at: 0.05 }).finish() },
  pickup_drive: { prio: 4, max: 1, minGap: 4, vol: 0.3, render: (sr) => S(sr, 0.28).tone({ wave: 'saw', f0: 400, f1: 1700, dur: 0.28, vol: 0.5, lp: [800, 6000] }).finish() },
  pickup_chip: { prio: 4, max: 1, minGap: 4, vol: 0.26, render: (sr) => arp(S(sr, 0.14), [880, 1319], 0.055, 'pulse', 0.5, 0.5).finish() },
  chip_tick: { prio: 1, max: 1, minGap: 4, vol: 0.06, render: (sr) => S(sr, 0.012).tone({ wave: 'square', f0: 3000, dur: 0.012, vol: 0.5 }).finish() },
  star: { prio: 1, max: 4, minGap: 2, vol: 0.07, render: (sr) => S(sr, 0.03).tone({ wave: 'sine', f0: 2600, f1: 3100, dur: 0.03, vol: 0.7 }).finish() },
  extend: { prio: 5, max: 1, minGap: 30, vol: 0.36, render: (sr) => arp(S(sr, 0.75), [523, 659, 784, 1047, 1319, 1568], 0.08, 'pulse', 0.45, 0.5, 2).finish() },
  graze: { prio: 1, max: 2, minGap: 2, vol: 0.06, render: (sr) => S(sr, 0.018).noise({ dur: 0.018, vol: 0.7, hp: 6000 }).finish() },
  barrier_hit: { prio: 4, max: 1, minGap: 6, vol: 0.32, render: (sr) => S(sr, 0.22).tone({ wave: 'sine', f0: 800, fm: [1.41, 4], dur: 0.22, vol: 0.6 }).noise({ dur: 0.05, vol: 0.3, hp: 2000 }).finish() },
  barrier_break: { prio: 4, max: 1, minGap: 10, vol: 0.34, render: (sr) => {
    const s = S(sr, 0.4).noise({ dur: 0.3, vol: 0.5, bp: [4200, 3] });
    [3100, 4200, 2600, 5300, 3700].forEach((f, k) => s.tone({ wave: 'sine', f0: f, at: k * 0.035, dur: 0.18, vol: 0.25 }));
    return s.finish();
  } },
  glass_shatter: { prio: 5, max: 1, minGap: 30, vol: 0.5, render: (sr) => {
    const s = S(sr, 1.3).noise({ dur: 1.0, vol: 0.6, bp: [3800, 2] }).noise({ dur: 0.6, vol: 0.5, lp: [1500, 100], f0: 6000 });
    for (let k = 0; k < 18; k++) s.tone({ wave: 'sine', f0: 2200 + ((k * 1931) % 4400), at: k * 0.045, dur: 0.25, vol: 0.18 });
    return s.finish();
  } },
  drive_ready: { prio: 3, max: 1, minGap: 30, vol: 0.28, render: (sr) => S(sr, 0.45).tone({ wave: 'sine', f0: 1047, fm: [3.5, 2], dur: 0.45, vol: 0.4 }).tone({ wave: 'sine', f0: 1568, fm: [3.5, 2], dur: 0.45, vol: 0.35, at: 0.04 }).tone({ wave: 'sine', f0: 2093, fm: [3.5, 1], dur: 0.4, vol: 0.25, at: 0.08 }).finish() },
  drive_start: { prio: 5, max: 1, minGap: 30, vol: 0.55, render: (sr) => S(sr, 0.9).noise({ dur: 0.5, vol: 0.6, lp: [300, 7000], f0: 16000, decay: 'lin' }).tone({ wave: 'sine', f0: 70, f1: 40, dur: 0.8, vol: 0.9 }).tone({ wave: 'saw', f0: 294, dur: 0.85, vol: 0.12, at: 0.08, lp: [2000, 900] }).tone({ wave: 'saw', f0: 440, dur: 0.85, vol: 0.12, at: 0.08, lp: [2000, 900] }).tone({ wave: 'saw', f0: 587, dur: 0.85, vol: 0.12, at: 0.08, lp: [2000, 900] }).finish() },
  drive_end: { prio: 3, max: 1, minGap: 30, vol: 0.25, render: (sr) => S(sr, 0.32).noise({ dur: 0.32, vol: 0.5, lp: [6000, 300], f0: 14000 }).finish() },
  warn_behind: { prio: 4, max: 1, minGap: 20, vol: 0.28, render: (sr) => arp(S(sr, 0.34), [880, 660, 880, 660], 0.075, 'pulse', 0.4, 0.5, 0.85).finish() },
  mine_arm: { prio: 3, max: 2, minGap: 10, vol: 0.18, render: (sr) => S(sr, 0.5).tone({ wave: 'square', f0: 2000, dur: 0.5, vol: 0.4, decay: 'hold', gate: 7.5 }).finish() },
  laser_charge: { prio: 3, max: 2, minGap: 6, vol: 0.2, render: (sr) => S(sr, 1.0).tone({ wave: 'saw', f0: 200, f1: 1100, dur: 1.0, vol: 0.4, decay: 'hold', lp: [600, 4000], vib: [14, 0.3] }).finish() },
  laser_fire: { prio: 3, max: 2, minGap: 6, vol: 0.28, render: (sr) => S(sr, 0.7).noise({ dur: 0.7, vol: 0.4, bp: [900, 1], decay: 'hold' }).tone({ wave: 'saw', f0: 150, dur: 0.7, vol: 0.4, decay: 'hold', vib: [30, 0.4] }).finish() },
  lightning_warn: { prio: 3, max: 2, minGap: 10, vol: 0.16, render: (sr) => S(sr, 0.8).noise({ dur: 0.8, vol: 0.6, hp: 2500, decay: 'hold', gate: 19 }).finish() },
  lightning_strike: { prio: 4, max: 2, minGap: 6, vol: 0.5, render: (sr) => S(sr, 1.1).noise({ dur: 0.12, vol: 0.9, hp: 1500 }).noise({ dur: 1.1, vol: 0.7, lp: [3000, 70], f0: 6000 }).tone({ wave: 'sine', f0: 60, f1: 30, dur: 0.9, vol: 0.6 }).finish() },
  press_slam: { prio: 3, max: 2, minGap: 6, vol: 0.42, render: (sr) => S(sr, 0.25).tone({ wave: 'sine', f0: 90, f1: 30, dur: 0.25, vol: 0.9 }).noise({ dur: 0.2, vol: 0.6, lp: [500, 100], f0: 4000 }).tone({ wave: 'metal', f0: 9000, dur: 0.08, vol: 0.2, bp: [3000, 4] }).finish() },
  enemy_fire_s: { prio: 1, max: 3, minGap: 3, vol: 0.12, render: (sr) => S(sr, 0.035).tone({ wave: 'pulse', duty: 0.125, f0: 1050, f1: 700, dur: 0.035, vol: 0.6 }).finish() },
  enemy_fire_m: { prio: 2, max: 2, minGap: 4, vol: 0.16, render: (sr) => S(sr, 0.065).tone({ wave: 'square', f0: 520, f1: 300, dur: 0.065, vol: 0.5 }).finish() },
  enemy_fire_l: { prio: 3, max: 2, minGap: 6, vol: 0.22, render: (sr) => S(sr, 0.13).tone({ wave: 'saw', f0: 320, f1: 110, dur: 0.13, vol: 0.6, lp: [2500, 500] }).finish() },
  boss_phase: { prio: 5, max: 1, minGap: 30, vol: 0.5, render: (sr) => S(sr, 0.9).tone({ wave: 'saw', f0: 62, dur: 0.9, vol: 0.6, vib: [7, 1.5], lp: [900, 300] }).tone({ wave: 'sine', f0: 1800, fm: [1.41, 5], dur: 0.25, vol: 0.4 }).noise({ dur: 0.5, vol: 0.4, lp: [1200, 100], f0: 5000 }).finish() },
  wave_arc: { prio: 2, max: 2, minGap: 6, vol: 0.2, render: (sr) => S(sr, 0.32).tone({ wave: 'saw', f0: 330, f1: 220, dur: 0.32, vol: 0.5, bp: [700, 3], vib: [6, 0.3] }).tone({ wave: 'sine', f0: 660, f1: 440, dur: 0.3, vol: 0.3 }).finish() },
  organic_pop: { prio: 3, max: 3, minGap: 3, vol: 0.3, render: (sr) => S(sr, 0.13).noise({ dur: 0.13, vol: 0.6, bp: [650, 2], f0: 4000 }).tone({ wave: 'sine', f0: 300, f1: 90, dur: 0.1, vol: 0.6 }).finish() },
  heartbeat: { prio: 4, max: 1, minGap: 10, vol: 0.55, render: (sr) => S(sr, 0.45).tone({ wave: 'sine', f0: 62, f1: 40, dur: 0.16, vol: 0.9 }).tone({ wave: 'sine', f0: 55, f1: 36, dur: 0.18, vol: 0.7, at: 0.2 }).finish() },
  menu_move: { prio: 2, max: 1, minGap: 2, vol: 0.18, render: (sr) => S(sr, 0.025).tone({ wave: 'pulse', duty: 0.25, f0: 1500, dur: 0.025, vol: 0.5 }).finish() },
  menu_confirm: { prio: 3, max: 1, minGap: 3, vol: 0.24, render: (sr) => arp(S(sr, 0.12), [988, 1480], 0.045, 'pulse', 0.5).finish() },
  menu_cancel: { prio: 3, max: 1, minGap: 3, vol: 0.22, render: (sr) => arp(S(sr, 0.12), [880, 587], 0.045, 'pulse', 0.5).finish() },
  pause: { prio: 3, max: 1, minGap: 6, vol: 0.24, render: (sr) => S(sr, 0.32).tone({ wave: 'tri', f0: 587, dur: 0.32, vol: 0.4 }).tone({ wave: 'tri', f0: 880, dur: 0.32, vol: 0.3 }).tone({ wave: 'tri', f0: 1175, dur: 0.32, vol: 0.2 }).finish() },
  countdown: { prio: 3, max: 1, minGap: 6, vol: 0.22, render: (sr) => S(sr, 0.04).tone({ wave: 'square', f0: 1000, dur: 0.04, vol: 0.5 }).finish() },
  stage_intro: { prio: 3, max: 1, minGap: 30, vol: 0.32, render: (sr) => S(sr, 1.1).noise({ dur: 0.8, vol: 0.4, lp: [300, 5000], f0: 14000, decay: 'lin' }).tone({ wave: 'saw', f0: 220, dur: 1.0, vol: 0.12, at: 0.3, lp: [3000, 600] }).tone({ wave: 'saw', f0: 330, dur: 1.0, vol: 0.12, at: 0.3, lp: [3000, 600] }).tone({ wave: 'saw', f0: 440, dur: 1.0, vol: 0.1, at: 0.3, lp: [3000, 600] }).finish() },
  tally: { prio: 2, max: 1, minGap: 2, vol: 0.1, render: (sr) => S(sr, 0.012).tone({ wave: 'square', f0: 2200, dur: 0.012, vol: 0.5 }).finish() },
  siren: { prio: 4, max: 1, minGap: 30, vol: 0.32, render: (sr) => {
    const s = S(sr, 3.0);
    for (let k = 0; k < 6; k++) s.tone({ wave: 'square', f0: k % 2 ? 500 : 700, at: k * 0.5, dur: 0.5, vol: 0.4, decay: 'hold', lp: [1800, 1800] });
    return s.finish();
  } },
  crystal_ping: { prio: 2, max: 2, minGap: 4, vol: 0.14, render: (sr) => S(sr, 0.2).tone({ wave: 'sine', f0: 2600, fm: [2.76, 1.5], dur: 0.2, vol: 0.6 }).finish() },
  wall_regen: { prio: 2, max: 2, minGap: 10, vol: 0.16, render: (sr) => S(sr, 0.4).noise({ dur: 0.4, vol: 0.5, bp: [400, 2], f0: 3000, decay: 'lin' }).finish() },
  flame: { prio: 2, max: 2, minGap: 8, vol: 0.22, render: (sr) => S(sr, 0.7).noise({ dur: 0.7, vol: 0.7, lp: [2200, 1500], f0: 8000, decay: 'hold' }).finish() },
  crush: { prio: 4, max: 1, minGap: 10, vol: 0.5, render: (sr) => S(sr, 0.5).tone({ wave: 'sine', f0: 60, f1: 25, dur: 0.5, vol: 0.9 }).noise({ dur: 0.4, vol: 0.7, lp: [800, 60], f0: 3000 }).tone({ wave: 'metal', f0: 7000, dur: 0.15, vol: 0.3, bp: [2400, 3] }).finish() },
  thunder: { prio: 3, max: 1, minGap: 30, vol: 0.4, render: (sr) => S(sr, 2.0).noise({ dur: 2.0, vol: 0.8, lp: [600, 50], f0: 2000 }).finish() },
};

export function renderAllSfx(sr: number): Map<string, Float32Array> {
  const out = new Map<string, Float32Array>();
  for (const [id, d] of Object.entries(SFX)) out.set(id, d.render(sr));
  return out;
}

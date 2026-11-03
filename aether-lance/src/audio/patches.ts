// Music instruments built from WebAudio nodes (docs/08_audio.md §3).

export interface Patch {
  osc: 'pulse12' | 'pulse25' | 'pulse50' | 'pulse75' | 'tri' | 'saw' | 'sine' | 'fm' | 'organ' | 'noise';
  unison?: number;
  spread?: number;            // cents
  adsr: [number, number, number, number];
  filter?: { type: BiquadFilterType; cutoff: number; q?: number; env?: number; decay?: number };
  formants?: number[];        // parallel band-pass formant filters (choir)
  vibrato?: { delay: number; rate: number; depth: number };
  fm?: { ratio: number; index: number; decay?: number };
  gain: number;
  octave?: number;            // octave shift
}

export const PATCHES: Record<string, Patch> = {
  lead_saw: { osc: 'saw', unison: 2, spread: 8, adsr: [0.01, 0.25, 0.75, 0.18], filter: { type: 'lowpass', cutoff: 4200, q: 0.8, env: 1.6, decay: 0.25 }, vibrato: { delay: 0.22, rate: 5.6, depth: 14 }, gain: 0.16 },
  lead_pulse: { osc: 'pulse25', adsr: [0.005, 0.2, 0.7, 0.12], vibrato: { delay: 0.25, rate: 5.5, depth: 10 }, gain: 0.13 },
  lead_sq: { osc: 'pulse50', adsr: [0.005, 0.15, 0.65, 0.1], vibrato: { delay: 0.25, rate: 5.5, depth: 10 }, filter: { type: 'lowpass', cutoff: 3200, q: 0.5 }, gain: 0.12 },
  lead_fm: { osc: 'fm', fm: { ratio: 2, index: 2.6, decay: 0.4 }, adsr: [0.005, 0.3, 0.7, 0.2], vibrato: { delay: 0.2, rate: 5.8, depth: 12 }, gain: 0.2 },
  bell: { osc: 'fm', fm: { ratio: 3.5, index: 4, decay: 0.35 }, adsr: [0.002, 0.6, 0.0, 0.5], gain: 0.15 },
  harp: { osc: 'fm', fm: { ratio: 1, index: 1.4, decay: 0.3 }, adsr: [0.002, 0.45, 0.0, 0.3], gain: 0.16 },
  bass_fm: { osc: 'fm', fm: { ratio: 1, index: 2.2, decay: 0.16 }, adsr: [0.004, 0.18, 0.55, 0.06], filter: { type: 'lowpass', cutoff: 1800, q: 0.7 }, gain: 0.32 },
  bass_pulse: { osc: 'pulse50', adsr: [0.004, 0.12, 0.6, 0.05], filter: { type: 'lowpass', cutoff: 1100, q: 1.2, env: 2.2, decay: 0.09 }, gain: 0.2 },
  bass_dist: { osc: 'saw', unison: 2, spread: 12, adsr: [0.004, 0.1, 0.7, 0.05], filter: { type: 'lowpass', cutoff: 900, q: 4, env: 3, decay: 0.08 }, gain: 0.2 },
  bass_tri: { osc: 'tri', adsr: [0.003, 0.1, 0.8, 0.05], gain: 0.34 },
  pad: { osc: 'saw', unison: 3, spread: 14, adsr: [0.35, 0.5, 0.7, 0.8], filter: { type: 'lowpass', cutoff: 1500, q: 0.4 }, gain: 0.05 },
  pad_soft: { osc: 'tri', unison: 2, spread: 10, adsr: [0.4, 0.5, 0.8, 0.9], gain: 0.08 },
  choir: { osc: 'saw', unison: 3, spread: 16, adsr: [0.3, 0.4, 0.8, 0.9], formants: [800, 1150, 2900], vibrato: { delay: 0.3, rate: 4.6, depth: 9 }, gain: 0.32 },
  organ: { osc: 'organ', adsr: [0.02, 0.2, 0.85, 0.25], gain: 0.07 },
  arp: { osc: 'pulse12', adsr: [0.002, 0.09, 0.15, 0.05], gain: 0.1 },
  arp_tri: { osc: 'tri', adsr: [0.002, 0.12, 0.2, 0.05], gain: 0.16 },
  strings: { osc: 'saw', unison: 2, spread: 10, adsr: [0.12, 0.3, 0.8, 0.4], filter: { type: 'lowpass', cutoff: 2600, q: 0.3 }, vibrato: { delay: 0.3, rate: 5, depth: 8 }, gain: 0.07 },
  brass: { osc: 'saw', unison: 2, spread: 6, adsr: [0.04, 0.3, 0.7, 0.15], filter: { type: 'lowpass', cutoff: 1400, q: 1, env: 2.4, decay: 0.2 }, gain: 0.1 },
};

// ---------------------------------------------------------------------------
export class Instruments {
  private waves = new Map<string, PeriodicWave>();
  noise: AudioBuffer;
  metalNoise: AudioBuffer;
  constructor(private ctx: BaseAudioContext) {
    const sr = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const d = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
    this.metalNoise = ctx.createBuffer(1, 93 * 64, sr);
    const m = this.metalNoise.getChannelData(0);
    let lfsr = 1;
    for (let i = 0; i < 93; i++) { const bit = (lfsr ^ (lfsr >> 6)) & 1; lfsr = (lfsr >> 1) | (bit << 14); m[i] = lfsr & 1 ? 1 : -1; }
    for (let i = 93; i < m.length; i++) m[i] = m[i % 93]!;
  }

  wave(kind: string): PeriodicWave {
    let w = this.waves.get(kind);
    if (!w) {
      const n = 48;
      const real = new Float32Array(n), imag = new Float32Array(n);
      if (kind.startsWith('pulse')) {
        const duty = parseInt(kind.slice(5), 10) / 100;
        for (let k = 1; k < n; k++) {
          real[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
          imag[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
        }
      } else if (kind === 'organ') {
        const h = [0, 1, 0.6, 0.35, 0.3, 0, 0.18, 0, 0.12];
        for (let k = 1; k < h.length; k++) imag[k] = h[k]!;
      }
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(kind, w);
    }
    return w;
  }

  /** Schedule one note. Returns nothing; nodes clean themselves up. */
  note(patchName: string, out: AudioNode, t: number, freq: number, dur: number, vel: number): void {
    if (patchName === 'drums') return;
    const p = PATCHES[patchName] ?? PATCHES.lead_pulse!;
    const ctx = this.ctx;
    if (p.octave) freq *= Math.pow(2, p.octave);
    const [a, d, s, r] = p.adsr;
    const peak = p.gain * vel;
    const env = ctx.createGain();
    const g = env.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + a);
    g.setTargetAtTime(peak * s, t + a, Math.max(0.01, d / 3));
    const off = t + Math.max(dur, a + 0.01);
    g.setTargetAtTime(0, off, Math.max(0.01, r / 4));
    const stop = off + r * 1.5 + 0.05;

    let chainIn: AudioNode = env;
    if (p.filter) {
      const f = ctx.createBiquadFilter();
      f.type = p.filter.type;
      f.Q.value = p.filter.q ?? 0.7;
      const cut = Math.min(18000, p.filter.cutoff);
      if (p.filter.env) {
        f.frequency.setValueAtTime(Math.min(18000, cut * p.filter.env), t);
        f.frequency.setTargetAtTime(cut, t, (p.filter.decay ?? 0.2) / 3);
      } else f.frequency.value = cut;
      f.connect(env);
      chainIn = f;
    }
    let targets: AudioNode[] = [chainIn];
    if (p.formants) {
      targets = p.formants.map((fq) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 5;
        bp.connect(chainIn);
        return bp;
      });
    }
    env.connect(out);

    const oscs: (OscillatorNode | AudioBufferSourceNode)[] = [];
    const uni = p.unison ?? 1;
    for (let k = 0; k < uni; k++) {
      if (p.osc === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = this.noise; src.loop = true;
        oscs.push(src);
        for (const tg of targets) src.connect(tg);
        continue;
      }
      const o = ctx.createOscillator();
      if (p.osc === 'tri') o.type = 'triangle';
      else if (p.osc === 'saw') o.type = 'sawtooth';
      else if (p.osc === 'sine' || p.osc === 'fm') o.type = 'sine';
      else o.setPeriodicWave(this.wave(p.osc));
      o.frequency.setValueAtTime(freq, t);
      if (uni > 1) o.detune.value = ((k / (uni - 1)) * 2 - 1) * (p.spread ?? 8);
      if (p.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = p.vibrato.rate;
        const lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(0, t + p.vibrato.delay);
        lg.gain.linearRampToValueAtTime(p.vibrato.depth, t + p.vibrato.delay + 0.25);
        lfo.connect(lg).connect(o.detune);
        lfo.start(t); lfo.stop(stop);
      }
      if (p.osc === 'fm' && p.fm) {
        const mod = ctx.createOscillator();
        mod.frequency.setValueAtTime(freq * p.fm.ratio, t);
        const mg = ctx.createGain();
        const depth = freq * p.fm.ratio * p.fm.index;
        mg.gain.setValueAtTime(depth, t);
        mg.gain.setTargetAtTime(depth * 0.25, t, (p.fm.decay ?? 0.3) / 3);
        mod.connect(mg).connect(o.frequency);
        mod.start(t); mod.stop(stop);
      }
      for (const tg of targets) o.connect(tg);
      oscs.push(o);
    }
    for (const o of oscs) { o.start(t); o.stop(stop); }
    oscs[0]!.onended = () => { env.disconnect(); };
  }

  /** Drum kit: pitch class picks the voice. */
  drum(pc: number, out: AudioNode, t: number, vel: number): void {
    const ctx = this.ctx;
    const env = (peak: number, decay: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak * vel, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
      g.connect(out);
      return g;
    };
    const noise = (dest: AudioNode, dur: number, rate = 1, buf = this.noise) => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      s.connect(dest); s.start(t, (t * 7.3) % 1.5); s.stop(t + dur + 0.05);
      s.onended = () => dest.disconnect();
    };
    const tone = (dest: AudioNode, type: OscillatorType, f0: number, f1: number, time: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + time);
      o.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    };
    const filt = (type: BiquadFilterType, f: number, q: number, dest: AudioNode) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b;
    };
    switch (pc) {
      case 0: { // kick
        const e = env(0.9, 0.32); tone(e, 'sine', 160, 42, 0.07, 0.32);
        const c = env(0.25, 0.02); noise(filt('lowpass', 2500, 0.5, c), 0.02); break;
      }
      case 2: { // snare
        const e = env(0.42, 0.17); noise(filt('bandpass', 1900, 0.7, e), 0.18);
        const b = env(0.32, 0.09); tone(b, 'triangle', 240, 160, 0.05, 0.1); break;
      }
      case 1: { // clap
        for (let k = 0; k < 3; k++) {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.setValueAtTime(0.3 * vel, t + k * 0.011);
          g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.011 + (k === 2 ? 0.15 : 0.01));
          g.connect(out);
          noise(filt('bandpass', 1300, 1.2, g), 0.2);
        }
        break;
      }
      case 4: { const e = env(0.5, 0.25); tone(e, 'sine', 220, 90, 0.18, 0.25); break; } // tom high
      case 3: { const e = env(0.6, 1.8); noise(filt('lowpass', 380, 0.8, e), 1.8, 0.6); break; } // thunder
      case 5: { const e = env(0.18, 0.06); noise(filt('bandpass', 5200, 1.5, e), 0.07); break; } // shaker
      case 6: { const e = env(0.16, 0.045); noise(filt('highpass', 7200, 0.5, e), 0.05); break; } // hat closed
      case 7: { const e = env(0.35, 0.09); tone(e, 'sine', 900, 380, 0.03, 0.09); break; } // wood
      case 8: { const e = env(0.25, 0.04); tone(e, 'square', 1700, 1500, 0.02, 0.04); break; } // rim
      case 9: { const e = env(0.22, 0.16); noise(filt('bandpass', 3100, 6, e), 0.16, 1, this.metalNoise); break; } // metal
      case 10: { const e = env(0.14, 0.28); noise(filt('highpass', 6800, 0.5, e), 0.3); break; } // hat open
      case 11: { const e = env(0.2, 1.3); noise(filt('highpass', 4800, 0.4, e), 1.3); break; } // crash
    }
  }
}

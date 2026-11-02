// Audio engine: context, buses, reverb/delay, SFX playback with priorities, music control.
import { renderAllSfx, SFX } from './sfxsynth';
import { MusicPlayer, type SongDef } from './sequencer';

interface Voice { id: string; prio: number; src: AudioBufferSourceNode; end: number }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgmBus!: GainNode;
  private bgmFilter!: BiquadFilterNode;
  private bgmDuck!: GainNode;
  private sfxBus!: GainNode;
  private uiBus!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private lastPlay = new Map<string, number>();
  private loops = new Map<string, { src: AudioBufferSourceNode; g: GainNode }>();
  music: MusicPlayer | null = null;
  frame = 0;
  vol = { master: 8, bgm: 7, sfx: 8 };
  ready = false;
  private songs: Record<string, SongDef> = {};
  private pendingSong: { id: string; fade: number } | null = null;
  private timer: number | null = null;

  registerSongs(s: Record<string, SongDef>): void { this.songs = s; }

  /** Must be called from inside a user-gesture handler. */
  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // iOS: play a silent buffer inside the gesture
    const sb = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource(); s.buffer = sb; s.connect(ctx.destination); s.start(0);
    void ctx.resume();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(comp);
    this.bgmBus = ctx.createGain();
    this.bgmDuck = ctx.createGain();
    this.bgmFilter = ctx.createBiquadFilter(); this.bgmFilter.type = 'lowpass'; this.bgmFilter.frequency.value = 20000;
    this.bgmBus.connect(this.bgmDuck).connect(this.bgmFilter).connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
    // reverb impulse
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.8), pre = Math.floor(ctx.sampleRate * 0.02);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let seed = 777 + c * 31;
      for (let i = pre; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 3.2); }
    }
    this.reverb.buffer = ir;
    const revOut = ctx.createGain(); revOut.gain.value = 0.9;
    this.reverb.connect(revOut).connect(this.master);
    // delay (lead)
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.3;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    this.delay.connect(lp).connect(fb).connect(this.delay);
    lp.connect(this.bgmBus);

    this.music = new MusicPlayer(ctx, this.bgmBus, this.reverb, this.delay);
    // SFX buffers
    const rendered = renderAllSfx(ctx.sampleRate);
    for (const [id, data] of rendered) {
      const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(id, b);
    }
    this.applyVolumes();
    this.ready = true;
    this.timer = window.setInterval(() => this.music?.pump(), 25);
    if (this.pendingSong) { this.playMusic(this.pendingSong.id, this.pendingSong.fade); this.pendingSong = null; }
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const v = (x: number) => Math.pow(x / 10, 2);
    this.master.gain.value = v(this.vol.master);
    this.bgmBus.gain.value = v(this.vol.bgm) * 0.55;
    this.sfxBus.gain.value = v(this.vol.sfx) * 0.8;
    this.uiBus.gain.value = v(this.vol.sfx) * 0.6;
  }

  update(frame: number): void {
    this.frame = frame;
    this.music?.pump();
  }

  sfx(id: string, x = 240, volMul = 1, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const def = SFX[id];
    const buf = this.buffers.get(id);
    if (!def || !buf) return;
    const last = this.lastPlay.get(id) ?? -999;
    if (this.frame - last < def.minGap) return;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= def.max) { const o = same[0]!; try { o.src.stop(); } catch { /* */ } this.voices.splice(this.voices.indexOf(o), 1); }
    if (this.voices.length >= 16) {
      let worst = -1;
      for (let i = 0; i < this.voices.length; i++) if (this.voices[i]!.prio <= def.prio && (worst < 0 || this.voices[i]!.prio < this.voices[worst]!.prio)) worst = i;
      if (worst < 0) return;
      try { this.voices[worst]!.src.stop(); } catch { /* */ }
      this.voices.splice(worst, 1);
    }
    this.lastPlay.set(id, this.frame);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.05);
    const g = ctx.createGain();
    g.gain.value = def.vol * volMul;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.6, Math.min(0.6, ((x - 240) / 240) * 0.6));
    src.connect(g).connect(p).connect(id.startsWith('menu') || id === 'pause' || id === 'countdown' || id === 'tally' ? this.uiBus : this.sfxBus);
    src.start(now);
    this.voices.push({ id, prio: def.prio, src, end: now + buf.duration / src.playbackRate.value });
  }

  loopStart(key: string, id: string, vol = 1): void {
    if (!this.ctx || this.loops.has(key)) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = (SFX[id]?.vol ?? 0.3) * vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
    this.loops.set(key, { src, g });
  }

  loopStop(key: string): void {
    const l = this.loops.get(key);
    if (!l || !this.ctx) return;
    const now = this.ctx.currentTime;
    l.g.gain.setTargetAtTime(0, now, 0.03);
    try { l.src.stop(now + 0.15); } catch { /* */ }
    this.loops.delete(key);
  }

  loopStopAll(): void { for (const k of [...this.loops.keys()]) this.loopStop(k); }

  playMusic(id: string, fade = 0, startTick = 0): void {
    const def = this.songs[id];
    if (!def) return;
    if (!this.music) { this.pendingSong = { id, fade }; return; }
    this.delay.delayTime.setValueAtTime(Math.min(1.4, 0.75 * 60 / def.bpm), this.ctx!.currentTime);
    this.music.play(def, fade, startTick);
  }

  stopMusic(fade = 0.05): void { this.music?.stop(fade); this.pendingSong = null; }
  currentSong(): string | null { return this.music?.currentId ?? this.pendingSong?.id ?? null; }

  setDrive(on: boolean): void { this.music?.setDrive(on); }

  duck(db: number, sec: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.bgmDuck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.pow(10, db / 20), now);
    g.linearRampToValueAtTime(1, now + sec);
  }

  setPauseFilter(on: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.bgmFilter.frequency.setTargetAtTime(on ? 600 : 20000, now, 0.06);
    this.bgmDuck.gain.setTargetAtTime(on ? 0.5 : 1, now, 0.06);
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }
  stopAllSfx(): void { for (const v of this.voices) { try { v.src.stop(); } catch { /* */ } } this.voices = []; this.loopStopAll(); }

  dispose(): void { if (this.timer) clearInterval(this.timer); }
}

export const audio = new AudioEngine();

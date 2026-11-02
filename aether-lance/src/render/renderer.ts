// Presentation: 480×270 game canvas + HUD canvas → WebGL2 post-process (bloom, distortion, CRT)
// with a Canvas2D fallback, plus a full-resolution overlay canvas for Japanese text and touch UI.
import { makeCanvas, ctx2d, type Canvas } from './sprite';
import { PAL, type PalKey } from './palette';
import { input } from '../core/input';

export const GW = 480;
export const GH = 270;

export interface VideoSettings {
  scaleMode: 'integer' | 'fit' | 'stretch';
  scaleFilter: 'sharp' | 'soft';
  crt: 'off' | 'light' | 'strong';
  scanline: number; // 0..100
  bloom: number;    // 0..100
  quality: 'auto' | 'high' | 'low';
}

interface Wave { x: number; y: number; r: number; max: number; life: number; age: number; strength: number }

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS_BRIGHT = `#version 300 es
precision mediump float;
in vec2 uv; out vec4 o; uniform sampler2D t; uniform vec2 texel;
void main(){
  vec3 c = texture(t, uv + vec2(-0.5,-0.5)*texel).rgb + texture(t, uv + vec2(0.5,-0.5)*texel).rgb
         + texture(t, uv + vec2(-0.5,0.5)*texel).rgb + texture(t, uv + vec2(0.5,0.5)*texel).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.62, 0.86, l);
  o = vec4(c * k, 1.0);
}`;

const FS_DOWN = `#version 300 es
precision mediump float;
in vec2 uv; out vec4 o; uniform sampler2D t; uniform vec2 texel;
void main(){
  vec3 c = texture(t, uv + vec2(-1.0,-1.0)*texel).rgb + texture(t, uv + vec2(1.0,-1.0)*texel).rgb
         + texture(t, uv + vec2(-1.0,1.0)*texel).rgb + texture(t, uv + vec2(1.0,1.0)*texel).rgb;
  o = vec4(c * 0.25, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision mediump float;
in vec2 uv; out vec4 o; uniform sampler2D t; uniform vec2 dir;
void main(){
  vec3 c = texture(t, uv).rgb * 0.227027;
  c += texture(t, uv + dir * 1.3846).rgb * 0.316216;
  c += texture(t, uv - dir * 1.3846).rgb * 0.316216;
  c += texture(t, uv + dir * 3.2308).rgb * 0.070270;
  c += texture(t, uv - dir * 3.2308).rgb * 0.070270;
  o = vec4(c, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D game; uniform sampler2D hud; uniform sampler2D bloom;
uniform vec2 gsize; uniform float scale; uniform float bloomK; uniform float scan; uniform float vig;
uniform float curve; uniform float chroma; uniform float soft; uniform float haze; uniform float time;
uniform vec4 waves[4];
vec2 sharp(vec2 u){
  vec2 p = u * gsize; vec2 i = floor(p) + 0.5; vec2 f = p - i;
  vec2 k = clamp(f * scale, -0.5, 0.5);
  return (i + k) / gsize;
}
void main(){
  vec2 u = vec2(uv.x, 1.0 - uv.y);
  if (curve > 0.0) {
    vec2 cc = u * 2.0 - 1.0;
    cc *= 1.0 + curve * dot(cc.yx, cc.yx);
    u = cc * 0.5 + 0.5;
    if (u.x < 0.0 || u.y < 0.0 || u.x > 1.0 || u.y > 1.0) { o = vec4(0.0,0.0,0.0,1.0); return; }
  }
  vec2 g = u;
  float asp = gsize.x / gsize.y;
  for (int i = 0; i < 4; i++) {
    vec4 w = waves[i];
    if (w.w <= 0.0) continue;
    vec2 d = (g - w.xy) * vec2(asp, 1.0);
    float dl = length(d);
    float band = 1.0 - smoothstep(0.0, 0.045, abs(dl - w.z));
    if (dl > 0.0001) g -= normalize(d) / vec2(asp, 1.0) * band * w.w * 0.02;
  }
  if (haze > 0.0) {
    float m = smoothstep(0.55, 0.95, g.y);
    g.x += sin(g.y * 90.0 + time * 4.0) * 0.0018 * haze * m;
    g.y += sin(g.x * 60.0 + time * 3.0) * 0.0012 * haze * m;
  }
  vec2 sg = soft > 0.5 ? sharp(g) : (floor(g * gsize) + 0.5) / gsize;
  vec3 col;
  if (chroma > 0.0) {
    vec2 off = vec2(chroma / gsize.x, 0.0);
    col = vec3(texture(game, sg + off).r, texture(game, sg).g, texture(game, sg - off).b);
  } else col = texture(game, sg).rgb;
  col += texture(bloom, g).rgb * bloomK;
  vec2 hu = (floor(u * gsize) + 0.5) / gsize;
  vec4 h = texture(hud, hu);
  col = mix(col, h.rgb, h.a);
  if (scan > 0.0 && scale >= 2.0) {
    float fy = fract(u.y * gsize.y);
    col *= 1.0 - scan * smoothstep(0.55, 1.0, abs(fy - 0.5) * 2.0);
  }
  if (vig > 0.0) { vec2 v = u - 0.5; col *= 1.0 - vig * dot(v, v) * 2.2; }
  o = vec4(col, 1.0);
}`;

export class Renderer {
  readonly gameCanvas: Canvas = makeCanvas(GW, GH);
  readonly hudCanvas: Canvas = makeCanvas(GW, GH);
  readonly game = ctx2d(this.gameCanvas);
  readonly hud = ctx2d(this.hudCanvas);
  private display!: HTMLCanvasElement;
  private overlayCanvas!: HTMLCanvasElement;
  overlay!: CanvasRenderingContext2D;
  private gl: WebGL2RenderingContext | null = null;
  private d2: CanvasRenderingContext2D | null = null;
  vp = { x: 0, y: 0, w: GW, h: GH, scale: 1 };
  dpr = 1;
  devW = GW;
  devH = GH;
  portrait = false;
  settings: VideoSettings = { scaleMode: 'integer', scaleFilter: 'sharp', crt: 'light', scanline: 15, bloom: 55, quality: 'auto' };
  lowQuality = false;
  waves: Wave[] = [];
  chroma = 0;
  haze = 0;
  time = 0;
  bgDim = 0;
  private progs: Record<string, WebGLProgram> = {};
  private texGame: WebGLTexture | null = null;
  private texHud: WebGLTexture | null = null;
  private fbos: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }[] = [];
  private vao: WebGLVertexArrayObject | null = null;
  private waveData = new Float32Array(16);
  glOk = false;

  init(root: HTMLElement): void {
    this.display = document.createElement('canvas');
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.id = 'overlay';
    root.appendChild(this.display);
    root.appendChild(this.overlayCanvas);
    this.overlay = this.overlayCanvas.getContext('2d')!;
    this.initGL();
    if (!this.gl) {
      this.d2 = this.display.getContext('2d')!;
    }
    this.display.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.gl = null; this.glOk = false; });
    this.display.addEventListener('webglcontextrestored', () => { this.initGL(); });
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 100));
    this.layout();
  }

  private initGL(): void {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = this.display.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    } catch { gl = null; }
    if (!gl) return;
    try {
      const mk = (fs: string) => {
        const p = gl.createProgram()!;
        for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
          const s = gl.createShader(type)!;
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
          gl.attachShader(p, s);
        }
        gl.bindAttribLocation(p, 0, 'p');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
        return p;
      };
      this.progs = { bright: mk(FS_BRIGHT), down: mk(FS_DOWN), blur: mk(FS_BLUR), final: mk(FS_FINAL) };
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const tex = (w: number, h: number, filter: number) => {
        const t = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.texGame = tex(GW, GH, gl.NEAREST);
      this.texHud = tex(GW, GH, gl.NEAREST);
      this.fbos = [];
      for (const [w, h] of [[240, 135], [120, 68], [120, 68]] as const) {
        const t = tex(w, h, gl.LINEAR);
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        this.fbos.push({ fb, tex: t, w, h });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.gl = gl;
      this.glOk = true;
    } catch (err) {
      console.warn('WebGL2 post-process disabled:', err);
      this.gl = null;
      this.glOk = false;
    }
  }

  layout(): void {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
    this.devW = devW; this.devH = devH;
    for (const c of [this.display, this.overlayCanvas]) {
      c.width = devW; c.height = devH;
      c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
      c.style.left = '0px'; c.style.top = '0px';
    }
    this.portrait = cssH > cssW * 1.05;
    const availH = this.portrait ? Math.min(devH * 0.55, devW * (GH / GW)) : devH;
    let s: number;
    const mode = this.settings.scaleMode;
    if (mode === 'stretch' && !this.portrait) {
      this.vp = { x: 0, y: 0, w: devW, h: devH, scale: Math.min(devW / GW, devH / GH) };
    } else {
      const fit = Math.min(devW / GW, availH / GH);
      s = mode === 'integer' && fit >= 1 ? Math.floor(fit) : fit;
      const w = Math.round(GW * s), h = Math.round(GH * s);
      const top = this.portrait ? Math.round(Math.max(8 * dpr, (devH * 0.06))) : Math.round((devH - h) / 2);
      this.vp = { x: Math.round((devW - w) / 2), y: top, w, h, scale: s };
    }
    input.layout = {
      left: this.vp.x / dpr, top: this.vp.y / dpr, width: this.vp.w / dpr, height: this.vp.h / dpr,
      cssW, cssH, portrait: this.portrait, padTop: (this.vp.y + this.vp.h) / dpr,
    };
    this.layoutTouchButtons(cssW, cssH);
  }

  layoutTouchButtons(cssW: number, cssH: number): void {
    const L = input.layout;
    const left = input.touchLeftHanded;
    const [drive, form, pause] = input.buttons;
    if (this.portrait) {
      const y = cssH - 70;
      drive!.cx = left ? 70 : cssW - 70; drive!.cy = y;
      form!.cx = left ? 160 : cssW - 160; form!.cy = y + 10;
    } else {
      const bottom = Math.min(cssH, L.top + L.height);
      drive!.cx = left ? 64 : cssW - 64; drive!.cy = bottom - 64;
      form!.cx = left ? 150 : cssW - 150; form!.cy = bottom - 40;
    }
    drive!.r = 36; form!.r = 26;
    pause!.cx = left ? 34 : cssW - 34; pause!.cy = Math.max(30, L.top + 30); pause!.r = 20;
  }

  addWave(x: number, y: number, max: number, life: number, strength: number): void {
    if (this.waves.length >= 4) this.waves.shift();
    this.waves.push({ x, y, r: 0, max, life, age: 0, strength });
  }

  stepEffects(): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.age++;
      w.r = (w.age / w.life) * w.max;
      if (w.age >= w.life) this.waves.splice(i, 1);
    }
    if (this.chroma > 0) this.chroma = Math.max(0, this.chroma - 0.05);
  }

  beginFrame(): void {
    const o = this.overlay;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.devW, this.devH);
    this.hud.clearRect(0, 0, GW, GH);
  }

  /** Fade the overlay text drawn so far (used when a modal scene dims the scene below it). */
  fadeText(amount: number): void {
    const o = this.overlay;
    o.save();
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'destination-out';
    o.fillStyle = `rgba(0,0,0,${amount})`;
    o.fillRect(0, 0, this.devW, this.devH);
    o.restore();
  }

  present(): void {
    this.time += 1 / 60;
    const gl = this.gl;
    if (gl && this.glOk) {
      const low = this.lowQuality || this.settings.quality === 'low';
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texGame);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this.settings.scaleFilter === 'soft' ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.settings.scaleFilter === 'soft' ? gl.LINEAR : gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.gameCanvas);
      gl.bindTexture(gl.TEXTURE_2D, this.texHud);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.hudCanvas);
      const bloomOn = this.settings.bloom > 0 && !low;
      const [fBright, fA, fB] = this.fbos as [typeof this.fbos[0], typeof this.fbos[0], typeof this.fbos[0]];
      if (bloomOn) {
        this.pass('bright', fBright, this.texGame!, (p) => gl.uniform2f(gl.getUniformLocation(p, 'texel'), 1 / GW, 1 / GH));
        this.pass('down', fA, fBright.tex, (p) => gl.uniform2f(gl.getUniformLocation(p, 'texel'), 1 / 240, 1 / 135));
        for (let k = 0; k < 2; k++) {
          this.pass('blur', fB, fA.tex, (p) => gl.uniform2f(gl.getUniformLocation(p, 'dir'), 1 / 120, 0));
          this.pass('blur', fA, fB.tex, (p) => gl.uniform2f(gl.getUniformLocation(p, 'dir'), 0, 1 / 68));
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.devW, this.devH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(this.vp.x, this.devH - this.vp.y - this.vp.h, this.vp.w, this.vp.h);
      const p = this.progs.final!;
      gl.useProgram(p);
      const U = (n: string) => gl.getUniformLocation(p, n);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texGame); gl.uniform1i(U('game'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texHud); gl.uniform1i(U('hud'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fA.tex); gl.uniform1i(U('bloom'), 2);
      gl.uniform2f(U('gsize'), GW, GH);
      gl.uniform1f(U('scale'), this.vp.scale);
      gl.uniform1f(U('bloomK'), bloomOn ? (this.settings.bloom / 100) * 1.1 : 0);
      const crt = this.settings.crt;
      gl.uniform1f(U('scan'), crt === 'off' || low ? 0 : (this.settings.scanline / 100) * (crt === 'strong' ? 1.6 : 1));
      gl.uniform1f(U('vig'), crt === 'off' ? 0 : crt === 'strong' ? 0.28 : 0.15);
      gl.uniform1f(U('curve'), crt === 'strong' ? 0.035 : 0);
      gl.uniform1f(U('chroma'), this.chroma);
      gl.uniform1f(U('soft'), this.settings.scaleFilter === 'soft' ? 1 : 0);
      gl.uniform1f(U('haze'), this.haze);
      gl.uniform1f(U('time'), this.time);
      this.waveData.fill(0);
      this.waves.forEach((w, i) => {
        const fade = 1 - w.age / w.life;
        this.waveData[i * 4] = w.x / GW; this.waveData[i * 4 + 1] = w.y / GH;
        this.waveData[i * 4 + 2] = w.r / GH; this.waveData[i * 4 + 3] = w.strength * fade;
      });
      gl.uniform4fv(U('waves'), this.waveData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      if (!this.d2) return;
      const g = this.d2;
      g.imageSmoothingEnabled = this.settings.scaleFilter === 'soft';
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.devW, this.devH);
      g.drawImage(this.gameCanvas, this.vp.x, this.vp.y, this.vp.w, this.vp.h);
      g.imageSmoothingEnabled = false;
      g.drawImage(this.hudCanvas, this.vp.x, this.vp.y, this.vp.w, this.vp.h);
    }
  }

  private pass(name: string, target: { fb: WebGLFramebuffer; w: number; h: number }, src: WebGLTexture, setup: (p: WebGLProgram) => void): void {
    const gl = this.gl!;
    const p = this.progs[name]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(p, 't'), 0);
    setup(p);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- overlay (hi-res) text in game coordinates -------------------------------------------
  private gameTransform(): void {
    const s = this.vp.w / GW, sy = this.vp.h / GH;
    this.overlay.setTransform(s, 0, 0, sy, this.vp.x, this.vp.y);
  }

  text(str: string, x: number, y: number, o: { size?: number; color?: PalKey | string; align?: CanvasTextAlign; alpha?: number; shadow?: boolean; maxW?: number; baseline?: CanvasTextBaseline } = {}): void {
    const g = this.overlay;
    this.gameTransform();
    const size = o.size ?? 8;
    g.font = `${size}px "DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
    g.textAlign = o.align ?? 'left';
    g.textBaseline = o.baseline ?? 'top';
    g.globalAlpha = o.alpha ?? 1;
    const color = o.color ? (o.color.startsWith('#') || o.color.startsWith('rgb') ? o.color : PAL[o.color as PalKey]) : PAL.N8;
    if (o.shadow !== false) {
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.fillText(str, x + size / 12 + 0.4, y + size / 12 + 0.4, o.maxW);
    }
    g.fillStyle = color;
    g.fillText(str, x, y, o.maxW);
    g.globalAlpha = 1;
  }

  /** Word-wrapped text; returns the height used. */
  textWrap(str: string, x: number, y: number, maxW: number, o: { size?: number; color?: PalKey | string; lineH?: number; align?: CanvasTextAlign; alpha?: number } = {}): number {
    const g = this.overlay;
    this.gameTransform();
    const size = o.size ?? 8;
    g.font = `${size}px "DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
    const lines: string[] = [];
    for (const para of str.split('\n')) {
      let line = '';
      const tokens = /[　-鿿＀-￯]/.test(para) ? [...para] : para.split(/(\s+)/);
      for (const tk of tokens) {
        const test = line + tk;
        if (g.measureText(test).width > maxW && line) { lines.push(line); line = tk.trimStart(); } else line = test;
      }
      lines.push(line);
    }
    const lh = o.lineH ?? size * 1.4;
    lines.forEach((l, i) => this.text(l, x, y + i * lh, { size, color: o.color, align: o.align, alpha: o.alpha }));
    return lines.length * lh;
  }

  /** Draw in CSS-pixel space on the overlay (touch controls). */
  cssTransform(): void {
    this.overlay.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        try { await (screen.orientation as unknown as { lock(o: string): Promise<void> }).lock('landscape'); } catch { /* not supported */ }
      } else await document.exitFullscreen();
    } catch { /* not supported */ }
  }
}

export const renderer = new Renderer();

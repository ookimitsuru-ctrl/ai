// Input: physical keys / pad buttons / touch → logical actions, sampled once per logic frame.

export const ACTIONS = [
  'up', 'down', 'left', 'right', 'shot', 'drive', 'speedUp', 'speedDown', 'formation', 'pause', 'confirm', 'cancel',
] as const;
export type Action = (typeof ACTIONS)[number];
export const ACT: Record<Action, number> = Object.fromEntries(ACTIONS.map((a, i) => [a, i])) as Record<Action, number>;
const N = ACTIONS.length;

export type KeyBindings = Record<Action, [string | null, string | null]>;
export type PadBindings = Record<Action, number[]>;

export const DEFAULT_KEYS: KeyBindings = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  shot: ['KeyZ', 'KeyJ'],
  drive: ['KeyX', 'KeyK'],
  speedUp: ['KeyC', 'KeyL'],
  speedDown: ['Shift+KeyC', 'Shift+KeyL'],
  formation: ['KeyV', 'KeyI'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space'],
  cancel: ['Escape', 'Backspace'],
};

export const DEFAULT_PAD: PadBindings = {
  up: [12], down: [13], left: [14], right: [15],
  shot: [0], drive: [1], formation: [2], speedUp: [3, 5], speedDown: [4],
  pause: [9], confirm: [0], cancel: [1],
};

interface KeyEv { code: string; shift: boolean; key: string }

export interface PointerState {
  x: number; y: number; // game coords
  moved: boolean; clicked: boolean; down: boolean; active: boolean;
}

export interface TouchButton { id: 'drive' | 'form' | 'pause'; cx: number; cy: number; r: number; pressed: boolean; held: boolean; pid: number }

/** Maps CSS pixels on screen to game pixels; provided by the renderer. */
export interface ScreenLayout { left: number; top: number; width: number; height: number; cssW: number; cssH: number; portrait: boolean; padTop: number }

export class Input {
  held = new Uint8Array(N);
  pressed = new Uint8Array(N);
  released = new Uint8Array(N);
  private prevHeld = new Uint8Array(N);
  private holdFrames = new Uint16Array(N);
  private queuedPress = new Uint8Array(N);

  keys: KeyBindings = structuredClone(DEFAULT_KEYS);
  pad: PadBindings = structuredClone(DEFAULT_PAD);
  analogMove = false;

  private keysDown = new Set<string>();
  private shiftDown = false;
  private keyQueue: KeyEv[] = [];
  private shiftCodes = new Set<string>();
  private boundCodes = new Set<string>();

  /** When set, the next key/button press is delivered here instead of actions (key config). */
  captureKey: ((code: string) => void) | null = null;
  capturePad: ((button: number) => void) | null = null;
  typed: string[] = [];
  anyPressed = false;
  lastDevice: 'keyboard' | 'pad' | 'touch' | 'mouse' = 'keyboard';

  padConnected = false;
  padId = '';
  private prevPadButtons: boolean[] = [];
  analogX = 0;
  analogY = 0;

  pointer: PointerState = { x: 0, y: 0, moved: false, clicked: false, down: false, active: false };
  private pointerClickQueued = false;
  private pointerMovedQueued = false;

  // touch (game mode)
  touchMode: 'menu' | 'game' = 'menu';
  touchActive = false; // a touch has been used recently → touch UI visible
  touchDx = 0;
  touchDy = 0;
  touchFinger = false;
  touchSensitivity = 1.3;
  touchAlwaysFire = false;
  touchLeftHanded = false;
  buttons: TouchButton[] = [
    { id: 'drive', cx: 0, cy: 0, r: 36, pressed: false, held: false, pid: -1 },
    { id: 'form', cx: 0, cy: 0, r: 26, pressed: false, held: false, pid: -1 },
    { id: 'pause', cx: 0, cy: 0, r: 20, pressed: false, held: false, pid: -1 },
  ];
  private dragPid = -1;
  private dragLastX = 0;
  private dragLastY = 0;
  private accDx = 0;
  private accDy = 0;
  private queuedBtn = { drive: false, form: false, pause: false };
  layout: ScreenLayout = { left: 0, top: 0, width: 480, height: 270, cssW: 480, cssH: 270, portrait: false, padTop: 270 };
  dragIndicator = { on: false, x: 0, y: 0 };

  attach(el: HTMLElement): void {
    this.rebuildBindingCache();
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code.startsWith('Shift')) this.shiftDown = true;
      if (this.boundCodes.has(e.code) || e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab' || e.code === 'Backspace') e.preventDefault();
      this.lastDevice = 'keyboard';
      if (e.repeat) return;
      this.keysDown.add(e.code);
      this.keyQueue.push({ code: e.code, shift: e.shiftKey, key: e.key });
    });
    window.addEventListener('keyup', (e) => {
      if (e.code.startsWith('Shift')) this.shiftDown = false;
      this.keysDown.delete(e.code);
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    window.addEventListener('gamepadconnected', (e) => { this.padConnected = true; this.padId = (e as GamepadEvent).gamepad.id; });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = this.findPad() !== null; });

    el.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    el.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    el.addEventListener('pointerup', (e) => this.onPointerUp(e), { passive: false });
    el.addEventListener('pointercancel', (e) => this.onPointerUp(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseAll(): void {
    this.keysDown.clear();
    this.shiftDown = false;
    this.dragPid = -1;
    this.touchFinger = false;
    for (const b of this.buttons) { b.held = false; b.pid = -1; }
  }

  rebuildBindingCache(): void {
    this.shiftCodes.clear();
    this.boundCodes.clear();
    for (const a of ACTIONS) {
      for (const b of this.keys[a]) {
        if (!b) continue;
        if (b.startsWith('Shift+')) { this.shiftCodes.add(b.slice(6)); this.boundCodes.add(b.slice(6)); } else this.boundCodes.add(b);
      }
    }
  }

  private toGame(clientX: number, clientY: number): [number, number] {
    const L = this.layout;
    return [((clientX - L.left) / L.width) * 480, ((clientY - L.top) / L.height) * 270];
  }

  private hitButton(cx: number, cy: number): TouchButton | null {
    if (this.touchMode !== 'game') return null;
    for (const b of this.buttons) {
      const dx = cx - b.cx, dy = cy - b.cy;
      if (dx * dx + dy * dy <= (b.r + 8) * (b.r + 8)) return b;
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    const [gx, gy] = this.toGame(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') {
      this.lastDevice = 'mouse';
      this.pointer.x = gx; this.pointer.y = gy; this.pointer.down = true; this.pointer.active = true;
      this.pointerClickQueued = true;
      this.keyQueue.push({ code: '__pointer', shift: false, key: '' });
      return;
    }
    this.lastDevice = 'touch';
    this.touchActive = true;
    if (this.touchMode === 'menu') {
      this.pointer.x = gx; this.pointer.y = gy; this.pointer.active = true; this.pointer.down = true;
      this.pointerClickQueued = true;
      this.keyQueue.push({ code: '__pointer', shift: false, key: '' });
      return;
    }
    const btn = this.hitButton(e.clientX, e.clientY);
    if (btn) {
      btn.held = true; btn.pid = e.pointerId;
      this.queuedBtn[btn.id] = true;
      return;
    }
    if (this.dragPid === -1) {
      this.dragPid = e.pointerId;
      this.dragLastX = e.clientX; this.dragLastY = e.clientY;
      this.touchFinger = true;
      this.dragIndicator.on = true; this.dragIndicator.x = e.clientX; this.dragIndicator.y = e.clientY;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      const [gx, gy] = this.toGame(e.clientX, e.clientY);
      if (Math.abs(gx - this.pointer.x) + Math.abs(gy - this.pointer.y) > 0.5) this.pointerMovedQueued = true;
      this.pointer.x = gx; this.pointer.y = gy; this.pointer.active = true;
      return;
    }
    if (e.pointerId === this.dragPid) {
      e.preventDefault();
      const s = 480 / this.layout.width; // css px → game px
      this.accDx += (e.clientX - this.dragLastX) * s * this.touchSensitivity;
      this.accDy += (e.clientY - this.dragLastY) * s * this.touchSensitivity;
      this.dragLastX = e.clientX; this.dragLastY = e.clientY;
      this.dragIndicator.x = e.clientX; this.dragIndicator.y = e.clientY;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') { this.pointer.down = false; return; }
    this.pointer.down = false;
    if (e.pointerId === this.dragPid) { this.dragPid = -1; this.touchFinger = false; this.dragIndicator.on = false; }
    for (const b of this.buttons) if (b.pid === e.pointerId) { b.held = false; b.pid = -1; }
  }

  findPad(): Gamepad | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  private matchesEvent(binding: string | null, ev: KeyEv): boolean {
    if (!binding) return false;
    if (binding.startsWith('Shift+')) return ev.shift && ev.code === binding.slice(6);
    return ev.code === binding && !(ev.shift && this.shiftCodes.has(ev.code));
  }

  private isHeld(binding: string | null): boolean {
    if (!binding) return false;
    if (binding.startsWith('Shift+')) return this.shiftDown && this.keysDown.has(binding.slice(6));
    return this.keysDown.has(binding) && !(this.shiftDown && this.shiftCodes.has(binding));
  }

  /** Sample all devices. Call exactly once per logic frame. */
  poll(): void {
    this.queuedPress.fill(0);
    this.typed.length = 0;
    this.anyPressed = false;
    for (const ev of this.keyQueue) {
      this.anyPressed = true;
      if (ev.code === '__pointer') continue;
      if (this.captureKey) { const cb = this.captureKey; this.captureKey = null; cb(ev.shift && !ev.code.startsWith('Shift') ? 'Shift+' + ev.code : ev.code); continue; }
      if (ev.key.length === 1) this.typed.push(ev.key);
      else if (ev.key === 'Backspace') this.typed.push('\b');
      else if (ev.key === 'Enter') this.typed.push('\n');
      for (let i = 0; i < N; i++) {
        const b = this.keys[ACTIONS[i]!];
        if (this.matchesEvent(b[0], ev) || this.matchesEvent(b[1], ev)) this.queuedPress[i] = 1;
      }
    }
    this.keyQueue.length = 0;

    const h = this.held;
    for (let i = 0; i < N; i++) {
      const b = this.keys[ACTIONS[i]!];
      h[i] = this.isHeld(b[0]) || this.isHeld(b[1]) ? 1 : 0;
    }

    // gamepad
    const pad = this.findPad();
    this.padConnected = pad !== null;
    this.analogX = 0; this.analogY = 0;
    if (pad) {
      this.padId = pad.id;
      const btns = pad.buttons;
      let anyBtn = false;
      for (let bi = 0; bi < btns.length; bi++) {
        const down = !!btns[bi]?.pressed;
        const was = this.prevPadButtons[bi] ?? false;
        if (down && !was) {
          anyBtn = true;
          this.anyPressed = true;
          if (this.capturePad) { const cb = this.capturePad; this.capturePad = null; cb(bi); continue; }
          for (let i = 0; i < N; i++) if (this.pad[ACTIONS[i]!].includes(bi)) this.queuedPress[i] = 1;
        }
        if (down) for (let i = 0; i < N; i++) if (this.pad[ACTIONS[i]!].includes(bi)) h[i] = 1;
        this.prevPadButtons[bi] = down;
      }
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      const DZ = 0.35;
      if (Math.abs(ax) > DZ || Math.abs(ay) > DZ) {
        anyBtn = true;
        if (ax < -DZ) h[ACT.left] = 1;
        if (ax > DZ) h[ACT.right] = 1;
        if (ay < -DZ) h[ACT.up] = 1;
        if (ay > DZ) h[ACT.down] = 1;
        this.analogX = Math.abs(ax) > DZ ? ax : 0;
        this.analogY = Math.abs(ay) > DZ ? ay : 0;
      }
      if (anyBtn) this.lastDevice = 'pad';
    }

    // touch buttons & drag
    for (const b of this.buttons) {
      b.pressed = this.queuedBtn[b.id];
      this.queuedBtn[b.id] = false;
    }
    if (this.touchMode === 'game') {
      if (this.buttons[0]!.pressed) this.queuedPress[ACT.drive] = 1;
      if (this.buttons[1]!.pressed) this.queuedPress[ACT.formation] = 1;
      if (this.buttons[2]!.pressed) this.queuedPress[ACT.pause] = 1;
      if (this.touchActive && (this.touchFinger || this.touchAlwaysFire)) h[ACT.shot] = 1;
    }
    this.touchDx = this.accDx; this.touchDy = this.accDy;
    this.accDx = 0; this.accDy = 0;

    // pointer
    this.pointer.clicked = this.pointerClickQueued;
    this.pointer.moved = this.pointerMovedQueued;
    this.pointerClickQueued = false;
    this.pointerMovedQueued = false;

    for (let i = 0; i < N; i++) {
      const p = this.queuedPress[i] || (h[i] && !this.prevHeld[i]) ? 1 : 0;
      this.pressed[i] = p;
      this.released[i] = this.prevHeld[i] && !h[i] ? 1 : 0;
      this.holdFrames[i] = h[i] ? Math.min(65535, this.holdFrames[i]! + 1) : 0;
      this.prevHeld[i] = h[i]!;
    }
  }

  isHeld_(a: Action): boolean { return this.held[ACT[a]] === 1; }
  hit(a: Action): boolean { return this.pressed[ACT[a]] === 1; }
  /** Menu-style auto repeat: press, then after 24f every 6f. */
  repeat(a: Action): boolean {
    const i = ACT[a];
    if (this.pressed[i]) return true;
    const f = this.holdFrames[i]!;
    return f > 24 && (f - 24) % 6 === 0;
  }
  menuConfirm(): boolean { return this.hit('confirm') || this.hit('shot'); }
  menuCancel(): boolean { return this.hit('cancel') || this.hit('drive'); }

  /** Clear edge state (used after scene transitions so a press doesn't leak). */
  consume(): void {
    this.pressed.fill(0);
    this.pointer.clicked = false;
    this.anyPressed = false;
  }
}

export const input = new Input();

export function keyLabel(code: string | null): string {
  if (!code) return '---';
  let s = code;
  let prefix = '';
  if (s.startsWith('Shift+')) { prefix = 'SHIFT+'; s = s.slice(6); }
  if (s.startsWith('Key')) s = s.slice(3);
  else if (s.startsWith('Digit')) s = s.slice(5);
  else if (s.startsWith('Arrow')) s = ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' } as Record<string, string>)[s] ?? s;
  else if (s.startsWith('Numpad')) s = 'NUM' + s.slice(6);
  return (prefix + s).toUpperCase();
}

export function padLabel(b: number): string {
  const names: Record<number, string> = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'BACK', 9: 'START', 10: 'LS', 11: 'RS', 12: 'D↑', 13: 'D↓', 14: 'D←', 15: 'D→' };
  return names[b] ?? 'B' + b;
}

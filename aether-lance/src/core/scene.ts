// Scene stack with fade transitions (docs/02_tech.md §4.2).
import { input } from './input';

export interface Scene {
  readonly id?: string;
  /** Draw lower scenes too (pause overlay etc). */
  transparent?: boolean;
  enter?(): void;
  exit?(): void;
  /** Called when a scene above it is popped. */
  resume?(): void;
  update(): void;
  render(alpha: number): void;
  /** touch mode for this scene */
  touchMode?: 'menu' | 'game';
}

type Factory = () => Scene;

class SceneManager {
  stack: Scene[] = [];
  private fade = 0;        // 0..1 black overlay
  private fadeDir = 0;     // +1 fading out, -1 fading in
  private pending: (() => void) | null = null;
  fadeFrames = 20;
  frame = 0;

  get top(): Scene | undefined { return this.stack[this.stack.length - 1]; }
  get busy(): boolean { return this.fadeDir !== 0; }

  push(s: Scene): void {
    this.stack.push(s);
    s.enter?.();
    input.consume();
  }

  pop(): void {
    const s = this.stack.pop();
    s?.exit?.();
    this.top?.resume?.();
    input.consume();
  }

  replaceNow(s: Scene): void {
    while (this.stack.length) this.stack.pop()?.exit?.();
    this.push(s);
  }

  /** Fade out, swap the whole stack for the new scene, fade in. */
  goto(f: Factory, frames = 20): void {
    if (this.fadeDir === 1) return;
    this.fadeFrames = frames;
    this.fadeDir = 1;
    this.pending = () => this.replaceNow(f());
  }

  /** Fade transition then run arbitrary action. */
  transition(action: () => void, frames = 20): void {
    if (this.fadeDir === 1) return;
    this.fadeFrames = frames;
    this.fadeDir = 1;
    this.pending = action;
  }

  update(): void {
    this.frame++;
    const top = this.top;
    if (top) input.touchMode = top.touchMode ?? 'menu';
    if (this.fadeDir === 1) {
      this.fade = Math.min(1, this.fade + 1 / this.fadeFrames);
      if (this.fade >= 1) {
        const p = this.pending; this.pending = null;
        p?.();
        this.fadeDir = -1;
      }
      return;
    }
    if (this.fadeDir === -1) {
      this.fade = Math.max(0, this.fade - 1 / this.fadeFrames);
      if (this.fade <= 0) this.fadeDir = 0;
      // allow the new scene to animate while fading in, but swallow input
      input.consume();
    }
    top?.update();
  }

  render(alpha: number): void {
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start]!.transparent) start--;
    for (let i = Math.max(0, start); i < this.stack.length; i++) this.stack[i]!.render(alpha);
  }

  get fadeAlpha(): number { return this.fade; }
}

export const scenes = new SceneManager();

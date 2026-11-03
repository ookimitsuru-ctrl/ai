// Reusable vertical menu with keyboard / pad / mouse / touch support (docs/09_ui.md §2).
import { input } from '../core/input';
import { audio } from '../audio/engine';
import { font } from '../render/font';
import { PAL, rgba } from '../render/palette';
import { renderer } from '../render/renderer';

export interface MenuItem {
  label: string | (() => string);
  desc?: string | (() => string);
  value?: () => string;
  enabled?: () => boolean;
  action?: () => void;
  left?: () => void;
  right?: () => void;
  color?: string;
}

export class Menu {
  sel = 0;
  scroll = 0;
  constructor(public items: MenuItem[], public x = 240, public y = 120, public gap = 14, public align: 'center' | 'left' = 'center', public width = 200, public visible = 12) {}

  label(i: MenuItem): string { return typeof i.label === 'function' ? i.label() : i.label; }
  enabled(i: MenuItem): boolean { return i.enabled ? i.enabled() : true; }

  /** Returns 'cancel' if the user backed out. */
  update(): 'cancel' | null {
    const n = this.items.length;
    if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; audio.sfx('menu_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % n; audio.sfx('menu_move'); }
    const it = this.items[this.sel]!;
    if (input.repeat('left') && it.left) { it.left(); audio.sfx('menu_move'); }
    if (input.repeat('right') && it.right) { it.right(); audio.sfx('menu_move'); }
    // pointer
    const p = input.pointer;
    if (p.active && (p.moved || p.clicked)) {
      for (let k = 0; k < Math.min(n, this.visible); k++) {
        const i = k + this.scroll;
        const yy = this.y + k * this.gap;
        const x0 = this.align === 'center' ? this.x - this.width / 2 : this.x - 10;
        if (p.y >= yy - 3 && p.y < yy + this.gap - 3 && p.x >= x0 && p.x <= x0 + this.width + 20) {
          if (this.sel !== i) { this.sel = i; if (p.moved) audio.sfx('menu_move'); }
          if (p.clicked) {
            const item = this.items[i]!;
            if (item.right && !item.action) {
              // tap on value: left half decreases, right half increases
              if (p.x < this.x + this.width / 2 - 30 && item.left) item.left(); else item.right();
              audio.sfx('menu_move');
            } else this.activate();
            p.clicked = false;
          }
        }
      }
    }
    if (input.menuConfirm()) this.activate();
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + this.visible) this.scroll = this.sel - this.visible + 1;
    if (input.menuCancel()) { audio.sfx('menu_cancel'); return 'cancel'; }
    return null;
  }

  activate(): void {
    const it = this.items[this.sel]!;
    if (!this.enabled(it)) { audio.sfx('menu_cancel'); return; }
    if (it.action) { audio.sfx('menu_confirm'); it.action(); }
    else if (it.right) { it.right(); audio.sfx('menu_move'); }
  }

  draw(g: CanvasRenderingContext2D, frame: number, scale = 1): void {
    const f = font();
    for (let k = 0; k < Math.min(this.items.length, this.visible); k++) {
      const i = k + this.scroll;
      const it = this.items[i]!;
      const y = this.y + k * this.gap;
      const on = i === this.sel;
      const en = this.enabled(it);
      const col = !en ? 'N3' : on ? 'N8' : it.color ?? 'N5';
      const label = this.label(it);
      if (this.align === 'center') {
        const text = it.value ? `${label}  ${it.value()}` : label;
        f.draw(g, text, this.x, y, col, scale, 'center', on ? 'N0' : undefined);
        if (on) {
          const w = f.width(text, scale);
          drawCursor(g, this.x - w / 2 - 14, y + 1, frame);
        }
      } else {
        f.draw(g, label, this.x, y, col, scale, 'left', on ? 'N0' : undefined);
        if (it.value) f.draw(g, (it.left ? '◀ ' : '') + it.value() + (it.right ? ' ▶' : ''), this.x + this.width, y, on ? 'C4' : 'N6', scale, 'right');
        if (on) drawCursor(g, this.x - 14, y + 1, frame);
      }
    }
    if (this.items.length > this.visible) {
      if (this.scroll > 0) f.draw(g, '▲', this.x, this.y - 10, 'N5', 1, 'center');
      if (this.scroll + this.visible < this.items.length) f.draw(g, '▼', this.x, this.y + this.visible * this.gap, 'N5', 1, 'center');
    }
  }

  drawDesc(y = 236): void {
    const it = this.items[this.sel];
    if (!it?.desc) return;
    const d = typeof it.desc === 'function' ? it.desc() : it.desc;
    renderer.text(d, 240, y, { size: 8, align: 'center', color: 'N6' });
  }
}

export function drawCursor(g: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  const o = Math.round(Math.sin(frame * 0.15) * 1.5);
  g.fillStyle = PAL.N7; g.fillRect(Math.round(x + o), y + 2, 6, 2);
  g.fillStyle = PAL.C3; g.fillRect(Math.round(x + o) + 6, y + 2, 2, 2);
  g.fillStyle = PAL.N5; g.fillRect(Math.round(x + o) + 1, y + 1, 2, 1); g.fillRect(Math.round(x + o) + 1, y + 4, 3, 1);
  g.fillStyle = PAL.O5; g.fillRect(Math.round(x + o) - 2, y + 2, 2, 2);
}

export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 0.78): void {
  g.fillStyle = rgba('N0', a);
  g.fillRect(x, y, w, h);
  g.fillStyle = PAL.N3;
  g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = PAL.C2;
  g.fillRect(x + 2, y, 12, 1); g.fillRect(x + w - 14, y + h - 1, 12, 1);
}

/** Simple yes/no confirm modal state. */
export class Confirm {
  active = false;
  sel = 1;
  msg = '';
  private onYes: (() => void) | null = null;
  open(msg: string, onYes: () => void): void { this.active = true; this.sel = 1; this.msg = msg; this.onYes = onYes; }
  update(): void {
    if (!this.active) return;
    if (input.repeat('left') || input.repeat('right') || input.repeat('up') || input.repeat('down')) { this.sel = 1 - this.sel; audio.sfx('menu_move'); }
    const p = input.pointer;
    if (p.clicked && p.y > 140 && p.y < 160) { this.sel = p.x < 240 ? 0 : 1; this.choose(); return; }
    if (input.menuConfirm()) this.choose();
    else if (input.menuCancel()) { this.active = false; audio.sfx('menu_cancel'); }
  }
  private choose(): void {
    this.active = false;
    if (this.sel === 0) { audio.sfx('menu_confirm'); this.onYes?.(); } else audio.sfx('menu_cancel');
  }
  draw(g: CanvasRenderingContext2D, frame: number, yes: string, no: string): void {
    if (!this.active) return;
    panel(g, 110, 100, 260, 70, 0.92);
    renderer.text(this.msg, 240, 112, { size: 8, align: 'center' });
    const f = font();
    f.draw(g, yes, 200, 146, this.sel === 0 ? 'N8' : 'N5', 1, 'center');
    f.draw(g, no, 280, 146, this.sel === 1 ? 'N8' : 'N5', 1, 'center');
    drawCursor(g, (this.sel === 0 ? 200 - f.width(yes) / 2 : 280 - f.width(no) / 2) - 14, 147, frame);
  }
}

// Original bitmap fonts: 5×7 glyphs in a 6×8 cell (uppercase), and 3×5 digits for score popups.
import { makeCanvas, ctx2d, tinted, type Canvas } from './sprite';
import { PAL, type PalKey } from './palette';
import { pv } from '../core/pv';
import { HD } from '../core/hd';

// HD edition: the same API draws vector text (Rajdhani) sized to match the pixel font's cap height.
let measureCtx: CanvasRenderingContext2D | null = null;
function hdFont(cellH: number, scale: number): string {
  const px = (cellH >= 8 ? 10.4 : 7.4) * scale;
  return `${cellH >= 8 && scale >= 2 ? 700 : 600} ${px}px "Rajdhani", "Noto Sans", "Noto Sans Symbols 2", "Segoe UI Symbol", sans-serif`;
}

const G5: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ' ': '.....|.....|.....|.....|.....|.....|.....',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '.': '.....|.....|.....|.....|.....|.....|..#..',
  ',': '.....|.....|.....|.....|.....|..#..|.#...',
  ':': '.....|..#..|.....|.....|.....|..#..|.....',
  ';': '.....|..#..|.....|.....|.....|..#..|.#...',
  '-': '.....|.....|.....|.###.|.....|.....|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '[': '.###.|.#...|.#...|.#...|.#...|.#...|.###.',
  ']': '.###.|...#.|...#.|...#.|...#.|...#.|.###.',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
  '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  _: '.....|.....|.....|.....|.....|.....|#####',
  '#': '.#.#.|#####|.#.#.|.#.#.|.#.#.|#####|.#.#.',
  '&': '.##..|#..#.|.##..|.#...|#.#.#|#..#.|.##.#',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '×': '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
  '★': '..#..|..#..|#####|.###.|.#.#.|#...#|.....',
  '♥': '.....|.#.#.|#####|#####|.###.|..#..|.....',
  '◀': '...#.|..##.|.###.|####.|.###.|..##.|...#.',
  '▶': '.#...|.##..|.###.|.####|.###.|.##..|.#...',
  '▲': '.....|..#..|.###.|#####|.....|.....|.....',
  '▼': '.....|.....|.....|#####|.###.|..#..|.....',
  '■': '.....|#####|#####|#####|#####|#####|.....',
  '□': '.....|#####|#...#|#...#|#...#|#####|.....',
  '⬡': '..#..|.#.#.|#...#|#...#|#...#|.#.#.|..#..',
  '●': '.....|.###.|#####|#####|#####|.###.|.....',
  '○': '.....|.###.|#...#|#...#|#...#|.###.|.....',
  '↑': '..#..|.###.|#.#.#|..#..|..#..|..#..|..#..',
  '↓': '..#..|..#..|..#..|..#..|#.#.#|.###.|..#..',
  '←': '.....|.#...|#....|#####|#....|.#...|.....',
  '→': '.....|...#.|....#|#####|....#|...#.|.....',
  '♪': '..##.|..#.#|..#..|..#..|.##..|###..|.#...',
  '©': '.###.|#...#|#.#.#|#.#..|#.#.#|#...#|.###.',
};

const G3: Record<string, string> = {
  '0': '###|#.#|#.#|#.#|###', '1': '.#.|##.|.#.|.#.|###', '2': '###|..#|###|#..|###', '3': '###|..#|###|..#|###',
  '4': '#.#|#.#|###|..#|..#', '5': '###|#..|###|..#|###', '6': '###|#..|###|#.#|###', '7': '###|..#|..#|.#.|.#.',
  '8': '###|#.#|###|#.#|###', '9': '###|#.#|###|..#|###', '×': '...|#.#|.#.|#.#|...', '+': '...|.#.|###|.#.|...',
  ' ': '...|...|...|...|...',
};

export class BitmapFont {
  readonly cw: number;
  readonly ch: number;
  private index = new Map<string, number>();
  private atlas: Canvas;
  private tints = new Map<string, Canvas>();

  constructor(glyphs: Record<string, string>, gw: number, gh: number) {
    this.cw = gw + 1;
    this.ch = gh + 1;
    const keys = Object.keys(glyphs);
    this.atlas = makeCanvas(keys.length * this.cw, this.ch);
    const g = ctx2d(this.atlas);
    g.fillStyle = '#fff';
    keys.forEach((k, i) => {
      this.index.set(k, i);
      const rows = glyphs[k]!.split('|');
      rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(i * this.cw + x, y, 1, 1); });
    });
  }

  private sheet(color: string): Canvas {
    let c = this.tints.get(color);
    if (!c) { c = tinted(this.atlas, color); this.tints.set(color, c); }
    return c;
  }

  width(text: string, scale = 1): number {
    if (HD) {
      measureCtx ??= document.createElement('canvas').getContext('2d')!;
      measureCtx.font = hdFont(this.ch, scale);
      return measureCtx.measureText(text).width;
    }
    return text.length ? (text.length * this.cw - 1) * scale : 0;
  }

  draw(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: PalKey | string = 'N8', scale = 1, align: 'left' | 'center' | 'right' = 'left', shadow?: PalKey | string): void {
    if (pv.textless) return;
    if (HD) { this.drawHD(g, text, x, y, color, scale, align, shadow); return; }
    if (shadow) this.draw(g, text, x + scale, y + scale, shadow, scale, align);
    const hex = color.startsWith('#') || color.startsWith('rgb') ? color : PAL[color as PalKey];
    const sheet = this.sheet(hex);
    const w = this.width(text, scale);
    let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
    const cy = Math.round(y);
    for (const chRaw of text) {
      let ch = chRaw;
      let i = this.index.get(ch);
      if (i === undefined) { ch = ch.toUpperCase(); i = this.index.get(ch); }
      if (i !== undefined && ch !== ' ') g.drawImage(sheet, i * this.cw, 0, this.cw, this.ch, cx, cy, this.cw * scale, this.ch * scale);
      cx += this.cw * scale;
    }
  }

  private drawHD(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number, align: 'left' | 'center' | 'right', shadow?: string): void {
    const hex = color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl') ? color : PAL[color as PalKey];
    g.save();
    g.font = hdFont(this.ch, scale);
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    const base = y + (this.ch - 1) * scale; // the pixel glyphs sit on y .. y + cap height
    if (shadow) {
      g.fillStyle = shadow.startsWith('#') || shadow.startsWith('rgb') ? shadow : PAL[shadow as PalKey];
      g.globalAlpha *= 0.85;
      g.fillText(text, x + 0.6 * scale, base + 0.7 * scale);
      g.globalAlpha /= 0.85;
    }
    g.fillStyle = hex;
    g.fillText(text, x, base);
    g.restore();
  }
}

let _f5: BitmapFont | null = null;
let _f3: BitmapFont | null = null;
export function font(): BitmapFont { return (_f5 ??= new BitmapFont(G5, 5, 7)); }
export function smallFont(): BitmapFont { return (_f3 ??= new BitmapFont(G3, 3, 5)); }

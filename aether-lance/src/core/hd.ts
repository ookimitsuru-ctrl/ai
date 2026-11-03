// HD edition switch (build-time). `npm run build:hd` / `build:single:hd` set AL_EDITION=hd, which defines __HD__.
// The classic edition renders the 480×270 world 1:1 as pixel art; the HD edition renders the same world at RS×
// resolution with smooth, modern shading (sprites, terrain, backgrounds, effects, vector text).
declare const __HD__: boolean;

export const HD: boolean = typeof __HD__ !== 'undefined' && __HD__;

/** Render scale of the game / HUD canvases (1 = classic pixel art). Decided once at boot, before any art is built. */
export let RS = HD ? 3 : 1;
export function setRenderScale(s: number): void { RS = HD ? Math.max(2, Math.min(4, s)) : 1; }

/** Logical (game-pixel) size of a canvas that may have been built at RS×. */
export type ScaledCanvas = HTMLCanvasElement & { k?: number };
export const kOf = (c: ScaledCanvas): number => c.k ?? 1;
export const lw = (c: ScaledCanvas): number => c.width / kOf(c);
export const lh = (c: ScaledCanvas): number => c.height / kOf(c);

/** Snap a coordinate to the output pixel grid (whole game pixels in classic, 1/RS in HD). */
export const snap = (v: number): number => (RS === 1 ? Math.round(v) : Math.round(v * RS) / RS);

/** Draw a canvas at its logical size. */
export function blit(g: CanvasRenderingContext2D, c: ScaledCanvas, x: number, y: number): void {
  const k = kOf(c);
  if (k === 1) g.drawImage(c, x, y);
  else g.drawImage(c, x, y, c.width / k, c.height / k);
}

/** Font stacks: pixel font (classic) or Rajdhani + the system's Japanese sans (HD). */
export const TEXT_FONT = HD
  ? '"Rajdhani", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", sans-serif'
  : '"DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif';
export const TEXT_WEIGHT = HD ? '600 ' : '';

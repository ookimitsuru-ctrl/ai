// Low-level pixel drawing helpers (cached discs/rings, stamped lines).
import { makeCanvas, ctx2d, type Canvas } from './sprite';

const discCache = new Map<string, Canvas>();
export function disc(r: number, color: string): Canvas {
  const rr = Math.max(1, Math.round(r));
  const key = rr + color;
  let c = discCache.get(key);
  if (!c) {
    c = makeCanvas(rr * 2 + 1, rr * 2 + 1);
    const g = ctx2d(c);
    g.fillStyle = color;
    for (let y = -rr; y <= rr; y++) {
      const half = Math.floor(Math.sqrt(rr * rr - y * y + rr * 0.6));
      g.fillRect(rr - half, rr + y, half * 2 + 1, 1);
    }
    discCache.set(key, c);
  }
  return c;
}

export function drawDisc(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const c = disc(r, color);
  g.drawImage(c, Math.round(x) - (c.width >> 1), Math.round(y) - (c.height >> 1));
}

const ringCache = new Map<string, Canvas>();
export function drawRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 1): void {
  const rr = Math.max(1, Math.round(r));
  const key = rr + '|' + width + color;
  let c = ringCache.get(key);
  if (!c) {
    if (ringCache.size > 600) ringCache.clear();
    c = makeCanvas(rr * 2 + 3, rr * 2 + 3);
    const gg = ctx2d(c);
    gg.fillStyle = color;
    const o = rr + 1;
    for (let yy = -rr - 1; yy <= rr + 1; yy++) for (let xx = -rr - 1; xx <= rr + 1; xx++) {
      const d = Math.sqrt(xx * xx + yy * yy);
      if (d <= rr + 0.5 && d > rr - width + 0.5) gg.fillRect(o + xx, o + yy, 1, 1);
    }
    ringCache.set(key, c);
  }
  g.drawImage(c, Math.round(x) - (c.width >> 1), Math.round(y) - (c.height >> 1));
}

/** Pixel line made of w×w stamps (crisp at low resolution). */
export function stampLine(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number): void {
  const dx = x2 - x1, dy = y2 - y1;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const h = w / 2;
  for (let i = 0; i <= n; i++) {
    g.fillRect(Math.round(x1 + (dx * i) / n - h), Math.round(y1 + (dy * i) / n - h), w, w);
  }
}

/** Dashed pixel line (telegraphs). */
export function dashLine(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dash: number, offset: number, w = 1): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.ceil(len);
  for (let i = 0; i < n; i++) {
    if (((i + offset) % (dash * 2)) >= dash) continue;
    const t = i / len;
    g.fillRect(Math.round(x1 + dx * t - w / 2), Math.round(y1 + dy * t - w / 2), w, w);
  }
}

const glowCache = new Map<string, Canvas>();
/** Soft radial glow (for additive light). */
export function glowSprite(r: number, color: string): Canvas {
  const rr = Math.max(2, Math.round(r));
  const key = rr + color;
  let c = glowCache.get(key);
  if (!c) {
    c = makeCanvas(rr * 2, rr * 2);
    const g = ctx2d(c);
    const grd = g.createRadialGradient(rr, rr, 0, rr, rr, rr);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, rr * 2, rr * 2);
    glowCache.set(key, c);
  }
  return c;
}

export function drawGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  const c = glowSprite(r, color);
  const a = g.globalAlpha;
  g.globalAlpha = a * alpha;
  g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
  g.globalAlpha = a;
}

/** Jagged lightning polyline. */
export function lightningPts(x1: number, y1: number, x2: number, y2: number, segs: number, jag: number, rnd: () => number): number[] {
  const pts = [x1, y1];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const nx = -(y2 - y1), ny = x2 - x1;
    const l = Math.sqrt(nx * nx + ny * ny) || 1;
    const o = (rnd() - 0.5) * 2 * jag;
    pts.push(x1 + (x2 - x1) * t + (nx / l) * o, y1 + (y2 - y1) * t + (ny / l) * o);
  }
  pts.push(x2, y2);
  return pts;
}

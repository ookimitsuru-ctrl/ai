// Low-level pixel drawing helpers (cached discs/rings, stamped lines).
import { makeCanvas, ctx2d, type Canvas } from './sprite';
import { HD, RS } from '../core/hd';

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
  if (HD) {
    g.fillStyle = color;
    g.beginPath(); g.arc(x, y, Math.max(0.5, r + 0.3), 0, Math.PI * 2); g.fill();
    return;
  }
  const c = disc(r, color);
  g.drawImage(c, Math.round(x) - (c.width >> 1), Math.round(y) - (c.height >> 1));
}

const ringCache = new Map<string, Canvas>();
export function drawRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width = 1): void {
  if (HD) {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); g.arc(x, y, Math.max(0.5, r - width / 2 + 0.5), 0, Math.PI * 2); g.stroke();
    return;
  }
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
  if (HD) {
    // smooth round-capped stroke in the current fill colour
    g.strokeStyle = g.fillStyle; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.lineCap = 'butt';
    return;
  }
  const dx = x2 - x1, dy = y2 - y1;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const h = w / 2;
  for (let i = 0; i <= n; i++) {
    g.fillRect(Math.round(x1 + (dx * i) / n - h), Math.round(y1 + (dy * i) / n - h), w, w);
  }
}

/** Dashed pixel line (telegraphs). */
export function dashLine(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dash: number, offset: number, w = 1): void {
  if (HD) {
    g.strokeStyle = g.fillStyle; g.lineWidth = w * 0.8; g.lineCap = 'round';
    g.setLineDash([dash * 0.6, dash * 1.4]); g.lineDashOffset = -offset;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.setLineDash([]); g.lineCap = 'butt';
    return;
  }
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
    if (glowCache.size > 400) glowCache.clear();
    const k = HD ? RS : 1;
    c = makeCanvas(rr * 2 * k, rr * 2 * k);
    const g = ctx2d(c);
    const R = rr * k;
    const grd = g.createRadialGradient(R, R, 0, R, R, R);
    grd.addColorStop(0, color);
    if (HD) { grd.addColorStop(0.25, color); grd.addColorStop(0.5, fade(color, 0.35)); grd.addColorStop(0.75, fade(color, 0.1)); }
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, R * 2, R * 2);
    glowCache.set(key, c);
  }
  return c;
}

/** Same colour at a lower alpha (accepts #rrggbb, rgb(), rgba() and hsl()). */
function fade(color: string, a: number): string {
  if (color.startsWith('#') && color.length === 7) {
    const v = parseInt(color.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }
  const m = color.match(/^(rgb|hsl)a?\(([^)]+)\)$/);
  if (m) { const parts = m[2]!.split(',').slice(0, 3).join(','); return `${m[1]}a(${parts},${a})`; }
  return color;
}

export function drawGlow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  const c = glowSprite(r, color);
  const a = g.globalAlpha;
  g.globalAlpha = a * alpha;
  const rr = Math.max(2, Math.round(r));
  if (HD) g.drawImage(c, x - rr, y - rr, rr * 2, rr * 2);
  else g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2));
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

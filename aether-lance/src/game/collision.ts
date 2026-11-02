// Shape intersection helpers (docs/02_tech.md §7).
import type { Shape } from './entities';

export function circleVsShape(cx: number, cy: number, r: number, ex: number, ey: number, s: Shape): boolean {
  const sx = ex + s.ox, sy = ey + s.oy;
  if (s.kind === 'circle') {
    const dx = cx - sx, dy = cy - sy, rr = r + s.r;
    return dx * dx + dy * dy <= rr * rr;
  }
  const hw = s.w / 2, hh = s.h / 2;
  const qx = Math.max(sx - hw, Math.min(cx, sx + hw)), qy = Math.max(sy - hh, Math.min(cy, sy + hh));
  const dx = cx - qx, dy = cy - qy;
  return dx * dx + dy * dy <= r * r;
}

export function boxVsShape(bx: number, by: number, bw: number, bh: number, ex: number, ey: number, s: Shape): boolean {
  const sx = ex + s.ox, sy = ey + s.oy;
  if (s.kind === 'circle') return circleVsShape(sx, sy, s.r, bx, by, { kind: 'box', w: bw, h: bh, ox: 0, oy: 0 });
  return Math.abs(bx - sx) * 2 <= bw + s.w && Math.abs(by - sy) * 2 <= bh + s.h;
}

/** Squared distance from point to segment. */
export function segDist2(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = x1 + t * dx - px, qy = y1 + t * dy - py;
  return qx * qx + qy * qy;
}

/** Capsule (segment with radius r) vs shape. */
export function segVsShape(x1: number, y1: number, x2: number, y2: number, r: number, ex: number, ey: number, s: Shape): boolean {
  const sx = ex + s.ox, sy = ey + s.oy;
  if (s.kind === 'circle') {
    const rr = r + s.r;
    return segDist2(sx, sy, x1, y1, x2, y2) <= rr * rr;
  }
  // sample along segment (shapes are small; 3px steps are exact enough)
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const n = Math.max(1, Math.ceil(len / 3));
  const hw = s.w / 2 + r, hh = s.h / 2 + r;
  for (let i = 0; i <= n; i++) {
    const px = x1 + (dx * i) / n, py = y1 + (dy * i) / n;
    if (Math.abs(px - sx) <= hw && Math.abs(py - sy) <= hh) return true;
  }
  return false;
}

export function shapeBounds(s: Shape): { w: number; h: number } {
  return s.kind === 'circle' ? { w: s.r * 2, h: s.r * 2 } : { w: s.w, h: s.h };
}

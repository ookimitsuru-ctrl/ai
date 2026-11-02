// Simple autopilot (attract demo + automated survival tests): potential-field dodging.
import { IB, type InputFrame } from './player';
import { segDist2 } from './collision';
import { dist2 } from '../core/dmath';
import type { World } from './world';

export function botInput(w: World): InputFrame {
  const p = w.player;
  let fx = 0, fy = 0;
  // preferred position
  let target: { x: number; y: number } | null = null;
  let best = 1e9;
  for (const e of w.enemies.items) {
    if (!e.active || e.dead || e.x < p.x + 20 || e.x > 470) continue;
    const d = Math.abs(e.y - p.y) + (e.x - p.x) * 0.3;
    if (d < best) { best = d; target = e; }
  }
  const tx = 110, ty = target ? target.y : 135;
  fx += (tx - p.x) * 0.02;
  fy += (ty - p.y) * 0.03;
  // bullets
  let danger = 0;
  for (const b of w.bullets.items) {
    if (!b.active || b.fade > 0) continue;
    const d2 = dist2(b.x + b.vx * 6, b.y + b.vy * 6, p.hitX, p.hitY);
    if (d2 > 70 * 70) continue;
    danger++;
    const d = Math.sqrt(d2) + 0.1;
    const k = 900 / (d * d);
    fx += ((p.hitX - b.x) / d) * k;
    fy += ((p.hitY - b.y) / d) * k * 1.4;
  }
  for (const e of w.enemies.items) {
    if (!e.active || e.dead) continue;
    const d2 = dist2(e.x, e.y, p.x, p.y);
    if (d2 > 60 * 60) continue;
    const d = Math.sqrt(d2) + 0.1;
    const k = 1400 / (d * d);
    fx += ((p.x - e.x) / d) * k; fy += ((p.y - e.y) / d) * k;
  }
  for (const h of w.hazards.items) {
    if (!h.active) continue;
    if (h.kind === 'bolt') { const dx = p.x - h.x; if (Math.abs(dx) < 30) fx += Math.sign(dx || 1) * 2; }
    else if (h.np >= 2) {
      for (let i = 0; i + 1 < h.np; i++) {
        const d2 = segDist2(p.x, p.y, h.pts[i * 2]!, h.pts[i * 2 + 1]!, h.pts[i * 2 + 2]!, h.pts[i * 2 + 3]!);
        if (d2 < 30 * 30) { fy += (p.y < 135 ? -1 : 1) * 2; }
      }
    } else if (h.w > 0) {
      if (p.x > h.x - 20 && p.x < h.x + h.w + 20 && p.y > h.y - 20 && p.y < h.y + h.h + 20) fx += p.x < h.x + h.w / 2 ? -2 : 2;
    }
  }
  // terrain
  const t = w.terrain;
  for (const [dx, dy] of [[0, -14], [0, 14], [14, 0], [10, -10], [10, 10], [24, 0], [24, -12], [24, 12]] as const) {
    if (t.solid(p.x + dx + w.camX, p.y + dy + w.camY)) { fx -= dx * 0.08; fy -= dy * 0.12; }
  }
  let bits = IB.SHOT;
  const th = 0.25;
  if (fx > th) bits |= IB.RIGHT; else if (fx < -th) bits |= IB.LEFT;
  if (fy > th) bits |= IB.DOWN; else if (fy < -th) bits |= IB.UP;
  if (p.drive >= 100 && danger > 6) bits |= IB.DRIVE;
  return { bits, tdx: 0, tdy: 0, ax: 0, ay: 0 };
}

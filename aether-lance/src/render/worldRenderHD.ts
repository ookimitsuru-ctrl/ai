// HD edition world effects: glowing energy shots, gradient exhaust, soft particles, beam-like hazards, bevelled
// breakable blocks and smooth moving walls. Everything else is inherited from the classic WorldView (whose sprites,
// terrain and backgrounds are already rendered in HD by their own modules).
import { PAL, type PalKey } from './palette';
import { makeCanvas, ctx2d, type Canvas } from './sprite';
import { drawGlow, lightningPts } from './draw';
import { fxRng } from '../core/rng';
import { RS } from '../core/hd';
import { WorldView } from './worldRender';
import { SHOT_PULSE, SHOT_FAN, SHOT_RAY, SHOT_BOMB, SHOT_SEEKER } from '../game/entities';

const L = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

function rgba(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/** Cached pre-rendered energy bolt: soft tail → bright head, pointing +x. Logical size (w + tail) × (h + 2·pad). */
const boltCache = new Map<string, { c: Canvas; w: number; h: number; ox: number }>();
function bolt(len: number, thick: number, core: string, edge: string, tail: number): { c: Canvas; w: number; h: number; ox: number } {
  const key = `${len}|${thick}|${core}|${edge}|${tail}`;
  let b = boltCache.get(key);
  if (b) return b;
  const pad = thick * 0.9 + 1;
  const W = len + tail + pad * 2, H = thick + pad * 2;
  const c = makeCanvas(Math.ceil(W * RS), Math.ceil(H * RS));
  const g = ctx2d(c);
  g.scale(RS, RS);
  const cy = H / 2, x0 = pad, x1 = pad + tail + len;
  // halo
  const halo = g.createLinearGradient(x0, 0, x1, 0);
  halo.addColorStop(0, rgba(edge, 0)); halo.addColorStop(0.6, rgba(edge, 0.1)); halo.addColorStop(1, rgba(edge, 0.24));
  g.fillStyle = halo;
  g.beginPath(); g.ellipse((x0 + x1) / 2 + tail * 0.2, cy, (x1 - x0) / 2 + pad * 0.4, thick / 2 + pad * 0.7, 0, 0, TAU); g.fill();
  // body: tapered capsule
  const body = g.createLinearGradient(x0, 0, x1, 0);
  body.addColorStop(0, rgba(edge, 0)); body.addColorStop(0.4, rgba(edge, 0.85)); body.addColorStop(0.85, rgba(core, 1)); body.addColorStop(1, '#ffffff');
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(x0, cy);
  g.quadraticCurveTo(x0 + tail * 0.6, cy - thick / 2, x1 - thick / 2, cy - thick / 2);
  g.arc(x1 - thick / 2, cy, thick / 2, -Math.PI / 2, Math.PI / 2);
  g.quadraticCurveTo(x0 + tail * 0.6, cy + thick / 2, x0, cy);
  g.fill();
  // white-hot core line
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = Math.max(0.5, thick * 0.35); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0 + tail * 0.7, cy); g.lineTo(x1 - thick * 0.4, cy); g.stroke();
  b = { c, w: W, h: H, ox: x1 - thick / 2 };
  boltCache.set(key, b);
  return b;
}

export class WorldViewHD extends WorldView {
  // ---- player shots ---------------------------------------------------------------------------------
  protected override drawShots(g: CanvasRenderingContext2D, a: number): void {
    const w = this.w;
    g.globalCompositeOperation = 'lighter';
    for (const s of w.shots.items) {
      if (!s.active) continue;
      const x = L(s.px, s.x, a), y = L(s.py, s.y, a);
      switch (s.kind) {
        case SHOT_PULSE: {
          const b = bolt(Math.max(4, s.w), Math.max(1.6, s.h * 0.8), s.gold ? PAL.Y4 : PAL.C5, s.gold ? PAL.Y2 : PAL.C2, s.drone ? 4 : 8);
          g.drawImage(b.c, x + s.w / 2 - b.ox, y - b.h / 2, b.w, b.h); // head on the shot's front edge
          break;
        }
        case SHOT_FAN: {
          const ang = Math.atan2(s.vy, s.vx);
          const sc = s.scale;
          const b = bolt(Math.max(3, 6 * sc), Math.max(1.4, 3 * sc), s.gold ? PAL.Y4 : PAL.G4, s.gold ? PAL.Y2 : PAL.G2, 5 * sc);
          g.save(); g.translate(x, y); g.rotate(ang);
          g.drawImage(b.c, -b.ox, -b.h / 2, b.w, b.h);
          g.restore();
          break;
        }
        case SHOT_RAY: {
          if (s.nt < 1) break;
          const wd = s.h;
          const pts = s.trail;
          const path = () => { g.beginPath(); g.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < s.nt; i++) g.lineTo(pts[i * 2]!, pts[i * 2 + 1]!); };
          g.lineCap = 'round'; g.lineJoin = 'round';
          path(); g.strokeStyle = rgba(s.gold ? PAL.Y2 : PAL.P2, 0.35); g.lineWidth = wd + 5; g.stroke();
          path(); g.strokeStyle = s.gold ? PAL.Y3 : PAL.C3; g.lineWidth = wd + 1.2; g.stroke();
          path(); g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.8, wd - 2.4); g.stroke();
          g.lineCap = 'butt';
          drawGlow(g, s.x, s.y, 7 + wd, s.gold ? PAL.Y3 : PAL.C4, 0.9);
          break;
        }
        case SHOT_BOMB: {
          g.globalCompositeOperation = 'source-over';
          const sh = g.createRadialGradient(x - 1, y - 1, 0.3, x, y, 3.4);
          sh.addColorStop(0, PAL.N5); sh.addColorStop(1, PAL.N1);
          g.fillStyle = sh; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
          g.globalCompositeOperation = 'lighter';
          drawGlow(g, x, y, 5, (s.age >> 2) % 2 ? PAL.O5 : PAL.O3, 0.9);
          break;
        }
        case SHOT_SEEKER: {
          const dx = Math.cos((s.angle * Math.PI) / 180), dy = Math.sin((s.angle * Math.PI) / 180);
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = PAL.N7; g.lineWidth = 2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - dx * 4, y - dy * 4); g.lineTo(x + dx * 3, y + dy * 3); g.stroke();
          g.lineCap = 'butt';
          g.globalCompositeOperation = 'lighter';
          drawGlow(g, x - dx * 5, y - dy * 5, 4, s.gold ? PAL.Y4 : PAL.O6, 1);
          break;
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- exhaust ------------------------------------------------------------------------------------------
  protected override drawFlame(g: CanvasRenderingContext2D, x: number, y: number, len: number): void {
    // blue ion exhaust
    const L0 = len + 3;
    const grd = g.createLinearGradient(x - L0, 0, x + 1, 0);
    grd.addColorStop(0, 'rgba(28,138,192,0)'); grd.addColorStop(0.35, 'rgba(51,183,232,0.55)');
    grd.addColorStop(0.75, 'rgba(127,224,255,0.95)'); grd.addColorStop(1, 'rgba(230,250,255,1)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x + 1, y - 1.6);
    g.bezierCurveTo(x - L0 * 0.4, y - 1.8, x - L0 * 0.8, y - 0.5, x - L0, y);
    g.bezierCurveTo(x - L0 * 0.8, y + 0.5, x - L0 * 0.4, y + 1.8, x + 1, y + 1.6);
    g.closePath(); g.fill();
    // inner core
    const core = g.createLinearGradient(x - L0 * 0.5, 0, x + 1, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(1, 'rgba(255,255,255,0.95)');
    g.fillStyle = core;
    g.beginPath(); g.ellipse(x - L0 * 0.22, y, L0 * 0.28, 0.7, 0, 0, TAU); g.fill();
    drawGlow(g, x - 1, y, 5, PAL.C3, 0.6);
  }

  // ---- particles ---------------------------------------------------------------------------------------
  protected override drawParticles(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const q of w.particles.items) {
      if (!q.active) continue;
      const t = q.life / q.max;
      g.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      switch (q.kind) {
        case 'spark': {
          g.strokeStyle = t > 0.6 ? q.color2 : q.color; g.lineWidth = 0.9; g.lineCap = 'round';
          g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 2.4, q.y - q.vy * 2.4); g.stroke();
          g.lineCap = 'butt';
          break;
        }
        case 'ember':
          if ((q.life >> 1) % 3 === 0) break;
          g.globalCompositeOperation = 'lighter';
          drawGlow(g, q.x, q.y, 2.2, t > 0.5 ? q.color : PAL.O3, 0.9);
          break;
        case 'smoke':
          drawGlow(g, q.x, q.y, q.size * 1.6, t > 0.7 ? PAL.N4 : q.color, 0.45 * t);
          break;
        case 'fire': {
          const k = 1 - t;
          const r = q.size * (0.6 + k * 0.8);
          const col = k < 0.15 ? PAL.N8 : k < 0.35 ? PAL.Y4 : k < 0.55 ? PAL.O5 : k < 0.8 ? PAL.O3 : PAL.N3;
          g.globalCompositeOperation = k < 0.8 ? 'lighter' : 'source-over';
          drawGlow(g, q.x, q.y, r * 1.5, col, k > 0.8 ? (1 - k) * 3 : 0.95);
          if (k < 0.5) drawGlow(g, q.x - r * 0.15, q.y - r * 0.15, r * 0.7, PAL.N8, 0.7 * (1 - k * 2));
          break;
        }
        case 'ring':
          g.globalAlpha = t;
          g.strokeStyle = q.color; g.lineWidth = (q.sw || 2) * (0.6 + t * 0.6);
          g.beginPath(); g.arc(q.x, q.y, Math.max(0.5, q.size), 0, TAU); g.stroke();
          if (q.add) { g.globalAlpha = t * 0.35; g.lineWidth = (q.sw || 2) * 3; g.stroke(); }
          g.globalAlpha = 1;
          break;
        case 'glow':
          drawGlow(g, q.x, q.y, q.size * (0.6 + t * 0.6), q.color, t);
          break;
        case 'flash':
          drawGlow(g, q.x, q.y, q.size * (1.6 - t * 0.4), q.color, t);
          break;
        case 'debris': {
          const s = Math.max(1.2, q.size);
          g.save(); g.translate(q.x, q.y); g.rotate(q.rot);
          if (q.src) g.drawImage(q.src, q.sx, q.sy, q.sw, q.sh, -s / 2, -s / 2, s, s);
          else {
            g.fillStyle = q.color; g.fillRect(-s / 2, -s / 2, s, s * 0.7);
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-s / 2, -s / 2, s, s * 0.2);
          }
          g.restore();
          break;
        }
        case 'shard': {
          const s = q.size, c = Math.cos(q.rot), sn = Math.sin(q.rot);
          g.fillStyle = q.color;
          g.beginPath(); g.moveTo(q.x - c * s, q.y - sn * s); g.lineTo(q.x - sn * 0.8, q.y + c * 0.8); g.lineTo(q.x + c * s, q.y + sn * s); g.lineTo(q.x + sn * 0.8, q.y - c * 0.8); g.closePath(); g.fill();
          break;
        }
        case 'drop':
          g.fillStyle = q.color;
          g.beginPath(); g.ellipse(q.x, q.y, q.size * 0.55, q.size * 0.8, 0, 0, TAU); g.fill();
          break;
        case 'trail': case 'line':
          g.globalAlpha = t;
          g.strokeStyle = q.color; g.lineWidth = Math.max(0.8, q.size); g.lineCap = 'round';
          g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x + q.vx * 6, q.y + q.vy * 6); g.stroke();
          g.lineCap = 'butt'; g.globalAlpha = 1;
          break;
        case 'leaf':
          g.fillStyle = q.color;
          g.beginPath(); g.ellipse(q.x, q.y, 1.4, 0.6, q.rot, 0, TAU); g.fill();
          break;
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- breakable blocks ------------------------------------------------------------------------------------
  protected override drawBreakables(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const b of w.terrain.breakables) {
      const x = b.x - w.camX, y = b.y - w.camY;
      if (x > 490 || x + b.w < -10 || y > 280 || y + b.h < -10) continue;
      const cry = b.style === 'crystal';
      const base: PalKey = cry ? 'P2' : 'F2', hi: PalKey = cry ? 'P4' : 'T3', lo: PalKey = cry ? 'P0' : 'F0';
      if (!b.alive) {
        if (b.regen > 0 && b.grow > 0) {
          const s = 0.4 + b.grow * 0.6;
          g.globalAlpha = 0.25 + b.grow * 0.5;
          g.fillStyle = PAL[base];
          this.round(g, x + (b.w * (1 - s)) / 2, y + (b.h * (1 - s)) / 2, b.w * s, b.h * s, 2); g.fill();
          g.globalAlpha = 1;
        }
        continue;
      }
      const grd = g.createLinearGradient(x, y, x + b.w * 0.4, y + b.h);
      grd.addColorStop(0, PAL[hi]); grd.addColorStop(0.25, PAL[base]); grd.addColorStop(1, PAL[lo]);
      g.fillStyle = b.flash > 0 ? PAL.N8 : grd;
      this.round(g, x + 0.3, y + 0.3, b.w - 0.6, b.h - 0.6, 2.2); g.fill();
      g.strokeStyle = rgba(PAL[lo], 0.9); g.lineWidth = 0.6; g.stroke();
      if (cry) {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba(PAL.C4, 0.5); g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(x + b.w * 0.2, y + b.h * 0.8); g.lineTo(x + b.w * 0.55, y + b.h * 0.2); g.lineTo(x + b.w * 0.85, y + b.h * 0.6); g.stroke();
        if ((w.frame + b.x) % 90 < 6) drawGlow(g, x + 3, y + 3, 4, PAL.C5, 0.9);
        g.globalCompositeOperation = 'source-over';
      }
      const dmg = 1 - b.hp / b.maxHp;
      if (dmg > 0.2) {
        g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 0.8; g.lineCap = 'round';
        const cx = x + b.w / 2, cy = y + b.h / 2;
        g.beginPath(); g.moveTo(cx - b.w * 0.3 * dmg, cy - 3); g.lineTo(cx, cy); g.lineTo(cx + 2, cy + 2);
        if (dmg > 0.5) { g.moveTo(cx + 1, cy - b.h * 0.3); g.lineTo(cx + b.w * 0.15, cy); g.lineTo(cx + b.w * 0.3, cy + 4); }
        g.stroke(); g.lineCap = 'butt';
      }
    }
  }

  private round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  // ---- moving walls ------------------------------------------------------------------------------------------
  protected override drawDynamic(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const d of w.terrain.dyn) {
      const sx0 = Math.max(-2, Math.floor(d.x0 - w.camX)), sx1 = Math.min(482, Math.ceil(d.x1 - w.camX));
      if (sx1 <= sx0) continue;
      if (d.kind === 'wave') {
        for (const floor of [true, false]) {
          const base = floor ? d.floorY : d.ceilY;
          if (base === undefined) continue;
          const yAt = (sx: number) => (floor ? base - w.terrain.waveOffset(d, sx + w.camX) : base + w.terrain.waveOffset(d, sx + w.camX)) - w.camY;
          g.beginPath();
          g.moveTo(sx0, floor ? 272 : -2);
          for (let sx = sx0; sx <= sx1; sx += 2) g.lineTo(sx, yAt(sx));
          g.lineTo(sx1, yAt(sx1)); g.lineTo(sx1, floor ? 272 : -2); g.closePath();
          const top = yAt((sx0 + sx1) / 2);
          const grd = g.createLinearGradient(0, top, 0, floor ? top + 40 : top - 40);
          grd.addColorStop(0, PAL.F3); grd.addColorStop(0.15, PAL.F2); grd.addColorStop(1, PAL.F0);
          g.fillStyle = grd; g.fill();
          // wet rim
          g.beginPath();
          for (let sx = sx0; sx <= sx1; sx += 2) { const yy = yAt(sx) + (floor ? 0.6 : -0.6); if (sx === sx0) g.moveTo(sx, yy); else g.lineTo(sx, yy); }
          g.strokeStyle = PAL.T3; g.lineWidth = 0.9; g.stroke();
        }
      } else {
        const x = d.x0 - w.camX, y = d.y! - w.camY, ww = d.x1 - d.x0, hh = d.h!;
        if (d.solid) {
          const grd = g.createLinearGradient(x, y, x + ww, y + hh);
          grd.addColorStop(0, PAL.C4); grd.addColorStop(0.5, PAL.C3); grd.addColorStop(1, PAL.C1);
          g.fillStyle = grd; this.round(g, x, y, ww, hh, 1.5); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.6; g.stroke();
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = rgba(PAL.C4, 0.25); this.round(g, x - 2, y - 2, ww + 4, hh + 4, 3); g.fill();
          g.globalCompositeOperation = 'source-over';
        } else {
          const gl = d.glow ?? 0;
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(gl > 0.5 ? PAL.C5 : PAL.C3, 0.3 + gl * 0.6); g.lineWidth = 0.8;
          this.round(g, x + 0.5, y + 0.5, ww - 1, hh - 1, 1.5); g.stroke();
          if (gl > 0) { g.fillStyle = rgba(PAL.C3, gl * 0.22); g.fill(); }
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
  }

  // ---- hazards -----------------------------------------------------------------------------------------------
  protected override drawHazards(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const poly = (pts: ArrayLike<number>, n: number) => { g.beginPath(); g.moveTo(pts[0]!, pts[1]!); for (let i = 1; i < n; i++) g.lineTo(pts[i * 2]!, pts[i * 2 + 1]!); };
    for (const h of w.hazards.items) {
      if (!h.active) continue;
      const tele = h.tele > 0;
      switch (h.kind) {
        case 'laser': {
          if (tele) { g.globalCompositeOperation = 'lighter'; drawGlow(g, h.pts[0]!, h.pts[1]!, 6 + ((w.frame >> 1) % 3) * 2, PAL.R3, 0.8); g.globalCompositeOperation = 'source-over'; break; }
          const wd = h.width * (h.dur < 6 ? h.dur / 6 : h.age < 4 ? (h.age + 1) / 5 : 1);
          g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
          poly(h.pts, h.np); g.strokeStyle = rgba(PAL.R1, 0.45); g.lineWidth = wd + 7; g.stroke();
          poly(h.pts, h.np); g.strokeStyle = PAL.R3; g.lineWidth = wd + 1; g.stroke();
          poly(h.pts, h.np); g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.8, wd / 2.5); g.stroke();
          drawGlow(g, h.pts[0]!, h.pts[1]!, wd + 8, PAL.R4, 0.9);
          g.globalCompositeOperation = 'source-over'; g.lineCap = 'butt';
          break;
        }
        case 'bolt': {
          if (tele) break;
          const pts = lightningPts(h.x + (fxRng.next() - 0.5) * 10, -10, h.x + (fxRng.next() - 0.5) * 8, 280, 14, 9, () => fxRng.next());
          g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round';
          poly(pts, pts.length / 2); g.strokeStyle = rgba(PAL.Y3, 0.35); g.lineWidth = 9; g.stroke();
          poly(pts, pts.length / 2); g.strokeStyle = PAL.Y4; g.lineWidth = 3; g.stroke();
          poly(pts, pts.length / 2); g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.stroke();
          drawGlow(g, h.x, 135, 50, PAL.Y4, 0.55);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'arc': {
          if (h.np < 2) break;
          const x1 = h.pts[0]!, y1 = h.pts[1]!, x2 = h.pts[2]!, y2 = h.pts[3]!;
          if (tele) { if ((w.frame >> 1) % 2) { g.strokeStyle = rgba(PAL.C4, 0.5); g.lineWidth = 0.7; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); } break; }
          const pts = lightningPts(x1, y1, x2, y2, Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 12)), 4, () => fxRng.next());
          g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round';
          poly(pts, pts.length / 2); g.strokeStyle = rgba(PAL.C3, 0.45); g.lineWidth = 5; g.stroke();
          poly(pts, pts.length / 2); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke();
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'flame': {
          g.globalCompositeOperation = 'lighter';
          if (tele) { for (let k = 0; k < 3; k++) drawGlow(g, h.x + (fxRng.next() - 0.5) * 6, h.y + (fxRng.next() - 0.5) * 6, 2.5, PAL.C4, 0.8); g.globalCompositeOperation = 'source-over'; break; }
          for (let k = 0; k < 16; k++) {
            const d = fxRng.next() * h.h, a2 = ((h.angle + (fxRng.next() - 0.5) * h.w) * Math.PI) / 180;
            const r = 3 + (d / h.h) * 7;
            drawGlow(g, h.x + Math.cos(a2) * d, h.y + Math.sin(a2) * d, r, d < h.h * 0.3 ? PAL.O6 : d < h.h * 0.7 ? PAL.O5 : PAL.O3, 0.8);
          }
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'column': case 'molten': {
          if (tele) {
            if (h.kind === 'molten') { g.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) drawGlow(g, h.x + fxRng.next() * h.w, h.y + fxRng.next() * 16, 2, PAL.O4, 0.9); g.globalCompositeOperation = 'source-over'; }
            break;
          }
          if (h.color === 1) {
            // organic tentacle column
            const grow = Math.min(1, h.age / 6);
            const top = h.y < 135;
            const len = h.h * grow;
            const y0 = top ? h.y : h.y + h.h - len;
            const grd = g.createLinearGradient(h.x, 0, h.x + h.w, 0);
            grd.addColorStop(0, PAL.F0); grd.addColorStop(0.35, PAL.F3); grd.addColorStop(0.6, PAL.F2); grd.addColorStop(1, PAL.F0);
            g.fillStyle = grd;
            this.round(g, h.x, y0 - (top ? 4 : 0), h.w, len + 4, h.w / 2); g.fill();
            g.fillStyle = PAL.T3;
            for (let yy = 4; yy < len; yy += 10) { g.beginPath(); g.arc(h.x + h.w / 2, y0 + yy, 1.1, 0, TAU); g.fill(); }
            break;
          }
          const molten = h.kind === 'molten';
          const grd = g.createLinearGradient(h.x, 0, h.x + h.w, 0);
          grd.addColorStop(0, molten ? 'rgba(163,58,20,0.85)' : PAL.R1); grd.addColorStop(0.5, molten ? PAL.O5 : PAL.R3); grd.addColorStop(1, molten ? 'rgba(163,58,20,0.85)' : PAL.R1);
          g.fillStyle = grd;
          g.fillRect(h.x, h.y, h.w, h.h);
          // flowing ripples
          g.globalCompositeOperation = 'lighter';
          g.strokeStyle = rgba(molten ? PAL.O6 : PAL.R4, 0.55); g.lineWidth = 1;
          for (let yy = 0; yy < h.h; yy += 7) {
            const yv = h.y + ((yy + w.frame * 4) % h.h);
            const off = Math.sin((yv + w.frame * 2) * 0.2) * h.w * 0.25;
            g.beginPath(); g.moveTo(h.x + h.w / 2 + off - 2, yv); g.lineTo(h.x + h.w / 2 + off + 2, yv + 4); g.stroke();
          }
          g.fillStyle = rgba(molten ? PAL.O6 : PAL.R4, 0.9); g.fillRect(h.x + h.w / 2 - 0.8, h.y, 1.6, h.h);
          drawGlow(g, h.x + h.w / 2, h.y + h.h - 4, h.w * 1.6, molten ? PAL.O4 : PAL.R3, 0.6);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'band':
          if (tele) break;
          g.fillStyle = rgba(PAL.R2, 0.45);
          g.fillRect(h.x, h.y, h.w, h.h);
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = rgba(PAL.R4, 0.5); g.fillRect(h.x, h.y, h.w, 0.8); g.fillRect(h.x, h.y + h.h - 0.8, h.w, 0.8);
          g.globalCompositeOperation = 'source-over';
          break;
        default: break;
      }
    }
  }

  // ---- wave arcs (enemy) -----------------------------------------------------------------------------------
  protected override drawArc(g: CanvasRenderingContext2D, b: { x: number; y: number; arcR: number; angle: number; arcHalf: number; gapA: number; gapHalf: number; gapA2: number; fade: number }): void {
    const r = b.arcR;
    const fadeOut = r > 200 ? (240 - r) / 40 : 1;
    // split the arc around the gaps into continuous runs
    const n = Math.max(16, Math.round(b.arcHalf * 2));
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const ad = b.angle - b.arcHalf + (b.arcHalf * 2 * i) / n;
      let gap = false;
      for (const gp of [b.gapA, b.gapA2]) {
        if (gp >= 999) continue;
        let d = ad - gp; while (d > 180) d -= 360; while (d < -180) d += 360;
        if (Math.abs(d) < b.gapHalf) gap = true;
      }
      if (!gap && start < 0) start = ad;
      if ((gap || i === n) && start >= 0) { runs.push([start, gap ? ad - (b.arcHalf * 2) / n : ad]); start = -1; }
    }
    g.lineCap = 'round';
    for (const [pass, col, lw, al] of [[0, PAL.R2, 3.2, 0.55], [1, PAL.R4, 1.1, 1]] as const) {
      void pass;
      g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = al * fadeOut;
      for (const [a0, a1] of runs) { g.beginPath(); g.arc(b.x, b.y, r, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180); g.stroke(); }
    }
    g.globalAlpha = 1; g.lineCap = 'butt';
  }
}

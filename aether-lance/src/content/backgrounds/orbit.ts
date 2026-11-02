// STAGE 1 background: dusk planet, distant Halo Ring, debris silhouettes, foreground girders.
import { PAL, type PalKey } from '../../render/palette';
import { makeCanvas, ctx2d, type Canvas } from '../../render/sprite';
import { StarField, paintCanvas, rampPick, fbm, drawRepeat } from './common';
import { Rng } from '../../core/rng';
import type { World } from '../../game/world';
import type { Background } from './index';

let planetCache: { dusk: Canvas; dawn: Canvas } | null = null;

export function planetCanvas(dawn = false): Canvas {
  if (!planetCache) planetCache = { dusk: makePlanet(false), dawn: makePlanet(true) };
  return dawn ? planetCache.dawn : planetCache.dusk;
}

function makePlanet(dawn: boolean): Canvas {
  const W = 620, H = 300, R = 620, cx = 640, cy = R + 130;
  const atm: PalKey[] = dawn ? ['C1', 'C2', 'C3', 'C4', 'Y4'] : ['P0', 'P1', 'P2', 'O3', 'O5'];
  const sea: PalKey[] = dawn ? ['C0', 'C1', 'C2', 'T2', 'C3'] : ['N0', 'N0', 'C0', 'T0', 'T1'];
  const land: PalKey[] = dawn ? ['G0', 'G1', 'G2', 'Y2'] : ['N0', 'N1', 'G0', 'O1'];
  const cloud: PalKey[] = dawn ? ['N4', 'N5', 'N6', 'N7', 'N8'] : ['N1', 'N2', 'N4', 'P2', 'O4'];
  return paintCanvas(W, H, (x, y) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const edge = R - d;
    if (edge < -22) return null;
    const nx = dx / R, ny = dy / R;
    const dir = Math.max(0, Math.min(1, -nx * 0.7 - ny * 0.5));
    const rim = Math.max(0, 1 - Math.max(0, edge) / 70);
    const light = Math.max(0, Math.min(1, rim * rim * (0.35 + 0.65 * dir) * 1.25));
    if (edge < 0) {
      const t = 1 + edge / 22;
      if (t < 0.2) return null;
      return rampPick(['N1', atm[0]!, atm[1]!, atm[2]!], t * t * (0.35 + light * 0.65), x, y);
    }
    if (edge < 2) return rampPick([atm[2]!, atm[3]!, atm[4]!], 0.3 + light * 0.7, x, y);
    const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
    const cont = fbm(x * 0.006 + 3, y * 0.012 + lat, 7, 5);
    const clouds = fbm(x * 0.018, y * 0.045 + cont * 1.5, 21, 4);
    const shade = Math.min(1, light * 0.95 + (edge < 12 ? 0.15 : 0));
    if (clouds > 0.6) return rampPick(cloud, Math.min(1, shade * 1.1 + (clouds - 0.6) * 0.8), x, y);
    if (shade < 0.06) {
      const city = fbm(x * 0.09, y * 0.09, 33, 2);
      if (cont > 0.52 && city > 0.7 && (x * 7 + y * 3) % 5 === 0) return dawn ? 'C4' : 'O5';
      return cont > 0.52 ? 'N1' : 'N0';
    }
    if (cont > 0.52) return rampPick(land, shade, x, y);
    return rampPick(sea, shade, x, y);
  });
}

function ringCanvas(): Canvas {
  const W = 1400, H = 150;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  // a huge gentle arc
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const y = 30 + Math.sin(t * Math.PI) * -18 + t * 70;
    const thick = 9 + t * 8;
    g.fillStyle = PAL.N2; g.fillRect(x, Math.round(y), 1, Math.round(thick));
    g.fillStyle = PAL.N3; g.fillRect(x, Math.round(y), 1, 2);
    g.fillStyle = PAL.N1; g.fillRect(x, Math.round(y + thick - 2), 1, 2);
    if (x % 14 === 0) { g.fillStyle = PAL.C3; g.fillRect(x, Math.round(y + thick / 2), 1, 1); }
    if (x % 90 < 3) { g.fillStyle = PAL.N4; g.fillRect(x, Math.round(y - 3), 1, Math.round(thick + 6)); }
  }
  return c;
}

function debrisLayer(): Canvas {
  const W = 1200, H = 270;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const r = new Rng(91);
  for (let i = 0; i < 26; i++) {
    const x = r.next() * W, y = 20 + r.next() * 230, s = 2 + r.next() * 9;
    g.fillStyle = r.next() < 0.5 ? PAL.N2 : PAL.N1;
    g.beginPath();
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, rr = s * (0.6 + r.next() * 0.6);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    if (r.next() < 0.4) { g.fillStyle = PAL.N3; g.fillRect(Math.round(x - s * 0.4), Math.round(y - s * 0.4), 2, 1); }
  }
  // broken girders
  for (let i = 0; i < 5; i++) {
    const x = r.next() * W, y = 30 + r.next() * 200, len = 30 + r.next() * 50;
    g.fillStyle = PAL.N2;
    g.save(); g.translate(x, y); g.rotate((r.next() - 0.5) * 1.2);
    g.fillRect(0, 0, len, 3);
    for (let k = 0; k < len; k += 6) g.fillRect(k, -2, 1, 7);
    g.restore();
  }
  return c;
}

function girders(): Canvas {
  const W = 2600, H = 270;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  g.fillStyle = '#05060c';
  const put = (x: number, top: boolean) => {
    const h = 70 + (x % 50);
    const y = top ? 0 : H - h;
    g.fillRect(x, y, 14, h);
    for (let k = 0; k < h; k += 10) { g.fillRect(x - 6, y + k, 26, 2); }
    g.fillRect(x + 4, top ? h : y - 12, 6, 12);
  };
  put(300, false); put(340, true); put(1500, true); put(2100, false);
  return c;
}

export function orbitBackground(_w: World, dawn = false): Background {
  const stars = new StarField(11);
  const planet = planetCanvas(dawn);
  const ring = ringCanvas();
  const deb = debrisLayer();
  const fg = girders();
  return {
    draw(g, w) {
      g.fillStyle = PAL.N0;
      g.fillRect(0, 0, 480, 270);
      // faint nebula glow at top-left
      stars.draw(g, w.bgX, 0, w.frame);
      const px = Math.round(480 - planet.width + 60 - Math.min(60, w.bgX * 0.006));
      g.drawImage(planet, px, 270 - planet.height + 40);
      drawRepeat(g, ring, w.bgX, 0.05, 6);
      drawRepeat(g, deb, w.bgX, 0.3, 0);
    },
    drawFg(g, w) {
      if (w.stage.id !== 1) return;
      const p = w.player;
      g.globalAlpha = 0.55;
      const x = -((w.bgX * 1.4) % fg.width);
      g.drawImage(fg, Math.round(x), 0);
      if (x + fg.width < 480) g.drawImage(fg, Math.round(x + fg.width), 0);
      g.globalAlpha = 1;
      void p;
    },
  };
}

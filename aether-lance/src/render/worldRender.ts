// Draws a World into the 480×270 game canvas following the layer order of docs/07_visual.md §8.
import { PAL, type PalKey, rgba } from './palette';
import { drawSprite, makeCanvas, ctx2d, flashState, type Sprite } from './sprite';
import { disc, drawDisc, drawRing, stampLine, dashLine, drawGlow, lightningPts } from './draw';
import { font, smallFont } from './font';
import { TerrainRenderer, THEMES } from './terrainRender';
import { TerrainRendererHD } from './terrainRenderHD';
import { HD } from '../core/hd';
import { fxRng } from '../core/rng';
import { SPR } from '../content/sprites/registry';
import { BACKGROUNDS, type Background } from '../content/backgrounds/index';
import { EF, SHOT_PULSE, SHOT_FAN, SHOT_RAY, SHOT_BOMB, SHOT_SEEKER, type Enemy } from '../game/entities';
import type { World } from '../game/world';
import { DRONE } from '../data/balance';

export interface ViewOpts { interp: boolean; hitbox: boolean; emphasis: boolean; flashReduce: boolean; shake: number; bgDim: number }

const L = (a: number, b: number, t: number) => a + (b - a) * t;

export class WorldView {
  bg: Background;
  terrain: TerrainRenderer | TerrainRendererHD;
  private light = makeCanvas(480, 270);
  private lg = ctx2d(this.light);
  private needleRot: Sprite[];
  private missileRot: Sprite[];
  private shardRot: Sprite[];
  private shipRot: Sprite[] | null = null;

  constructor(public w: World) {
    const mk = BACKGROUNDS[w.stage.bgId] ?? BACKGROUNDS.space!;
    this.bg = mk(w);
    const theme = THEMES[w.stage.theme] ?? THEMES.hull!;
    this.terrain = HD ? new TerrainRendererHD(w.terrain, theme, w.stage.theme) : new TerrainRenderer(w.terrain, theme);
    this.terrain.warm(w.camX, w.camY);
    this.needleRot = SPR.needle!.rotations(16);
    this.missileRot = SPR.missile!.rotations(16);
    this.shardRot = SPR.shard!.rotations(8);
  }

  render(g: CanvasRenderingContext2D, alpha: number, o: ViewOpts): void {
    const w = this.w;
    const a = o.interp ? alpha : 1;
    flashState.on = ((w.frame >> 1) & 1) === 0;
    g.save();
    g.fillStyle = PAL.N0;
    g.fillRect(0, 0, 480, 270);
    // screen shake
    const tr = w.trauma * w.trauma * o.shake;
    if (tr > 0.001) g.translate(Math.round((fxRng.next() * 2 - 1) * 6 * tr), Math.round((fxRng.next() * 2 - 1) * 6 * tr));
    this.bg.draw(g, w);
    if (o.bgDim > 0) { g.fillStyle = `rgba(0,0,0,${o.bgDim / 100})`; g.fillRect(-10, -10, 500, 290); }
    this.bg.drawMid?.(g, w);
    this.terrain.draw(g, w.camX, w.camY);
    this.drawBreakables(g);
    this.drawDynamic(g);
    for (const e of w.enemies.items) if (e.active && e.drawLayer === 0) this.drawEnemy(g, e, a);
    for (const e of w.enemies.items) if (e.active && e.drawLayer === 1) this.drawEnemy(g, e, a);
    this.drawItems(g, a);
    this.drawShots(g, a);
    this.drawPlayer(g, a, o);
    this.drawParticles(g);
    this.bg.drawFg?.(g, w);
    if (w.dark) this.drawDark(g);
    this.drawTeles(g);
    this.drawHazards(g);
    this.drawBullets(g, a, o);
    this.drawPopups(g);
    this.drawWarnings(g);
    g.restore();
    if (w.flashA > 0) {
      g.globalAlpha = o.flashReduce ? Math.min(0.2, w.flashA) : w.flashA;
      g.fillStyle = o.flashReduce ? '#606070' : w.flashColor;
      g.fillRect(0, 0, 480, 270);
      g.globalAlpha = 1;
    }
  }

  // ---- terrain extras ---------------------------------------------------------------------------
  protected drawBreakables(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const b of w.terrain.breakables) {
      const x = Math.round(b.x - w.camX), y = Math.round(b.y - w.camY);
      if (x > 490 || x + b.w < -10 || y > 280 || y + b.h < -10) continue;
      const cry = b.style === 'crystal';
      if (!b.alive) {
        if (b.regen > 0 && b.grow > 0) {
          g.globalAlpha = 0.25 + b.grow * 0.5;
          g.fillStyle = cry ? PAL.P2 : PAL.F2;
          const s = 0.4 + b.grow * 0.6;
          g.fillRect(Math.round(x + (b.w * (1 - s)) / 2), Math.round(y + (b.h * (1 - s)) / 2), Math.round(b.w * s), Math.round(b.h * s));
          g.globalAlpha = 1;
        }
        continue;
      }
      const dmg = 1 - b.hp / b.maxHp;
      g.fillStyle = b.flash > 0 ? PAL.N8 : cry ? PAL.P2 : PAL.F2;
      g.fillRect(x, y, b.w, b.h);
      g.fillStyle = cry ? PAL.P3 : PAL.F3;
      for (let yy = 0; yy < b.h; yy += 8) for (let xx = (yy / 8) % 2 ? 4 : 0; xx < b.w; xx += 8) g.fillRect(x + xx + 1, y + yy + 1, 3, 2);
      g.fillStyle = cry ? PAL.P4 : PAL.T3;
      g.fillRect(x, y, b.w, 1); g.fillRect(x, y, 1, b.h);
      g.fillStyle = cry ? PAL.P0 : PAL.F0;
      g.fillRect(x, y + b.h - 1, b.w, 1); g.fillRect(x + b.w - 1, y, 1, b.h);
      if (dmg > 0.2) {
        g.fillStyle = PAL.N0;
        const cx = x + b.w / 2, cy = y + b.h / 2;
        stampLine(g, cx - b.w * 0.3 * dmg, cy - 3, cx + 2, cy + 2, 1);
        if (dmg > 0.5) stampLine(g, cx + 1, cy - b.h * 0.3, cx + b.w * 0.3, cy + 4, 1);
      }
      if (cry && (w.frame + b.x) % 90 < 3) { g.fillStyle = PAL.C5; g.fillRect(x + 2, y + 2, 2, 2); }
    }
  }

  protected drawDynamic(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const d of w.terrain.dyn) {
      const sx0 = Math.max(0, Math.floor(d.x0 - w.camX)), sx1 = Math.min(480, Math.ceil(d.x1 - w.camX));
      if (sx1 <= sx0) continue;
      if (d.kind === 'wave') {
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = sx + w.camX;
          const off = w.terrain.waveOffset(d, wx);
          if (d.floorY !== undefined) {
            const top = Math.round(d.floorY - off - w.camY);
            g.fillStyle = PAL.F1; g.fillRect(sx, top, 1, 272 - top);
            g.fillStyle = PAL.F3; g.fillRect(sx, top, 1, 2);
            g.fillStyle = PAL.T3; g.fillRect(sx, top, 1, 1);
            if ((wx >> 2) % 5 === 0) { g.fillStyle = PAL.F2; g.fillRect(sx, top + 4, 1, 3); }
          }
          if (d.ceilY !== undefined) {
            const bot = Math.round(d.ceilY + off - w.camY);
            g.fillStyle = PAL.F1; g.fillRect(sx, 0, 1, bot);
            g.fillStyle = PAL.F3; g.fillRect(sx, bot - 2, 1, 2);
            g.fillStyle = PAL.T3; g.fillRect(sx, bot - 1, 1, 1);
          }
        }
      } else {
        const x = Math.round(d.x0 - w.camX), y = Math.round(d.y! - w.camY), ww = d.x1 - d.x0, hh = d.h!;
        if (d.solid) {
          g.fillStyle = PAL.C2; g.fillRect(x, y, ww, hh);
          g.fillStyle = PAL.C4; g.fillRect(x + 2, y + 2, ww - 4, hh - 4);
          g.fillStyle = PAL.N8; g.fillRect(x, y, ww, 1); g.fillRect(x, y, 1, hh);
          g.fillStyle = PAL.C1; g.fillRect(x, y + hh - 1, ww, 1); g.fillRect(x + ww - 1, y, 1, hh);
        } else {
          const gl = d.glow ?? 0;
          g.globalAlpha = 0.25 + gl * 0.55;
          g.fillStyle = gl > 0.5 ? PAL.C5 : PAL.C3;
          g.fillRect(x, y, ww, 1); g.fillRect(x, y + hh - 1, ww, 1); g.fillRect(x, y, 1, hh); g.fillRect(x + ww - 1, y, 1, hh);
          if (gl > 0) { g.globalAlpha = gl * 0.25; g.fillRect(x, y, ww, hh); }
          g.globalAlpha = 1;
        }
      }
    }
  }

  // ---- enemies -----------------------------------------------------------------------------------
  protected drawEnemy(g: CanvasRenderingContext2D, e: Enemy, a: number): void {
    const x = L(e.px, e.x, a), y = L(e.py, e.y, a);
    if (x < -120 || x > 600 || y < -140 || y > 410) return;
    const def = e.def as { draw?: (g: CanvasRenderingContext2D, e: Enemy, x: number, y: number, w: World) => void; sprite?: string; anim?: number };
    if (def.draw) { def.draw(g, e, x, y, this.w); }
    else if (def.sprite) {
      let s = SPR[def.sprite];
      if (!s) return;
      if (e.flipY) s = s.flipY;
      const fr = (def.anim === 0 ? e.frame : Math.floor(e.age / (def.anim ?? 8))) % s.frames;
      if (e.carrier && !e.dead) {
        const pulse = 0.55 + 0.45 * Math.sin(this.w.frame * 0.21);
        g.globalAlpha = pulse;
        s.drawGlow(g, carrierColor(e.carrier), fr, x, y);
        g.globalAlpha = 1;
      }
      drawSprite(g, s, fr, x, y, e.flash > 0);
    } else {
      drawDisc(g, x, y, 6, e.flash ? PAL.N8 : PAL.T3);
    }
    if (this.w.player.godMode && this.hitboxes) this.drawEnemyHitbox(g, e);
  }
  hitboxes = false;

  protected drawEnemyHitbox(g: CanvasRenderingContext2D, e: Enemy): void {
    g.strokeStyle = '#ff0'; g.lineWidth = 1;
    const sh = e.parts ? e.parts.filter((p) => p.alive).map((p) => ({ s: p.shape, x: p.x, y: p.y })) : [{ s: e.shape, x: e.x, y: e.y }];
    for (const { s, x, y } of sh) {
      if (s.kind === 'box') g.strokeRect(Math.round(x + s.ox - s.w / 2) + 0.5, Math.round(y + s.oy - s.h / 2) + 0.5, s.w, s.h);
      else { g.beginPath(); g.arc(x + s.ox, y + s.oy, s.r, 0, Math.PI * 2); g.stroke(); }
    }
  }

  // ---- items --------------------------------------------------------------------------------------
  protected drawItems(g: CanvasRenderingContext2D, a: number): void {
    const w = this.w;
    const f = font();
    for (const it of w.items.items) {
      if (!it.active) continue;
      const x = L(it.px, it.x, a), y = L(it.py, it.y, a);
      switch (it.kind) {
        case 'star': drawSprite(g, SPR.star!, (it.age >> 2) % 2, x, y); break;
        case 'arms': case 'wisp': case 'aegis': {
          const c = it.kind === 'arms' ? '#ff6a3d' : it.kind === 'wisp' ? PAL.C4 : PAL.G3;
          g.globalCompositeOperation = 'lighter';
          drawGlow(g, x, y, 14, c, 0.45 + 0.15 * Math.sin(it.age * 0.15));
          g.globalCompositeOperation = 'source-over';
          drawSprite(g, SPR['item_' + it.kind]!, (it.age >> 3) % 8, x, y);
          break;
        }
        case 'drive':
          g.globalCompositeOperation = 'lighter'; drawGlow(g, x, y, 14, PAL.Y3, 0.45); g.globalCompositeOperation = 'source-over';
          drawSprite(g, SPR.item_drive!, (it.age >> 3) % 4, x, y);
          break;
        case 'armsChip': case 'subChip': {
          const sub = it.kind === 'subChip';
          const period = sub ? 120 : 90;
          const blink = it.age % period > period - 10 && ((it.age >> 1) & 1);
          drawSprite(g, sub ? SPR.item_subchip! : SPR.item_chip!, 0, x, y, !!blink);
          const ch = sub ? (it.phase % 2 === 0 ? 'B' : 'S') : 'PFR'[it.phase % 3]!;
          f.draw(g, ch, x, y - 3, sub ? 'P4' : ch === 'P' ? 'C2' : ch === 'F' ? 'G1' : 'P2', 1, 'center');
          break;
        }
        case 'oneUp': {
          const hue = (it.age * 6) % 360;
          g.globalCompositeOperation = 'lighter'; drawGlow(g, x, y, 16, `hsl(${hue},90%,60%)`, 0.6); g.globalCompositeOperation = 'source-over';
          drawDisc(g, x, y, 7, `hsl(${hue},80%,55%)`);
          drawDisc(g, x, y, 5, `hsl(${(hue + 60) % 360},90%,75%)`);
          f.draw(g, '1UP', x, y - 3, 'N0', 1, 'center');
          break;
        }
        case 'lostWisp':
          if (it.life < 90 && (it.age >> 2) % 2) break;
          g.globalAlpha = 0.6; drawSprite(g, SPR.wisp!, (it.age >> 2) % 6, x, y); g.globalAlpha = 1;
          break;
      }
    }
  }

  // ---- shots --------------------------------------------------------------------------------------
  protected drawShots(g: CanvasRenderingContext2D, a: number): void {
    const w = this.w;
    g.globalCompositeOperation = 'lighter';
    for (const s of w.shots.items) {
      if (!s.active) continue;
      const x = L(s.px, s.x, a), y = L(s.py, s.y, a);
      switch (s.kind) {
        case SHOT_PULSE: {
          const ww = s.w, hh = s.h;
          const c1 = s.gold ? PAL.Y2 : PAL.C2, c2 = s.gold ? PAL.Y4 : PAL.C5;
          g.fillStyle = c1; g.fillRect(Math.round(x - ww / 2), Math.round(y - hh / 2), ww, hh);
          g.fillStyle = c2; g.fillRect(Math.round(x - ww / 2 + 2), Math.round(y - (hh > 3 ? 1 : 0.5)), ww - 2, hh > 3 ? 2 : 1);
          if (s.drone) break;
          g.fillStyle = s.gold ? PAL.Y1 : PAL.C1; g.fillRect(Math.round(x - ww / 2 - 3), Math.round(y), 3, 1);
          break;
        }
        case SHOT_FAN: {
          const ww = Math.max(2, Math.round(8 * s.scale)), hh = Math.max(1, Math.round(4 * s.scale));
          g.fillStyle = s.gold ? PAL.Y2 : PAL.G2; g.fillRect(Math.round(x - ww / 2), Math.round(y - hh / 2), ww, hh);
          g.fillStyle = s.gold ? PAL.Y4 : PAL.G4; g.fillRect(Math.round(x - ww / 2 + 1), Math.round(y - hh / 2 + 1), Math.max(1, ww - 2), Math.max(1, hh - 2));
          break;
        }
        case SHOT_RAY: {
          const wd = s.h;
          g.fillStyle = s.gold ? PAL.Y1 : PAL.P2;
          for (let i = 0; i + 1 < s.nt; i++) stampLine(g, s.trail[i * 2]!, s.trail[i * 2 + 1]!, s.trail[i * 2 + 2]!, s.trail[i * 2 + 3]!, wd + 2);
          g.fillStyle = s.gold ? PAL.Y3 : PAL.C4;
          for (let i = 0; i + 1 < s.nt; i++) stampLine(g, s.trail[i * 2]!, s.trail[i * 2 + 1]!, s.trail[i * 2 + 2]!, s.trail[i * 2 + 3]!, Math.max(1, wd));
          g.fillStyle = PAL.N8;
          for (let i = 0; i + 1 < s.nt; i++) stampLine(g, s.trail[i * 2]!, s.trail[i * 2 + 1]!, s.trail[i * 2 + 2]!, s.trail[i * 2 + 3]!, Math.max(1, wd - 3));
          g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 3, 3);
          break;
        }
        case SHOT_BOMB:
          g.globalCompositeOperation = 'source-over';
          drawDisc(g, x, y, 3, PAL.N1);
          g.fillStyle = (s.age >> 2) % 2 ? PAL.O5 : PAL.O3; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
          g.globalCompositeOperation = 'lighter';
          break;
        case SHOT_SEEKER: {
          const dx = Math.cos((s.angle * Math.PI) / 180), dy = Math.sin((s.angle * Math.PI) / 180);
          g.fillStyle = PAL.N7; stampLine(g, x - dx * 4, y - dy * 4, x + dx * 3, y + dy * 3, 2);
          g.fillStyle = s.gold ? PAL.Y4 : PAL.O6; g.fillRect(Math.round(x - dx * 5), Math.round(y - dy * 5), 1, 1);
          break;
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- player ----------------------------------------------------------------------------------------
  protected drawPlayer(g: CanvasRenderingContext2D, a: number, o: ViewOpts): void {
    const w = this.w;
    const p = w.player;
    // drones
    for (let i = 0; i < p.drones; i++) {
      const dx = L(p.dpx[i]!, p.dx[i]!, a), dy = L(p.dpy[i]!, p.dy[i]!, a);
      g.globalCompositeOperation = 'lighter';
      drawGlow(g, dx, dy, 10, p.driving ? PAL.Y3 : PAL.C3, 0.5);
      g.globalCompositeOperation = 'source-over';
      drawSprite(g, SPR.wisp!, (w.frame >> 2) % 6 + i, dx, dy);
    }
    if (p.state === 'dead' || p.state === 'gone') return;
    const x = L(p.px, p.x, a), y = L(p.py, p.y, a);
    if (p.invuln > 0 && !p.driving && (w.frame >> 2) % 2 === 0) {
      if (o.flashReduce) g.globalAlpha = 0.5; else return this.drawBarrier(g, x, y);
    }
    // engine flame
    const len = [4, 7, 10, 13][p.speedLv - 1]! + (p.moveX > 0.3 ? 3 : p.moveX < -0.3 ? -2 : 0) + (fxRng.next() < 0.5 ? 1 : 0);
    g.globalCompositeOperation = 'lighter';
    this.drawFlame(g, x - 15, y, len);
    if (p.driving) drawGlow(g, x, y, 26, PAL.Y3, 0.35 + 0.15 * Math.sin(w.frame * 0.4));
    g.globalCompositeOperation = 'source-over';
    // speed-change afterimages
    if (p.speedFx > 0) {
      g.globalAlpha = p.speedFx / 16;
      for (let k = 1; k <= 3; k++) drawSprite(g, SPR.kestrel!, 2 + p.bank, x - k * 6, y);
      g.globalAlpha = 1;
    }
    if (p.driving && w.frame % 4 < 2) {
      g.globalAlpha = 0.25;
      drawSprite(g, SPR.kestrel!, 2 + p.bank, x - 8, y, true);
      g.globalAlpha = 1;
    }
    drawSprite(g, SPR.kestrel!, 2 + p.bank, x, y);
    if (p.muzzle > 0) { g.fillStyle = PAL.N8; g.fillRect(Math.round(x + 15), Math.round(y) - 1, 3, 3); }
    g.globalAlpha = 1;
    this.drawBarrier(g, x, y);
    if (o.hitbox || p.godMode && this.hitboxes) {
      drawRing(g, p.hitX + (x - p.x), y, 3, PAL.R3, 1);
      g.fillStyle = PAL.N8; g.fillRect(Math.round(p.hitX + (x - p.x)) - 1, Math.round(y) - 1, 2, 2);
    }
    if (p.formLabel > 0) font().draw(g, p.formation.toUpperCase(), x, y - 22, 'C4', 1, 'center', 'N0');
  }

  /** Engine exhaust behind the ship; (x, y) is the nozzle, len the flame length (additive blending is set). */
  protected drawFlame(g: CanvasRenderingContext2D, x: number, y: number, len: number): void {
    const fx = Math.round(x), fy = Math.round(y);
    g.fillStyle = PAL.O3; g.fillRect(fx - len, fy - 2, len, 4);
    g.fillStyle = PAL.O5; g.fillRect(fx - Math.round(len * 0.75), fy - 1, Math.round(len * 0.75), 3);
    g.fillStyle = PAL.O6; g.fillRect(fx - Math.round(len * 0.45), fy - 1, Math.round(len * 0.45), 2);
    g.fillStyle = PAL.N8; g.fillRect(fx - 2, fy, 2, 1);
  }

  protected drawBarrier(g: CanvasRenderingContext2D, x: number, y: number): void {
    const p = this.w.player;
    if (p.barrier <= 0) return;
    const rot = this.w.frame * 0.02;
    g.fillStyle = p.barrier >= 3 ? PAL.G4 : p.barrier === 2 ? PAL.G3 : PAL.G2;
    g.globalAlpha = 0.45 + 0.2 * Math.sin(this.w.frame * 0.12);
    for (let layer = 0; layer < p.barrier; layer++) {
      const r = 15 + layer * 1.5;
      for (let k = 0; k < 6; k++) {
        const a1 = rot + (k * Math.PI) / 3 + layer * 0.3, a2 = a1 + Math.PI / 3;
        stampLine(g, x + Math.cos(a1) * r, y + Math.sin(a1) * r * 0.8, x + Math.cos(a2) * r, y + Math.sin(a2) * r * 0.8, 1);
      }
    }
    g.globalAlpha = 1;
  }

  // ---- particles ------------------------------------------------------------------------------------
  protected drawParticles(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const q of w.particles.items) {
      if (!q.active) continue;
      const t = q.life / q.max;
      g.globalCompositeOperation = q.add ? 'lighter' : 'source-over';
      switch (q.kind) {
        case 'spark':
          g.fillStyle = t > 0.6 ? q.color2 : q.color;
          stampLine(g, q.x, q.y, q.x - q.vx * 2, q.y - q.vy * 2, 1);
          break;
        case 'ember':
          if ((q.life >> 1) % 3 === 0) break;
          g.fillStyle = t > 0.5 ? q.color : PAL.O3;
          g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
          break;
        case 'smoke':
          g.globalAlpha = 0.5 * t;
          drawDisc(g, q.x, q.y, q.size, t > 0.7 ? PAL.N4 : q.color);
          g.globalAlpha = 1;
          break;
        case 'fire': {
          const k = 1 - t;
          const r = q.size * (0.5 + k * 0.7);
          const col = k < 0.2 ? PAL.N8 : k < 0.4 ? PAL.Y4 : k < 0.6 ? PAL.O5 : k < 0.8 ? PAL.O3 : PAL.N3;
          if (k > 0.8) g.globalAlpha = (1 - k) * 4;
          drawDisc(g, q.x, q.y, r, col);
          if (k < 0.7) drawDisc(g, q.x - r * 0.2, q.y - r * 0.2, r * 0.55, k < 0.3 ? PAL.N8 : PAL.O6);
          g.globalAlpha = 1;
          break;
        }
        case 'ring':
          g.globalAlpha = t;
          drawRing(g, q.x, q.y, q.size, q.color, q.sw || 2);
          g.globalAlpha = 1;
          break;
        case 'glow':
          drawGlow(g, q.x, q.y, q.size * (0.6 + t * 0.6), q.color, t);
          break;
        case 'flash':
          g.globalAlpha = t;
          drawDisc(g, q.x, q.y, q.size * (1.3 - t * 0.3), q.color);
          g.globalAlpha = 1;
          break;
        case 'debris':
          if (q.src) g.drawImage(q.src, q.sx, q.sy, q.sw, q.sh, Math.round(q.x), Math.round(q.y), q.sw, q.sh);
          else { g.fillStyle = q.color; g.fillRect(Math.round(q.x), Math.round(q.y), Math.round(q.size), Math.round(q.size)); g.fillStyle = PAL.N1; g.fillRect(Math.round(q.x) + 1, Math.round(q.y) + Math.round(q.size) - 1, Math.max(1, Math.round(q.size) - 1), 1); }
          break;
        case 'shard': {
          g.fillStyle = q.color;
          const s = Math.round(q.size);
          const c = Math.cos(q.rot), sn = Math.sin(q.rot);
          stampLine(g, q.x - c * s, q.y - sn * s, q.x + c * s, q.y + sn * s, 1);
          break;
        }
        case 'drop':
          g.fillStyle = q.color;
          g.fillRect(Math.round(q.x), Math.round(q.y), Math.round(q.size), Math.round(q.size) + 1);
          break;
        case 'trail': case 'line':
          g.globalAlpha = t;
          g.fillStyle = q.color;
          stampLine(g, q.x, q.y, q.x + q.vx * 6, q.y + q.vy * 6, Math.max(1, Math.round(q.size)));
          g.globalAlpha = 1;
          break;
        case 'leaf':
          g.fillStyle = q.color; g.fillRect(Math.round(q.x), Math.round(q.y), 2, 1);
          break;
      }
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---- darkness (ST2) -------------------------------------------------------------------------------
  protected drawDark(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const lg = this.lg;
    lg.globalCompositeOperation = 'source-over';
    lg.fillStyle = 'rgba(4,2,12,0.52)';
    lg.clearRect(0, 0, 480, 270);
    lg.fillRect(0, 0, 480, 270);
    lg.globalCompositeOperation = 'destination-out';
    const p = w.player;
    if (p.alive) {
      const grd = lg.createRadialGradient(p.x + 20, p.y, 10, p.x + 90, p.y, 150);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = grd;
      lg.beginPath(); lg.moveTo(p.x, p.y - 8); lg.lineTo(p.x + 220, p.y - 80); lg.lineTo(p.x + 220, p.y + 80); lg.lineTo(p.x, p.y + 8); lg.closePath(); lg.fill();
      const g2 = lg.createRadialGradient(p.x, p.y, 0, p.x, p.y, 46);
      g2.addColorStop(0, 'rgba(0,0,0,0.95)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = g2; lg.fillRect(p.x - 46, p.y - 46, 92, 92);
    }
    for (const q of w.particles.items) {
      if (!q.active || (q.kind !== 'fire' && q.kind !== 'flash')) continue;
      const r = 30 + q.size * 2;
      const g3 = lg.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g3.addColorStop(0, 'rgba(0,0,0,0.8)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = g3; lg.fillRect(q.x - r, q.y - r, r * 2, r * 2);
    }
    for (const e of w.enemies.items) {
      if (!e.active || !e.o.light) continue;
      const r = e.o.light as number;
      const g4 = lg.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g4.addColorStop(0, 'rgba(0,0,0,0.7)'); g4.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = g4; lg.fillRect(e.x - r, e.y - r, r * 2, r * 2);
    }
    g.drawImage(this.light, 0, 0);
  }

  // ---- telegraphs & hazards ---------------------------------------------------------------------------
  protected drawTeles(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const t of w.teles.items) {
      if (!t.active) continue;
      const k = 1 - t.life / t.max;
      const blink = (t.life >> 2) % 2 === 0 || t.life < 12;
      const col = PAL[(t.color in PAL ? t.color : 'O5') as PalKey];
      switch (t.kind) {
        case 'line':
          if (!blink) break;
          g.fillStyle = col;
          g.globalAlpha = 0.5 + k * 0.5;
          if (t.pts) for (let i = 0; i + 3 < t.pts.length; i += 2) dashLine(g, t.pts[i]!, t.pts[i + 1]!, t.pts[i + 2]!, t.pts[i + 3]!, 4, w.frame, t.w);
          else dashLine(g, t.x1, t.y1, t.x2, t.y2, 4, w.frame, t.w);
          g.globalAlpha = 1;
          break;
        case 'band': {
          g.fillStyle = rgba('O4', 0.12 + k * 0.18);
          const y0 = Math.min(t.y1, t.y2), hh = Math.abs(t.y2 - t.y1);
          const x0 = Math.min(t.x1, t.x2), ww = Math.abs(t.x2 - t.x1) || 480;
          g.fillRect(Math.round(x0), Math.round(y0), Math.round(ww), Math.round(hh));
          g.fillStyle = rgba('O5', 0.35 + k * 0.4);
          for (let xx = Math.round(x0) - ((w.frame * 2) % 16); xx < x0 + ww; xx += 16) { g.fillRect(xx, Math.round(y0), 6, 1); g.fillRect(xx, Math.round(y0 + hh) - 1, 6, 1); }
          break;
        }
        case 'vband': {
          const a2 = 0.15 + k * 0.5;
          g.fillStyle = rgba('Y4', blink ? a2 : a2 * 0.4);
          g.fillRect(Math.round(t.x1 - (t.w * k) / 2), 0, Math.max(1, Math.round(t.w * k)), 270);
          g.fillStyle = rgba('N8', blink ? 0.6 : 0.2);
          g.fillRect(Math.round(t.x1), 0, 1, 270);
          break;
        }
        case 'circle':
          g.globalAlpha = blink ? 0.9 : 0.4;
          drawRing(g, t.x1, t.y1, t.w * (1 - k * 0.5), col, 1);
          g.globalAlpha = 1;
          break;
        case 'shadow':
          g.fillStyle = rgba('N0', 0.25 + k * 0.4);
          g.fillRect(Math.round(t.x1 - t.w / 2), Math.round(t.y1 - 1), Math.round(t.w), 3);
          break;
        case 'dots':
          if (t.pts) { g.fillStyle = col; for (let i = 0; i + 1 < t.pts.length; i += 4) if (blink) g.fillRect(Math.round(t.pts[i]!), Math.round(t.pts[i + 1]!), 1, 1); }
          break;
        case 'cross':
          if (!blink) break;
          g.fillStyle = col;
          g.fillRect(Math.round(t.x1) - 5, Math.round(t.y1), 11, 1); g.fillRect(Math.round(t.x1), Math.round(t.y1) - 5, 1, 11);
          break;
        case 'arrow': break;
      }
    }
  }

  protected drawHazards(g: CanvasRenderingContext2D): void {
    const w = this.w;
    for (const h of w.hazards.items) {
      if (!h.active) continue;
      const tele = h.tele > 0;
      switch (h.kind) {
        case 'laser': {
          if (tele) {
            g.globalCompositeOperation = 'lighter';
            drawGlow(g, h.pts[0]!, h.pts[1]!, 6 + ((w.frame >> 1) % 3) * 2, PAL.R3, 0.8);
            g.globalCompositeOperation = 'source-over';
            break;
          }
          const wd = h.width * (h.dur < 6 ? h.dur / 6 : h.age < 4 ? (h.age + 1) / 5 : 1);
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = PAL.R1;
          for (let i = 0; i + 1 < h.np; i++) stampLine(g, h.pts[i * 2]!, h.pts[i * 2 + 1]!, h.pts[i * 2 + 2]!, h.pts[i * 2 + 3]!, Math.round(wd + 4));
          g.fillStyle = PAL.R3;
          for (let i = 0; i + 1 < h.np; i++) stampLine(g, h.pts[i * 2]!, h.pts[i * 2 + 1]!, h.pts[i * 2 + 2]!, h.pts[i * 2 + 3]!, Math.max(1, Math.round(wd)));
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = PAL.N8;
          for (let i = 0; i + 1 < h.np; i++) stampLine(g, h.pts[i * 2]!, h.pts[i * 2 + 1]!, h.pts[i * 2 + 2]!, h.pts[i * 2 + 3]!, Math.max(1, Math.round(wd / 2.5)));
          drawDisc(g, h.pts[0]!, h.pts[1]!, wd / 2 + 2, PAL.N8);
          break;
        }
        case 'bolt': {
          if (tele) break;
          const pts = lightningPts(h.x + (fxRng.next() - 0.5) * 10, -10, h.x + (fxRng.next() - 0.5) * 8, 280, 14, 9, () => fxRng.next());
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = PAL.Y3;
          for (let i = 0; i + 3 < pts.length; i += 2) stampLine(g, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, 5);
          g.fillStyle = PAL.N8;
          for (let i = 0; i + 3 < pts.length; i += 2) stampLine(g, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, 2);
          drawGlow(g, h.x, 135, 40, PAL.Y4, 0.5);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'arc': {
          if (h.np < 2) break;
          const x1 = h.pts[0]!, y1 = h.pts[1]!, x2 = h.pts[2]!, y2 = h.pts[3]!;
          if (tele) {
            if ((w.frame >> 1) % 2) { g.fillStyle = rgba('C4', 0.5); stampLine(g, x1, y1, x2, y2, 1); }
            break;
          }
          const pts = lightningPts(x1, y1, x2, y2, Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 12)), 4, () => fxRng.next());
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = PAL.C3;
          for (let i = 0; i + 3 < pts.length; i += 2) stampLine(g, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, 3);
          g.fillStyle = PAL.N8;
          for (let i = 0; i + 3 < pts.length; i += 2) stampLine(g, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!, 1);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'flame': {
          if (tele) {
            g.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 3; k++) { g.fillStyle = PAL.C4; g.fillRect(Math.round(h.x + (fxRng.next() - 0.5) * 6), Math.round(h.y + (fxRng.next() - 0.5) * 6), 1, 1); }
            g.globalCompositeOperation = 'source-over';
            break;
          }
          g.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 14; k++) {
            const d = fxRng.next() * h.h, a2 = ((h.angle + (fxRng.next() - 0.5) * h.w) * Math.PI) / 180;
            const r = 2 + (d / h.h) * 5;
            drawDisc(g, h.x + Math.cos(a2) * d, h.y + Math.sin(a2) * d, r, d < h.h * 0.3 ? PAL.O6 : d < h.h * 0.7 ? PAL.O5 : PAL.O3);
          }
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'column': case 'molten': {
          if (tele) {
            if (h.kind === 'molten') { g.fillStyle = PAL.O4; for (let k = 0; k < 3; k++) g.fillRect(Math.round(h.x + fxRng.next() * h.w), Math.round(h.y + fxRng.next() * 16), 1, 2); }
            break;
          }
          const molten = h.kind === 'molten';
          if (h.color === 1) {
            // organic tentacle column
            const grow = Math.min(1, h.age / 6);
            const top = h.y < 135;
            const len = Math.round(h.h * grow);
            const y0 = top ? h.y : h.y + h.h - len;
            g.fillStyle = PAL.F1; g.fillRect(Math.round(h.x), Math.round(y0), Math.round(h.w), len);
            g.fillStyle = PAL.F3; g.fillRect(Math.round(h.x + 3), Math.round(y0), 4, len);
            g.fillStyle = PAL.T3; for (let yy = 4; yy < len; yy += 10) g.fillRect(Math.round(h.x + h.w / 2), Math.round(y0 + yy), 2, 2);
            g.fillStyle = PAL.F0; g.fillRect(Math.round(h.x), Math.round(top ? y0 + len - 2 : y0), Math.round(h.w), 2);
            break;
          }
          g.fillStyle = molten ? PAL.O3 : PAL.R1;
          g.fillRect(Math.round(h.x), Math.round(h.y), Math.round(h.w), Math.round(h.h));
          g.fillStyle = molten ? PAL.O5 : PAL.R3;
          for (let yy = 0; yy < h.h; yy += 6) g.fillRect(Math.round(h.x + 2 + ((yy * 7 + w.frame * 3) % Math.max(1, h.w - 4))), Math.round(h.y + ((yy + w.frame * 4) % h.h)), 2, 4);
          g.fillStyle = molten ? PAL.O6 : PAL.R4;
          g.fillRect(Math.round(h.x + h.w / 2 - 1), Math.round(h.y), 2, Math.round(h.h));
          break;
        }
        case 'band':
          if (tele) break;
          g.fillStyle = rgba('R2', 0.5);
          g.fillRect(Math.round(h.x), Math.round(h.y), Math.round(h.w), Math.round(h.h));
          break;
        default: break;
      }
    }
  }

  // ---- enemy bullets ---------------------------------------------------------------------------------
  protected drawBullets(g: CanvasRenderingContext2D, a: number, o: ViewOpts): void {
    const w = this.w;
    const pel = SPR.pellet!, orb = SPR.orb!, globe = SPR.globe!, chip = SPR.chip!;
    for (const b of w.bullets.items) {
      if (!b.active) continue;
      const x = L(b.px, b.x, a), y = L(b.py, b.y, a);
      if (b.fade > 0) { g.globalAlpha = b.fade / 12; }
      if (o.emphasis && b.kind !== 'waveArc') { g.globalCompositeOperation = 'lighter'; drawGlow(g, x, y, b.r * 3 + 4, PAL.R3, 0.6); g.globalCompositeOperation = 'source-over'; }
      switch (b.kind) {
        case 'pellet': drawSprite(g, pel, (b.age >> 2) & 1, x, y); break;
        case 'chip': drawSprite(g, chip, (b.age >> 2) & 1, x, y); break;
        case 'orb': drawSprite(g, orb, (b.age >> 3) & 1, x, y); break;
        case 'globe': case 'globeSplit': drawSprite(g, globe, (b.age >> 3) % 4, x, y); break;
        case 'needle': { const i = (Math.round(b.angle / 22.5) % 16 + 16) % 16; drawSprite(g, this.needleRot[i]!, 0, x, y); break; }
        case 'missile': { const i = (Math.round(b.angle / 22.5) % 16 + 16) % 16; drawSprite(g, this.missileRot[i]!, 0, x, y); break; }
        case 'shard': drawSprite(g, this.shardRot[(b.age >> 2) % 8]!, 0, x, y); break;
        case 'waveArc': this.drawArc(g, b); break;
      }
      g.globalAlpha = 1;
    }
    if (o.emphasis) return;
    void disc;
  }

  protected drawArc(g: CanvasRenderingContext2D, b: { x: number; y: number; arcR: number; angle: number; arcHalf: number; gapA: number; gapHalf: number; gapA2: number; fade: number }): void {
    const r = b.arcR;
    const n = Math.max(8, Math.round((r * b.arcHalf * 2 * Math.PI) / 180 / 2));
    const fadeOut = r > 200 ? (240 - r) / 40 : 1;
    for (let pass = 0; pass < 2; pass++) {
      g.fillStyle = pass === 0 ? PAL.R2 : PAL.R4;
      g.globalAlpha = (pass === 0 ? 0.7 : 1) * fadeOut;
      for (let i = 0; i <= n; i++) {
        const ad = b.angle - b.arcHalf + (b.arcHalf * 2 * i) / n;
        let skip = false;
        for (const gp of [b.gapA, b.gapA2]) {
          if (gp >= 999) continue;
          let d = ad - gp; while (d > 180) d -= 360; while (d < -180) d += 360;
          if (Math.abs(d) < b.gapHalf) skip = true;
        }
        if (skip) continue;
        const rad = (ad * Math.PI) / 180;
        const s = pass === 0 ? 3 : 1;
        g.fillRect(Math.round(b.x + Math.cos(rad) * r - s / 2), Math.round(b.y + Math.sin(rad) * r - s / 2), s, s);
      }
    }
    g.globalAlpha = 1;
  }

  // ---- popups / warnings ------------------------------------------------------------------------------
  protected drawPopups(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const sf = smallFont(), f = font();
    for (const p of w.popups.items) {
      if (!p.active) continue;
      if (p.life < 10) g.globalAlpha = p.life / 10;
      if (p.small && /^[0-9×+ ]+$/.test(p.text)) sf.draw(g, p.text, p.x, p.y, p.color, 1, 'center', 'N0');
      else f.draw(g, p.text, p.x, p.y, p.color, 1, 'center', 'N0');
      g.globalAlpha = 1;
    }
  }

  protected drawWarnings(g: CanvasRenderingContext2D): void {
    const w = this.w;
    const f = font();
    for (const wn of w.warnings) {
      if ((wn.life >> 2) % 2) continue;
      f.draw(g, '◀!', 4, wn.y - 4, 'O5', 2, 'left', 'N0');
    }
    // wind indicator
    if (w.windWarn > 0 || Math.abs(w.wind) > 0.05) {
      const dir = w.windWarn > 0 ? w.windDir : Math.sign(w.wind);
      if (dir !== 0 && ((w.frame >> 3) % 2 || w.windWarn === 0)) f.draw(g, dir < 0 ? '↑↑' : '↓↓', 456, 120, w.windWarn > 0 ? 'O5' : 'C4', 2, 'center', 'N0');
    }
    void DRONE; void EF;
  }
}

export function carrierColor(k: string): string {
  switch (k) {
    case 'arms': return '#ff6a3d';
    case 'wisp': return PAL.C4;
    case 'aegis': return PAL.G3;
    case 'drive': return PAL.Y3;
    case 'armsChip': return PAL.N8;
    case 'subChip': return PAL.P4;
    case 'oneUp': return PAL.Y4;
    default: return PAL.N8;
  }
}

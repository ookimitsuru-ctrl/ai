// Visual effects: particles, explosions (docs/07_visual.md §6). Uses fxRng only (never game rng).
import { fxRng as R } from '../core/rng';
import { PAL } from '../render/palette';
import type { Particle, ParticleKind, Pool } from './entities';

export class Fx {
  scale = 1; // auto-quality: 0.5 halves particle counts
  constructor(public pool: Pool<Particle>) {}

  p(kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, o: Partial<Particle> = {}): Particle {
    const q = this.pool.getOrRecycle();
    q.active = true; q.kind = kind; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = life; q.max = life;
    q.size = size; q.grow = 0; q.color = color; q.color2 = color; q.grav = 0; q.drag = 1; q.rot = 0; q.vr = 0; q.add = false; q.src = null;
    Object.assign(q, o);
    return q;
  }

  n(base: number): number { return Math.max(1, Math.round(base * this.scale)); }

  sparks(x: number, y: number, count: number, color: string, angle = 0, spread = 360, speed = 2.5, life = 10): void {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = ((angle + (R.next() - 0.5) * spread) * Math.PI) / 180;
      const s = speed * (0.4 + R.next() * 0.8);
      this.p('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + R.next() * 0.6), 1, color, { add: true, drag: 0.9, color2: PAL.N8 });
    }
  }

  ring(x: number, y: number, r: number, color: string, life: number, width = 2): void {
    this.p('ring', x, y, 0, 0, life, 0, color, { grow: r / life, add: true, sw: width });
  }

  glow(x: number, y: number, r: number, color: string, life: number): void {
    this.p('glow', x, y, 0, 0, life, r, color, { add: true });
  }

  smoke(x: number, y: number, n = 2, size = 4): void {
    for (let i = 0; i < this.n(n); i++) this.p('smoke', x + (R.next() - 0.5) * 6, y + (R.next() - 0.5) * 6, (R.next() - 0.5) * 0.4 - 0.3, -0.2 - R.next() * 0.3, 30 + R.next() * 20, size + R.next() * 3, PAL.N3, { grow: 0.12, drag: 0.97 });
  }

  fireball(x: number, y: number, r: number, delay = 0, life = 18): void {
    this.p('fire', x, y, (R.next() - 0.5) * 0.4, (R.next() - 0.5) * 0.4, life + delay, r, PAL.Y4, { sx: delay, add: false });
  }

  embers(x: number, y: number, n: number, speed = 2, color: string = PAL.O5): void {
    for (let i = 0; i < this.n(n); i++) {
      const a = R.next() * Math.PI * 2, s = speed * (0.3 + R.next());
      this.p('ember', x, y, Math.cos(a) * s, Math.sin(a) * s - 0.5, 30 + R.next() * 40, 1, color, { grav: 0.04, drag: 0.97, add: true });
    }
  }

  debris(x: number, y: number, n: number, src: CanvasImageSource | null, sw = 0, sh = 0, color: string = PAL.N5): void {
    for (let i = 0; i < this.n(n); i++) {
      const a = R.next() * Math.PI * 2, s = 0.8 + R.next() * 2.4;
      const q = this.p('debris', x + (R.next() - 0.5) * 8, y + (R.next() - 0.5) * 8, Math.cos(a) * s, Math.sin(a) * s - 0.6, 40 + R.next() * 30, 2 + R.next() * 2, color, { grav: 0.06, drag: 0.99, vr: (R.next() - 0.5) * 0.4 });
      if (src && sw > 4 && sh > 4) {
        q.src = src; q.sw = 4; q.sh = 4;
        q.sx = Math.floor(R.next() * (sw - 4)); q.sy = Math.floor(R.next() * (sh - 4));
      }
    }
  }

  shards(x: number, y: number, n: number, colors: string[], speed = 2.5): void {
    for (let i = 0; i < this.n(n); i++) {
      const a = R.next() * Math.PI * 2, s = speed * (0.3 + R.next());
      this.p('shard', x + (R.next() - 0.5) * 6, y + (R.next() - 0.5) * 6, Math.cos(a) * s, Math.sin(a) * s, 30 + R.next() * 40, 2 + R.next() * 3, colors[i % colors.length]!, { grav: 0.05, drag: 0.98, vr: (R.next() - 0.5) * 0.5, rot: R.next() * 6 });
    }
  }

  drops(x: number, y: number, n: number, colors: string[]): void {
    for (let i = 0; i < this.n(n); i++) {
      const a = R.next() * Math.PI * 2, s = 0.5 + R.next() * 2.5;
      this.p('drop', x, y, Math.cos(a) * s, Math.sin(a) * s - 0.8, 30 + R.next() * 30, 1 + R.next() * 2, colors[i % colors.length]!, { grav: 0.08, drag: 0.98 });
    }
  }

  explosion(x: number, y: number, size: 'small' | 'medium' | 'large' | 'organic' | 'crystal' | 'tiny', src?: CanvasImageSource, sw = 0, sh = 0): void {
    switch (size) {
      case 'tiny':
        this.p('flash', x, y, 0, 0, 3, 5, PAL.N8, { add: true });
        this.sparks(x, y, 4, PAL.O5, 0, 360, 1.8, 8);
        break;
      case 'small':
        this.p('flash', x, y, 0, 0, 3, 8, PAL.N8, { add: true });
        this.fireball(x, y, 7);
        this.sparks(x, y, 8, PAL.O5, 0, 360, 2.6, 12);
        this.debris(x, y, 4, src ?? null, sw, sh);
        this.smoke(x, y, 2, 3);
        break;
      case 'organic':
        this.p('flash', x, y, 0, 0, 3, 8, PAL.T3, { add: true });
        this.drops(x, y, 12, [PAL.T3, PAL.G3, PAL.F3, PAL.G4]);
        this.fireball(x, y, 6);
        this.smoke(x, y, 2, 3);
        break;
      case 'crystal':
        this.p('flash', x, y, 0, 0, 4, 10, PAL.P4, { add: true });
        this.shards(x, y, 14, [PAL.P3, PAL.P4, PAL.C4, PAL.N8]);
        this.sparks(x, y, 8, PAL.C4, 0, 360, 3, 12);
        break;
      case 'medium':
        this.p('flash', x, y, 0, 0, 3, 14, PAL.N8, { add: true });
        for (let i = 0; i < 3; i++) this.fireball(x + (R.next() - 0.5) * 20, y + (R.next() - 0.5) * 20, 9 + R.next() * 4, i * 4, 20);
        this.ring(x, y, 28, PAL.C4, 14);
        this.sparks(x, y, 16, PAL.O5, 0, 360, 3.4, 14);
        this.debris(x, y, 6, src ?? null, sw, sh);
        this.smoke(x, y, 4, 5);
        break;
      case 'large':
        this.p('flash', x, y, 0, 0, 4, 24, PAL.N8, { add: true });
        for (let i = 0; i < 6; i++) this.fireball(x + (R.next() - 0.5) * 36, y + (R.next() - 0.5) * 30, 11 + R.next() * 6, i * 4, 22);
        this.ring(x, y, 40, PAL.C4, 16, 3);
        this.ring(x, y, 60, PAL.O5, 22, 2);
        this.sparks(x, y, 24, PAL.O5, 0, 360, 4, 16);
        this.embers(x, y, 20, 2.4);
        this.debris(x, y, 10, src ?? null, sw, sh);
        this.smoke(x, y, 6, 6);
        break;
    }
  }

  update(): void {
    for (const q of this.pool.items) {
      if (!q.active) continue;
      if (q.kind === 'fire' && q.sx > 0) { q.sx--; continue; }
      q.life--;
      if (q.life <= 0) { q.active = false; continue; }
      q.vy += q.grav;
      q.vx *= q.drag; q.vy *= q.drag;
      q.x += q.vx; q.y += q.vy;
      q.rot += q.vr;
      if (q.kind === 'ring') q.size += q.grow;
      else if (q.grow) q.size += q.grow;
    }
  }
}

// Debug overlay & commands (?debug=1) — docs/10_plan_qa.md §6.
import { font } from '../render/font';
import { rgba } from '../render/palette';
import { audio } from '../audio/engine';
import { ENEMIES } from '../game/registry';
import type { GameScene } from './game';

export class Debug {
  on = true;
  hitboxes = false;
  paused = false;
  step = false;
  slow = 1;
  spawnIdx = 0;
  private keys = new Set<string>();
  constructor(private g: GameScene) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
  }
  update(): void {
    const k = this.keys;
    const w = this.g.world;
    const p = w.player;
    if (k.has('Backquote')) this.on = !this.on;
    if (k.has('KeyH')) { this.hitboxes = !this.hitboxes; this.g.view.hitboxes = this.hitboxes; }
    if (k.has('KeyI')) { p.godMode = !p.godMode; }
    if (k.has('KeyM')) { p.lv = 5; p.drones = 4; p.sub = p.sub ?? 'seeker'; p.subLv = 2; p.barrier = 3; p.drive = 100; }
    for (let i = 1; i <= 6; i++) if (k.has('F' + i)) { this.g.run.stage = i; this.g.run.startAt = 'start'; this.g.startStage(); }
    if (k.has('PageDown')) { const cps = w.stage.checkpoints; const next = cps.find((c) => c.at > w.t + 30); if (next) { this.g.run.startAt = next.id; this.g.startStage(); } }
    if (k.has('KeyB')) {
      const b = w.boss?.active ? w.boss : w.midboss?.active ? w.midboss : null;
      if (b?.parts) { const pt = b.parts.find((q) => q.alive && !q.armored && q.maxHp < 1e6); if (pt) w.damageEnemy(b, pt, 99999, 0); }
      else if (b) w.damageEnemy(b, null, 99999, 0);
      else { this.g.run.startAt = 'boss'; this.g.startStage(); }
    }
    if (k.has('KeyN')) { this.g.run.startAt = 'midboss'; this.g.startStage(); }
    if (k.has('Pause') || k.has('KeyO')) this.paused = !this.paused;
    if (k.has('Period')) this.step = true;
    if (k.has('KeyE')) {
      const ids = [...ENEMIES.keys()];
      const id = ids[this.spawnIdx++ % ids.length]!;
      w.spawnEnemy(id, 420, 135, {});
    }
    if (k.has('KeyX') && k.has('ShiftLeft')) {
      for (let i = 0; i < 600; i++) w.spawnBullet(240 + Math.cos(i) * 200, 135 + Math.sin(i * 1.3) * 120, i * 7, 0.6, 'pellet', { force: true });
      for (let i = 0; i < 300; i++) w.fx.explosion(Math.random() * 480, Math.random() * 270, 'small');
    }
    if (k.has('KeyT')) audio.sfx('extend');
    k.clear();
  }
  render(h: CanvasRenderingContext2D): void {
    if (!this.on) return;
    const w = this.g.world;
    const f = font();
    h.fillStyle = rgba('N0', 0.55);
    h.fillRect(2, 20, 150, 74);
    const lines = [
      `T ${w.t} F ${w.frame} ${w.phase}`,
      `EN ${w.enemies.count()} BU ${w.bullets.count()} PA ${w.particles.count()}`,
      `RANK ${w.rank.toFixed(1)} SEC ${w.section} CP ${w.checkpoint}`,
      `CAM ${w.camX.toFixed(0)},${w.camY.toFixed(0)} SCR ${w.scrollVX.toFixed(2)}`,
      `GOD ${w.player.godMode ? 'ON' : 'OFF'} ${this.paused ? 'PAUSED' : ''}`,
      w.stage.beatBpm && audio.music ? `DRIFT ${audio.music.driftMs(((w.frame - w.musicStartFrame) * w.stage.beatBpm * 48) / 3600).toFixed(0)}MS` : `ITEMS ${w.stats.itemsGot}/${w.stats.itemsTotal}`,
      `WAIT ${w.waiting ?? '-'} BOSS ${w.bossTimer}`,
    ];
    lines.forEach((l, i) => f.draw(h, l, 5, 23 + i * 10, 'N8'));
  }
}

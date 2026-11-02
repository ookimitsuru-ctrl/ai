// Enemy / boss definition registry. Content modules register themselves at boot.
import type { Enemy, Part, Shape, SizeClass } from './entities';
import type { Ctx } from './script';
import type { World } from './world';

export type ScriptFn = (e: Enemy, c: Ctx) => Generator<number | undefined, void, unknown>;

export interface EnemyDef {
  id: string;
  hp: number;
  score: number;
  size: SizeClass;
  flags?: number;
  shape: Shape;
  sprite?: string;
  anim?: number;               // frames per animation frame
  behaviors?: Record<string, ScriptFn>;
  script?: ScriptFn;
  init?(e: Enemy, c: Ctx): void;
  draw?(g: CanvasRenderingContext2D, e: Enemy, x: number, y: number, w: World): void;
  onDeath?(e: Enemy, c: Ctx): void;
  onHit?(e: Enemy, part: Part | null, dmg: number, c: Ctx): void;
  explosion?: 'small' | 'medium' | 'large' | 'organic' | 'crystal' | 'none';
  drive?: number;
  bossName?: string;
  timeLimit?: number;          // frames (bosses / midbosses)
  hitSound?: string;
  deathSound?: string;
  layer?: 0 | 1;
}

export const ENEMIES = new Map<string, EnemyDef>();

export function defEnemy(d: EnemyDef): EnemyDef {
  ENEMIES.set(d.id, d);
  return d;
}

// Content registration: sprites are built at boot; enemy/boss modules register on import.
import { buildCommon } from './sprites/common';
import { buildEnemies1 } from './sprites/enemies1';
import './enemies/common';
import './bosses/st1';

export function buildAllSprites(): void {
  buildCommon();
  buildEnemies1();
}

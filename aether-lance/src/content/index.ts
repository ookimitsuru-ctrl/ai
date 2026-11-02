// Content registration: sprites are built at boot; enemy/boss modules register on import.
import { buildCommon } from './sprites/common';
import { buildEnemies1 } from './sprites/enemies1';
import { buildEnemies2 } from './sprites/enemies2';
import { buildEnemies3 } from './sprites/enemies3';
import './enemies/common';
import './enemies/st2';
import './enemies/st3';
import './bosses/st1';
import './bosses/st2';
import './bosses/st3';

export function buildAllSprites(): void {
  buildCommon();
  buildEnemies1();
  buildEnemies2();
  buildEnemies3();
}

import type { World } from '../../game/world';
import { orbitBackground } from './orbit';
import { caveBackground } from './cave';
import { hiveBackground } from './hive';
import { stormBackground } from './storm';
import { foundryBackground } from './foundry';
import { StarField } from './common';
import { PAL } from '../../render/palette';

export interface Background {
  draw(g: CanvasRenderingContext2D, w: World): void;
  drawMid?(g: CanvasRenderingContext2D, w: World): void;
  drawFg?(g: CanvasRenderingContext2D, w: World): void;
}

export const BACKGROUNDS: Record<string, (w: World) => Background> = {
  orbit: (w) => orbitBackground(w),
  cave: (w) => caveBackground(w),
  hive: (w) => hiveBackground(w),
  storm: (w) => stormBackground(w),
  foundry: (w) => foundryBackground(w),
  space: () => {
    const s = new StarField(3);
    return { draw(g, w) { g.fillStyle = PAL.N0; g.fillRect(0, 0, 480, 270); s.draw(g, w.bgX, w.bgY, w.frame); } };
  },
};

export function registerBackground(id: string, f: (w: World) => Background): void {
  BACKGROUNDS[id] = f;
}

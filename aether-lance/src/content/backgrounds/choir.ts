// STAGE 6 background: the Choir Core — white/gold geometry, beat pulses, organ pipes lit by the music.
import { PAL } from '../../render/palette';
import { layerCanvas, type Canvas } from '../../render/sprite';
import { blit, lw, snap } from '../../core/hd';
import { gradientCanvas, drawRepeat } from './common';
import { drawRing, drawGlow } from '../../render/draw';
import { audio } from '../../audio/engine';
import type { Background } from './index';
import type { World } from '../../game/world';

function arches(): Canvas {
  const { c, g } = layerCanvas(720, 270);
  for (let i = 0; i < 6; i++) {
    const x = i * 120 + 20;
    g.fillStyle = PAL.C0; g.fillRect(x, 40, 16, 230);
    g.fillStyle = PAL.N3; g.fillRect(x + 2, 40, 3, 230);
    g.strokeStyle = PAL.N3; g.lineWidth = 3;
    g.beginPath(); g.arc(x + 68, 70, 52, Math.PI, 0); g.stroke();
    g.fillStyle = PAL.Y1; g.fillRect(x + 6, 36, 4, 4);
  }
  return c;
}

function pipes(): Canvas {
  const { c, g } = layerCanvas(600, 270);
  for (let i = 0; i < 24; i++) {
    const x = i * 25 + 4, h = 70 + ((i * 37) % 5) * 22;
    g.fillStyle = PAL.N2; g.fillRect(x, 270 - h, 12, h);
    g.fillStyle = PAL.N4; g.fillRect(x + 2, 270 - h, 2, h);
    g.fillStyle = PAL.N1; g.fillRect(x, 270 - h, 12, 3);
  }
  return c;
}

export function choirBackground(_w: World): Background {
  const grad = gradientCanvas(480, 270, ['N0', 'C0', 'N2', 'C0', 'N0']);
  const arc = arches();
  const pip = pipes();
  return {
    draw(g, w) {
      blit(g, grad, 0, 0);
      const silent = !!w.stageData.silence;
      // beat pulse rings from the centre
      if (!silent && w.stage.beatBpm) {
        const ph = (((w.frame - w.beatOrigin) % w.beatLen) + w.beatLen) % w.beatLen;
        const k = ph / w.beatLen;
        g.globalAlpha = (1 - k) * 0.35;
        drawRing(g, 300, 135, 20 + k * 220, PAL.C3, 1);
        drawRing(g, 300, 135, 60 + k * 260, PAL.Y2, 1);
        g.globalAlpha = 1;
      }
      // rotating halo of light
      g.globalAlpha = 0.25;
      for (let k = 0; k < 12; k++) {
        const a = w.frame * 0.003 + (k * Math.PI) / 6;
        g.fillStyle = k % 2 ? PAL.Y2 : PAL.C2;
        g.fillRect(Math.round(300 + Math.cos(a) * 170), Math.round(135 + Math.sin(a) * 110), 3, 3);
      }
      g.globalAlpha = 1;
      drawRepeat(g, arc, w.bgX, 0.15, 0);
      // organ pipes glow with the music
      const act = silent ? 0 : Math.max(audio.music?.activity('choir') ?? 0, audio.music?.activity('organ') ?? 0, audio.music?.activity('lead') ?? 0);
      let x0 = -((w.bgX * 0.4) % lw(pip)); if (x0 > 0) x0 -= lw(pip);
      for (let x = x0; x < 480; x += lw(pip)) blit(g, pip, snap(x), 0);
      if (act > 0.05) {
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 20; i++) {
          const px = ((i * 25 + 10 - w.bgX * 0.4) % 600 + 600) % 600;
          if (px > 480) continue;
          drawGlow(g, px, 250 - (i % 5) * 20, 14, i % 3 ? PAL.C3 : PAL.Y3, act * 0.5);
        }
        g.globalCompositeOperation = 'source-over';
      }
      if (silent) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 480, 270); }
    },
  };
}

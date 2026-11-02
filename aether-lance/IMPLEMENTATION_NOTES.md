# AETHER LANCE — implementation notes

Spec: `docs/` (README → 01..11). This file tracks how the code maps to it and any deviations.

## Layout
- `src/core` — loop helpers, input (keyboard/pad/touch → actions), deterministic math (`dmath`), RNG, scenes, save.
- `src/render` — palette, sprite builder (auto-shaded pixel art `SB`), bitmap fonts, WebGL2 post (bloom/CRT/shockwaves) + Canvas2D fallback, world renderer, HUD, terrain painter.
- `src/audio` — MML parser, WebAudio instruments, look-ahead sequencer, offline-synthesised SFX, engine.
- `src/game` — World (fixed update order), player/weapons/drones, terrain bitmap, script context (coroutines + bullet patterns), FX, bot.
- `src/content` — sprites, enemies, bosses, stages, backgrounds, music (all procedural / code-authored).
- `src/scenes` — boot/title/menus, game, pause, options/keyconfig, practice, records, ending, demo, debug.

## Testing
- `npm test` — vitest: MML/song alignment, headless stage simulation (autopilot clears each stage; determinism hash).
- `?debug=1` — debug overlay; keys: ` overlay, H hitboxes, I god, M max power, F1-F6 stage, N midboss, B boss/kill part, PgDn next checkpoint, O pause, . step, E spawn enemy, Shift+X stress.

## Deviations from the spec (intentional)
- Terrain is a per-pixel material bitmap in 256×256 chunks instead of 16×16 tiles with masks (same behaviour, simpler authoring; 02 §7.3).
- Bitmap font glyphs are 5×7 in a 6×8 cell (07 §10 says 8×8).
- Enemy broadphase is brute force (enemy counts are small) instead of a uniform grid (02 §7.2).
- Debug code is bundled (enabled only with `?debug`) instead of a dynamic import, so the single-file build stays one file.
- `|` in MML is a bar line everywhere; the repeat break is `/` (08 §4.1 updated).

## Progress (resume from here)
Done: engine, UI/scenes, stages 1–4 (+ midbosses/bosses, music), headless tests (`npm test`: sim, music, bosses).
In progress: stage 5 FOUNDRY — `src/content/sprites/enemies5.ts` written; still to write:
`content/enemies/st5.ts` (press, beltgun, welder, scrap, assembly wrapper, molten-falls controller),
`content/bosses/st5.ts` (assemblyarm MB5, anvil B5), `content/backgrounds/foundry.ts`, `content/stages/stage5.ts`
(vertical shaft via scrollV, conveyors via stage.onUpdate → w.conveyorPush, haze via w.haze), song `st5`.
Then: stage 6 CHOIR CORE (beat sync 24f/beat, rhythm walls `dyn` kind 'rhythm', ECHO, SERAPH, CANTOR, ANTIPHON,
THE CHOIR 3 forms incl. melody bullets from `final2` lead track), songs `st6`, `final1`, `final2`, heartbeat.
Then: loop-2 check, PWA manifest/icon + `npm run build:single`, GitHub Pages workflow, Playwright e2e script,
docs update (deviations), final QA screenshots, commit/push.
Register new content in `src/content/index.ts`, `content/stages/index.ts`, `content/music/index.ts`, `content/backgrounds/index.ts`.

# AETHER LANCE — implementation notes

Spec: `docs/` (README → 01..11). This file maps the code to the spec and lists every intentional deviation.
Player-facing instructions are in `README.md`.

## Status

Complete (v1.0.0). All MUST items and nearly all SHOULD items of the spec are implemented:

- 6 stages, 6 midbosses and 6 bosses (THE CHOIR has 3 forms), loop 2, true ending, continues, checkpoints.
- PULSE / FAN / RAY Lv1–5, GRAVITY BOMB / SEEKER, WISP drones in 3 formations, AEGIS, Lance Drive, rank, 4 difficulties.
- ARCADE, PRACTICE (any reached stage / checkpoint / loadout), BOSS RUSH (unlocks after a clear), ranking with name entry.
- Replays: every arcade / boss-rush run is recorded, and the #1 run of each board is stored and can be watched from the ranking.
- All music (15 MML songs incl. drive layers and jingles) and SFX are synthesised in WebAudio; all graphics are generated in code.
- Options: language (JA/EN), key and pad bindings, scaling / CRT / bloom / quality, volumes and sound test,
  accessibility (shake, flash reduction, bullet emphasis, hitbox, background dim, game speed), save export / import.
- Touch controls (relative drag, DRIVE / FORM / pause buttons, left-handed layout), gamepad, PWA (offline), single-file build,
  Android APK (`android/`), GitHub Actions workflow (tests, builds, single-HTML and APK artifacts, Pages deploy from the default branch).
- DotGothic16 is bundled as a 23 KB subset of the characters the game prints (`src/assets/fonts`, regenerate with
  `node scripts/subset-font.mjs`; `font.test.ts` fails when new text needs it). No build makes any network request.

## Android

`android/` is a plain Gradle project (AGP 8.5, no library dependencies) whose only code is `MainActivity.java`:
a full-screen, landscape WebView that serves `assets/www/index.html` (the single-file build, copied in by the
`copyWebAssets` task) from `https://appassets.androidplatform.net/` via `shouldInterceptRequest`, so the page has a
secure origin with working localStorage / WebAudio / WebGL2 and the app needs no INTERNET permission. Back calls
`window.AetherLance.back()` (main.ts), which sends Escape and returns false on the boot / title screens so the app
exits there. `WebView.onPause()` makes the page hidden, which pauses the game and suspends audio. All builds are
signed with `android/keystore/aetherlance.keystore` (password `aetherlance`, deliberately public) so newer APKs install
over older ones; a store release would need a private key. There was no emulator available (no KVM), so the APK was
verified statically (aapt2 badging, apksigner, lint: 0 errors) and the page itself by the e2e scenario
"android shell" (Pixel 7 landscape, app-assets origin, all other requests blocked, back-button behaviour, saves kept).

## Layout

- `src/core` — input (keyboard / pad / touch → actions), deterministic math (`dmath`), RNG, scene stack, save data.
- `src/render` — palette, sprite builder (auto-shaded pixel art `SB`), bitmap font, WebGL2 post (bloom / CRT / shockwaves / heat haze)
  with a Canvas2D fallback, hi-res overlay canvas for Japanese text, world renderer, HUD, terrain painter.
- `src/audio` — MML parser, WebAudio instruments, look-ahead sequencer (beat sync via `syncTo`), synthesised SFX, engine.
- `src/game` — World (fixed update order), player / weapons / drones, terrain bitmap, script context (generator coroutines +
  bullet patterns), FX, autopilot bot, replay encoding.
- `src/content` — sprites, enemies, bosses, stages, backgrounds, music (all procedural / code-authored).
- `src/scenes` — boot / title / menus, game, pause, options / key config, practice, records (name entry, ranking, credits),
  ending, attract demo, debug.

## Promotional video

`scripts/make-pv.mjs` films a 40 s, text-free PV straight from the game: `?debug` exposes `window.__dev`; the script
stops the real-time loop and calls `__dev.advance(1)` once per video frame (frame-exact, deterministic autopilot in god
mode), with `src/core/pv.ts` flags hiding the HUD, every bitmap / overlay text and the logo, and keeping one music
track running across cuts. The audio mixer is rebuilt on an `OfflineAudioContext` behind a Proxy whose `currentTime` is
the video clock, so the stage-1 theme and the gameplay SFX are scheduled exactly on the frames and rendered at the end.
Twelve shots cut on bar lines (150 BPM, 96 frames per bar), with the drive-layer hats on in the B section.

## Testing

- `npm test` (Vitest, 47 tests):
  - `music.test.ts` — MML parsing, repeats, every song's tracks are the same length and a whole number of bars.
  - `sim.test.ts` — the autopilot clears every stage headlessly; two runs with the same input give the same state hash.
  - `bosses.test.ts` — every midboss and boss can actually be destroyed (regression for unreachable weak points).
  - `replay.test.ts` — replay encoding round-trips exactly; a recorded mortal run (keyboard + touch input) replays to the same state.
  - `font.test.ts` — the bundled font subset covers every character in `src/`.
- `npm run e2e` (Playwright, against `dist/` and `dist-single/`): boot / title, start a game and score, pause / resume,
  touch drag on an iPhone 12 profile, live run vs. its replay (frame, score, position, kills must match), best score →
  stored replay → playback from the ranking, single-file build from `file://`, Android shell (see "Android" above).
- `?debug=1` — debug overlay; keys: `` ` `` overlay, H hitboxes, I god, M max power, F1–F6 stage, N midboss, B boss / kill part,
  PgDn next checkpoint, O pause, `.` step, E spawn enemy, Shift+X stress.

## Deviations from the spec (intentional)

- **Terrain** is a per-pixel material bitmap in 256×256 chunks instead of 16×16 tiles with masks (same behaviour,
  simpler authoring; 02 §7.3). Materials: rock, crystal, breakable, conveyor L/R, alternate.
- **Bitmap font** glyphs are 5×7 in a 6×8 cell (07 §10 says 8×8). Japanese text uses the overlay canvas (DotGothic16).
- **Enemy broadphase** is brute force (enemy counts are small) instead of a uniform grid (02 §7.2).
- **Debug code** is bundled (enabled only with `?debug`) instead of a dynamic import, so the single-file build stays one file.
- **MML**: `|` is a bar line everywhere; the repeat break is `/`; `^` ties without repeating the pitch (also after chords and
  rests); `{...}` chords; per-song `meter`. 08 §4.1 has been updated to match.
- **Stage 2 branch** is laid out inside the screen height (upper and lower routes split by a crystal island) instead of a
  taller world with a vertical camera (02 §6 SHOULD). Stage 5's vertical shaft does use vertical scrolling.
- **Attract demo** is played by the autopilot (stage 1, god mode, 90 s) instead of a recorded developer replay (09 §3.3).
  It never desyncs after balance changes, which a stored input log would.
- **Replays** are kept in localStorage as `aetherlance.replay.<board>` (header + RLE-varint-base64 input log) rather than
  listed in `SaveData.replays`; the ranking checks that the stored replay still matches the #1 entry. A replay records
  each stage's shot mode and the in-scene decisions (tally skip, continue) as extra input bits, so it stays in sync even
  if options change mid-run. Replays are tied to the game version string.
- **Default scaling** is FIT instead of INTEGER on touch (coarse-pointer) devices: integer steps waste too much of a
  phone screen. The boot screen's iPhone silent-switch hint is only shown on iOS.
- **Save data in the single-file build** works the same (localStorage), but the service worker is only registered for the
  served PWA build.

## Not implemented (COULD items)

- SCORE ATTACK mode (03 §12).
- Statistics screen and achievements (03 §13). Lifetime stats are counted in the save data, and a per-run flight record
  is shown in the ending, but there is no separate stats / achievements screen.
- The SHOULD "survival bot" that searches for unavoidable bullet situations (10 §3) is covered only partially: the autopilot
  clears all stages and defeats every boss, but there is no automated "no escape" detector.

## v1.1 changes

- Player ship redesigned as the KESTREL Mk.II (40×20 sprite in `content/sprites/common.ts`): white armour with red
  bands, twin propellant tanks, wing-tip laser cannons, twin blue ion engines (flame at x-18, y-1.5 / y+2.5; muzzle at
  x+19). Hitbox unchanged. HUD lives icon, classic icon (generated from the sprite by `scripts/make-icons.cjs`) and the
  HD vector icon (`scripts/make-icons-hd.cjs`) follow the new design.
- Filler waves (`World.stepFillers`, `StageDef.fillers` / `fillersV`, `FILLER` in balance.ts): between scripted waves,
  whenever fewer than 5 enemies are around, a stage-specific formation enters from an open spot on the right edge
  (the top edge in vertical-scroll sections). Not within 45 frames of a scripted spawn, not in the 6 s before a midboss
  or boss, not in stage 6's silence. Uses the game RNG, so runs stay deterministic.
- Boss damage (`BOSS_DMG`): player damage vs. the midboss / boss ×3.6 (FAN ×1.8 on top); attacks unchanged.
  `bosses.test.ts` now requires every midboss and boss to fall to a Lv3 / two-drone loadout with each main weapon.
- Bug fix: RAY shots reset their trail to zero points right after spawning, so they never hit anything.
- Version 1.1.0 (replays from 1.0 are rejected).

## Automated device test

- `?autotest=<minutes>` (`scenes/autotest.ts`, started from `main.ts`): the look-ahead autopilot (`game/planner.ts`,
  mortal) plays each stage in turn with the loadout a player normally has there (docs/03 §5.7), cycling the
  difficulties (`diff=normal,hard`) and the three main weapons, continuing up to three times per attempt. Options:
  `stages=1-6`, `speed=1..4`, `vol=0..10`. Each observation is one console line `ALTEST {json}`
  (begin / start / death with cause / midboss / boss / clear / gameover / fps every 30 s / done); a results table is
  shown on screen at the end. Death causes come from `World.hitSrc` (`bullet:<kind>`, `hazard:<kind>`,
  `contact:<enemy>`, `terrain`, `crush`).
- `game/planner.ts`: each frame it tries the 9 stick directions for 6 frames followed by each of the 9 again up to
  26 frames ahead, predicting the player's terrain box on the exact camera path (`profile.X/Y`), bullets (linear),
  enemy bodies (current velocity) and hazards (incl. telegraphs about to fire), and picks the safest path that lines
  up with a target. The old potential-field bot (`bot.ts`) stays for the attract demo and the god-mode tests.
- Android: `MainActivity` appends the launch intent's `query` extra to the start URL and forwards `ALTEST` lines and
  page errors (`JSERR`) to logcat under the tag `AetherLance`.
- `scripts/device-test.py` (host side, stdlib Python + adb): installs the APK, starts the test, follows logcat, polls
  battery temperature and restarts the app if it dies, takes a screenshot every 5 minutes and, if a local LLM is
  running (Ollama `/api/*` or OpenAI-compatible `/v1/*`), has a vision model check it; at the end it computes
  per-difficulty/stage numbers and automatic findings and asks the LLM for a balance review → `report.md`.

## v1.1.1 changes (headless balance sweep)

A sweep with the look-ahead autopilot (every stage × PULSE / FAN / RAY × NORMAL / HARD, mortal, with the loadout
a player normally has there) plus boss-fight timing runs found:

- **Respawn into the wall (stage 5).** In the vertical shaft the fixed respawn point (60, 135) is inside the shaft
  wall; the ship was pushed out to the screen edge while invulnerable and died again the moment invulnerability ran
  out, every 5 s until the lives were gone. `World.entrySpot()` now picks the nearest spot that stays clear of terrain
  through the entry and the invulnerability (also used after a continue).
- **Press warning out of place (stage 5).** The press scrolls with the terrain, but its warning band stayed where the
  press was when the warning started, so the head came down up to ~26 px left of the band. The band now follows it.
- **Stage 1 boss hatches could not be hit.** The WARDEN's hatches sit behind the armoured bow, so straight shots never
  reached them and phase 1 only ended by its 50 s timeout (the fight took 95–120 s; even with ×200 damage it took
  56 s). Their hit boxes now reach forward to the bow.
- **SEEKER fed the stage 2 boss's counter-laser.** Seekers homed on a multi-part enemy's centre, which on the GOLEM
  is the chest crystal that absorbs hits and answers with a reflecting laser fan, so carrying SEEKER provoked attacks
  and did no damage. Seekers now home on the nearest part that can take damage.
- **Boss damage per stage** (`BOSS_DMG.midboss` / `.boss`, see balance.ts): the uniform ×3.6 left stage 1 long (the
  first midboss escaped with PULSE Lv1, FAN timed out on the boss) while the late bosses melted in 4–15 s at full
  power. Multipliers are now set so a midboss takes about 10–20 s and a boss about 40–80 s with the usual power, and
  `bosses.test.ts` (Lv3, two drones, no sub weapon) still beats every one well within its time limit.
- Version 1.1.1 (v1.1.0 replays are rejected).

## HD edition

A second edition with modern, high-resolution art; the game itself (logic, content, audio) is shared. Build-time
switch `__HD__` (`AL_EDITION=hd`: `npm run build:hd`, `npm run build:single:hd`); Android flavour `hd`
(`com.aetherlance.game.hd`, label "AETHER LANCE HD", own launcher icon from `scripts/make-icons-hd.cjs`).
`src/core/hd.ts` holds `HD`, the render scale `RS` (3, or 2 on devices with ≤ 3 GB memory or ≤ 4 cores) and helpers
for canvases stored at RS× but drawn in game units (`k`, `lw`/`lh`, `blit`, `snap`).
- Renderer: game and HUD canvases RS× with a matching transform (all drawing code stays in 480×270 units), linear
  sampling, bloom chain sized to the larger texture. Defaults: FIT, soft, CRT off. Own save and replay keys.
- Sprites (`spriteHD.ts`): the sprite builder records its primitives; they are re-rasterised at RS×2 with continuous
  ramp shading, Blinn-Phong gloss, rim light, a thin AA outline and a 2×2 downsample. Smooth rotations, soft carrier
  halo, glaze-style hit flash; pixel-string sprites are edge-smoothed.
- Terrain (`terrainRenderHD.ts`, `terrainThemesHD.ts`): bilinear occupancy → anti-aliased contours, a continuous
  distance-field normal, and one continuous-colour material per theme; chunks are painted RS× in time-sliced jobs
  ahead of the camera.
- Backgrounds: `paintCanvas` at 2× with the ordered dither blurred into smooth colour (alpha kept crisp), vector
  layers via `layerCanvas` at RS×, round twinkling stars.
- Effects (`worldRenderHD.ts`): cached glowing bolts for PULSE / FAN, layered beams for RAY, lasers, lightning and
  arcs; gradient exhaust; soft particles; bevelled breakables; smooth wave walls and rhythm walls; continuous wave arcs.
- Text: bitmap-font calls draw Rajdhani (bundled OFL subset) sized to the pixel font's cap height; Japanese uses the
  system sans-serif; chrome logo; gradient HUD plates for readability on bright stages.
- e2e: "HD edition boots and plays" (render scale active, scoring, canvas not black).

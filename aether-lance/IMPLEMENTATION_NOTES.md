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

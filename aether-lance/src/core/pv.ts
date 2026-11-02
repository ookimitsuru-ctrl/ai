// Capture ("PV") mode, driven by scripts/make-pv.mjs through the ?debug hooks (window.__dev).
// textless: no HUD, no bitmap / overlay text, no logo.  lockMusic: the game's own music commands are ignored so one
// track can run across cuts.  muteSfx: silence while the capture script fast-forwards between shots.
// Never enabled in normal play.
export const pv = { textless: false, lockMusic: false, muteSfx: false, sfxVol: 1 };

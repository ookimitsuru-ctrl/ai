// Options, key config and controls reference (docs/09_ui.md §3.14–3.15).
import { scenes, type Scene } from '../core/scene';
import { input, ACTIONS, keyLabel, padLabel, DEFAULT_KEYS, DEFAULT_PAD, type Action } from '../core/input';
import { save, persist, defaultSettings, defaultSave } from '../core/save';
import { renderer } from '../render/renderer';
import { font } from '../render/font';
import { PAL } from '../render/palette';
import { audio } from '../audio/engine';
import { t, type StrKey } from '../i18n/index';
import { Menu, Confirm, panel, type MenuItem } from '../ui/menu';
import { backdrop } from './backdrop';
import { saveSettings } from '../app';

type Tab = 'game' | 'controls' | 'video' | 'audio' | 'access' | 'data';

function cycle<T>(arr: readonly T[], v: T, d: number): T { const i = arr.indexOf(v); return arr[(i + d + arr.length) % arr.length]!; }
const onoff = (b: boolean) => (b ? 'ON' : 'OFF');

export class OptionsScene implements Scene {
  t = 0;
  tabs: Tab[];
  tab = 0;
  menus: Record<string, Menu> = {};
  confirm = new Confirm();
  testSong = 0;
  testSfx = 0;
  constructor(private fromPause = false) {
    this.tabs = fromPause ? ['audio', 'video', 'access'] : ['game', 'controls', 'video', 'audio', 'access', 'data'];
    const S = () => save.data.settings;
    const set = (fn: () => void) => () => { fn(); saveSettings(); };
    const L = (k: StrKey) => () => t(k);
    const num = (get: () => number, setv: (v: number) => void, lo: number, hi: number, step: number) => ({
      left: set(() => setv(Math.max(lo, Math.round((get() - step) * 100) / 100))),
      right: set(() => setv(Math.min(hi, Math.round((get() + step) * 100) / 100))),
    });
    const songs = ['title', 'st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'boss', 'final1', 'final2', 'name_entry', 'ending'];
    const sfxIds = ['shot_pulse', 'explode_l', 'pickup_arms', 'drive_start', 'extend', 'boss_die', 'lightning_strike', 'glass_shatter', 'siren'];
    const M: Record<Tab, MenuItem[]> = {
      game: [
        { label: L('opt.lang'), value: () => (S().lang === 'ja' ? '日本語' : 'ENGLISH'), left: set(() => { S().lang = S().lang === 'ja' ? 'en' : 'ja'; }), right: set(() => { S().lang = S().lang === 'ja' ? 'en' : 'ja'; }) },
        { label: L('opt.shotMode'), value: () => S().shotMode.toUpperCase(), left: set(() => { S().shotMode = S().shotMode === 'hold' ? 'toggle' : 'hold'; }), right: set(() => { S().shotMode = S().shotMode === 'hold' ? 'toggle' : 'hold'; }) },
        { label: L('opt.touchSens'), value: () => S().touchSensitivity.toFixed(1), ...num(() => S().touchSensitivity, (v) => { S().touchSensitivity = v; }, 0.8, 2.0, 0.1) },
        { label: L('opt.touchLayout'), value: () => S().touchLayout.toUpperCase(), left: set(() => { S().touchLayout = S().touchLayout === 'right' ? 'left' : 'right'; }), right: set(() => { S().touchLayout = S().touchLayout === 'right' ? 'left' : 'right'; }) },
        { label: L('opt.alwaysFire'), value: () => onoff(S().touchAlwaysFire), left: set(() => { S().touchAlwaysFire = !S().touchAlwaysFire; }), right: set(() => { S().touchAlwaysFire = !S().touchAlwaysFire; }) },
        { label: L('opt.vibration'), value: () => onoff(S().vibration), left: set(() => { S().vibration = !S().vibration; }), right: set(() => { S().vibration = !S().vibration; }) },
      ],
      controls: [
        { label: L('opt.keys'), action: () => scenes.push(new KeyConfigScene(false)) },
        { label: L('opt.padkeys'), action: () => scenes.push(new KeyConfigScene(true)) },
        { label: L('opt.analog'), value: () => onoff(S().analogMove), left: set(() => { S().analogMove = !S().analogMove; }), right: set(() => { S().analogMove = !S().analogMove; }) },
        { label: L('opt.resetKeys'), action: () => this.confirm.open(t('confirm.reset'), set(() => { S().keys = structuredClone(DEFAULT_KEYS); S().pad = structuredClone(DEFAULT_PAD); })) },
      ],
      video: [
        { label: L('opt.scale'), value: () => S().scaleMode.toUpperCase(), left: set(() => { S().scaleMode = cycle(['integer', 'fit', 'stretch'] as const, S().scaleMode, -1); }), right: set(() => { S().scaleMode = cycle(['integer', 'fit', 'stretch'] as const, S().scaleMode, 1); }) },
        { label: L('opt.filter'), value: () => S().scaleFilter.toUpperCase(), left: set(() => { S().scaleFilter = S().scaleFilter === 'sharp' ? 'soft' : 'sharp'; }), right: set(() => { S().scaleFilter = S().scaleFilter === 'sharp' ? 'soft' : 'sharp'; }) },
        { label: L('opt.crt'), value: () => S().crt.toUpperCase(), left: set(() => { S().crt = cycle(['off', 'light', 'strong'] as const, S().crt, -1); }), right: set(() => { S().crt = cycle(['off', 'light', 'strong'] as const, S().crt, 1); }) },
        { label: L('opt.scanline'), value: () => S().scanline + '%', ...num(() => S().scanline, (v) => { S().scanline = v; }, 0, 100, 5) },
        { label: L('opt.bloom'), value: () => S().bloom + '%', ...num(() => S().bloom, (v) => { S().bloom = v; }, 0, 100, 5) },
        { label: L('opt.interp'), value: () => onoff(S().interpolate), left: set(() => { S().interpolate = !S().interpolate; }), right: set(() => { S().interpolate = !S().interpolate; }) },
        { label: L('opt.quality'), value: () => S().quality.toUpperCase(), left: set(() => { S().quality = cycle(['auto', 'high', 'low'] as const, S().quality, -1); renderer.lowQuality = false; }), right: set(() => { S().quality = cycle(['auto', 'high', 'low'] as const, S().quality, 1); renderer.lowQuality = false; }) },
        { label: L('opt.fullscreen'), value: () => onoff(!!document.fullscreenElement), action: () => { void renderer.toggleFullscreen(); } },
        { label: L('opt.fps'), value: () => onoff(S().showFps), left: set(() => { S().showFps = !S().showFps; }), right: set(() => { S().showFps = !S().showFps; }) },
      ],
      audio: [
        { label: L('opt.master'), value: () => '■'.repeat(S().volMaster) + '□'.repeat(10 - S().volMaster), ...num(() => S().volMaster, (v) => { S().volMaster = v; }, 0, 10, 1) },
        { label: L('opt.bgm'), value: () => '■'.repeat(S().volBgm) + '□'.repeat(10 - S().volBgm), ...num(() => S().volBgm, (v) => { S().volBgm = v; }, 0, 10, 1) },
        { label: L('opt.sfx'), value: () => '■'.repeat(S().volSfx) + '□'.repeat(10 - S().volSfx), ...num(() => S().volSfx, (v) => { S().volSfx = v; audio.sfx('pickup_chip'); }, 0, 10, 1) },
        ...(fromPause ? [] : [
          { label: () => 'BGM', value: () => (save.data.progress.heardSongs.includes(songs[this.testSong]!) || this.testSong === 0 ? songs[this.testSong]!.toUpperCase() : '???'), left: () => { this.testSong = (this.testSong + songs.length - 1) % songs.length; }, right: () => { this.testSong = (this.testSong + 1) % songs.length; }, action: () => { const id = songs[this.testSong]!; if (save.data.progress.heardSongs.includes(id) || id === 'title') audio.playMusic(id, 0.3); } },
          { label: () => 'SE', value: () => sfxIds[this.testSfx]!.toUpperCase(), left: () => { this.testSfx = (this.testSfx + sfxIds.length - 1) % sfxIds.length; }, right: () => { this.testSfx = (this.testSfx + 1) % sfxIds.length; }, action: () => audio.sfx(sfxIds[this.testSfx]!) },
        ]),
      ],
      access: [
        { label: L('opt.shake'), value: () => S().shake.toUpperCase(), left: set(() => { S().shake = cycle(['off', 'half', 'full'] as const, S().shake, -1); }), right: set(() => { S().shake = cycle(['off', 'half', 'full'] as const, S().shake, 1); }) },
        { label: L('opt.flash'), value: () => onoff(S().flashReduce), left: set(() => { S().flashReduce = !S().flashReduce; }), right: set(() => { S().flashReduce = !S().flashReduce; }) },
        { label: L('opt.emphasis'), value: () => onoff(S().bulletEmphasis), left: set(() => { S().bulletEmphasis = !S().bulletEmphasis; }), right: set(() => { S().bulletEmphasis = !S().bulletEmphasis; }) },
        { label: L('opt.hitbox'), value: () => onoff(S().showHitbox), left: set(() => { S().showHitbox = !S().showHitbox; }), right: set(() => { S().showHitbox = !S().showHitbox; }) },
        { label: L('opt.bgDim'), value: () => S().bgDim + '%', ...num(() => S().bgDim, (v) => { S().bgDim = v; }, 0, 60, 10) },
        ...(fromPause ? [] : [{ label: L('opt.speed'), value: () => S().gameSpeed + '%', left: set(() => { S().gameSpeed = cycle([100, 90, 80] as const, S().gameSpeed, -1); }), right: set(() => { S().gameSpeed = cycle([100, 90, 80] as const, S().gameSpeed, 1); }) }]),
      ],
      data: [
        { label: L('opt.resetSettings'), action: () => this.confirm.open(t('confirm.reset'), set(() => { const lang = S().lang; save.data.settings = defaultSettings(); save.data.settings.lang = lang; })) },
        { label: L('opt.erase'), action: () => this.confirm.open(t('confirm.erase'), () => setTimeout(() => this.confirm.open(t('confirm.erase2'), () => { const st = save.data.settings; save.data = defaultSave(); save.data.settings = st; persist(); }), 0)) },
        { label: L('opt.export'), action: () => { try { void navigator.clipboard.writeText(btoa(unescape(encodeURIComponent(JSON.stringify(save.data))))); audio.sfx('pickup_chip'); } catch { /* */ } } },
        { label: L('opt.import'), action: () => { try { const s = window.prompt('SAVE DATA'); if (s) { const parsed = JSON.parse(decodeURIComponent(escape(atob(s.trim())))); localStorage.setItem('aetherlance.save.v1', JSON.stringify(parsed)); location.reload(); } } catch { /* */ } } },
      ],
    };
    for (const tb of this.tabs) this.menus[tb] = new Menu(M[tb], 70, 66, 15, 'left', 340, 11);
  }

  get menu(): Menu { return this.menus[this.tabs[this.tab]!]!; }

  update(): void {
    this.t++;
    if (this.confirm.active) { this.confirm.update(); return; }
    const p = input.pointer;
    if (p.clicked && p.y >= 30 && p.y < 46) {
      const tw = 400 / this.tabs.length;
      const i = Math.floor((p.x - 40) / tw);
      if (i >= 0 && i < this.tabs.length) { this.tab = i; audio.sfx('menu_move'); p.clicked = false; }
    }
    if (input.hit('speedUp') || input.hit('formation')) { this.tab = (this.tab + 1) % this.tabs.length; audio.sfx('menu_move'); }
    const r = this.menu.update();
    if (r === 'cancel') { persist(); scenes.pop(); }
  }

  render(): void {
    const g = renderer.game;
    if (!this.fromPause) backdrop.draw(g, 0.6);
    const h = renderer.hud;
    const f = font();
    f.draw(h, 'OPTIONS', 240, 12, 'N8', 2, 'center', 'N1');
    const tw = 400 / this.tabs.length;
    this.tabs.forEach((tb, i) => {
      const on = i === this.tab;
      panel(h, 40 + i * tw + 1, 30, tw - 2, 16, on ? 0.9 : 0.4);
      renderer.text(t(('opt.tab.' + tb) as StrKey), 40 + i * tw + tw / 2, 34, { size: 8, align: 'center', color: on ? 'N8' : 'N5' });
    });
    panel(h, 50, 56, 380, 176, 0.75);
    // labels via overlay (japanese), values via bitmap font
    const m = this.menu;
    for (let k = 0; k < Math.min(m.items.length, m.visible); k++) {
      const i = k + m.scroll;
      const it = m.items[i]!;
      const y = m.y + k * m.gap;
      const on = i === m.sel;
      renderer.text(m.label(it), m.x, y - 1, { size: 8, color: on ? 'N8' : 'N5' });
      if (it.value) f.draw(h, (it.left ? '◀ ' : '') + it.value() + (it.right ? ' ▶' : ''), m.x + m.width, y, on ? 'C4' : 'N6', 1, 'right');
      if (on) { h.fillStyle = PAL.C2; h.fillRect(m.x - 12, y + 2, 6, 2); h.fillStyle = PAL.N8; h.fillRect(m.x - 6, y + 2, 2, 2); }
    }
    f.draw(h, 'C/V: NEXT TAB   ←→: CHANGE   X/ESC: BACK', 240, 244, 'N4', 1, 'center');
    this.confirm.draw(h, this.t, t('confirm.yes'), t('confirm.no'));
  }
}

const ACT_LABEL: Record<Action, StrKey | string> = {
  up: '↑', down: '↓', left: '←', right: '→', shot: 'controls.shot', drive: 'controls.drive', speedUp: 'SPEED +', speedDown: 'SPEED −', formation: 'controls.form', pause: 'controls.pause', confirm: 'OK', cancel: 'CANCEL',
};

export class KeyConfigScene implements Scene {
  t = 0;
  sel = 0;
  col = 0;
  waiting = false;
  constructor(private pad: boolean) {}
  update(): void {
    this.t++;
    if (this.waiting) return;
    const n = ACTIONS.length + 1;
    if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; audio.sfx('menu_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % n; audio.sfx('menu_move'); }
    if (!this.pad && (input.repeat('left') || input.repeat('right'))) { this.col = 1 - this.col; audio.sfx('menu_move'); }
    const p = input.pointer;
    if (p.clicked) { const i = Math.floor((p.y - 46) / 14); if (i >= 0 && i < n) { this.sel = i; if (!this.pad) this.col = p.x > 330 ? 1 : 0; this.activate(); } return; }
    if (input.hit('confirm') || (input.hit('shot') && this.sel === ACTIONS.length)) this.activate();
    else if (input.hit('cancel') || (this.pad && input.hit('drive'))) { audio.sfx('menu_cancel'); saveSettings(); scenes.pop(); }
  }
  activate(): void {
    if (this.sel === ACTIONS.length) { audio.sfx('menu_cancel'); saveSettings(); scenes.pop(); return; }
    const a = ACTIONS[this.sel]!;
    const S = save.data.settings;
    this.waiting = true;
    audio.sfx('menu_confirm');
    if (!this.pad) {
      input.captureKey = (code) => {
        this.waiting = false;
        if (code === 'Escape' && a !== 'pause' && a !== 'cancel') return;
        // swap duplicates
        for (const b of ACTIONS) for (let k = 0; k < 2; k++) if (S.keys[b][k] === code && !(b === a && k === this.col)) S.keys[b][k] = S.keys[a][this.col];
        S.keys[a][this.col] = code;
        saveSettings();
      };
    } else {
      if (!input.padConnected) { this.waiting = false; return; }
      input.capturePad = (btn) => {
        this.waiting = false;
        for (const b of ACTIONS) S.pad[b] = S.pad[b].filter((x) => x !== btn || b === a || (a === 'shot' && b === 'confirm') || (a === 'confirm' && b === 'shot') || (a === 'drive' && b === 'cancel') || (a === 'cancel' && b === 'drive'));
        S.pad[a] = [btn];
        saveSettings();
      };
    }
  }
  render(): void {
    const g = renderer.game;
    backdrop.draw(g, 0.7);
    const h = renderer.hud;
    const f = font();
    f.draw(h, this.pad ? 'GAMEPAD' : 'KEYBOARD', 240, 18, 'N8', 2, 'center', 'N1');
    panel(h, 90, 40, 300, 200, 0.8);
    const S = save.data.settings;
    ACTIONS.forEach((a, i) => {
      const y = 48 + i * 14;
      const on = i === this.sel;
      const lab = ACT_LABEL[a];
      if (lab.includes('.')) renderer.text(t(lab as StrKey), 110, y - 1, { size: 8, color: on ? 'N8' : 'N5' });
      else f.draw(h, lab, 110, y, on ? 'N8' : 'N5');
      if (!this.pad) {
        for (let k = 0; k < 2; k++) {
          const sel = on && this.col === k;
          const txt = this.waiting && sel ? '...' : keyLabel(S.keys[a][k]);
          f.draw(h, txt, 280 + k * 80, y, sel ? 'C4' : 'N6', 1, 'center');
        }
      } else f.draw(h, this.waiting && on ? '...' : S.pad[a].map(padLabel).join(' / ') || '---', 320, y, on ? 'C4' : 'N6', 1, 'center');
    });
    const backY = 48 + ACTIONS.length * 14;
    f.draw(h, 'BACK', 240, backY, this.sel === ACTIONS.length ? 'N8' : 'N5', 1, 'center');
    if (this.waiting) renderer.text(this.pad ? t('opt.pressPad') : t('opt.press'), 240, 246, { size: 8, align: 'center', color: 'O5' });
    else if (this.pad && !input.padConnected) renderer.text(t('opt.noPad'), 240, 246, { size: 8, align: 'center', color: 'N5' });
  }
}

export class ControlsPanel {
  draw(h: CanvasRenderingContext2D): void {
    const f = font();
    panel(h, 40, 30, 400, 210, 0.92);
    f.draw(h, 'CONTROLS', 240, 38, 'N8', 2, 'center');
    const S = save.data.settings;
    const rows: [StrKey, string, string][] = [
      ['controls.move', `${keyLabel(S.keys.up[0])}${keyLabel(S.keys.down[0])}${keyLabel(S.keys.left[0])}${keyLabel(S.keys.right[0])} / WASD`, 'D-PAD / STICK'],
      ['controls.shot', `${keyLabel(S.keys.shot[0])} / ${keyLabel(S.keys.shot[1])}`, S.pad.shot.map(padLabel).join('/')],
      ['controls.drive', `${keyLabel(S.keys.drive[0])} / ${keyLabel(S.keys.drive[1])}`, S.pad.drive.map(padLabel).join('/')],
      ['controls.speed', `${keyLabel(S.keys.speedUp[0])} / ${keyLabel(S.keys.speedUp[1])}`, `${S.pad.speedUp.map(padLabel).join('/')} ${S.pad.speedDown.map(padLabel).join('/')}`],
      ['controls.form', `${keyLabel(S.keys.formation[0])} / ${keyLabel(S.keys.formation[1])}`, S.pad.formation.map(padLabel).join('/')],
      ['controls.pause', `${keyLabel(S.keys.pause[0])} / ${keyLabel(S.keys.pause[1])}`, S.pad.pause.map(padLabel).join('/')],
    ];
    f.draw(h, 'KEYBOARD', 260, 64, 'N5', 1, 'center'); f.draw(h, 'PAD', 380, 64, 'N5', 1, 'center');
    rows.forEach(([k, kb, pd], i) => {
      const y = 80 + i * 16;
      renderer.text(t(k), 56, y - 1, { size: 8, color: 'N7', maxW: 150 });
      f.draw(h, kb, 260, y, 'C4', 1, 'center');
      f.draw(h, pd, 380, y, 'C4', 1, 'center');
    });
    renderer.textWrap(t('controls.touch'), 56, 184, 368, { size: 8, color: 'N6' });
  }
}

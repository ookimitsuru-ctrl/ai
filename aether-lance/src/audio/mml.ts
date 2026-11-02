// MML parser (docs/08_audio.md §4.1). Resolution: whole note = 192 ticks (quarter = 48).
//   t o < > l v @name q p k L  notes a-g (+ # -)  r  & ^  [ ... / ... ]n  {chord}  | (bar line, ignored)  ; comment

export const TPQ = 48;
export const WHOLE = TPQ * 4;

export interface NoteEv {
  tick: number;
  dur: number;   // ticks until next event of the voice (written length)
  gate: number;  // sounding ticks
  midi: number;
  vel: number;   // 0..1
  inst: string;
  pan: number;   // -1..1
}

export interface TrackData {
  events: NoteEv[];
  total: number;
  loop: number; // tick of loop start, -1 = no loop
  tempo: number | null;
}

/** Expand [ body ]n. Optional '/' marks where the LAST pass stops ([A/B]3 = A B A B A). */
export function expandRepeats(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '[') {
      let depth = 1, j = i + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        if (depth > 0) j++;
      }
      const body = expandRepeats(src.slice(i + 1, j));
      j++;
      let num = '';
      while (j < src.length && /[0-9]/.test(src[j]!)) num += src[j++];
      const n = num ? parseInt(num, 10) : 2;
      // top-level '/' split (body already expanded, nested '/' consumed)
      const k = body.indexOf('/');
      const pre = k >= 0 ? body.slice(0, k) : body;
      const post = k >= 0 ? body.slice(k + 1) : '';
      for (let r = 0; r < n; r++) out += ' ' + pre + ' ' + (r < n - 1 ? post : '') + ' ';
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function parseMML(source: string, defaultInst = 'lead_pulse'): TrackData {
  const s = expandRepeats(source);
  const events: NoteEv[] = [];
  let i = 0;
  let tick = 0;
  let octave = 4;
  let defLen = TPQ / 2;
  let vel = 12 / 15;
  let inst = defaultInst;
  let gate = 7 / 8;
  let pan = 0;
  let transpose = 0;
  let loop = -1;
  let tempo: number | null = null;
  let lastNotes: NoteEv[] = [];

  const peekNum = (): string => {
    let n = '';
    while (i < s.length && /[0-9]/.test(s[i]!)) n += s[i++];
    return n;
  };
  const signedNum = (): number => {
    let sign = 1;
    if (s[i] === '-') { sign = -1; i++; } else if (s[i] === '+') i++;
    return sign * parseInt(peekNum() || '0', 10);
  };
  const length = (fallback: number): number => {
    const n = peekNum();
    let len = n ? Math.round(WHOLE / parseInt(n, 10)) : fallback;
    let add = len / 2;
    while (s[i] === '.') { len += add; add /= 2; i++; }
    return Math.round(len);
  };
  const skipWs = () => { while (i < s.length && /[\s|]/.test(s[i]!)) i++; };
  const readNote = (): { midi: number } | null => {
    const ch = s[i]!.toLowerCase();
    if (!(ch in SEMI)) return null;
    i++;
    let semi = SEMI[ch]!;
    while (s[i] === '+' || s[i] === '#' || s[i] === '-') { semi += s[i] === '-' ? -1 : 1; i++; }
    return { midi: (octave + 1) * 12 + semi + transpose };
  };
  const applyTie = () => {
    // & note-or-length, ^ length
    for (;;) {
      skipWs();
      if (s[i] === '&' || s[i] === '^') {
        const tieCh = s[i];
        i++;
        skipWs();
        let add: number;
        if (tieCh === '&' && /[a-g]/i.test(s[i] ?? '')) { readNote(); add = length(defLen); } else add = length(defLen);
        for (const n of lastNotes) { n.dur += add; n.gate = Math.max(1, Math.round(n.dur * gate)); }
        tick += add;
      } else break;
    }
  };

  while (i < s.length) {
    const c = s[i]!;
    if (/[\s|]/.test(c)) { i++; continue; }
    if (c === ';') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === 't') { i++; tempo = parseInt(peekNum() || '120', 10); continue; }
    if (c === 'o') { i++; octave = parseInt(peekNum() || '4', 10); continue; }
    if (c === '<') { i++; octave--; continue; }
    if (c === '>') { i++; octave++; continue; }
    if (c === 'l') { i++; defLen = length(defLen); continue; }
    if (c === 'v') { i++; vel = Math.min(15, parseInt(peekNum() || '12', 10)) / 15; continue; }
    if (c === 'q') { i++; gate = Math.max(1, Math.min(8, parseInt(peekNum() || '7', 10))) / 8; continue; }
    if (c === 'p') { i++; pan = Math.max(-64, Math.min(64, signedNum())) / 64; continue; }
    if (c === 'k') { i++; transpose = signedNum(); continue; }
    if (c === 'L') { i++; loop = tick; continue; }
    if (c === '@') {
      i++;
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i]!)) name += s[i++];
      inst = name;
      continue;
    }
    if (c === 'r') {
      i++;
      const len = length(defLen);
      tick += len;
      lastNotes = [];
      continue;
    }
    if (c === '{') {
      i++;
      const pitches: number[] = [];
      while (i < s.length && s[i] !== '}') {
        const ch = s[i]!;
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '<') { octave--; i++; continue; }
        if (ch === '>') { octave++; i++; continue; }
        const n = readNote();
        if (n) pitches.push(n.midi);
        else i++;
      }
      i++; // }
      const len = length(defLen);
      lastNotes = pitches.map((midi) => ({ tick, dur: len, gate: Math.max(1, Math.round(len * gate)), midi, vel, inst, pan }));
      events.push(...lastNotes);
      tick += len;
      applyTie();
      continue;
    }
    const n = /[a-g]/i.test(c) ? readNote() : null;
    if (n) {
      const len = length(defLen);
      const ev: NoteEv = { tick, dur: len, gate: Math.max(1, Math.round(len * gate)), midi: n.midi, vel, inst, pan };
      events.push(ev);
      lastNotes = [ev];
      tick += len;
      applyTie();
      continue;
    }
    i++; // unknown char: ignore
  }
  events.sort((a, b) => a.tick - b.tick);
  return { events, total: tick, loop, tempo };
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

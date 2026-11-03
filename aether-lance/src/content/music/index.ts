import type { SongDef } from '../../audio/sequencer';
import { st1, boss, title, jingle_clear, jingle_gameover, name_entry, ending } from './songs1';
import { st2, st3, st4, st5 } from './songs2';
import { st6, final1, final2, resolve } from './songs3';

export const ALL_SONGS: Record<string, SongDef> = Object.fromEntries(
  [st1, boss, title, jingle_clear, jingle_gameover, name_entry, ending, st2, st3, st4, st5, st6, final1, final2, resolve].map((s) => [s.id, s]),
);

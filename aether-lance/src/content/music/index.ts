import type { SongDef } from '../../audio/sequencer';
import { st1, boss, title, jingle_clear, jingle_gameover, name_entry, ending } from './songs1';

export const ALL_SONGS: Record<string, SongDef> = Object.fromEntries(
  [st1, boss, title, jingle_clear, jingle_gameover, name_entry, ending].map((s) => [s.id, s]),
);

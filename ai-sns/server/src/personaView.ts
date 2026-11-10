import { PERSONAS, TOPIC_BY_ID } from "./data";
import type { Persona } from "./types";

/** アプリに返してよいペルソナ情報だけ(interests / theta / speech / samples などの内部設定は出さない) */
export interface PublicPersona {
  slot: number;
  locked: false;
  id: string;
  name: string;
  handle: string;
  age: number;
  occupation: string;
  bio: string;
  personality: string[];
  favoriteTopics: string[];
  followedAt: number;
}

/** 未フォローのペルソナは「???」のシルエット。名前もIDも出さない(ネタバレ・総当たり防止) */
export interface LockedPersona {
  slot: number;
  locked: true;
}

export function toPublic(p: Persona, slot: number, followedAt: number): PublicPersona {
  return {
    slot,
    locked: false,
    id: p.id,
    name: p.name,
    handle: p.handle,
    age: p.age,
    occupation: p.occupation,
    bio: p.bio,
    personality: p.personality,
    favoriteTopics: p.interests.strong.map((id) => TOPIC_BY_ID.get(id)?.label ?? id),
    followedAt,
  };
}

/** そのユーザーのフォロー状況に応じた20枠の一覧 */
export function buildPersonaList(followed: Map<string, number>): (PublicPersona | LockedPersona)[] {
  return PERSONAS.map((p, i) => {
    const at = followed.get(p.id);
    return at === undefined ? { slot: i + 1, locked: true as const } : toPublic(p, i + 1, at);
  });
}

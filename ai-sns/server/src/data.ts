import personasJson from "../data/personas.json";
import topicsJson from "../data/topics.json";
import type { Persona, Topic } from "./types";

export const PERSONAS = personasJson.personas as Persona[];
export const TOPICS = topicsJson.topics as Topic[];

export const PERSONA_BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));
export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

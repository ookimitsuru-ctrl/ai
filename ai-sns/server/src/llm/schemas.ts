import { TOPICS } from "../data";

export const TOPICS_SCHEMA_NAME = "topics_result";
export function topicsSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      topics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tag: { type: "string", enum: TOPICS.map((t) => t.id) },
            weight: { type: "number" },
          },
          required: ["tag", "weight"],
          additionalProperties: false,
        },
      },
    },
    required: ["topics"],
    additionalProperties: false,
  };
}

export const REPLIES_SCHEMA_NAME = "replies_result";
export function repliesSchema(personaIds: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      replies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            personaId: { type: "string", enum: personaIds },
            text: { type: "string" },
          },
          required: ["personaId", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["replies"],
    additionalProperties: false,
  };
}

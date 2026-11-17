/**
 * Client-safe shapes and limits for workspace skills. Uploaded content never
 * leaves the server through this module — pages pass full instructions only to
 * the client that renders the preview.
 */

export type CustomSkillSummary = {
  id: number;
  name: string;
  description: string;
  instructions: string;
  /** Original uploaded filename, or null for an inline skill. */
  sourceName: string | null;
  /** ISO timestamp; RSC payloads stay plain strings. */
  createdAt: string;
};

export const CUSTOM_SKILL_NAME_MAX = 80;
export const CUSTOM_SKILL_DESCRIPTION_MAX = 280;
export const CUSTOM_SKILL_INSTRUCTIONS_MAX = 40_000;
export const CUSTOM_SKILLS_MAX = 50;
export const CUSTOM_SKILL_FILE_BYTES_MAX = 40_000;

export const CUSTOM_SKILL_FILE_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

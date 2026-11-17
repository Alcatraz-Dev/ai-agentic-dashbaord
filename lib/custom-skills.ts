import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { customSkills, db } from "@/db";
import type { CustomSkillSummary } from "@/lib/custom-skill-types";

export type NewCustomSkillInput = {
  name: string;
  description: string;
  instructions: string;
  sourceName: string | null;
};

const columns = {
  id: customSkills.id,
  name: customSkills.name,
  description: customSkills.description,
  instructions: customSkills.instructions,
  sourceName: customSkills.sourceName,
  createdAt: customSkills.createdAt,
};

function toSummary(row: {
  id: number;
  name: string;
  description: string;
  instructions: string;
  sourceName: string | null;
  createdAt: Date;
}): CustomSkillSummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Workspace skills, oldest first so the page order is stable. */
export async function listCustomSkillsForUser(profileId: number): Promise<CustomSkillSummary[]> {
  const rows = await db
    .select(columns)
    .from(customSkills)
    .where(eq(customSkills.ownerId, profileId))
    .orderBy(asc(customSkills.createdAt), asc(customSkills.id));

  return rows.map(toSummary);
}

/**
 * The same rows, used by the agent runtime. The full instructions travel here
 * but never into the prompt: only names and descriptions are listed, and the
 * `use_skill` tool loads one body when the task needs it.
 */
export async function listCustomSkillsForRuntime(
  profileId: number,
): Promise<CustomSkillSummary[]> {
  return listCustomSkillsForUser(profileId);
}

export async function countCustomSkillsForUser(profileId: number): Promise<number> {
  const rows = await db
    .select({ id: customSkills.id })
    .from(customSkills)
    .where(eq(customSkills.ownerId, profileId));

  return rows.length;
}

/** True when this owner already has a skill with the same display name. */
export async function customSkillNameExists(
  profileId: number,
  name: string,
): Promise<boolean> {
  const rows = await db
    .select({ name: customSkills.name })
    .from(customSkills)
    .where(eq(customSkills.ownerId, profileId));

  return rows.some((entry) => entry.name.toLowerCase() === name.toLowerCase());
}

export async function createCustomSkillForUser(
  profileId: number,
  input: NewCustomSkillInput,
): Promise<CustomSkillSummary> {
  const [row] = await db
    .insert(customSkills)
    .values({
      ownerId: profileId,
      name: input.name,
      description: input.description,
      instructions: input.instructions,
      sourceName: input.sourceName,
    })
    .returning(columns);

  if (!row) throw new Error("The custom skill insert returned no row.");
  return toSummary(row);
}

/** Owner-scoped, so another user's id deletes nothing. */
export async function deleteCustomSkillForUser(
  profileId: number,
  skillId: number,
): Promise<boolean> {
  if (!Number.isInteger(skillId) || skillId <= 0) return false;

  const rows = await db
    .delete(customSkills)
    .where(and(eq(customSkills.ownerId, profileId), eq(customSkills.id, skillId)))
    .returning({ id: customSkills.id });

  return rows.length > 0;
}

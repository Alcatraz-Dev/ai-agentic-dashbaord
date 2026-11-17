import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { customDiagrams, db } from "@/db";
import type { CustomDiagramSummary } from "@/lib/custom-diagram-types";

export type NewCustomDiagramInput = {
  name: string;
  description: string;
  source: string;
  sourceName: string | null;
};

const columns = {
  id: customDiagrams.id,
  name: customDiagrams.name,
  description: customDiagrams.description,
  source: customDiagrams.source,
  sourceName: customDiagrams.sourceName,
  createdAt: customDiagrams.createdAt,
};

function toSummary(row: {
  id: number;
  name: string;
  description: string;
  source: string;
  sourceName: string | null;
  createdAt: Date;
}): CustomDiagramSummary {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Workspace diagrams, oldest first so the page order is stable. */
export async function listCustomDiagramsForUser(
  profileId: number,
): Promise<CustomDiagramSummary[]> {
  const rows = await db
    .select(columns)
    .from(customDiagrams)
    .where(eq(customDiagrams.ownerId, profileId))
    .orderBy(asc(customDiagrams.createdAt), asc(customDiagrams.id));

  return rows.map(toSummary);
}

/**
 * The same rows, used by the agent runtime. The source travels here but not
 * into the prompt: only names and descriptions are listed, and `use_diagram`
 * loads one body when a task refers to it.
 */
export async function listCustomDiagramsForRuntime(
  profileId: number,
): Promise<CustomDiagramSummary[]> {
  return listCustomDiagramsForUser(profileId);
}

export async function countCustomDiagramsForUser(profileId: number): Promise<number> {
  const rows = await db
    .select({ id: customDiagrams.id })
    .from(customDiagrams)
    .where(eq(customDiagrams.ownerId, profileId));

  return rows.length;
}

/** True when this owner already has a diagram with the same display name. */
export async function customDiagramNameExists(
  profileId: number,
  name: string,
): Promise<boolean> {
  const rows = await db
    .select({ name: customDiagrams.name })
    .from(customDiagrams)
    .where(eq(customDiagrams.ownerId, profileId));

  return rows.some((entry) => entry.name.toLowerCase() === name.toLowerCase());
}

export async function createCustomDiagramForUser(
  profileId: number,
  input: NewCustomDiagramInput,
): Promise<CustomDiagramSummary> {
  const [row] = await db
    .insert(customDiagrams)
    .values({
      ownerId: profileId,
      name: input.name,
      description: input.description,
      source: input.source,
      sourceName: input.sourceName,
    })
    .returning(columns);

  if (!row) throw new Error("The custom diagram insert returned no row.");
  return toSummary(row);
}

export async function getCustomDiagramForUser(
  profileId: number,
  diagramId: number,
): Promise<CustomDiagramSummary | null> {
  if (!Number.isInteger(diagramId) || diagramId <= 0) return null;

  const [row] = await db
    .select(columns)
    .from(customDiagrams)
    .where(and(eq(customDiagrams.ownerId, profileId), eq(customDiagrams.id, diagramId)))
    .limit(1);

  return row ? toSummary(row) : null;
}

/** Owner-scoped rename / re-describe / re-source, for the library's edit flow. */
export async function updateCustomDiagramForUser(
  profileId: number,
  diagramId: number,
  input: { name: string; description: string; source: string; sourceName?: string | null },
): Promise<CustomDiagramSummary | null> {
  if (!Number.isInteger(diagramId) || diagramId <= 0) return null;

  const [row] = await db
    .update(customDiagrams)
    .set({
      name: input.name,
      description: input.description,
      source: input.source,
      ...(input.sourceName === undefined ? {} : { sourceName: input.sourceName }),
      updatedAt: new Date(),
    })
    .where(and(eq(customDiagrams.ownerId, profileId), eq(customDiagrams.id, diagramId)))
    .returning(columns);

  return row ? toSummary(row) : null;
}

/** Owner-scoped, so another user's id deletes nothing. */
export async function deleteCustomDiagramForUser(
  profileId: number,
  diagramId: number,
): Promise<boolean> {
  if (!Number.isInteger(diagramId) || diagramId <= 0) return false;

  const rows = await db
    .delete(customDiagrams)
    .where(and(eq(customDiagrams.ownerId, profileId), eq(customDiagrams.id, diagramId)))
    .returning({ id: customDiagrams.id });

  return rows.length > 0;
}

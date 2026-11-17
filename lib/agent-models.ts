/** Server-only saved models: list / create / delete */
import { db } from "@/db";
import { agentModels } from "@/db";
import { eq, and } from "drizzle-orm";

export type AgentModel = {
  id: number;
  ownerId: number;
  label: string;
  model: string;
  baseUrl: string;
  api: string;
  apiKey: string; // encrypted
  createdAt: Date;
  updatedAt: Date;
};

/** List all saved models for a user, ordered oldest-first */
export async function listAgentModelsForUser(ownerId: number) {
  return await db
    .select()
    .from(agentModels)
    .where(and(eq(agentModels.ownerId, ownerId)))
    .orderBy(agentModels.createdAt);
}

/** One saved model, owner-scoped. Used to validate a picker key and resolve a run. */
export async function getAgentModelForUser(ownerId: number, modelId: number) {
  const [row] = await db
    .select()
    .from(agentModels)
    .where(and(eq(agentModels.ownerId, ownerId), eq(agentModels.id, modelId)))
    .limit(1);

  return row ?? null;
}

/** Create a new saved model (BYO AI) */
export async function createAgentModelForUser(
  ownerId: number,
  label: string,
  model: string,
  baseUrl: string,
  api: string,
  apiKey: string
) {
  const [row] = await db
    .insert(agentModels)
    .values({
      ownerId,
      label,
      model,
      baseUrl,
      api,
      apiKey, // sealed by secrets.ts before insert
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  return row;
}

/** Delete a saved model by id */
export async function deleteAgentModelForUser(ownerId: number, modelId: number) {
  await db
    .delete(agentModels)
    .where(and(eq(agentModels.ownerId, ownerId), eq(agentModels.id, modelId)));
}
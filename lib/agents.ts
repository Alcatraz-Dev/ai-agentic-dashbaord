import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { agents, db } from "@/db";
import type { AgentApprovalMode, AgentDetail, AgentSummary } from "@/lib/agent-options";

export type NewAgentInput = {
  name: string;
  avatar: string;
  color: string;
  provider: string;
  instructions: string | null;
};

const agentColumns = {
  id: agents.id,
  name: agents.name,
  avatar: agents.avatar,
  color: agents.color,
  provider: agents.provider,
  /** Column is text; the UI only ever sees the three known modes. */
  approvalMode: sql<AgentApprovalMode>`${agents.approvalMode}`.as("approval_mode"),
  enabledTools: agents.enabledTools,
  mcpTools: agents.mcpTools,
  enabledSkills: agents.enabledSkills,
  enabledPlugins: agents.enabledPlugins,
  enabledDiagrams: agents.enabledDiagrams,
};

/** Agents owned by an app user, oldest first so the sidebar order is stable. */
export async function listAgentsForUser(profileId: number): Promise<AgentSummary[]> {
  return db
    .select(agentColumns)
    .from(agents)
    .where(eq(agents.ownerId, profileId))
    .orderBy(asc(agents.createdAt), asc(agents.id));
}

/** One agent, scoped to its owner. Returns null when missing or not theirs. */
export async function getAgentForUser(
  profileId: number,
  agentId: number,
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .select({ ...agentColumns, instructions: agents.instructions })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);

  return row ?? null;
}

export type AgentUpdateInput = Pick<
  NewAgentInput,
  "name" | "avatar" | "color" | "instructions"
>;

/**
 * Updates one agent, scoped to its owner — an id belonging to someone else
 * matches no row and returns null.
 */
export async function updateAgentForUser(
  profileId: number,
  agentId: number,
  input: AgentUpdateInput,
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .update(agents)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Changes only the model provider, scoped to the owner. Used by the model
 * pickers so switching models never rewrites the rest of the agent.
 */
export async function setAgentProviderForUser(
  profileId: number,
  agentId: number,
  provider: string,
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .update(agents)
    .set({ provider, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Sets how this agent handles data-changing app actions. Ownership is part of
 * the UPDATE, so another user's agent matches no row.
 */
export async function setAgentApprovalModeForUser(
  profileId: number,
  agentId: number,
  approvalMode: AgentApprovalMode,
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .update(agents)
    .set({ approvalMode, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Replaces the agent's enabled tools, scoped to the owner. An empty array is a
 * real state (no tools); null would mean "every tool".
 */
export async function setAgentToolsForUser(
  profileId: number,
  agentId: number,
  tools: string[],
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .update(agents)
    .set({ enabledTools: tools, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Replaces the MCP tools this agent may call. Keys look like `3:search`;
 * an empty array is a real state (no MCP tools), null would mean all of them.
 */
export async function setAgentMcpToolsForUser(
  profileId: number,
  agentId: number,
  tools: string[],
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .update(agents)
    .set({ mcpTools: tools, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Sets which workspace skills and/or HTTP plugins this agent may use. Omitted
 * groups keep their stored value; an empty array is a real state (none), while
 * null (older rows) means every one the workspace has.
 */
export async function setAgentLibraryForUser(
  profileId: number,
  agentId: number,
  input: { skills?: string[]; plugins?: string[]; diagrams?: string[] },
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const patch: {
    updatedAt: Date;
    enabledSkills?: string[];
    enabledPlugins?: string[];
    enabledDiagrams?: string[];
  } = { updatedAt: new Date() };
  if (input.skills) patch.enabledSkills = input.skills;
  if (input.plugins) patch.enabledPlugins = input.plugins;
  if (input.diagrams) patch.enabledDiagrams = input.diagrams;

  const [row] = await db
    .update(agents)
    .set(patch)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return row ?? null;
}

/**
 * Adds one workspace skill name or plugin slug to an agent's library. A stored
 * list is extended; `null` already means "everything", so it stays null. Used
 * when something is created from chat and immediately scheduled for an agent.
 */
export async function attachAgentLibraryItemForUser(
  profileId: number,
  agentId: number,
  kind: "skill" | "plugin" | "diagram",
  name: string,
): Promise<AgentDetail | null> {
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [row] = await db
    .select({
      skills: agents.enabledSkills,
      plugins: agents.enabledPlugins,
      diagrams: agents.enabledDiagrams,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!row) return null;

  const current =
    kind === "skill" ? row.skills : kind === "plugin" ? row.plugins : row.diagrams;
  // null = every workspace item, which already includes this one.
  if (current === null) return getAgentForUser(profileId, agentId);

  const next = [...new Set([...current, name])].slice(0, 60);
  const [updated] = await db
    .update(agents)
    .set(
      kind === "skill"
        ? { enabledSkills: next, updatedAt: new Date() }
        : kind === "plugin"
          ? { enabledPlugins: next, updatedAt: new Date() }
          : { enabledDiagrams: next, updatedAt: new Date() },
    )
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ ...agentColumns, instructions: agents.instructions });

  return updated ?? null;
}

/**
 * Deletes one agent, scoped to its owner. Transcript rows and schedules go with
 * it through their `ON DELETE CASCADE` foreign keys.
 */
export async function deleteAgentForUser(profileId: number, agentId: number): Promise<boolean> {
  if (!Number.isInteger(agentId) || agentId <= 0) return false;

  const rows = await db
    .delete(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ id: agents.id });

  return rows.length > 0;
}

export async function createAgentForUser(
  profileId: number,
  input: NewAgentInput,
): Promise<AgentSummary> {
  const [row] = await db
    .insert(agents)
    .values({ ownerId: profileId, ...input })
    .returning(agentColumns);

  if (!row) throw new Error("The agent insert returned no row.");
  return row;
}

import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { agentMemories, agents, db } from "@/db";
import {
  MEMORIES_PER_AGENT_MAX,
  MEMORY_CONTENT_MAX,
  MEMORY_CONTENT_MIN,
  MEMORY_PROMPT_CHARS_MAX,
  MEMORY_PROMPT_MAX,
  MEMORY_RECALL_LIMIT,
  memoryQueryTokens,
  normalizeMemoryTags,
  type AgentMemoryNote,
  type MemoryAgent,
  type MemoryEntry,
  type MemoryRecord,
  type MemorySource,
} from "@/lib/memory-types";

/**
 * Agent memory: short durable notes, one row each, owned by the workspace and
 * attached to one agent. Nothing here is generated: a note exists because the
 * agent called `save_memory` or the owner wrote it. The prompt carries the
 * newest few, `recall_memory` searches the rest by keyword, and the Memory page
 * draws every note as a node.
 */

const memoryColumns = {
  id: agentMemories.id,
  agentId: agentMemories.agentId,
  content: agentMemories.content,
  tags: agentMemories.tags,
  source: agentMemories.source,
  useCount: agentMemories.useCount,
  lastUsedAt: agentMemories.lastUsedAt,
  createdAt: agentMemories.createdAt,
};

type MemoryRow = {
  id: number;
  agentId: number;
  content: string;
  tags: string[] | null;
  source: string;
  useCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
};

function toSource(value: string): MemorySource {
  return value === "owner" ? "owner" : "agent";
}

/** Every note this workspace keeps, newest first, with its agent's identity. */
export async function listMemoriesForUser(profileId: number): Promise<MemoryRecord[]> {
  const rows = await db
    .select({
      ...memoryColumns,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
    })
    .from(agentMemories)
    .innerJoin(agents, eq(agents.id, agentMemories.agentId))
    .where(eq(agentMemories.ownerId, profileId))
    .orderBy(desc(agentMemories.createdAt), desc(agentMemories.id));

  return rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName,
    agentAvatar: row.agentAvatar,
    agentColor: row.agentColor,
    content: row.content,
    tags: normalizeMemoryTags(row.tags),
    source: toSource(row.source),
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Every agent of the workspace with its switch state and note count. */
export async function listMemoryAgents(profileId: number): Promise<MemoryAgent[]> {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      avatar: agents.avatar,
      color: agents.color,
      enabled: agents.memoryEnabled,
      count: sql<number>`count(${agentMemories.id})::int`,
    })
    .from(agents)
    .leftJoin(agentMemories, eq(agentMemories.agentId, agents.id))
    .where(eq(agents.ownerId, profileId))
    .groupBy(agents.id, agents.name, agents.avatar, agents.color, agents.memoryEnabled)
    .orderBy(asc(agents.createdAt), asc(agents.id));

  return rows.map((row) => ({ ...row, enabled: row.enabled !== false }));
}

/**
 * What the agent's config rail shows: the switch state and the newest notes.
 * The rail only needs `
 * the switch and the recent notes, so this is not the whole workspace list.
 */
export async function memoryPanelForAgent(
  profileId: number,
  agentId: number,
  limit = 6,
): Promise<{ enabled: boolean; notes: AgentMemoryNote[] }> {
  const rowsToKeep = Math.max(1, Math.min(Number.isFinite(limit) ? Math.trunc(limit) : 6, 80));
  if (!Number.isInteger(agentId) || agentId <= 0) return { enabled: false, notes: [] };

  const [agent] = await db
    .select({ enabled: agents.memoryEnabled })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!agent) return { enabled: false, notes: [] };

  const rows = await db
    .select({
      id: agentMemories.id,
      content: agentMemories.content,
      tags: agentMemories.tags,
      source: agentMemories.source,
      useCount: agentMemories.useCount,
      createdAt: agentMemories.createdAt,
    })
    .from(agentMemories)
    .where(and(eq(agentMemories.ownerId, profileId), eq(agentMemories.agentId, agentId)))
    .orderBy(desc(agentMemories.createdAt), desc(agentMemories.id))
    .limit(rowsToKeep);

  return {
    enabled: agent.enabled !== false,
    notes: rows.map((row) => ({
      id: row.id,
      content: row.content,
      tags: normalizeMemoryTags(row.tags),
      source: toSource(row.source),
      useCount: row.useCount,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * Switches memory on or off for one agent. Off means the runtime attaches no
 * memory tools and no stored note reaches the prompt; the notes themselves are
 * kept, so switching it back on restores everything.
 */
export async function setAgentMemoryEnabledForUser(
  profileId: number,
  agentId: number,
  enabled: boolean,
): Promise<boolean> {
  if (!Number.isInteger(agentId) || agentId <= 0) return false;

  const rows = await db
    .update(agents)
    .set({ memoryEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .returning({ id: agents.id });

  return rows.length > 0;
}

export type CreateMemoryInput = {
  agentId: number;
  content: string;
  tags?: string[] | string | null;
  source?: MemorySource;
};

export type CreateMemoryResult =
  | { ok: true; memory: MemoryRecord }
  | { ok: false; error: string };

/**
 * Stores one note. The agent must belong to the caller; the per-agent cap drops
 * the least-used, oldest note so a busy agent keeps learning instead of
 * silently refusing to remember anything new.
 */
export async function createMemoryForUser(
  profileId: number,
  input: CreateMemoryInput,
): Promise<CreateMemoryResult> {
  const agentId = Number(input.agentId);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "Pick the agent this memory belongs to." };
  }

  const content = String(input.content ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (content.length < MEMORY_CONTENT_MIN) {
    return { ok: false, error: "Write a little more so the memory is useful." };
  }

  const [agent] = await db
    .select({ id: agents.id, name: agents.name, avatar: agents.avatar, color: agents.color })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!agent) return { ok: false, error: "That agent could not be found." };

  const rows = await db
    .select({ id: agentMemories.id, useCount: agentMemories.useCount })
    .from(agentMemories)
    .where(and(eq(agentMemories.ownerId, profileId), eq(agentMemories.agentId, agentId)))
    .orderBy(desc(agentMemories.createdAt), desc(agentMemories.id));

  if (rows.length >= MEMORIES_PER_AGENT_MAX) {
    const droppable = [...rows].sort((a, b) => a.useCount - b.useCount).slice(0, rows.length - MEMORIES_PER_AGENT_MAX + 1);
    await db.delete(agentMemories).where(
      and(
        eq(agentMemories.ownerId, profileId),
        inArray(
          agentMemories.id,
          droppable.map((row) => row.id),
        ),
      ),
    );
  }

  const [stored] = await db
    .insert(agentMemories)
    .values({
      ownerId: profileId,
      agentId,
      content: content.slice(0, MEMORY_CONTENT_MAX),
      tags: normalizeMemoryTags(input.tags),
      source: input.source === "owner" ? "owner" : "agent",
    })
    .returning(memoryColumns);

  if (!stored) return { ok: false, error: "We couldn't save that memory." };

  return {
    ok: true,
    memory: {
      id: stored.id,
      agentId: stored.agentId,
      agentName: agent.name,
      agentAvatar: agent.avatar,
      agentColor: agent.color,
      content: stored.content,
      tags: normalizeMemoryTags(stored.tags),
      source: toSource(stored.source),
      useCount: stored.useCount,
      lastUsedAt: stored.lastUsedAt ? stored.lastUsedAt.toISOString() : null,
      createdAt: stored.createdAt.toISOString(),
    },
  };
}

export type UpdateMemoryInput = {
  content: string;
  tags?: string[] | string | null;
};

/**
 * Owner rewrites a note — wording and tags only; the agent it belongs to stays.
 * Editing is a real write, not a second note, so a corrected preference replaces
 * the wrong one instead of piling up beside it.
 */
export async function updateMemoryForUser(
  profileId: number,
  memoryId: number,
  input: UpdateMemoryInput,
): Promise<CreateMemoryResult> {
  if (!Number.isInteger(memoryId) || memoryId <= 0) {
    return { ok: false, error: "That memory could not be found." };
  }

  const content = String(input.content ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (content.length < MEMORY_CONTENT_MIN) {
    return { ok: false, error: "Write a little more so the memory is useful." };
  }

  const [updated] = await db
    .update(agentMemories)
    .set({
      content: content.slice(0, MEMORY_CONTENT_MAX),
      tags: normalizeMemoryTags(input.tags),
      updatedAt: new Date(),
    })
    .where(and(eq(agentMemories.ownerId, profileId), eq(agentMemories.id, memoryId)))
    .returning(memoryColumns);

  if (!updated) return { ok: false, error: "That memory could not be found." };

  const [agent] = await db
    .select({ name: agents.name, avatar: agents.avatar, color: agents.color })
    .from(agents)
    .where(eq(agents.id, updated.agentId))
    .limit(1);

  return {
    ok: true,
    memory: {
      id: updated.id,
      agentId: updated.agentId,
      agentName: agent?.name ?? "Agent",
      agentAvatar: agent?.avatar ?? "circle:happy",
      agentColor: agent?.color ?? "blue",
      content: updated.content,
      tags: normalizeMemoryTags(updated.tags),
      source: toSource(updated.source),
      useCount: updated.useCount,
      lastUsedAt: updated.lastUsedAt ? updated.lastUsedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    },
  };
}

/** Bulk owner-scoped delete; returns how many of the ids actually belonged here. */
export async function deleteMemoriesForUser(
  profileId: number,
  memoryIds: number[],
): Promise<number> {
  const ids = [...new Set(memoryIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))].slice(
    0,
    100,
  );

  if (ids.length === 0) return 0;

  const rows = await db
    .delete(agentMemories)
    .where(and(eq(agentMemories.ownerId, profileId), inArray(agentMemories.id, ids)))
    .returning({ id: agentMemories.id });

  return rows.length;
}

/** Owner-scoped delete; another workspace's id removes nothing. */
export async function deleteMemoryForUser(profileId: number, memoryId: number): Promise<boolean> {
  if (!Number.isInteger(memoryId) || memoryId <= 0) return false;

  const rows = await db
    .delete(agentMemories)
    .where(and(eq(agentMemories.ownerId, profileId), eq(agentMemories.id, memoryId)))
    .returning({ id: agentMemories.id });

  return rows.length > 0;
}

export type AgentMemoryContext = {
  /** False when the owner switched memory off for this agent. */
  enabled: boolean;
  /** Notes the prompt carries, newest / most used first. */
  memories: MemoryEntry[];
};

/**
 * What one run may use. Read from the database rather than from the caller, so
 * chat, schedules and board runs all obey the same switch.
 */
export async function memoryContextForAgent(
  ownerId: number,
  agentId: number,
): Promise<AgentMemoryContext> {
  if (!Number.isInteger(agentId) || agentId <= 0) return { enabled: false, memories: [] };

  const [agent] = await db
    .select({ enabled: agents.memoryEnabled })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId)))
    .limit(1);

  if (!agent || agent.enabled === false) return { enabled: false, memories: [] };

  const rows = await db
    .select({
      id: agentMemories.id,
      content: agentMemories.content,
      tags: agentMemories.tags,
    })
    .from(agentMemories)
    .where(and(eq(agentMemories.ownerId, ownerId), eq(agentMemories.agentId, agentId)))
    .orderBy(sql`${agentMemories.lastUsedAt} desc nulls last`, desc(agentMemories.createdAt))
    .limit(MEMORY_PROMPT_MAX);

  const memories: MemoryEntry[] = [];
  let budget = MEMORY_PROMPT_CHARS_MAX;

  for (const row of rows) {
    const content = row.content.slice(0, Math.max(0, budget));
    if (!content) break;
    budget -= content.length;
    memories.push({ id: row.id, content, tags: normalizeMemoryTags(row.tags) });
  }

  return { enabled: true, memories };
}

/**
 * Keyword recall: every note of this agent is scored against the question
 * (content words + tags), the best few are returned and their usage stamped so
 * the graph can show what the agent actually relies on.
 */
export async function recallMemories(
  ownerId: number,
  agentId: number,
  query: string,
  limit = MEMORY_RECALL_LIMIT,
): Promise<MemoryEntry[]> {
  if (!Number.isInteger(agentId) || agentId <= 0) return [];

  const rows = await db
    .select({
      id: agentMemories.id,
      content: agentMemories.content,
      tags: agentMemories.tags,
      useCount: agentMemories.useCount,
      createdAt: agentMemories.createdAt,
    })
    .from(agentMemories)
    .where(and(eq(agentMemories.ownerId, ownerId), eq(agentMemories.agentId, agentId)))
    .orderBy(desc(agentMemories.createdAt))
    .limit(MEMORIES_PER_AGENT_MAX);

  if (rows.length === 0) return [];

  const tokens = memoryQueryTokens(query);
  const scored = rows.map((row) => {
    const tags = normalizeMemoryTags(row.tags);
    const content = row.content.toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (content.includes(token)) score += 2;
      if (tags.some((tag) => tag === token)) score += 3;
      else if (tags.some((tag) => tag.includes(token))) score += 1;
    }

    return { row, tags, score };
  });

  // With no query words, recency wins — an agent asked "what do you remember?"
  // should surface the latest notes rather than nothing.
  const ranked = tokens.length
    ? scored.sort((a, b) => b.score - a.score || b.row.createdAt.getTime() - a.row.createdAt.getTime())
    : scored.sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());

  const hits = ranked.slice(0, Math.max(1, Math.min(limit, MEMORY_RECALL_LIMIT)));

  await db
    .update(agentMemories)
    .set({ useCount: sql`${agentMemories.useCount} + 1`, lastUsedAt: new Date() })
    .where(
      and(
        eq(agentMemories.ownerId, ownerId),
        inArray(
          agentMemories.id,
          hits.map((hit) => hit.row.id),
        ),
      ),
    );

  return hits.map((hit) => ({
    id: hit.row.id,
    content: hit.row.content,
    tags: hit.tags,
  }));
}


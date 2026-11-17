import "server-only";

import { and, desc, eq, lt } from "drizzle-orm";

import { agentMessages, db } from "@/db";
import type { AgentResultCard } from "@/lib/apps/results";
import type { ChatSource, ChatToolStep } from "@/lib/agent-demo";

/**
 * Agent transcript storage.
 *
 * The chat page renders whatever is stored here, and the chat route appends one
 * user turn and one assistant turn per request, so a conversation survives a
 * reload. Only `role` and `content` are ever replayed to the model; `steps`,
 * `sources` and `cards` are presentation data kept so a reloaded transcript
 * looks exactly like the live one.
 *
 * Reads are paged newest-first: the page sends the latest {@link
 * AGENT_MESSAGE_PAGE_SIZE} turns, and the browser asks for `before=<oldest id>`
 * to walk further back.
 */

export type StoredAgentMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  /** ISO timestamp; formatted in the browser's locale. */
  createdAt: string;
  steps?: ChatToolStep[];
  sources?: ChatSource[];
  cards?: AgentResultCard[];
};

/** Turns per page: enough to fill the transcript without a long first paint. */
export const AGENT_MESSAGE_PAGE_SIZE = 10;

/** Hard ceiling so a hand-crafted request can't ask for the whole table. */
const MAX_PAGE_SIZE = 50;

export type AgentMessagePage = {
  /** Oldest first, ready to render. */
  messages: StoredAgentMessage[];
  /** Pass as `before` to fetch the page before this one; null at the start. */
  nextCursor: number | null;
  /** True while older turns exist beyond this page. */
  hasMore: boolean;
};

function toStoredMessage(row: {
  id: number;
  role: string;
  content: string;
  steps: { name: string; label: string }[] | null;
  sources: ChatSource[] | null;
  cards: AgentResultCard[] | null;
  createdAt: Date;
}): StoredAgentMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    steps: row.steps?.map((step) => ({ ...step, status: "done" as const })),
    sources: row.sources ?? undefined,
    cards: row.cards ?? undefined,
  };
}

/**
 * One page of an agent's transcript, newest page first.
 *
 * `before` is the id of the oldest message the caller already has, so pages
 * never overlap even when new turns are appended while the reader is scrolling.
 */
export async function listAgentMessagePage(
  agentId: number,
  options: { limit?: number; before?: number | null } = {},
): Promise<AgentMessagePage> {
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { messages: [], nextCursor: null, hasMore: false };
  }

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? AGENT_MESSAGE_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const before = options.before;

  const where =
    before && Number.isInteger(before) && before > 0
      ? and(eq(agentMessages.agentId, agentId), lt(agentMessages.id, before))
      : eq(agentMessages.agentId, agentId);

  // One extra row tells us whether an older page exists without a count query.
  const rows = await db
    .select({
      id: agentMessages.id,
      role: agentMessages.role,
      content: agentMessages.content,
      steps: agentMessages.steps,
      sources: agentMessages.sources,
      cards: agentMessages.cards,
      createdAt: agentMessages.createdAt,
    })
    .from(agentMessages)
    .where(where)
    .orderBy(desc(agentMessages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const messages = pageRows.map(toStoredMessage);

  return {
    messages,
    nextCursor: hasMore && messages.length > 0 ? messages[0].id : null,
    hasMore,
  };
}

/**
 * Deletes every stored turn for one agent, leaving approvals, widgets,
 * schedules and tasks untouched. Callers must have checked agent ownership.
 * Returns the number of deleted rows.
 */
export async function clearAgentMessagesForAgent(agentId: number): Promise<number> {
  if (!Number.isInteger(agentId) || agentId <= 0) return 0;

  const removed = await db
    .delete(agentMessages)
    .where(eq(agentMessages.agentId, agentId))
    .returning({ id: agentMessages.id });

  return removed.length;
}

/** Appends one turn. Callers are expected to have checked agent ownership. */
export async function appendAgentMessage(input: {
  agentId: number;
  role: "user" | "assistant";
  content: string;
  steps?: ChatToolStep[] | null;
  sources?: ChatSource[] | null;
  cards?: AgentResultCard[] | null;
}): Promise<void> {
  await db.insert(agentMessages).values({
    agentId: input.agentId,
    role: input.role,
    content: input.content,
    steps: input.steps?.map(({ name, label }) => ({ name, label })) ?? null,
    sources: input.sources ?? null,
    cards: input.cards ?? null,
  });
}

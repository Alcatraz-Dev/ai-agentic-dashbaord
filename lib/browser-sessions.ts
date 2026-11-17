import "server-only";

import { and, count, desc, eq, max, sql, sum } from "drizzle-orm";

import { agents, browserSessions, db } from "@/db";
import {
  browserSessionReplayUrl,
  type BrowserSessionStatus,
  type BrowserSessionSummary,
  type BrowserSessionWithAgent,
  type BrowserUsageSummary,
} from "@/lib/browser-session-types";

/**
 * The cloud-browser session history.
 *
 * A session only lives for one reply, so what outlives it is its Browserbase id
 * — enough to link to the replay and to show how much work a turn did.
 */

/** Newest rows kept per agent; older ones are pruned on write. */
const KEEP_PER_AGENT = 25;

export type BrowserSessionRecord = {
  ownerId: number;
  agentId: number;
  sessionId: string;
  contextId: string | null;
  actions: number;
  status: BrowserSessionStatus;
  startedAt: Date | null;
};

export async function recordBrowserSession(record: BrowserSessionRecord): Promise<void> {
  await db.insert(browserSessions).values({
    ownerId: record.ownerId,
    agentId: record.agentId,
    sessionId: record.sessionId,
    contextId: record.contextId,
    actions: record.actions,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: new Date(),
  });

  // History is a convenience, not a log: keep the table small.
  await db.execute(sql`
    delete from browser_sessions
    where agent_id = ${record.agentId}
      and id not in (
        select id from browser_sessions
        where agent_id = ${record.agentId}
        order by id desc
        limit ${KEEP_PER_AGENT}
      )
  `);
}

/** Recent sessions for one agent, newest first, scoped to its owner. */
export async function listBrowserSessions(
  ownerId: number,
  agentId: number,
  limit = 6,
): Promise<BrowserSessionSummary[]> {
  if (!Number.isInteger(agentId) || agentId <= 0) return [];

  const rows = await db
    .select({
      id: browserSessions.id,
      sessionId: browserSessions.sessionId,
      actions: browserSessions.actions,
      status: browserSessions.status,
      startedAt: browserSessions.startedAt,
      endedAt: browserSessions.endedAt,
    })
    .from(browserSessions)
    .where(and(eq(browserSessions.agentId, agentId), eq(browserSessions.ownerId, ownerId)))
    .orderBy(desc(browserSessions.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    actions: row.actions,
    status: row.status === "failed" ? "failed" : "closed",
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt.toISOString(),
    replayUrl: browserSessionReplayUrl(row.sessionId),
  }));
}

/** Recent sessions across every agent of this owner, newest first. */
export async function listOwnerBrowserSessions(
  ownerId: number,
  limit = 12,
): Promise<BrowserSessionWithAgent[]> {
  const rows = await db
    .select({
      id: browserSessions.id,
      sessionId: browserSessions.sessionId,
      actions: browserSessions.actions,
      status: browserSessions.status,
      startedAt: browserSessions.startedAt,
      endedAt: browserSessions.endedAt,
      agentId: agents.id,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
    })
    .from(browserSessions)
    .innerJoin(agents, eq(agents.id, browserSessions.agentId))
    .where(eq(browserSessions.ownerId, ownerId))
    .orderBy(desc(browserSessions.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    actions: row.actions,
    status: row.status === "failed" ? "failed" : "closed",
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt.toISOString(),
    replayUrl: browserSessionReplayUrl(row.sessionId),
    agentId: row.agentId,
    agentName: row.agentName,
    agentAvatar: row.agentAvatar,
    agentColor: row.agentColor,
  }));
}

/** Actions and sessions per agent, busiest first. */
export async function browserUsageByAgent(ownerId: number): Promise<BrowserUsageSummary[]> {
  const rows = await db
    .select({
      agentId: agents.id,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
      sessions: count(browserSessions.id),
      actions: sum(browserSessions.actions),
      lastUsedAt: max(browserSessions.endedAt),
    })
    .from(browserSessions)
    .innerJoin(agents, eq(agents.id, browserSessions.agentId))
    .where(eq(browserSessions.ownerId, ownerId))
    .groupBy(agents.id, agents.name, agents.avatar, agents.color)
    .orderBy(desc(sql`sum(${browserSessions.actions})`));

  return rows.map((row) => ({
    agentId: row.agentId,
    agentName: row.agentName,
    agentAvatar: row.agentAvatar,
    agentColor: row.agentColor,
    sessions: Number(row.sessions ?? 0),
    actions: Number(row.actions ?? 0),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
  }));
}

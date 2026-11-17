import "server-only";

import { and, asc, count, desc, eq, gte, isNull, lt, lte, or } from "drizzle-orm";

import { agentScheduleRuns, agentSchedules, agents, db, users, widgets } from "@/db";
import { appendAgentMessage } from "@/lib/agent-messages";
import { normalizeApprovalMode } from "@/lib/agent-options";
import { recordTaskRunForUser, taskCardForSchedule, taskToolsForSchedule } from "@/lib/tasks";
import { notifyScheduleFailure, sendScheduleEmail } from "@/lib/schedule-alerts";
import { streamAgentReply } from "@/lib/agent-runtime";
import { refreshWidgetById } from "@/lib/widget-refresh-service";
import { removeAgentScheduleJobs, syncAgentScheduleJobs } from "@/lib/schedule-jobs";
import type { ScheduleActionPolicy, ScheduleSentAction } from "@/lib/schedule-action";
import {
  nextRunForRule,
  type AgentScheduleRunSummary,
  type AgentScheduleRunWithContext,
  type AgentScheduleSummary,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";

/**
 * Recurring agent prompts. A schedule stores what to ask and when; running it
 * is the same runtime a chat turn uses, so the transcript collects the results.
 *
 * The timing is one shared schedule rule (`lib/schedule-rule.ts`) — the same
 * one widgets use — so a task can run once, on an interval, or daily, weekly or
 * monthly at one or more times.
 */

const columns = {
  id: agentSchedules.id,
  agentId: agentSchedules.agentId,
  title: agentSchedules.title,
  prompt: agentSchedules.prompt,
  frequency: agentSchedules.frequency,
  times: agentSchedules.times,
  monthDay: agentSchedules.monthDay,
  intervalMinutes: agentSchedules.intervalMinutes,
  runDate: agentSchedules.runDate,
  timezone: agentSchedules.timezone,
  weekday: agentSchedules.weekday,
  enabled: agentSchedules.enabled,
  nextRunAt: agentSchedules.nextRunAt,
  lastRunAt: agentSchedules.lastRunAt,
  lastStatus: agentSchedules.lastStatus,
  lastReply: agentSchedules.lastReply,
  jobsScheduleId: agentSchedules.jobsScheduleId,
  jobsError: agentSchedules.jobsError,
  action: agentSchedules.action,
  linkedWidgetId: agentSchedules.linkedWidgetId,
  linkedWidgetTitle: widgets.title,
};

type ScheduleRow = {
  id: number;
  agentId: number;
  title: string;
  prompt: string;
  frequency: string;
  times: { hour: number; minute: number }[] | null;
  monthDay: number;
  intervalMinutes: number;
  runDate: string | null;
  timezone: string | null;
  weekday: number;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  lastReply: string | null;
  jobsScheduleId: string | null;
  jobsError: string | null;
  action: ScheduleActionPolicy | null;
  linkedWidgetId: number | null;
  linkedWidgetTitle: string | null;
};

/** The stored row as a rule. Missing times fall back to the legacy clock. */
function ruleOf(row: ScheduleRow): ScheduleRule {
  return {
    frequency:
      row.frequency === "once" ||
      row.frequency === "interval" ||
      row.frequency === "weekly" ||
      row.frequency === "monthly"
        ? row.frequency
        : "daily",
    timezone: row.timezone ?? "UTC",
    times:
      Array.isArray(row.times) && row.times.length > 0
        ? row.times
        : [{ hour: 9, minute: 0 }],
    weekday: row.weekday,
    monthDay: row.monthDay,
    date: row.runDate,
    intervalMinutes: row.intervalMinutes,
  };
}

/** The legacy `cadence` mirror the old readers understood. */
function legacyCadence(frequency: ScheduleRule["frequency"]): string {
  if (frequency === "interval") return "hourly";
  if (frequency === "once") return "daily";
  return frequency;
}

/** Columns shared by every write, so a row always carries both shapes. */
function ruleValues(rule: ScheduleRule) {
  return {
    frequency: rule.frequency,
    times: rule.times,
    monthDay: rule.monthDay,
    intervalMinutes: rule.intervalMinutes,
    runDate: rule.frequency === "once" ? rule.date : null,
    timezone: rule.timezone,
    weekday: rule.weekday,
    cadence: legacyCadence(rule.frequency),
    hour: rule.times[0]?.hour ?? 9,
    minute: rule.times[0]?.minute ?? 0,
  };
}

function summarize(row: ScheduleRow): AgentScheduleSummary {
  return {
    id: row.id,
    agentId: row.agentId,
    title: row.title,
    prompt: row.prompt,
    rule: ruleOf(row),
    enabled: row.enabled,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastStatus: row.lastStatus === "ok" || row.lastStatus === "error" ? row.lastStatus : null,
    lastReply: row.lastReply,
    jobsScheduleId: row.jobsScheduleId,
    jobsError: row.jobsError,
    action: row.action ?? null,
    linkedWidgetId: row.linkedWidgetId,
    linkedWidgetTitle: row.linkedWidgetTitle,
  };
}

function baseQuery() {
  return db
    .select(columns)
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .leftJoin(widgets, eq(widgets.id, agentSchedules.linkedWidgetId));
}

async function reload(profileId: number, scheduleId: number): Promise<AgentScheduleSummary | null> {
  const [row] = await baseQuery()
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  return row ? summarize(row) : null;
}

export type CreateAgentScheduleInput = {
  title: string;
  prompt: string;
  rule: ScheduleRule;
  /** Widget refreshed after a successful run, or null. */
  linkedWidgetId?: number | null;
  /**
   * The one send/post the owner confirmed on the form. Null (or omitted) means
   * the run may only read: every mutating app action still needs a human.
   */
  action?: ScheduleActionPolicy | null;
};

export async function listAgentSchedules(
  profileId: number,
  agentId: number,
): Promise<AgentScheduleSummary[]> {
  const rows = await baseQuery()
    .where(and(eq(agentSchedules.agentId, agentId), eq(agents.ownerId, profileId)))
    .orderBy(asc(agentSchedules.createdAt), asc(agentSchedules.id));

  return rows.map(summarize);
}

/** How many schedules this owner has, across all their agents. */
export async function countSchedulesForUser(profileId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(eq(agents.ownerId, profileId));

  return Number(row?.total ?? 0);
}

async function ownsAgent(profileId: number, agentId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);

  return Boolean(row);
}

/**
 * A linked widget must belong to this owner and be one of this agent's cards,
 * so a schedule can't be pointed at someone else's widget by a bad id.
 */
async function linkedWidgetFor(
  profileId: number,
  agentId: number,
  widgetId: number | null | undefined,
): Promise<number | null> {
  if (widgetId === null || widgetId === undefined) return null;
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [row] = await db
    .select({ id: widgets.id })
    .from(widgets)
    .where(
      and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId), eq(widgets.agentId, agentId)),
    )
    .limit(1);

  return row?.id ?? null;
}

export async function createAgentScheduleForUser(
  profileId: number,
  agentId: number,
  input: CreateAgentScheduleInput,
): Promise<AgentScheduleSummary | null> {
  if (!(await ownsAgent(profileId, agentId))) return null;

  const linkedWidgetId = await linkedWidgetFor(profileId, agentId, input.linkedWidgetId);
  const nextRunAt = nextRunForRule(input.rule);

  const [row] = await db
    .insert(agentSchedules)
    .values({
      agentId,
      title: input.title,
      prompt: input.prompt,
      ...ruleValues(input.rule),
      linkedWidgetId,
      action: input.action ?? null,
      enabled: true,
      nextRunAt,
    })
    .returning({ id: agentSchedules.id });

  if (!row) return null;

  // Jobs is the primary timer. A sync failure is recorded on the row, and the
  // next cron tick still runs it, so creation never depends on Jobs being up.
  await syncAgentScheduleJobs(row.id).catch((error) =>
    console.error("[agents] could not sync a new schedule to Jobs", error),
  );

  return (await reload(profileId, row.id)) ?? null;
}

export async function deleteAgentScheduleForUser(
  profileId: number,
  scheduleId: number,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: agentSchedules.id })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!owned) return false;

  await removeAgentScheduleJobs(scheduleId).catch((error) =>
    console.error("[agents] could not delete the Jobs schedule", error),
  );
  await db.delete(agentSchedules).where(eq(agentSchedules.id, scheduleId));
  return true;
}

export async function setAgentScheduleEnabledForUser(
  profileId: number,
  scheduleId: number,
  enabled: boolean,
): Promise<AgentScheduleSummary | null> {
  const [owned] = await baseQuery()
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!owned) return null;

  const [row] = await db
    .update(agentSchedules)
    .set({
      enabled,
      nextRunAt: enabled ? nextRunForRule(ruleOf(owned)) : null,
      updatedAt: new Date(),
    })
    .where(eq(agentSchedules.id, scheduleId))
    .returning({ id: agentSchedules.id });

  if (!row) return null;

  await syncAgentScheduleJobs(row.id).catch((error) =>
    console.error("[agents] could not toggle the Jobs schedule", error),
  );

  return reload(profileId, scheduleId);
}

export type ScheduleRunResult =
  | { ok: true; reply: string; duplicate?: boolean; sent?: ScheduleSentAction[] }
  | { ok: false; error: string };

/** Runs currently executing, so two ticks can't launch the same task twice. */
const runningSchedules = new Set<number>();

/**
 * Moves a schedule's next run forward as soon as its work was handed to a
 * worker (CloudHike Jobs), so the next cron tick doesn't queue it twice.
 */
export async function reserveScheduleRun(scheduleId: number): Promise<boolean> {
  const [schedule] = await baseQuery().where(eq(agentSchedules.id, scheduleId)).limit(1);
  if (!schedule) return false;

  await db
    .update(agentSchedules)
    .set({
      nextRunAt: nextRunForRule(ruleOf(schedule), new Date(Date.now() + 60_000)),
      updatedAt: new Date(),
    })
    .where(eq(agentSchedules.id, scheduleId));

  return true;
}

const REPLY_PREVIEW_LENGTH = 400;

/** Same text, ignoring surrounding whitespace, is the same delivery. */
function deliveryKey(reply: string): string {
  return reply.replace(/\s+/g, " ").trim();
}

/** The last successful result for this schedule, for duplicate detection. */
async function lastDeliveredResult(scheduleId: number): Promise<string | null> {
  const [row] = await db
    .select({ result: agentScheduleRuns.result })
    .from(agentScheduleRuns)
    .where(and(eq(agentScheduleRuns.scheduleId, scheduleId), eq(agentScheduleRuns.status, "ok")))
    .orderBy(desc(agentScheduleRuns.id))
    .limit(1);

  return row?.result ?? null;
}

/**
 * Runs one schedule now: same runtime as a chat turn, results appended to the
 * transcript, then the schedule's bookkeeping is updated.
 *
 * A run records what the cloud browser did, waits for a busy browser instead of
 * failing, skips a delivery whose reply matches the previous one, and can
 * refresh the widget the schedule is linked to.
 */
export async function runAgentSchedule(
  scheduleId: number,
  trigger: "manual" | "cron" | "jobs" = "manual",
): Promise<ScheduleRunResult> {
  if (runningSchedules.has(scheduleId)) {
    return { ok: false, error: "That schedule is already running. Give it a moment." };
  }

  const [schedule] = await baseQuery()
    .where(eq(agentSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) return { ok: false, error: "That schedule could not be found." };

  runningSchedules.add(scheduleId);
  const startedAt = Date.now();

  try {
    const [agent] = await db
      .select({
        id: agents.id,
        ownerId: agents.ownerId,
        name: agents.name,
        provider: agents.provider,
        objective: agents.objective,
        instructions: agents.instructions,
        approvalMode: agents.approvalMode,
        enabledTools: agents.enabledTools,
        mcpTools: agents.mcpTools,
        enabledSkills: agents.enabledSkills,
        enabledPlugins: agents.enabledPlugins,
        enabledDiagrams: agents.enabledDiagrams,
      })
      .from(agents)
      .where(eq(agents.id, schedule.agentId))
      .limit(1);

    if (!agent) return { ok: false, error: "That agent could not be found." };

    // A card that owns this schedule narrows the run to the tools it picked.
    const cardTools = await taskToolsForSchedule(schedule.id).catch((error) => {
      console.error("[agents] could not read the card's tools", error);
      return null;
    });

    let reply = "";
    let failure: string | null = null;
    let browserUsed = false;
    let browserSessionId: string | null = null;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    /** Exactly what this run sent through its confirmed action. */
    const sent: ScheduleSentAction[] = [];
    /** Memories the agent looked up while answering. */
    const recalled: { id: number; content: string }[] = [];

    try {
      for await (const event of streamAgentReply(
        {
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          objective: agent.objective,
          instructions: agent.instructions,
          // A scheduled run follows the agent's saved approval rule.
          approvalMode: normalizeApprovalMode(agent.approvalMode),
          enabledTools: agent.enabledTools,
          mcpTools: agent.mcpTools,
          enabledSkills: agent.enabledSkills,
          enabledPlugins: agent.enabledPlugins,
          enabledDiagrams: agent.enabledDiagrams,
          ownerId: agent.ownerId,
        },
        [{ role: "user", content: schedule.prompt }],
        undefined,
        {
          onBrowser: (session) => {
            browserUsed = session.actions > 0;
            browserSessionId = session.sessionId;
          },
          onUsage: (usage) => {
            promptTokens = usage.inputTokens;
            completionTokens = usage.outputTokens;
          },
          onRecalled: (memories) => {
            recalled.splice(0, recalled.length, ...memories);
          },
          // The confirmed send/post, if this schedule has one. Without it the
          // run can only read, exactly like a chat turn without an owner.
          scheduledAction: schedule.action ?? null,
          // The card's own picks, when this schedule came from a task.
          cardTools,
        },
      )) {
        if (event.type === "text") reply += event.delta;
        else if (event.type === "sent") sent.push(event.entry);
        else if (event.type === "error") failure = event.message;
      }
    } catch (error) {
      console.error("[agents] scheduled run failed", error);
      failure = "The agent couldn't finish that run.";
    }

    const finishedAt = new Date();
    const result = failure ?? reply.trim();
    const duplicate =
      !failure &&
      result.length > 0 &&
      (await lastDeliveredResult(schedule.id).catch(() => null)) === result;

    // A duplicate is recorded, but nothing is delivered again: no second copy
    // in the transcript, no second alert, no repeated widget refresh.
    if (!failure && reply.trim() && !duplicate) {
      await appendAgentMessage({
        agentId: agent.id,
        role: "user",
        content: schedule.prompt,
      }).catch((error) => console.error("[agents] could not save the scheduled prompt", error));

      await appendAgentMessage({
        agentId: agent.id,
        role: "assistant",
        content: reply.trim(),
      }).catch((error) => console.error("[agents] could not save the scheduled reply", error));
    }

    await db
      .insert(agentScheduleRuns)
      .values({
        scheduleId: schedule.id,
        status: failure ? "error" : "ok",
        reply: result.slice(0, REPLY_PREVIEW_LENGTH) || null,
        result: result || null,
        trigger,
        browserUsed,
        browserSessionId,
        duplicate,
        sent: sent.length > 0 ? sent : null,
        recalled: recalled.length > 0 ? recalled : null,
        durationMs: finishedAt.getTime() - startedAt,
      })
      .catch((error) => console.error("[agents] could not save the schedule run", error));

    // A schedule created from a board card also writes that card's history, so
    // the board and the agent's own history agree.
    const card = await taskCardForSchedule(schedule.id, agent.id).catch((error) => {
      console.error("[agents] could not resolve the card for a scheduled run", error);
      return null;
    });

    if (card) {
      await recordTaskRunForUser(agent.ownerId, {
        taskId: card.taskId,
        agentId: agent.id,
        role: card.role,
        trigger: "schedule",
        status: failure ? "error" : "ok",
        reply: result.slice(0, 400),
        result,
        browserUsed,
        durationMs: finishedAt.getTime() - startedAt,
        promptTokens,
        recalled,
        completionTokens,
      }).catch((error) => console.error("[agents] could not save the card run", error));
    }

    // A one-off task is finished after its run: no next slot, and the Jobs
    // schedule is removed so it cannot fire again next year.
    const rule = ruleOf(schedule);
    const spent = rule.frequency === "once";
    const nextRunAt =
      schedule.enabled && !spent ? nextRunForRule(rule, new Date(finishedAt.getTime() + 60_000)) : null;

    await db
      .update(agentSchedules)
      .set({
        lastRunAt: finishedAt,
        lastStatus: failure ? "error" : "ok",
        lastReply: result.slice(0, REPLY_PREVIEW_LENGTH),
        nextRunAt,
        ...(spent ? { enabled: false } : {}),
        updatedAt: finishedAt,
      })
      .where(eq(agentSchedules.id, schedule.id));

    if (spent) {
      await removeAgentScheduleJobs(schedule.id).catch((error) =>
        console.error("[agents] could not remove the finished Jobs schedule", error),
      );
      await db
        .update(agentSchedules)
        .set({ jobsScheduleId: null, jobsError: null, updatedAt: new Date() })
        .where(eq(agentSchedules.id, schedule.id));
    }

    // A linked widget shows what this task reads: refresh it now instead of
    // waiting for the widget's own slot. Duplicates were skipped above.
    if (!failure && !duplicate && schedule.linkedWidgetId) {
      await refreshWidgetById(schedule.linkedWidgetId).catch((error) =>
        console.error("[agents] could not refresh the linked widget", error),
      );
    }

    if (failure) {
      await notifyScheduleFailure({
        ownerId: agent.ownerId,
        agentName: agent.name,
        scheduleTitle: schedule.title,
        error: failure,
      }).catch((error) => console.error("[agents] failure alert failed", error));
      return { ok: false, error: failure };
    }
    if (!deliveryKey(reply)) return { ok: false, error: "The agent returned an empty reply." };

    return { ok: true, reply: reply.trim(), duplicate, sent };
  } finally {
    runningSchedules.delete(scheduleId);
  }
}

type RunRow = {
  id: number;
  scheduleId: number;
  status: string;
  reply: string | null;
  result: string | null;
  trigger: string;
  browserUsed: boolean;
  browserSessionId: string | null;
  duplicate: boolean;
  sent: ScheduleSentAction[] | null;
  recalled: { id: number; content: string }[] | null;
  durationMs: number | null;
  createdAt: Date;
};

function serializeRun(row: RunRow): AgentScheduleRunSummary {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    status: row.status === "error" ? "error" : "ok",
    reply: row.reply,
    result: row.result,
    trigger: row.trigger,
    browserUsed: row.browserUsed,
    browserSessionId: row.browserSessionId,
    duplicate: row.duplicate,
    sent: row.sent ?? [],
    recalled: row.recalled ?? [],
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  };
}

const runColumns = {
  id: agentScheduleRuns.id,
  scheduleId: agentScheduleRuns.scheduleId,
  status: agentScheduleRuns.status,
  reply: agentScheduleRuns.reply,
  result: agentScheduleRuns.result,
  trigger: agentScheduleRuns.trigger,
  browserUsed: agentScheduleRuns.browserUsed,
  browserSessionId: agentScheduleRuns.browserSessionId,
  duplicate: agentScheduleRuns.duplicate,
  sent: agentScheduleRuns.sent,
  recalled: agentScheduleRuns.recalled,
  durationMs: agentScheduleRuns.durationMs,
  createdAt: agentScheduleRuns.createdAt,
};

/** Recent runs for one agent's schedules, newest first. */
export async function listAgentScheduleRuns(
  profileId: number,
  agentId: number,
  limit = 12,
): Promise<AgentScheduleRunSummary[]> {
  const rows = await db
    .select(runColumns)
    .from(agentScheduleRuns)
    .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(and(eq(agentSchedules.agentId, agentId), eq(agents.ownerId, profileId)))
    .orderBy(desc(agentScheduleRuns.id))
    .limit(limit);

  return rows.map(serializeRun);
}

/**
 * Recent runs across every agent the user owns, for the settings overview.
 * `limit` caps the rows, newest first.
 */
export async function listRecentScheduleRuns(
  profileId: number,
  limit = 50,
): Promise<AgentScheduleRunWithContext[]> {
  const rows = await db
    .select({
      ...runColumns,
      agentId: agents.id,
      agentName: agents.name,
      scheduleTitle: agentSchedules.title,
    })
    .from(agentScheduleRuns)
    .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(eq(agents.ownerId, profileId))
    .orderBy(desc(agentScheduleRuns.id))
    .limit(limit);

  return rows.map((row) => ({
    ...serializeRun(row),
    agentId: row.agentId,
    agentName: row.agentName,
    scheduleTitle: row.scheduleTitle,
  }));
}

/**
 * Failed runs from the last `days`, newest first, plus the total for the
 * notification badge. Derived from run rows so there is nothing to mark read.
 */
export async function listRecentScheduleFailures(
  profileId: number,
  days = 7,
  limit = 5,
): Promise<{ count: number; runs: AgentScheduleRunWithContext[] }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const scope = and(
    eq(agents.ownerId, profileId),
    eq(agentScheduleRuns.status, "error"),
    gte(agentScheduleRuns.createdAt, since),
  );

  const [rows, [total]] = await Promise.all([
    db
      .select({
        ...runColumns,
        agentId: agents.id,
        agentName: agents.name,
        scheduleTitle: agentSchedules.title,
      })
      .from(agentScheduleRuns)
      .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
      .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
      .where(scope)
      .orderBy(desc(agentScheduleRuns.id))
      .limit(limit),
    db
      .select({ total: count() })
      .from(agentScheduleRuns)
      .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
      .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
      .where(scope),
  ]);

  return {
    count: Number(total?.total ?? 0),
    runs: rows.map((row) => ({
      ...serializeRun(row),
      status: "error" as const,
      agentId: row.agentId,
      agentName: row.agentName,
      scheduleTitle: row.scheduleTitle,
    })),
  };
}

/** Changes a schedule's prompt or timing, recomputing the next run. */
export async function updateAgentScheduleForUser(
  profileId: number,
  scheduleId: number,
  input: CreateAgentScheduleInput,
): Promise<AgentScheduleSummary | null> {
  const [owned] = await baseQuery()
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!owned) return null;

  const linkedWidgetId = await linkedWidgetFor(
    profileId,
    owned.agentId,
    input.linkedWidgetId,
  );

  const [row] = await db
    .update(agentSchedules)
    .set({
      title: input.title,
      prompt: input.prompt,
      ...ruleValues(input.rule),
      linkedWidgetId,
      action: input.action ?? null,
      nextRunAt: owned.enabled ? nextRunForRule(input.rule) : null,
      updatedAt: new Date(),
    })
    .where(eq(agentSchedules.id, scheduleId))
    .returning({ id: agentSchedules.id });

  if (!row) return null;

  await syncAgentScheduleJobs(row.id).catch((error) =>
    console.error("[agents] could not update the Jobs schedule", error),
  );

  return reload(profileId, scheduleId);
}

/** True when the schedule belongs to an agent this user owns. */
export async function scheduleBelongsToUser(
  profileId: number,
  scheduleId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agentSchedules.id })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  return Boolean(row);
}

/**
 * Schedules that are due, oldest first, for the cron route. A paused workspace
 * contributes nothing, so no external timer fires its runs.
 */
export async function listDueSchedules(
  limit = 5,
  options: { excludeJobs?: boolean } = {},
): Promise<{ id: number; title: string; jobsScheduleId: string | null }[]> {
  const rows = await db
    .select({
      id: agentSchedules.id,
      title: agentSchedules.title,
      jobsScheduleId: agentSchedules.jobsScheduleId,
    })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .innerJoin(users, eq(users.id, agents.ownerId))
    .where(
      and(
        eq(agentSchedules.enabled, true),
        eq(users.schedulesPaused, false),
        lte(agentSchedules.nextRunAt, new Date()),
        options.excludeJobs ? isNull(agentSchedules.jobsScheduleId) : undefined,
      ),
    )
    .orderBy(asc(agentSchedules.nextRunAt))
    .limit(limit);

  return rows;
}

export type ScheduleAlertSettings = {
  paused: boolean;
  emailAlerts: boolean;
  digest: boolean;
};

export async function getScheduleAlertSettings(
  profileId: number,
): Promise<ScheduleAlertSettings> {
  const [row] = await db
    .select({
      paused: users.schedulesPaused,
      emailAlerts: users.scheduleAlerts,
      digest: users.scheduleDigest,
    })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1);

  return {
    paused: row?.paused ?? false,
    emailAlerts: row?.emailAlerts ?? true,
    digest: row?.digest ?? true,
  };
}

export async function setSchedulesPausedForUser(
  profileId: number,
  paused: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ schedulesPaused: paused, updatedAt: new Date() })
    .where(eq(users.id, profileId))
    .returning({ id: users.id });

  return Boolean(row);
}

export async function setScheduleAlertsForUser(
  profileId: number,
  enabled: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ scheduleAlerts: enabled, updatedAt: new Date() })
    .where(eq(users.id, profileId))
    .returning({ id: users.id });

  return Boolean(row);
}

export async function setScheduleDigestForUser(
  profileId: number,
  enabled: boolean,
): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ scheduleDigest: enabled, updatedAt: new Date() })
    .where(eq(users.id, profileId))
    .returning({ id: users.id });

  return Boolean(row);
}

/**
 * Called when a paused workspace resumes. Pause freezes `next_run_at`, so every
 * enabled schedule that fell due while paused is moved forward from now instead
 * of firing a burst of old runs.
 */
export async function rescheduleOverdueSchedulesForUser(profileId: number): Promise<number> {
  const rows = await db
    .select(columns)
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .leftJoin(widgets, eq(widgets.id, agentSchedules.linkedWidgetId))
    .where(
      and(
        eq(agents.ownerId, profileId),
        eq(agentSchedules.enabled, true),
        or(isNull(agentSchedules.nextRunAt), lt(agentSchedules.nextRunAt, new Date())),
      ),
    );

  const now = new Date();
  let shifted = 0;

  for (const row of rows) {
    const next = nextRunForRule(ruleOf(row), new Date(now.getTime() + 60_000));
    if (!next) continue;

    await db
      .update(agentSchedules)
      .set({ nextRunAt: next, updatedAt: now })
      .where(eq(agentSchedules.id, row.id));
    shifted += 1;
  }

  return shifted;
}

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_REPEAT_MS = 23 * 60 * 60 * 1000;

type DigestAgentRow = {
  name: string;
  runs: number;
  failures: number;
  lastAt: Date;
  lastStatus: string;
  lastReply: string | null;
};

function renderDigest(agentsRows: DigestAgentRow[]): { text: string; html: string } {
  const total = agentsRows.reduce((sum, row) => sum + row.runs, 0);
  const failures = agentsRows.reduce((sum, row) => sum + row.failures, 0);

  const text = [
    `Scheduled runs in the last 24 hours: ${total} across ${agentsRows.length} agent${agentsRows.length === 1 ? "" : "s"}.`,
    `Failures: ${failures}.`,
    "",
    ...agentsRows.map(
      (row) =>
        `- ${row.name}: ${row.runs} run${row.runs === 1 ? "" : "s"}, ${row.failures} failed. Last: ${row.lastStatus}.`,
    ),
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
      <p style="margin:0 0 4px"><strong>Your scheduled runs</strong> · last 24 hours</p>
      <p style="margin:0 0 12px;color:#475569">${total} run${total === 1 ? "" : "s"} across
        ${agentsRows.length} agent${agentsRows.length === 1 ? "" : "s"} · ${failures} failure${failures === 1 ? "" : "s"}</p>
      <table style="width:100%;border-collapse:collapse">
        <tbody>
          ${agentsRows
            .map(
              (row) => `<tr>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0">${row.name}</td>
                <td style="padding:8px 0;border-top:1px solid #e2e8f0;text-align:right;color:${
                  row.failures > 0 ? "#9f1239" : "#475569"
                }">${row.runs} run${row.runs === 1 ? "" : "s"} · ${row.failures} failed</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  return { text, html };
}

/**
 * One email per user per day with a per-agent tally of the last 24 hours.
 * Driven by the cron route, so it needs no separate scheduler. Users with no
 * runs in the window are skipped — an empty digest is noise.
 */
export async function sendDailyScheduleDigests(limit = 25): Promise<number> {
  const cutoff = new Date(Date.now() - DIGEST_REPEAT_MS);
  const candidates = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.scheduleDigest, true),
        or(isNull(users.scheduleDigestLastSentAt), lt(users.scheduleDigestLastSentAt, cutoff)),
      ),
    )
    .limit(limit);

  let sent = 0;

  for (const candidate of candidates) {
    if (!candidate.email) continue;

    const windowStart = new Date(Date.now() - DIGEST_WINDOW_MS);
    const rows = await db
      .select({
        agentName: agents.name,
        status: agentScheduleRuns.status,
        createdAt: agentScheduleRuns.createdAt,
        reply: agentScheduleRuns.reply,
      })
      .from(agentScheduleRuns)
      .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
      .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
      .where(and(eq(agents.ownerId, candidate.id), gte(agentScheduleRuns.createdAt, windowStart)))
      .orderBy(desc(agentScheduleRuns.createdAt));

    if (rows.length === 0) continue;

    const byAgent = new Map<string, DigestAgentRow>();
    for (const row of rows) {
      const existing = byAgent.get(row.agentName) ?? {
        name: row.agentName,
        runs: 0,
        failures: 0,
        lastAt: row.createdAt,
        lastStatus: row.status === "error" ? "failed" : "succeeded",
        lastReply: row.reply,
      };
      existing.runs += 1;
      if (row.status === "error") existing.failures += 1;
      byAgent.set(row.agentName, existing);
    }

    const { text, html } = renderDigest([...byAgent.values()]);
    const result = await sendScheduleEmail({
      to: candidate.email,
      subject: `Scheduled runs: ${rows.length} in the last 24 hours`,
      text,
      html,
    });

    if (!result.ok) continue;

    await db
      .update(users)
      .set({ scheduleDigestLastSentAt: new Date() })
      .where(eq(users.id, candidate.id));
    sent += 1;
  }

  return sent;
}

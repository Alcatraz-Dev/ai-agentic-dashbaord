import "server-only";

import { and, count, desc, eq, gt, gte, inArray, isNull, ne } from "drizzle-orm";

import {
  agentApprovals,
  agentScheduleRuns,
  agentSchedules,
  agents,
  db,
  taskAssignees,
  taskRuns,
  tasks,
  widgetRefreshRuns,
  widgets,
} from "@/db";
import { listRecentScheduleFailures } from "@/lib/agent-schedules";
import { roleLabelFromKey } from "@/lib/task-types";

/**
 * The Inbox: one owner-scoped read over work that already exists.
 *
 * Four groups, in the order the owner should read them:
 *  · needs_you  — an app action is sealed behind an approval card and waits.
 *  · to_review  — a board card was parked in review.
 *  · failed     — a scheduled run, task run or widget refresh ended in error.
 *  · finished   — recurring work that succeeded on its own clock this week.
 *
 * Nothing here is generated for the page: every row is a stored approval, card
 * or run, so the Inbox cannot claim something the workspace did not do. There is
 * no read/unread state — the lists are derived, so the badge is always true.
 */

export type InboxGroupId = "needs_you" | "to_review" | "failed" | "finished";

export type InboxItemKind =
  | "approval"
  | "review"
  | "schedule_run"
  | "task_run"
  | "widget_refresh";

export type InboxItem = {
  /** Prefixed with its kind, so two rows can never share a React key. */
  id: string;
  kind: InboxItemKind;
  title: string;
  /** One or two lines of real context; never invented. */
  detail: string;
  /** The agent behind it, when the row has one. */
  agent: { id: number; name: string } | null;
  /** Where the owner can actually act on it. */
  href: string;
  /** ISO timestamp of when it happened (or when the decision expires). */
  at: string;
};

export type InboxGroup = {
  id: InboxGroupId;
  label: string;
  hint: string;
  items: InboxItem[];
  /** True when more rows exist than this group shows. */
  truncated: boolean;
};

export type Inbox = {
  groups: InboxGroup[];
  /** Approvals + cards in review: the two things that block on the owner. */
  needsYou: number;
};

const APPROVALS_SHOWN = 8;
const REVIEW_SHOWN = 8;
const FAILED_SHOWN = 6;
const FINISHED_SHOWN = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Collapses a stored reply into one scannable line. */
function preview(value: string | null | undefined, max = 200): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "No reply was recorded.";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function listInboxForUser(profileId: number): Promise<Inbox> {
  const now = new Date();
  const since = new Date(now.getTime() - WEEK_MS);

  // A pending row is only real while its token can still be used: an expired
  // one has nothing left to approve, so it belongs in the failure history, not
  // in "needs you".
  const pendingScope = and(
    eq(agentApprovals.ownerId, profileId),
    eq(agentApprovals.status, "pending"),
    isNull(agentApprovals.usedAt),
    gt(agentApprovals.expiresAt, now),
  );
  const reviewScope = and(eq(tasks.ownerId, profileId), eq(tasks.status, "review"));

  const [
    approvalRows,
    [approvalTotal],
    reviewRows,
    [reviewTotal],
    scheduleFailures,
    taskFailureRows,
    widgetFailureRows,
    finishedScheduleRows,
    finishedTaskRows,
  ] = await Promise.all([
    db
      .select({
        jti: agentApprovals.jti,
        summary: agentApprovals.summary,
        toolkit: agentApprovals.toolkit,
        action: agentApprovals.action,
        createdAt: agentApprovals.createdAt,
        agentId: agents.id,
        agentName: agents.name,
      })
      .from(agentApprovals)
      .innerJoin(agents, eq(agents.id, agentApprovals.agentId))
      .where(pendingScope)
      .orderBy(desc(agentApprovals.createdAt))
      .limit(APPROVALS_SHOWN),
    db
      .select({ total: count() })
      .from(agentApprovals)
      .innerJoin(agents, eq(agents.id, agentApprovals.agentId))
      .where(pendingScope),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(reviewScope)
      .orderBy(desc(tasks.updatedAt))
      .limit(REVIEW_SHOWN),
    db.select({ total: count() }).from(tasks).where(reviewScope),
    listRecentScheduleFailures(profileId, 7, FAILED_SHOWN),
    db
      .select({
        id: taskRuns.id,
        reply: taskRuns.reply,
        createdAt: taskRuns.createdAt,
        taskTitle: tasks.title,
        agentId: agents.id,
        agentName: agents.name,
      })
      .from(taskRuns)
      .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
      .leftJoin(agents, eq(agents.id, taskRuns.agentId))
      .where(and(eq(tasks.ownerId, profileId), eq(taskRuns.status, "error")))
      .orderBy(desc(taskRuns.createdAt))
      .limit(FAILED_SHOWN),
    db
      .select({
        id: widgetRefreshRuns.id,
        note: widgetRefreshRuns.note,
        createdAt: widgetRefreshRuns.createdAt,
        widgetTitle: widgets.title,
        agentId: agents.id,
        agentName: agents.name,
      })
      .from(widgetRefreshRuns)
      .innerJoin(widgets, eq(widgets.id, widgetRefreshRuns.widgetId))
      .leftJoin(agents, eq(agents.id, widgets.agentId))
      .where(and(eq(widgets.ownerId, profileId), eq(widgetRefreshRuns.status, "error")))
      .orderBy(desc(widgetRefreshRuns.createdAt))
      .limit(FAILED_SHOWN),
    db
      .select({
        id: agentScheduleRuns.id,
        reply: agentScheduleRuns.reply,
        createdAt: agentScheduleRuns.createdAt,
        scheduleTitle: agentSchedules.title,
        agentId: agents.id,
        agentName: agents.name,
      })
      .from(agentScheduleRuns)
      .innerJoin(agentSchedules, eq(agentSchedules.id, agentScheduleRuns.scheduleId))
      .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
      .where(
        and(
          eq(agents.ownerId, profileId),
          eq(agentScheduleRuns.status, "ok"),
          ne(agentScheduleRuns.trigger, "manual"),
          gte(agentScheduleRuns.createdAt, since),
        ),
      )
      .orderBy(desc(agentScheduleRuns.createdAt))
      .limit(FINISHED_SHOWN),
    db
      .select({
        id: taskRuns.id,
        reply: taskRuns.reply,
        createdAt: taskRuns.createdAt,
        taskTitle: tasks.title,
        agentId: agents.id,
        agentName: agents.name,
      })
      .from(taskRuns)
      .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
      .leftJoin(agents, eq(agents.id, taskRuns.agentId))
      .where(
        and(
          eq(tasks.ownerId, profileId),
          eq(taskRuns.status, "ok"),
          eq(taskRuns.trigger, "schedule"),
          gte(taskRuns.createdAt, since),
        ),
      )
      .orderBy(desc(taskRuns.createdAt))
      .limit(FINISHED_SHOWN),
  ]);

  // Who is on each card in review, so the row says what is actually waiting.
  const reviewIds = reviewRows.map((row) => row.id);
  const assigneeRows =
    reviewIds.length > 0
      ? await db
          .select({
            taskId: taskAssignees.taskId,
            role: taskAssignees.role,
            agentName: agents.name,
          })
          .from(taskAssignees)
          .leftJoin(agents, eq(agents.id, taskAssignees.agentId))
          .where(inArray(taskAssignees.taskId, reviewIds))
      : [];

  const assigneesByTask = new Map<number, string[]>();
  for (const row of assigneeRows) {
    const label = row.agentName ?? `${roleLabelFromKey(row.role)} open`;
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push(label);
    assigneesByTask.set(row.taskId, list);
  }

  const needsYouItems: InboxItem[] = approvalRows.map((row) => ({
    id: `approval-${row.jti}`,
    kind: "approval",
    title: row.summary.replace(/^\[(remembered|full access)\]\s*/, ""),
    detail: `${row.toolkit} · ${row.action}`,
    agent: { id: row.agentId, name: row.agentName },
    href: `/dashboard/agents/${row.agentId}`,
    at: row.createdAt.toISOString(),
  }));

  const reviewItems: InboxItem[] = reviewRows.map((row) => {
    const people = assigneesByTask.get(row.id) ?? [];
    return {
      id: `review-${row.id}`,
      kind: "review",
      title: row.title,
      detail: people.length > 0 ? people.join(" · ") : "No one assigned yet",
      agent: null,
      href: "/dashboard/tasks",
      at: row.updatedAt.toISOString(),
    };
  });

  const failedItems: InboxItem[] = [
    ...scheduleFailures.runs.map<InboxItem>((run) => ({
      id: `schedule-run-${run.id}`,
      kind: "schedule_run",
      title: run.scheduleTitle,
      detail: preview(run.reply ?? run.result),
      agent: { id: run.agentId, name: run.agentName },
      href: `/dashboard/agents/${run.agentId}`,
      at: run.createdAt,
    })),
    ...taskFailureRows.map<InboxItem>((row) => ({
      id: `task-run-${row.id}`,
      kind: "task_run",
      title: row.taskTitle,
      detail: preview(row.reply),
      agent: row.agentId ? { id: row.agentId, name: row.agentName ?? "Agent" } : null,
      href: "/dashboard/tasks",
      at: row.createdAt.toISOString(),
    })),
    ...widgetFailureRows.map<InboxItem>((row) => ({
      id: `widget-refresh-${row.id}`,
      kind: "widget_refresh",
      title: row.widgetTitle,
      detail: preview(row.note),
      agent: row.agentId ? { id: row.agentId, name: row.agentName ?? "Agent" } : null,
      href: "/dashboard",
      at: row.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, FAILED_SHOWN + 2);

  const finishedItems: InboxItem[] = [
    ...finishedScheduleRows.map<InboxItem>((row) => ({
      id: `finished-schedule-${row.id}`,
      kind: "schedule_run",
      title: row.scheduleTitle,
      detail: preview(row.reply),
      agent: { id: row.agentId, name: row.agentName },
      href: `/dashboard/agents/${row.agentId}`,
      at: row.createdAt.toISOString(),
    })),
    ...finishedTaskRows.map<InboxItem>((row) => ({
      id: `finished-task-${row.id}`,
      kind: "task_run",
      title: row.taskTitle,
      detail: preview(row.reply),
      agent: row.agentId ? { id: row.agentId, name: row.agentName ?? "Agent" } : null,
      href: "/dashboard/tasks",
      at: row.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, FINISHED_SHOWN);

  const pendingApprovals = Number(approvalTotal?.total ?? 0);
  const reviewCount = Number(reviewTotal?.total ?? 0);

  return {
    needsYou: pendingApprovals + reviewCount,
    groups: [
      {
        id: "needs_you",
        label: "Needs you",
        hint: "An action that changes data is sealed behind an approval card. It is in the chat that prepared it, and it expires if nobody decides.",
        items: needsYouItems,
        truncated: pendingApprovals > needsYouItems.length,
      },
      {
        id: "to_review",
        label: "To review",
        hint: "Cards the board parked in review. Read them, or send them back with a note.",
        items: reviewItems,
        truncated: reviewCount > reviewItems.length,
      },
      {
        id: "failed",
        label: "Failed",
        hint: "Runs that ended in an error, newest first. Each row links to the surface that owns it.",
        items: failedItems,
        truncated: scheduleFailures.count > scheduleFailures.runs.length,
      },
      {
        id: "finished",
        label: "Finished while you were away",
        hint: "Recurring work that succeeded on its own clock in the last 7 days.",
        items: finishedItems,
        truncated:
          finishedScheduleRows.length >= FINISHED_SHOWN || finishedTaskRows.length >= FINISHED_SHOWN,
      },
    ],
  };
}

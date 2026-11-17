import "server-only";

import { eq } from "drizzle-orm";

import { agentSchedules, agents, db, widgets } from "@/db";
import { agentScheduleCron, nextRunForRule, type ScheduleRule } from "@/lib/agent-schedule-options";
import {
  createJobsSchedule,
  deleteJobsSchedule,
  updateJobsSchedule,
  type JobsScheduleInput,
  type JobsScheduleResult,
} from "@/lib/jobs";
import {
  averageRefreshMinutes,
  widgetScheduleRule,
  widgetScheduleValues,
} from "@/lib/widget-schedule";

/**
 * Keeps CloudHike Jobs recurring schedules in step with the app's rows.
 *
 * Jobs owns the clock; these rows own the task, its prompt and its history.
 * Every write is best-effort: without a public HTTPS origin (local dev) or a
 * Jobs project, the row keeps its own `next_run_at` / `next_refresh_at` and the
 * cron route remains a working fallback. A failed sync is stored on the row so
 * the Scheduling panel can say why, instead of pretending the schedule exists.
 */

async function ensure(
  existingId: string | null,
  input: JobsScheduleInput,
): Promise<JobsScheduleResult> {
  if (!existingId) return createJobsSchedule(input);

  const updated = await updateJobsSchedule(existingId, input);
  // The schedule was deleted in the Jobs dashboard: recreate it once.
  if (!updated.ok && updated.notFound) return createJobsSchedule(input);
  return updated;
}

export async function syncAgentScheduleJobs(scheduleId: number): Promise<void> {
  const [schedule] = await db
    .select({
      id: agentSchedules.id,
      agentId: agentSchedules.agentId,
      title: agentSchedules.title,
      frequency: agentSchedules.frequency,
      times: agentSchedules.times,
      monthDay: agentSchedules.monthDay,
      intervalMinutes: agentSchedules.intervalMinutes,
      runDate: agentSchedules.runDate,
      timezone: agentSchedules.timezone,
      weekday: agentSchedules.weekday,
      enabled: agentSchedules.enabled,
      jobsScheduleId: agentSchedules.jobsScheduleId,
    })
    .from(agentSchedules)
    .where(eq(agentSchedules.id, scheduleId))
    .limit(1);

  if (!schedule) return;

  const [agent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, schedule.agentId))
    .limit(1);

  if (!agent) return;

  const rule: ScheduleRule = {
    frequency:
      schedule.frequency === "once" ||
      schedule.frequency === "interval" ||
      schedule.frequency === "weekly" ||
      schedule.frequency === "monthly"
        ? schedule.frequency
        : "daily",
    timezone: schedule.timezone ?? "UTC",
    times:
      Array.isArray(schedule.times) && schedule.times.length > 0
        ? schedule.times
        : [{ hour: 9, minute: 0 }],
    weekday: schedule.weekday,
    monthDay: schedule.monthDay,
    date: schedule.runDate,
    intervalMinutes: schedule.intervalMinutes,
  };

  const input: JobsScheduleInput = {
    name: `${agent.name}: ${schedule.title}`,
    cron: agentScheduleCron(rule),
    timezone: rule.timezone,
    path: "/api/jobs/schedules",
    payload: { scheduleId: schedule.id },
    enabled: schedule.enabled,
    timeoutSeconds: 300,
  };

  const result = schedule.enabled
    ? await ensure(schedule.jobsScheduleId, input)
    : schedule.jobsScheduleId
      ? await ensure(schedule.jobsScheduleId, input)
      : null;

  if (!result) {
    // A disabled schedule that was never synced has nothing to pause remotely.
    await db
      .update(agentSchedules)
      .set({ jobsError: null, updatedAt: new Date() })
      .where(eq(agentSchedules.id, schedule.id));
    return;
  }

  if (result.ok) {
    await db
      .update(agentSchedules)
      .set({
        jobsScheduleId: result.id,
        jobsError: null,
        jobsSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentSchedules.id, schedule.id));
    return;
  }

  await db
    .update(agentSchedules)
    .set({ jobsError: result.error, updatedAt: new Date() })
    .where(eq(agentSchedules.id, schedule.id));
}

export async function removeAgentScheduleJobs(scheduleId: number): Promise<void> {
  const [schedule] = await db
    .select({ jobsScheduleId: agentSchedules.jobsScheduleId })
    .from(agentSchedules)
    .where(eq(agentSchedules.id, scheduleId))
    .limit(1);

  if (schedule?.jobsScheduleId) {
    await deleteJobsSchedule(schedule.jobsScheduleId);
  }
}

export async function syncWidgetScheduleJobs(widgetId: number): Promise<void> {
  const [widget] = await db
    .select({
      id: widgets.id,
      title: widgets.title,
      agentId: widgets.agentId,
      refreshEnabled: widgets.refreshEnabled,
      jobsScheduleId: widgets.jobsScheduleId,
      scheduleFrequency: widgets.scheduleFrequency,
      scheduleTimes: widgets.scheduleTimes,
      scheduleWeekday: widgets.scheduleWeekday,
      scheduleMonthDay: widgets.scheduleMonthDay,
      scheduleDate: widgets.scheduleDate,
      scheduleIntervalMinutes: widgets.scheduleIntervalMinutes,
      refreshTimezone: widgets.refreshTimezone,
    })
    .from(widgets)
    .where(eq(widgets.id, widgetId))
    .limit(1);

  if (!widget) return;

  const [agent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, widget.agentId))
    .limit(1);

  const rule = widgetScheduleRule(widget);
  const timezone = rule.timezone;
  const nextAt = widget.refreshEnabled ? nextRunForRule(rule) : null;
  const values = widgetScheduleValues(rule);

  const input: JobsScheduleInput = {
    name: `Widget: ${widget.title}`.slice(0, 100),
    cron: values.refreshCron,
    timezone,
    path: "/api/jobs/widgets",
    payload: { widgetId: widget.id },
    enabled: widget.refreshEnabled,
    timeoutSeconds: 300,
  };

  const result = widget.refreshEnabled
    ? await ensure(widget.jobsScheduleId, input)
    : widget.jobsScheduleId
      ? await ensure(widget.jobsScheduleId, input)
      : null;

  if (!result) {
    await db
      .update(widgets)
      .set({
        nextRefreshAt: nextAt,
        ...values,
        jobsError: null,
        updatedAt: new Date(),
      })
      .where(eq(widgets.id, widget.id));
    return;
  }

  if (result.ok) {
    await db
      .update(widgets)
      .set({
        jobsScheduleId: result.id,
        jobsError: null,
        nextRefreshAt: nextAt,
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(widgets.id, widget.id));
    return;
  }

  await db
    .update(widgets)
    .set({
      jobsError: result.error,
      nextRefreshAt: nextAt,
      refreshMinutes: averageRefreshMinutes(widgetScheduleRule(widget)),
      updatedAt: new Date(),
    })
    .where(eq(widgets.id, widget.id));
}

export async function removeWidgetScheduleJobs(widgetId: number): Promise<void> {
  const [widget] = await db
    .select({ jobsScheduleId: widgets.jobsScheduleId })
    .from(widgets)
    .where(eq(widgets.id, widgetId))
    .limit(1);

  if (widget?.jobsScheduleId) {
    await deleteJobsSchedule(widget.jobsScheduleId);
  }
}

/**
 * One widget already refreshed, usually from a scheduled agent run. The caller
 * decides when it is appropriate; this just stamps the row so the panel and
 * card show the new data straight away.
 */
export async function noteWidgetRefreshed(widgetId: number): Promise<void> {
  const [widget] = await db
    .select({
      refreshTimezone: widgets.refreshTimezone,
      scheduleFrequency: widgets.scheduleFrequency,
      scheduleTimes: widgets.scheduleTimes,
      scheduleWeekday: widgets.scheduleWeekday,
      scheduleMonthDay: widgets.scheduleMonthDay,
      scheduleDate: widgets.scheduleDate,
      scheduleIntervalMinutes: widgets.scheduleIntervalMinutes,
    })
    .from(widgets)
    .where(eq(widgets.id, widgetId))
    .limit(1);

  if (!widget) return;

  const rule = widgetScheduleRule(widget);

  await db
    .update(widgets)
    .set({
      nextRefreshAt: nextRunForRule(rule, new Date(Date.now() + 60_000)),
      refreshMinutes: averageRefreshMinutes(rule),
      updatedAt: new Date(),
    })
    .where(eq(widgets.id, widgetId));
}

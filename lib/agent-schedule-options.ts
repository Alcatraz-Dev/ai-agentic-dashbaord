/**
 * Client-safe agent schedule types.
 *
 * Both agent tasks and widget refreshes use the shared rule in
 * `lib/schedule-rule.ts`; this module only adds the agent-specific shape, the
 * run history and the labels the panel and the chat card read.
 */

import {
  SCHEDULE_WEEKDAYS,
  describeScheduleRule,
  nextRunForRule,
  scheduleRuleCron,
  type ScheduleRule,
} from "@/lib/schedule-rule";
import type { ScheduleActionPolicy, ScheduleSentAction } from "@/lib/schedule-action";

export type { ScheduleClock, ScheduleFrequency, ScheduleRule } from "@/lib/schedule-rule";
export {
  SCHEDULE_FREQUENCIES,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULE_TIMEZONES,
  SCHEDULE_TIMES_LIMIT,
  SCHEDULE_WEEKDAYS,
  browserTimeZone,
  describeScheduleRule,
  describeScheduleTimes,
  formatClock,
  isScheduleFrequency,
  isValidTimeZone,
  nextRunForRule,
  normalizeScheduleRule,
  normalizeTimes,
  parseClock,
  scheduleRuleCron,
  scheduleRuleFromCron,
  sameScheduleRule,
  todayIsoDate,
} from "@/lib/schedule-rule";

export type AgentScheduleCadence = "hourly" | "daily" | "weekly";

export const SCHEDULE_CADENCES: { id: AgentScheduleCadence; label: string; hint: string }[] = [
  { id: "hourly", label: "Every hour", hint: "At the chosen minute" },
  { id: "daily", label: "Every day", hint: "At the chosen time" },
  { id: "weekly", label: "Every week", hint: "On the chosen day and time" },
];

export function isScheduleCadence(value: unknown): value is AgentScheduleCadence {
  return SCHEDULE_CADENCES.some((option) => option.id === value);
}

export type AgentScheduleSummary = {
  id: number;
  agentId: number;
  title: string;
  prompt: string;
  /** The frequency, times and zone this task runs at. */
  rule: ScheduleRule;
  /** The one mutating app action this task may run unattended, or null. */
  action: ScheduleActionPolicy | null;
  enabled: boolean;
  /** ISO strings, formatted in the browser. */
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastReply: string | null;
  /** CloudHike Jobs recurring schedule id, null when not synced. */
  jobsScheduleId: string | null;
  /** Why the last Jobs sync failed, or null. */
  jobsError: string | null;
  /** Widget this task refreshes after a successful run, if any. */
  linkedWidgetId: number | null;
  /** Title of that widget, for the list. */
  linkedWidgetTitle: string | null;
};

/** One execution of a schedule, newest first in the panel. */
export type AgentScheduleRunSummary = {
  id: number;
  scheduleId: number;
  status: "ok" | "error";
  reply: string | null;
  /** Complete result, shown when a history row is opened. */
  result: string | null;
  /** "manual" | "cron" | "jobs" */
  trigger: string;
  /** True when the run drove the cloud browser. */
  browserUsed: boolean;
  /** Browserbase session id, so history can link to the replay. */
  browserSessionId: string | null;
  /** True when the reply matched the last delivery and was not repeated. */
  duplicate: boolean;
  durationMs: number | null;
  /** Exactly what this run sent or posted, in order. */
  sent: ScheduleSentAction[];
  /** Memories the agent looked up in this run (`recall_memory` hits). */
  recalled: { id: number; content: string }[];
  createdAt: string;
};

/** The form data the agent proposes before a schedule exists. */
export type AgentScheduleProposal = {
  id: string;
  title: string;
  prompt: string;
  rule: ScheduleRule;
  /** The one mutating app action the task may run, or null. */
  action: ScheduleActionPolicy | null;
  /** The editable legacy fields the confirmation form uses. */
  cadence: AgentScheduleCadence;
  timezone: string | null;
  hour: number;
  minute: number;
  weekday: number;
  /** Widget the task should refresh after it runs, if the user asked for that. */
  linkedWidgetId: number | null;
  linkedWidgetTitle: string | null;
  /** One sentence the agent uses to explain why this schedule helps. */
  summary: string;
};

/** Everything the owner confirms in the form card, before any row exists. */
export type AgentScheduleDraft = {
  title: string;
  prompt: string;
  rule: ScheduleRule;
  linkedWidgetId?: number | null;
  /** Confirmed send/post, or null when the schedule may only read. */
  action?: ScheduleActionPolicy | null;
};

/** Five-field cron CloudHike Jobs runs for a stored rule or legacy fields. */
export function agentScheduleCron(
  ruleOrLegacy:
    | ScheduleRule
    | {
        cadence: AgentScheduleCadence;
        hour: number;
        minute: number;
        weekday: number;
        timezone?: string | null;
      },
): string {
  if ("frequency" in ruleOrLegacy) return scheduleRuleCron(ruleOrLegacy);

  const base: ScheduleRule = {
    frequency: ruleOrLegacy.cadence === "hourly" ? "interval" : ruleOrLegacy.cadence,
    timezone: ruleOrLegacy.timezone || "UTC",
    times: [{ hour: ruleOrLegacy.hour, minute: ruleOrLegacy.minute }],
    weekday: ruleOrLegacy.weekday,
    monthDay: 1,
    date: null,
    intervalMinutes: 60,
  };
  return scheduleRuleCron(base);
}

/** A run plus the agent/schedule it belongs to, for the workspace overview. */
export type AgentScheduleRunWithContext = AgentScheduleRunSummary & {
  agentId: number;
  agentName: string;
  scheduleTitle: string;
};

export const SCHEDULE_TITLE_MAX_LENGTH = 60;
export const SCHEDULE_PROMPT_MAX_LENGTH = 800;

/** "Every day at 08:00 and 18:00 (Europe/Berlin)". */
export function describeSchedule(
  schedule:
    | { rule: ScheduleRule }
    | {
        cadence: AgentScheduleCadence;
        hour: number;
        minute: number;
        weekday: number;
        timezone?: string | null;
      },
): string {
  if ("rule" in schedule) return describeScheduleRule(schedule.rule);

  const zone = schedule.timezone ? ` (${schedule.timezone.replace(/_/g, " ")})` : "";
  const clock = `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;

  if (schedule.cadence === "hourly") {
    return `Every hour at :${String(schedule.minute).padStart(2, "0")}${zone}`;
  }
  if (schedule.cadence === "weekly") {
    return `${SCHEDULE_WEEKDAYS[schedule.weekday] ?? "Monday"}s at ${clock}${zone}`;
  }
  return `Every day at ${clock}${zone}`;
}

/** The next moment a stored rule fires. Legacy callers always get a Date. */
export function nextRunAfter(
  ruleOrLegacy:
    | ScheduleRule
    | {
        cadence: AgentScheduleCadence;
        hour: number;
        minute: number;
        weekday: number;
        timezone?: string | null;
      },
  from: Date = new Date(),
): Date {
  if ("frequency" in ruleOrLegacy) {
    const next = nextRunForRule(ruleOrLegacy, from);
    return next ?? new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }

  const base: ScheduleRule = {
    frequency: ruleOrLegacy.cadence === "hourly" ? "interval" : ruleOrLegacy.cadence,
    timezone: ruleOrLegacy.timezone || "UTC",
    times: [{ hour: ruleOrLegacy.hour, minute: ruleOrLegacy.minute }],
    weekday: ruleOrLegacy.weekday,
    monthDay: 1,
    date: null,
    intervalMinutes: 60,
  };
  return nextRunForRule(base, from) ?? new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

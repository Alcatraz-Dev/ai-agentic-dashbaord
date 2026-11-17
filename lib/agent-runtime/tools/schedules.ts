import { randomUUID } from "node:crypto";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_TITLE_MAX_LENGTH,
  isValidTimeZone,
  type AgentScheduleProposal,
} from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE, normalizeScheduleRule } from "@/lib/schedule-rule";
import { normalizeScheduleAction } from "@/lib/schedule-action";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";

/**
 * Schedule proposals are confirmation cards, not writes.
 *
 * The agent describes the task and timing; the chat renders an editable form.
 * Only the owner clicking Confirm calls the server action that creates the row
 * and its CloudHike Jobs schedule. That keeps a model from scheduling work the
 * owner never saw, and lets the owner fix the time, cadence or time zone first.
 */

const frequencySchema = z.enum(["once", "interval", "daily", "weekly", "monthly"]);

const proposeScheduleParameters = z.object({
  title: z.string().min(1).max(SCHEDULE_TITLE_MAX_LENGTH).describe("Short name for the schedule."),
  prompt: z
    .string()
    .min(1)
    .max(SCHEDULE_PROMPT_MAX_LENGTH)
    .describe("Exactly what the agent should do each time this runs."),
  frequency: frequencySchema.describe(
    "once, interval, daily, weekly or monthly. Use once for a specific date.",
  ),
  timezone: z
    .string()
    .max(64)
    .optional()
    .describe("IANA time zone from the user's context, e.g. Europe/Berlin. Omit if unknown."),
  hour: z.number().int().min(0).max(23).describe("Hour in the user's time zone (24-hour)."),
  minute: z.number().int().min(0).max(59).describe("Minute of the hour."),
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe("0 = Sunday … 6 = Saturday. Only used for weekly schedules."),
  monthDay: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional()
    .describe("Day of the month, 1–31. Only used for monthly schedules."),
  date: z
    .string()
    .max(10)
    .optional()
    .describe("YYYY-MM-DD for a one-off task. Only used when frequency is once."),
  intervalMinutes: z
    .number()
    .int()
    .min(15)
    .max(720)
    .optional()
    .describe("Minutes between runs (15–720). Only used when frequency is interval."),
  /**
   * The one send/post this schedule may run. Only set it when the owner asked
   * the task to send, post, email, message or publish something; the form lists
   * it verbatim and the owner confirms it there.
   */
  action: z
    .object({
      toolkit: z.string().max(64).describe('App slug, e.g. "gmail".'),
      action: z.string().max(96).describe('Exact action slug from app_find_actions, e.g. "GMAIL_SEND_EMAIL".'),
      actionLabel: z.string().max(80).describe('The action name app_find_actions showed, e.g. "Send Email".'),
      destinationField: z
        .string()
        .max(64)
        .describe('The action argument the destination goes in, e.g. "recipient_email" or "channel".'),
      destination: z
        .string()
        .max(200)
        .describe("The one destination the owner agreed to, e.g. their own email address."),
      maxPerRun: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe("Sends allowed per run. Default 1."),
    })
    .optional()
    .describe(
      "Only when the scheduled task sends or posts something. Leave it out for read-only tasks.",
    ),
  summary: z
    .string()
    .max(180)
    .optional()
    .describe("One sentence on why this schedule helps, shown above the form."),
});

const proposeSchedule = tool<typeof proposeScheduleParameters, AgentToolRunState>({
  name: "propose_schedule",
  description:
    "Open an editable schedule confirmation form. Use this whenever the user asks to schedule a task, run something on a recurring basis, or set a reminder. Never say a task is scheduled before the user clicks Confirm. Do not create schedules through any other tool.",
  parameters: proposeScheduleParameters,
  execute: async (input, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) {
      return "This chat has no signed-in owner, so schedules aren't available. Ask the user to reload and try again.";
    }

    const timezone =
      input.timezone && isValidTimeZone(input.timezone) ? input.timezone : null;

    const rule = normalizeScheduleRule(
      {
        frequency: input.frequency,
        timezone: timezone ?? "UTC",
        times: [{ hour: input.hour, minute: input.minute }],
        weekday: input.weekday,
        monthDay: input.monthDay ?? 1,
        date: input.date ?? null,
        intervalMinutes: input.intervalMinutes ?? 60,
      },
      DEFAULT_WIDGET_SCHEDULE_RULE,
    );

    const parsedAction = normalizeScheduleAction(input.action ?? null);
    if (!parsedAction.ok) return parsedAction.error;

    const proposal: AgentScheduleProposal = {
      id: randomUUID(),
      title: input.title.replace(/\s+/g, " ").trim().slice(0, SCHEDULE_TITLE_MAX_LENGTH),
      prompt: input.prompt.trim().slice(0, SCHEDULE_PROMPT_MAX_LENGTH),
      rule,
      cadence:
        input.frequency === "interval"
          ? "hourly"
          : input.frequency === "weekly"
            ? "weekly"
            : "daily",
      timezone,
      hour: input.hour,
      minute: input.minute,
      weekday: input.weekday,
      linkedWidgetId: null,
      linkedWidgetTitle: null,
      action: parsedAction.action,
      summary:
        input.summary?.replace(/\s+/g, " ").trim().slice(0, 180) ||
        "Review the date, time and frequency before confirming.",
    };

    if (!proposal.title || !proposal.prompt) {
      return "The schedule needs a name and a prompt. Fill both in and call propose_schedule again.";
    }

    state.scheduleProposals.push(proposal);

    return proposal.action
      ? "The editable confirmation form is on screen. It lists the exact action and destination the task will be allowed to use. Tell the user in one sentence to check them, plus the time and frequency, then click Confirm. The app creates the CloudHike Jobs schedule; you have not created anything yet, and the send has not run."
      : "The editable confirmation form is on screen. Tell the user in one sentence to check the time, frequency and time zone, then click Confirm. The app creates the CloudHike Jobs schedule; you have not created anything yet.";
  },
});

export const SCHEDULE_TOOLS: Tool<AgentToolRunState>[] = [proposeSchedule];

export const SCHEDULE_TOOL_LABELS: Record<string, string> = {
  propose_schedule: "Preparing the schedule for confirmation",
};

export const SCHEDULE_TOOL_SUMMARIES: { name: string; summary: string }[] = [
  {
    name: "propose_schedule",
    summary:
      "Open an editable schedule form with the date, time, frequency and time zone; the owner confirms before anything is created.",
  },
];

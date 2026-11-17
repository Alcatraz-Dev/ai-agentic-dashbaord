"use server";

import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_TITLE_MAX_LENGTH,
  nextRunForRule,
  normalizeScheduleRule,
  type AgentScheduleSummary,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE } from "@/lib/schedule-rule";
import {
  normalizeScheduleAction,
  type ScheduleActionPolicy,
  type ScheduleSentAction,
} from "@/lib/schedule-action";
import {
  createAgentScheduleForUser,
  deleteAgentScheduleForUser,
  rescheduleOverdueSchedulesForUser,
  runAgentSchedule,
  scheduleBelongsToUser,
  setAgentScheduleEnabledForUser,
  setScheduleAlertsForUser,
  setScheduleDigestForUser,
  setSchedulesPausedForUser,
  updateAgentScheduleForUser,
} from "@/lib/agent-schedules";
import {
  scheduleAlertsConfigured,
  sendScheduleTestEmail,
} from "@/lib/schedule-alerts";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export type CreateAgentScheduleResult =
  | { ok: true; schedule: AgentScheduleSummary }
  | { ok: false; error: string };

export type CreateAgentScheduleActionInput = {
  agentId: number;
  title: string;
  prompt: string;
  /** The form's frequency, times and IANA time zone. */
  rule: unknown;
  /** Widget refreshed after a successful run, when the task reads that widget. */
  linkedWidgetId?: number | null;
  /** The one send/post the owner confirmed on the form (null = read-only). */
  action?: unknown;
};

function scheduleRule(
  value: unknown,
): { ok: true; rule: ScheduleRule } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Pick when this run should happen." };
  }

  const rule = normalizeScheduleRule(value, DEFAULT_WIDGET_SCHEDULE_RULE);
  if (!nextRunForRule(rule)) {
    return { ok: false, error: "Choose a future date and time for this run." };
  }

  return { ok: true, rule };
}

function linkedWidget(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Only the exact action the owner confirmed, with its one destination. */
function scheduleAction(
  value: unknown,
): { ok: true; action: ScheduleActionPolicy | null } | { ok: false; error: string } {
  return normalizeScheduleAction(value);
}

export async function createAgentScheduleAction(
  input: CreateAgentScheduleActionInput,
): Promise<CreateAgentScheduleResult> {
  const user = await requireUser();

  const agentId = Number(input.agentId);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return { ok: false, error: "Give this schedule a name." };
  if (title.length > SCHEDULE_TITLE_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${SCHEDULE_TITLE_MAX_LENGTH} characters.` };
  }

  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "Write what the agent should do each run." };
  if (prompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
    return { ok: false, error: `Keep the prompt under ${SCHEDULE_PROMPT_MAX_LENGTH} characters.` };
  }

  const parsedRule = scheduleRule(input.rule);
  if (!parsedRule.ok) return parsedRule;

  const parsedAction = scheduleAction(input.action);
  if (!parsedAction.ok) return parsedAction;

  try {
    const profile = await ensureUserRecord(user);
    const schedule = await createAgentScheduleForUser(profile.id, agentId, {
      title,
      prompt,
      rule: parsedRule.rule,
      linkedWidgetId: linkedWidget(input.linkedWidgetId),
      action: parsedAction.action,
    });

    if (!schedule) return { ok: false, error: "That agent could not be found." };
    return { ok: true, schedule };
  } catch (error) {
    console.error("[agents] schedule create failed", error);
    return { ok: false, error: "We couldn't save that schedule. Please try again." };
  }
}

export type UpdateAgentScheduleInput = {
  id: number;
  title: string;
  prompt: string;
  rule: unknown;
  linkedWidgetId?: number | null;
  action?: unknown;
};

/** Edits an existing schedule; the agent it belongs to never changes. */
export async function updateAgentScheduleAction(
  input: UpdateAgentScheduleInput,
): Promise<CreateAgentScheduleResult> {
  const user = await requireUser();

  const scheduleId = Number(input.id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return { ok: false, error: "That schedule could not be found." };
  }

  const title = String(input.title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return { ok: false, error: "Give this schedule a name." };
  if (title.length > SCHEDULE_TITLE_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${SCHEDULE_TITLE_MAX_LENGTH} characters.` };
  }

  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "Write what the agent should do each run." };
  if (prompt.length > SCHEDULE_PROMPT_MAX_LENGTH) {
    return { ok: false, error: `Keep the prompt under ${SCHEDULE_PROMPT_MAX_LENGTH} characters.` };
  }

  const parsedRule = scheduleRule(input.rule);
  if (!parsedRule.ok) return parsedRule;

  const parsedAction = scheduleAction(input.action);
  if (!parsedAction.ok) return parsedAction;

  try {
    const profile = await ensureUserRecord(user);
    const schedule = await updateAgentScheduleForUser(profile.id, scheduleId, {
      title,
      prompt,
      rule: parsedRule.rule,
      linkedWidgetId: linkedWidget(input.linkedWidgetId),
      action: parsedAction.action,
    });

    if (!schedule) return { ok: false, error: "That schedule could not be found." };
    return { ok: true, schedule };
  } catch (error) {
    console.error("[agents] schedule update failed", error);
    return { ok: false, error: "We couldn't save that schedule. Please try again." };
  }
}

export type ScheduleMutationResult = { ok: true } | { ok: false; error: string };

/**
 * Workspace-wide pause. Manual runs still work; the cron route skips them.
 * Resuming moves overdue schedules forward so nothing fires a stale backlog.
 */
export async function setSchedulesPausedAction(paused: boolean): Promise<ScheduleMutationResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const resume = !paused;
    const saved = await setSchedulesPausedForUser(profile.id, Boolean(paused));
    if (!saved) return { ok: false, error: "We couldn't change that setting." };
    if (resume) await rescheduleOverdueSchedulesForUser(profile.id);
    return { ok: true };
  } catch (error) {
    console.error("[agents] pause-all failed", error);
    return { ok: false, error: "We couldn't change that setting. Please try again." };
  }
}

/** Daily summary email of the last 24 hours of scheduled runs. */
export async function setScheduleDigestAction(enabled: boolean): Promise<ScheduleMutationResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const saved = await setScheduleDigestForUser(profile.id, Boolean(enabled));
    if (!saved) return { ok: false, error: "We couldn't change that setting." };
    return { ok: true };
  } catch (error) {
    console.error("[agents] digest preference failed", error);
    return { ok: false, error: "We couldn't change that setting. Please try again." };
  }
}

/** Sends one alert email right now so delivery can be checked on demand. */
export async function sendScheduleTestEmailAction(): Promise<ScheduleMutationResult> {
  const user = await requireUser();

  if (!scheduleAlertsConfigured()) {
    return { ok: false, error: "Email is not configured on this server yet." };
  }

  try {
    await ensureUserRecord(user);
    const result = await sendScheduleTestEmail({
      to: user.email,
      name: user.name ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true };
  } catch (error) {
    console.error("[agents] test email failed", error);
    return { ok: false, error: "The test email could not be sent." };
  }
}

/** Email alerts for failed runs (delivery needs RESEND_API_KEY on the server). */
export async function setScheduleAlertsAction(
  enabled: boolean,
): Promise<ScheduleMutationResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const saved = await setScheduleAlertsForUser(profile.id, Boolean(enabled));
    if (!saved) return { ok: false, error: "We couldn't change that setting." };
    return { ok: true };
  } catch (error) {
    console.error("[agents] alert preference failed", error);
    return { ok: false, error: "We couldn't change that setting. Please try again." };
  }
}

export async function deleteAgentScheduleAction(input: {
  id: number;
}): Promise<ScheduleMutationResult> {
  const user = await requireUser();

  const scheduleId = Number(input.id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return { ok: false, error: "That schedule could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteAgentScheduleForUser(profile.id, scheduleId);

    if (!deleted) return { ok: false, error: "That schedule could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[agents] schedule delete failed", error);
    return { ok: false, error: "We couldn't delete that schedule. Please try again." };
  }
}

export type SetScheduleEnabledResult =
  | { ok: true; schedule: AgentScheduleSummary }
  | { ok: false; error: string };

export async function setAgentScheduleEnabledAction(input: {
  id: number;
  enabled: boolean;
}): Promise<SetScheduleEnabledResult> {
  const user = await requireUser();

  const scheduleId = Number(input.id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return { ok: false, error: "That schedule could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const schedule = await setAgentScheduleEnabledForUser(
      profile.id,
      scheduleId,
      Boolean(input.enabled),
    );

    if (!schedule) return { ok: false, error: "That schedule could not be found." };
    return { ok: true, schedule };
  } catch (error) {
    console.error("[agents] schedule toggle failed", error);
    return { ok: false, error: "We couldn't change that schedule. Please try again." };
  }
}

export type RunScheduleResult =
  | { ok: true; reply: string; duplicate?: boolean; sent?: ScheduleSentAction[] }
  | { ok: false; error: string };

/** Runs one schedule immediately and returns the reply for the panel. */
export async function runAgentScheduleNowAction(input: { id: number }): Promise<RunScheduleResult> {
  const user = await requireUser();

  const scheduleId = Number(input.id);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return { ok: false, error: "That schedule could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    if (!(await scheduleBelongsToUser(profile.id, scheduleId))) {
      return { ok: false, error: "That schedule could not be found." };
    }

    return await runAgentSchedule(scheduleId);
  } catch (error) {
    console.error("[agents] schedule run failed", error);
    return { ok: false, error: "That run didn't finish. Please try again." };
  }
}

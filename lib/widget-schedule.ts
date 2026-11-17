/**
 * Widget refresh schedules are the shared schedule rule with widget-shaped
 * helpers: read a stored row as a rule, write one back (including the legacy
 * `refresh_cron` / `refresh_minutes` mirrors), and format the next update.
 */

import {
  DEFAULT_WIDGET_SCHEDULE_RULE,
  describeScheduleRule,
  formatClock,
  isValidTimeZone,
  nextRunForRule,
  normalizeScheduleRule,
  normalizeTimes,
  scheduleRuleCron,
  scheduleRuleFromCron,
  type ScheduleRule,
} from "@/lib/schedule-rule";

export { DEFAULT_WIDGET_SCHEDULE_RULE, describeScheduleRule, nextRunForRule, scheduleRuleCron };

/** The default twice-daily rule, as the legacy cron mirror. */
export const DEFAULT_WIDGET_REFRESH_CRON = scheduleRuleCron(DEFAULT_WIDGET_SCHEDULE_RULE);

/** Compatibility for callers that still store the cron string. */
export function widgetRefreshMinutes(cron: string): number {
  return averageRefreshMinutes(scheduleRuleFromCron(cron, "UTC"));
}

/** Compatibility: the next moment a stored cron fires. */
export function nextWidgetRefreshAfter(
  cron: string,
  timezone: string | null | undefined,
  from: Date = new Date(),
): Date {
  const rule = scheduleRuleFromCron(cron, timezone ?? "UTC");
  return nextRunForRule({ ...rule, timezone: timezone ?? rule.timezone }, from) ?? from;
}

/** Compatibility: a readable sentence for a stored cron. */
export function describeWidgetRefreshCron(
  cron: string,
  timezone?: string | null,
): string {
  return describeScheduleRule(scheduleRuleFromCron(cron, timezone ?? "UTC"));
}

/** The subset of a widget row a schedule needs. */
export type WidgetScheduleFields = {
  scheduleFrequency: string;
  scheduleTimes: { hour: number; minute: number }[] | null;
  scheduleWeekday: number;
  scheduleMonthDay: number;
  scheduleDate: string | null;
  scheduleIntervalMinutes: number;
  refreshTimezone: string | null;
};

/** A stored widget row as the shared rule. */
export function widgetScheduleRule(widget: WidgetScheduleFields): ScheduleRule {
  return normalizeScheduleRule(
    {
      frequency: widget.scheduleFrequency,
      timezone: widget.refreshTimezone ?? "UTC",
      times: widget.scheduleTimes,
      weekday: widget.scheduleWeekday,
      monthDay: widget.scheduleMonthDay,
      date: widget.scheduleDate,
      intervalMinutes: widget.scheduleIntervalMinutes,
    },
    { ...DEFAULT_WIDGET_SCHEDULE_RULE, timezone: widget.refreshTimezone ?? "UTC" },
  );
}

/** Average minutes between updates, for the card's one-line label. */
export function averageRefreshMinutes(rule: ScheduleRule): number {
  switch (rule.frequency) {
    case "interval":
      return rule.intervalMinutes;
    case "weekly":
      return 7 * 24 * 60;
    case "monthly":
      return 30 * 24 * 60;
    case "once":
      return 0;
    case "daily":
    default:
      return rule.times.length > 0 ? Math.round(1440 / rule.times.length) : 1440;
  }
}

/** Columns a write sets, so both the rule and the legacy mirrors stay in sync. */
export function widgetScheduleValues(rule: ScheduleRule) {
  return {
    scheduleFrequency: rule.frequency,
    scheduleTimes: normalizeTimes(rule.times, DEFAULT_WIDGET_SCHEDULE_RULE.times),
    scheduleWeekday: rule.weekday,
    scheduleMonthDay: rule.monthDay,
    scheduleDate: rule.frequency === "once" ? rule.date : null,
    scheduleIntervalMinutes: rule.intervalMinutes,
    refreshTimezone: rule.timezone,
    refreshCron: scheduleRuleCron(rule),
    refreshMinutes: averageRefreshMinutes(rule),
  };
}

export function describeWidgetSchedule(widget: WidgetScheduleFields): string {
  return describeScheduleRule(widgetScheduleRule(widget));
}

/** Local formatting of the next update, in the widget's own zone. */
export function describeNextWidgetRefresh(
  iso: string | null,
  timezone: string | null | undefined,
): string {
  if (!iso) return "Not scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not scheduled";

  try {
    return date.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone && isValidTimeZone(timezone) ? timezone : undefined,
    });
  } catch {
    return date.toLocaleString();
  }
}

/** "08:00 and 18:00" for compact rows. */
export function describeWidgetTimes(widget: WidgetScheduleFields): string {
  return normalizeTimes(widget.scheduleTimes, DEFAULT_WIDGET_SCHEDULE_RULE.times)
    .map(formatClock)
    .join(" · ");
}

/**
 * One schedule rule for everything that runs on a timer.
 *
 * Agent schedules and widget refreshes share this shape: a frequency, the
 * times (or interval, date, weekday, month day) it fires at, and the IANA zone
 * those wall-clock values mean. The UI, the server actions, the local cron
 * fallback and the CloudHike Jobs sync all read the same helpers, so a rule can
 * never mean one thing on screen and another on the scheduler.
 */

export type ScheduleFrequency = "once" | "interval" | "daily" | "weekly" | "monthly";

/** A wall-clock time in the rule's zone. */
export type ScheduleClock = { hour: number; minute: number };

export type ScheduleRule = {
  frequency: ScheduleFrequency;
  /** IANA zone; "UTC" when the owner has no preference. */
  timezone: string;
  /** Times of day for daily/weekly/monthly, sorted and unique (max 4). */
  times: ScheduleClock[];
  /** 0 = Sunday … 6 = Saturday, for weekly. */
  weekday: number;
  /** 1–31, for monthly. Months without that day are skipped. */
  monthDay: number;
  /** `YYYY-MM-DD` for a one-off run; null otherwise. */
  date: string | null;
  /** Minutes between runs for `interval` (15–720). */
  intervalMinutes: number;
};

export const SCHEDULE_TIMES_LIMIT = 4;

export const SCHEDULE_FREQUENCIES: {
  id: ScheduleFrequency;
  label: string;
  hint: string;
}[] = [
  { id: "once", label: "Once", hint: "One run on a chosen date" },
  { id: "interval", label: "Interval", hint: "Every few minutes or hours" },
  { id: "daily", label: "Daily", hint: "At one or more times a day" },
  { id: "weekly", label: "Weekly", hint: "On a chosen weekday" },
  { id: "monthly", label: "Monthly", hint: "On a chosen day of the month" },
];

export const SCHEDULE_INTERVAL_OPTIONS = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
] as const;

export const SCHEDULE_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const SCHEDULE_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

/** A widget refreshes at 08:00 and 18:00 until its owner changes that. */
export const DEFAULT_WIDGET_SCHEDULE_RULE: ScheduleRule = {
  frequency: "daily",
  timezone: "UTC",
  times: [
    { hour: 8, minute: 0 },
    { hour: 18, minute: 0 },
  ],
  weekday: 1,
  monthDay: 1,
  date: null,
  intervalMinutes: 720,
};

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zone the browser is in, used to prefill new schedules and widgets. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isScheduleFrequency(value: unknown): value is ScheduleFrequency {
  return SCHEDULE_FREQUENCIES.some((option) => option.id === value);
}

export function formatClock(time: ScheduleClock): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

/** `09:30` → `{ hour: 9, minute: 30 }`, or null when it isn't a time. */
export function parseClock(value: unknown): ScheduleClock | null {
  if (typeof value === "object" && value !== null) {
    const hour = Number((value as ScheduleClock).hour);
    const minute = Number((value as ScheduleClock).minute);
    return wholeClock(hour, minute);
  }

  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  return wholeClock(Number(match[1]), Number(match[2]));
}

function wholeClock(hour: number, minute: number): ScheduleClock | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  return rounded >= min && rounded <= max ? rounded : fallback;
}

/** Sorted, de-duplicated times, capped at the limit. */
export function normalizeTimes(value: unknown, fallback: ScheduleClock[]): ScheduleClock[] {
  const list = Array.isArray(value)
    ? value.map(parseClock).filter((time): time is ScheduleClock => time !== null)
    : [];
  const source = list.length > 0 ? list : fallback;
  const seen = new Set<string>();
  const unique: ScheduleClock[] = [];

  for (const time of [...source].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))) {
    const key = formatClock(time);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(time);
    if (unique.length === SCHEDULE_TIMES_LIMIT) break;
  }

  return unique.length > 0 ? unique : [{ hour: 9, minute: 0 }];
}

function isoDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * Coerces anything form-shaped into a usable rule. Missing or invalid fields
 * keep the fallback, so a partial edit can never produce a schedule that fires
 * at the wrong hour.
 */
export function normalizeScheduleRule(
  value: unknown,
  fallback: ScheduleRule = DEFAULT_WIDGET_SCHEDULE_RULE,
): ScheduleRule {
  const input =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

  const frequency = isScheduleFrequency(input.frequency) ? input.frequency : fallback.frequency;
  const zone = String(input.timezone ?? "").trim();
  const timezone =
    zone && zone.length <= 64 && isValidTimeZone(zone) ? zone : fallback.timezone || "UTC";

  const interval = clampInt(input.intervalMinutes, 15, 720, fallback.intervalMinutes);

  return {
    frequency,
    timezone,
    times: normalizeTimes(input.times, fallback.times),
    weekday: clampInt(input.weekday, 0, 6, fallback.weekday),
    monthDay: clampInt(input.monthDay, 1, 31, fallback.monthDay),
    date: isoDate(input.date) ?? (frequency === "once" ? fallback.date : null),
    intervalMinutes: interval,
  };
}

/** True when both rules fire at the same moments, in the same zone. */
export function sameScheduleRule(a: ScheduleRule, b: ScheduleRule): boolean {
  return (
    a.frequency === b.frequency &&
    a.timezone === b.timezone &&
    a.weekday === b.weekday &&
    a.monthDay === b.monthDay &&
    a.date === b.date &&
    a.intervalMinutes === b.intervalMinutes &&
    a.times.length === b.times.length &&
    a.times.every((time, index) => formatClock(time) === formatClock(b.times[index] ?? time))
  );
}

/**
 * The five-field cron CloudHike Jobs runs for a rule. Cron cannot express a
 * one-off date, so `once` uses the date's own day and month: the run marks the
 * schedule finished and the Jobs schedule is removed right after it.
 */
export function scheduleRuleCron(rule: ScheduleRule): string {
  const times = normalizeTimes(rule.times, [{ hour: 9, minute: 0 }]);
  const minute = times[0].minute;
  const hours = Array.from(new Set(times.map((time) => time.hour)))
    .sort((a, b) => a - b)
    .join(",");

  switch (rule.frequency) {
    case "interval": {
      const minutes = clampInt(rule.intervalMinutes, 15, 720, 60);
      if (minutes < 60) return `*/${minutes} * * * *`;
      const step = Math.round(minutes / 60);
      return `0 */${step} * * *`;
    }
    case "weekly":
      return `${minute} ${hours} * * ${rule.weekday}`;
    case "monthly":
      return `${minute} ${hours} ${rule.monthDay} * *`;
    case "once": {
      const date = parseIsoDate(rule.date) ?? parseIsoDate(todayIsoDate())!;
      return `${minute} ${hours} ${date.day} ${date.month} *`;
    }
    case "daily":
    default:
      return `${minute} ${hours} * * *`;
  }
}

function parseIsoDate(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Today in the given zone, as `YYYY-MM-DD`, for date inputs. */
export function todayIsoDate(timezone = "UTC"): string {
  const parts = zonedParts(new Date(), isValidTimeZone(timezone) ? timezone : "UTC");
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAY_KEYS.indexOf(get("weekday"));

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const local = zonedParts(date, timeZone);
  return (
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) -
    Math.floor(date.getTime() / 1000) * 1000
  );
}

function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
  // One correction pass covers DST boundaries.
  utc = wall - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

function addCalendarDays(year: number, month: number, day: number, days: number) {
  const stamp = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: stamp.getUTCFullYear(),
    month: stamp.getUTCMonth() + 1,
    day: stamp.getUTCDate(),
    weekday: stamp.getUTCDay(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The first moment this rule fires strictly after `from`, in its own zone.
 * Null means it never will again — a one-off run whose date has passed.
 */
export function nextRunForRule(rule: ScheduleRule, from: Date = new Date()): Date | null {
  const timezone = isValidTimeZone(rule.timezone) ? rule.timezone : "UTC";
  const times = normalizeTimes(rule.times, [{ hour: 9, minute: 0 }]);
  const now = zonedParts(from, timezone);

  if (rule.frequency === "interval") {
    const minutes = clampInt(rule.intervalMinutes, 15, 720, 60);
    const step = minutes < 60 ? minutes : Math.round(minutes / 60) * 60;
    const nowMinute = now.hour * 60 + now.minute;
    const boundary = (Math.floor(nowMinute / step) + 1) * step;

    let minuteOfDay = boundary;
    let extraDays = 0;
    while (minuteOfDay >= 24 * 60) {
      minuteOfDay -= 24 * 60;
      extraDays += 1;
    }

    const day = addCalendarDays(now.year, now.month, now.day, extraDays);
    return zonedToUtc(
      day.year,
      day.month,
      day.day,
      Math.floor(minuteOfDay / 60),
      minuteOfDay % 60,
      timezone,
    );
  }

  if (rule.frequency === "once") {
    const date = parseIsoDate(rule.date);
    if (!date) return null;
    const candidate = zonedToUtc(
      date.year,
      date.month,
      date.day,
      times[0].hour,
      times[0].minute,
      timezone,
    );
    return candidate.getTime() > from.getTime() ? candidate : null;
  }

  if (rule.frequency === "weekly") {
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = addCalendarDays(now.year, now.month, now.day, offset);
      if (day.weekday !== rule.weekday) continue;
      for (const time of times) {
        const candidate = zonedToUtc(day.year, day.month, day.day, time.hour, time.minute, timezone);
        if (candidate.getTime() > from.getTime()) return candidate;
      }
    }
    return null;
  }

  if (rule.frequency === "monthly") {
    for (let offset = 0; offset <= 2; offset += 1) {
      const stamp = new Date(Date.UTC(now.year, now.month - 1 + offset, 1));
      const year = stamp.getUTCFullYear();
      const month = stamp.getUTCMonth() + 1;
      if (rule.monthDay > daysInMonth(year, month)) continue;
      for (const time of times) {
        const candidate = zonedToUtc(year, month, rule.monthDay, time.hour, time.minute, timezone);
        if (candidate.getTime() > from.getTime()) return candidate;
      }
    }
    return null;
  }

  // Daily: today's remaining times, then the next two days.
  for (let offset = 0; offset <= 2; offset += 1) {
    const day = addCalendarDays(now.year, now.month, now.day, offset);
    for (const time of times) {
      const candidate = zonedToUtc(day.year, day.month, day.day, time.hour, time.minute, timezone);
      if (candidate.getTime() > from.getTime()) return candidate;
    }
  }

  return null;
}

function clockList(times: ScheduleClock[]): string {
  const labels = times.map(formatClock);
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function shortDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Every day at 08:00 and 18:00 (Europe/Berlin)". */
export function describeScheduleRule(rule: ScheduleRule): string {
  const times = normalizeTimes(rule.times, [{ hour: 9, minute: 0 }]);
  const zone = rule.timezone ? ` (${rule.timezone.replace(/_/g, " ")})` : "";

  switch (rule.frequency) {
    case "once":
      return `Once on ${rule.date ? shortDate(rule.date) : "a date to pick"} at ${clockList(
        times.slice(0, 1),
      )}${zone}`;
    case "interval": {
      const option = SCHEDULE_INTERVAL_OPTIONS.find(
        (entry) => entry.minutes === rule.intervalMinutes,
      );
      return `${option?.label ?? `Every ${rule.intervalMinutes} minutes`}${zone}`;
    }
    case "weekly":
      return `Every ${SCHEDULE_WEEKDAYS[rule.weekday] ?? "Monday"} at ${clockList(times)}${zone}`;
    case "monthly":
      return `Every month on day ${rule.monthDay} at ${clockList(times)}${zone}`;
    case "daily":
    default:
      return `Every day at ${clockList(times)}${zone}`;
  }
}

/** "08:00 and 18:00" — what a card shows under the frequency. */
export function describeScheduleTimes(rule: ScheduleRule): string {
  return clockList(normalizeTimes(rule.times, [{ hour: 9, minute: 0 }]));
}

/**
 * Reads a cron written against the old widget model back into a rule, keeping
 * the times it fired at (`0 8,18 * * *` → daily at 08:00 and 18:00).
 */
export function scheduleRuleFromCron(
  cron: string,
  timezone: string | null | undefined,
): ScheduleRule {
  const zone = timezone && isValidTimeZone(timezone) ? timezone : "UTC";
  const fields = cron.trim().split(/\s+/);
  const fallback: ScheduleRule = {
    ...DEFAULT_WIDGET_SCHEDULE_RULE,
    timezone: zone,
    times: [{ hour: 8, minute: 0 }],
  };

  if (fields.length !== 5) return fallback;

  const stepMinute = /^\*\/(\d{1,2})$/.exec(fields[0]);
  if (stepMinute) {
    const step = Number(stepMinute[1]);
    return {
      ...fallback,
      frequency: "interval",
      intervalMinutes: Math.min(720, Math.max(15, step)),
    };
  }

  const minute = Number(fields[0]);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;

  const hourField = fields[1];
  const stepHour = /^\*?\/(\d{1,2})$/.exec(hourField);
  if (stepHour) {
    const step = Number(stepHour[1]);
    return {
      ...fallback,
      frequency: "interval",
      intervalMinutes: Math.min(720, Math.max(15, step * 60)),
    };
  }

  if (hourField === "*") {
    return { ...fallback, frequency: "interval", intervalMinutes: 60 };
  }

  const hours = hourField
    .split(",")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23)
    .sort((a, b) => a - b);

  if (hours.length === 0) return fallback;

  const times = hours.map((hour) => ({ hour, minute }));
  const weekdayField = fields[4];
  // Fields are minute hour day-of-month month day-of-week, so the day of the
  // month is fields[2] and fields[3] is the month.
  const monthDayField = fields[2];

  if (weekdayField !== "*" && /^\d$/.test(weekdayField)) {
    return { ...fallback, frequency: "weekly", weekday: Number(weekdayField), times };
  }

  if (monthDayField !== "*" && /^\d{1,2}$/.test(monthDayField)) {
    return {
      ...fallback,
      frequency: "monthly",
      monthDay: Math.min(31, Math.max(1, Number(monthDayField))),
      times,
    };
  }

  return { ...fallback, frequency: "daily", times };
}

/**
 * One-off migration: move existing schedules onto the shared schedule rule.
 *
 *   node --env-file=.env scripts/migrate-schedule-rules.mjs
 *
 * Agent schedules keep their cadence, hour, minute and weekday; widgets keep
 * the times their cron fired at (a `0 8,18 * * *` widget stays at 08:00 and
 * 18:00, an hourly one becomes an interval). Re-running is safe: every value is
 * derived from the same legacy columns.
 */

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env scripts/migrate-schedule-rules.mjs");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false, max: 1 });

/** A rule derived from an old five-field cron, keeping the hours it fired at. */
function ruleFromCron(cron, timezone) {
  const fallback = {
    frequency: "daily",
    timezone: timezone || "UTC",
    times: [{ hour: 8, minute: 0 }],
    weekday: 1,
    monthDay: 1,
    date: null,
    intervalMinutes: 720,
  };

  const fields = String(cron ?? "").trim().split(/\s+/);
  if (fields.length !== 5) return fallback;

  const minute = Number(fields[0]);
  const stepMinute = /^\*\/(\d{1,2})$/.exec(fields[0]);
  if (stepMinute) {
    const step = Number(stepMinute[1]);
    return { ...fallback, frequency: "interval", intervalMinutes: Math.min(720, Math.max(15, step)) };
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;

  const stepHour = /^\*?\/(\d{1,2})$/.exec(fields[1]);
  if (stepHour) {
    const step = Number(stepHour[1]);
    return {
      ...fallback,
      frequency: "interval",
      intervalMinutes: Math.min(720, Math.max(15, step * 60)),
    };
  }

  if (fields[1] === "*") {
    return { ...fallback, frequency: "interval", intervalMinutes: 60 };
  }

  const hours = fields[1]
    .split(",")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23)
    .sort((a, b) => a - b);
  if (hours.length === 0) return fallback;

  const times = hours.map((hour) => ({ hour, minute }));

  if (/^\d$/.test(fields[4])) {
    return { ...fallback, frequency: "weekly", weekday: Number(fields[4]), times };
  }
  if (/^\d{1,2}$/.test(fields[3])) {
    return {
      ...fallback,
      frequency: "monthly",
      monthDay: Math.min(31, Math.max(1, Number(fields[3]))),
      times,
    };
  }

  return { ...fallback, frequency: "daily", times };
}

/** The legacy `cadence` mirror the old readers expect. */
function legacyCadence(frequency) {
  return frequency === "interval" ? "hourly" : frequency === "once" ? "daily" : frequency;
}

try {
  const schedules = await sql`
    select id, cadence, hour, minute, weekday, timezone, frequency
    from agent_schedules
  `;

  let migrated = 0;
  for (const row of schedules) {
    const frequency =
      row.cadence === "hourly"
        ? "interval"
        : ["daily", "weekly", "monthly", "once"].includes(row.cadence)
          ? row.cadence
          : "daily";
    const times = [{ hour: Number(row.hour ?? 9), minute: Number(row.minute ?? 0) }];

    await sql`
      update agent_schedules
      set frequency = ${frequency},
          times = ${sql.json(times)},
          interval_minutes = ${frequency === "interval" ? 60 : 60},
          month_day = ${1},
          cadence = ${legacyCadence(frequency)},
          updated_at = now()
      where id = ${row.id}
    `;
    migrated += 1;
  }

  const widgets = await sql`
    select id, refresh_cron, refresh_timezone, refresh_minutes
    from widgets
  `;

  let refreshed = 0;
  for (const row of widgets) {
    const rule = ruleFromCron(row.refresh_cron, row.refresh_timezone);
    const average =
      rule.frequency === "interval"
        ? rule.intervalMinutes
        : rule.frequency === "daily" && rule.times.length > 1
          ? Math.round(1440 / rule.times.length)
          : rule.frequency === "weekly"
            ? 10080
            : 1440;

    await sql`
      update widgets
      set schedule_frequency = ${rule.frequency},
          schedule_times = ${sql.json(rule.times)},
          schedule_weekday = ${rule.weekday},
          schedule_month_day = ${rule.monthDay},
          schedule_interval_minutes = ${rule.intervalMinutes},
          refresh_minutes = ${average},
          updated_at = now()
      where id = ${row.id}
    `;
    refreshed += 1;
  }

  console.log(
    `Migrated ${migrated} agent schedule(s) and ${refreshed} widget schedule(s) to the shared rule.`,
  );
} finally {
  await sql.end();
}

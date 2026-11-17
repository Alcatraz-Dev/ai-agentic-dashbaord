"use client";

import { CalendarClock, Clock3 } from "lucide-react";

import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import {
  SCHEDULE_FREQUENCIES,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULE_TIMEZONES,
  SCHEDULE_WEEKDAYS,
  browserTimeZone,
  describeScheduleRule,
  formatClock,
  nextRunForRule,
  parseClock,
  type ScheduleFrequency,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";
import { cn } from "@/lib/utils";

const FIELD_LABEL = "text-[0.7rem]";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** YYYY-MM-DD → local midnight. */
function parseIsoDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Local midnight → YYYY-MM-DD. */
function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function nextLabel(rule: ScheduleRule): string {
  const next = nextRunForRule(rule);
  if (!next) return "No future run — pick a later date.";
  try {
    return next.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: rule.timezone,
    });
  } catch {
    return next.toLocaleString();
  }
}

/**
 * One form for a schedule rule. The agent's confirmation card and the agent
 * panel's edit dialog both use it, so frequency, date, times and zone always
 * mean the same thing before they reach the server or CloudHike Jobs.
 */
export function ScheduleRuleFields({
  rule,
  onChange,
  disabled = false,
}: {
  rule: ScheduleRule;
  onChange: (rule: ScheduleRule) => void;
  disabled?: boolean;
}) {
  const zones = Array.from(
    new Set([rule.timezone || browserTimeZone(), ...SCHEDULE_TIMEZONES]),
  ).filter(Boolean);

  function patch(values: Partial<ScheduleRule>) {
    onChange({ ...rule, ...values });
  }

  function setFrequency(frequency: ScheduleFrequency) {
    patch({
      frequency,
      date: frequency === "once" ? (rule.date ?? new Date().toISOString().slice(0, 10)) : null,
      times:
        rule.times.length > 0
          ? rule.times
          : [
              { hour: 8, minute: 0 },
              { hour: 18, minute: 0 },
            ],
    });
  }

  function setTime(index: number, value: string) {
    const parsed = parseClock(value);
    if (!parsed) return;
    const times = [...rule.times];
    times[index] = parsed;
    patch({ times });
  }

  function removeSecondTime() {
    patch({ times: rule.times.slice(0, 1) });
  }

  function addSecondTime() {
    if (rule.times.length >= 2) return;
    const first = rule.times[0] ?? { hour: 8, minute: 0 };
    patch({ times: [first, { hour: 18, minute: 0 }] });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className={FIELD_LABEL}>Frequency</Label>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {SCHEDULE_FREQUENCIES.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={rule.frequency === option.id}
              title={option.hint}
              onClick={() => setFrequency(option.id)}
              className={cn(
                "rounded-lg border px-1.5 py-1.5 text-[0.66rem] transition",
                rule.frequency === option.id
                  ? "border-foreground/20 bg-muted font-medium text-foreground"
                  : "border-border hover:bg-muted/60",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {rule.frequency === "once" && (
          <div className="min-w-[8.5rem] flex-1">
            <DatePicker
              label="Date"
              value={parseIsoDay(rule.date)}
              min={startOfToday()}
              disabled={disabled}
              size="sm"
              placeholder="Pick a day"
              aria-label="Run date"
              className="w-full"
              onChange={(next) => patch({ date: isoDay(next) })}
            />
          </div>
        )}

        {rule.frequency === "weekly" && (
          <div className="min-w-[7.5rem]">
            <Select
              label="Day"
              options={SCHEDULE_WEEKDAYS.map((day, index) => ({
                value: String(index),
                label: day,
              }))}
              value={String(rule.weekday)}
              disabled={disabled}
              size="sm"
              aria-label="Day of the week"
              className="w-full"
              onChange={(value) => patch({ weekday: Number(value) })}
            />
          </div>
        )}

        {rule.frequency === "monthly" && (
          <NumberInput
            label="Day of month"
            value={rule.monthDay}
            min={1}
            max={31}
            disabled={disabled}
            size="sm"
            className="w-24"
            onValueChange={(value) => patch({ monthDay: value ?? 1 })}
          />
        )}

        {rule.frequency === "interval" && (
          <div className="min-w-[10rem] flex-1">
            <Select
              label="Every"
              options={SCHEDULE_INTERVAL_OPTIONS.map((option) => ({
                value: String(option.minutes),
                label: option.label,
              }))}
              value={String(rule.intervalMinutes)}
              disabled={disabled}
              size="sm"
              aria-label="Interval"
              className="w-full"
              onChange={(value) => patch({ intervalMinutes: Number(value) })}
            />
          </div>
        )}

        {rule.frequency !== "interval" && (
          <>
            {rule.times.map((time, index) => (
              <div key={index} className="flex items-end gap-1">
                <TimePicker
                  label={index === 0 ? "Time" : "Second time"}
                  value={formatClock(time)}
                  disabled={disabled}
                  step={15}
                  size="sm"
                  className="w-[7.6rem]"
                  onChange={(value) => {
                    if (value) setTime(index, value);
                  }}
                />
                {index === 1 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={removeSecondTime}
                    className="pb-1 text-[0.62rem] text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {rule.times.length < 2 && rule.frequency !== "once" && (
              <button
                type="button"
                disabled={disabled}
                onClick={addSecondTime}
                className="pb-1 text-[0.66rem] font-medium text-brand-ink hover:underline"
              >
                + Add a second time
              </button>
            )}
          </>
        )}

        <div className="min-w-[9rem] flex-1">
          <Select
            label="Time zone"
            options={zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }))}
            value={rule.timezone}
            disabled={disabled}
            size="sm"
            aria-label="Time zone"
            className="w-full"
            onChange={(value) => patch({ timezone: value })}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/50 px-3 py-2">
        <p className="flex items-center gap-1 text-[0.63rem] font-semibold tracking-wide text-foreground uppercase">
          <CalendarClock className="size-3" />
          Schedule details
        </p>
        <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
          {describeScheduleRule(rule)}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[0.64rem] text-muted-foreground">
          <Clock3 className="size-2.5" />
          Next run {nextLabel(rule)}
        </p>
      </div>
    </div>
  );
}

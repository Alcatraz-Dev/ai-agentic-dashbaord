"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  nextRunAfter,
  type AgentScheduleRunSummary,
  type AgentScheduleSummary,
} from "@/lib/agent-schedule-options";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type DayEntry = {
  kind: "occurrence" | "ok" | "error";
  label: string;
  time: string;
};

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Month grid of what will run and what did. Occurrences are projected with the
 * same `nextRunAfter` the cron uses; runs come from the stored history.
 */
export function ScheduleCalendar({
  agentId,
  schedules,
  runs,
}: {
  agentId: number;
  schedules: AgentScheduleSummary[];
  runs: AgentScheduleRunSummary[];
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const titles = useMemo(
    () => new Map(schedules.map((schedule) => [schedule.id, schedule.title])),
    [schedules],
  );

  const entries = useMemo(() => {
    const byDay = new Map<string, DayEntry[]>();

    const push = (key: string, entry: DayEntry) => {
      const bucket = byDay.get(key);
      if (bucket) bucket.push(entry);
      else byDay.set(key, [entry]);
    };

    const monthStart = startOfMonth(month);
    const gridStart = new Date(monthStart);
    // Monday-first grid: back up to the Monday on or before the 1st.
    gridStart.setDate(monthStart.getDate() - ((monthStart.getDay() + 6) % 7));

    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);

      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const key = dayKey(day);

      for (const schedule of schedules) {
        if (!schedule.enabled) continue;

        const next = nextRunAfter(schedule.rule, new Date(dayStart.getTime() - 1000));
        if (next < dayEnd) {
          push(key, {
            kind: "occurrence",
            label: schedule.title,
            time: next.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }

      for (const run of runs) {
        const at = new Date(run.createdAt);
        if (Number.isNaN(at.getTime())) continue;
        if (dayKey(at) !== key) continue;

        push(key, {
          kind: run.status === "ok" ? "ok" : "error",
          label: titles.get(run.scheduleId) ?? "Schedule run",
          time: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }

    return byDay;
  }, [month, schedules, runs, titles]);

  const gridStart = useMemo(() => {
    const first = startOfMonth(month);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return start;
  }, [month]);

  const today = dayKey(new Date());
  const selectedEntries = selected ? (entries.get(selected) ?? []) : [];

  return (
    <div className="mt-2.5 rounded-xl border border-border/70 bg-muted/40 p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[0.7rem] font-medium">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="grid size-5 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="grid size-5 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {DAY_LABELS.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="text-center text-[0.58rem] font-medium text-muted-foreground/70"
          >
            {label}
          </span>
        ))}

        {Array.from({ length: 42 }, (_, index) => {
          const day = new Date(gridStart);
          day.setDate(gridStart.getDate() + index);
          const key = dayKey(day);
          const dayEntries = entries.get(key) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === today;
          const isSelected = key === selected;

          const dots = dayEntries.filter(
            (entry, entryIndex) =>
              dayEntries.findIndex((candidate) => candidate.kind === entry.kind) === entryIndex,
          );

          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(isSelected ? null : key)}
              aria-label={`${day.toDateString()}, ${dayEntries.length} scheduled`}
              aria-pressed={isSelected}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md text-[0.62rem] transition",
                inMonth ? "text-foreground" : "text-muted-foreground/40",
                isSelected ? "bg-brand-soft ring-1 ring-brand-border" : "hover:bg-muted/60",
                isToday && !isSelected && "font-semibold text-brand-ink",
              )}
            >
              <span className="tabular-nums">{day.getDate()}</span>
              <span className="mt-0.5 flex h-1 items-center gap-0.5">
                {dots.slice(0, 3).map((dot) => (
                  <span
                    key={dot.kind}
                    className={cn(
                      "size-1 rounded-full",
                      dot.kind === "occurrence"
                        ? "bg-brand-soft"
                        : dot.kind === "ok"
                          ? "bg-emerald-500"
                          : "bg-rose-500",
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-3 px-1 text-[0.58rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1 rounded-full bg-brand-soft" /> scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1 rounded-full bg-emerald-500" /> ran
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1 rounded-full bg-rose-500" /> failed
        </span>
      </div>

      {selected && (
        <div className="mt-1.5 border-t border-border/60 pt-1.5">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="text-[0.62rem] font-medium text-muted-foreground">{selected}</span>
            <a
              href={`/dashboard/settings?agent=${agentId}&date=${selected}`}
              className="text-[0.64rem] font-medium text-brand-ink hover:underline"
            >
              Open in run history
            </a>
          </div>
          {selectedEntries.length === 0 ? (
            <p className="px-1 text-[0.66rem] text-muted-foreground">Nothing on this day.</p>
          ) : (
            <ul className="space-y-0.5">
              {selectedEntries.map((entry, index) => (
                <li
                  key={`${entry.kind}-${entry.label}-${index}`}
                  className="flex items-center gap-1.5 px-1 text-[0.66rem]"
                >
                  <span
                    className={cn(
                      "size-1 rounded-full",
                      entry.kind === "occurrence"
                        ? "bg-brand-soft"
                        : entry.kind === "ok"
                          ? "bg-emerald-500"
                          : "bg-rose-500",
                    )}
                  />
                  <span className="text-muted-foreground tabular-nums">{entry.time}</span>
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

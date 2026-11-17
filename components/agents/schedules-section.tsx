"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock3,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import {
  deleteAgentScheduleAction,
  runAgentScheduleNowAction,
  setAgentScheduleEnabledAction,
} from "@/app/actions/schedules";
import { ScheduleDialog } from "@/components/agents/schedule-dialog";
import { EmptyCalendar } from "@/components/empty-calendar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { describeSchedule, type AgentScheduleRunSummary, type AgentScheduleSummary } from "@/lib/agent-schedule-options";
import { describeScheduleAction } from "@/lib/schedule-action";
import type { WidgetRecord } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Recurring agent tasks. A row stores a rule (once / interval / daily / weekly
 * / monthly), its prompt, and an optional linked widget. `Run now` uses the same
 * runtime as chat; CloudHike Jobs starts the scheduled ones.
 */
export function SchedulesSection({
  agentId,
  schedules,
  runs = [],
  widgets = [],
  embedded = false,
}: {
  agentId: number;
  schedules: AgentScheduleSummary[];
  /** Recent executions, newest first. */
  runs?: AgentScheduleRunSummary[];
  /** This agent's widgets, for linking a task to the card it refreshes. */
  widgets?: WidgetRecord[];
  /** Rendered inside the Scheduling tabs, which own the outer card. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState(schedules);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentScheduleSummary | null>(null);
  const [running, setRunning] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    text: string;
    sent: AgentScheduleRunSummary["sent"];
  } | null>(null);

  useEffect(() => {
    setList(schedules);
  }, [schedules]);

  async function run(schedule: AgentScheduleSummary) {
    if (running !== null) return;
    setRunning(schedule.id);
    setError(null);
    setPreview(null);

    try {
      const result = await runAgentScheduleNowAction({ id: schedule.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setPreview({ title: schedule.title, text: result.reply, sent: result.sent ?? [] });
      setList((current) =>
        current.map((entry) =>
          entry.id === schedule.id
            ? { ...entry, lastStatus: "ok", lastRunAt: new Date().toISOString() }
            : entry,
        ),
      );
      router.refresh();
    } catch (runError) {
      console.error("[agents] schedule run request failed", runError);
      setError("That run didn't finish. Please try again.");
    } finally {
      setRunning(null);
    }
  }

  async function toggle(schedule: AgentScheduleSummary, enabled: boolean) {
    if (toggling !== null) return;
    setToggling(schedule.id);
    setError(null);

    try {
      const result = await setAgentScheduleEnabledAction({ id: schedule.id, enabled });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setList((current) =>
        current.map((entry) => (entry.id === schedule.id ? result.schedule : entry)),
      );
      router.refresh();
    } catch (toggleError) {
      console.error("[agents] schedule toggle request failed", toggleError);
      setError("We couldn't change that schedule. Please try again.");
    } finally {
      setToggling(null);
    }
  }

  async function remove(schedule: AgentScheduleSummary) {
    if (removing !== null) return;
    if (!window.confirm(`Delete "${schedule.title}"? Runs already in the chat stay.`)) return;

    setRemoving(schedule.id);
    setError(null);

    try {
      const result = await deleteAgentScheduleAction({ id: schedule.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setList((current) => current.filter((entry) => entry.id !== schedule.id));
      router.refresh();
    } catch (removeError) {
      console.error("[agents] schedule delete request failed", removeError);
      setError("We couldn't delete that schedule. Please try again.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className={embedded ? "p-3" : "p-4"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {embedded ? "Agent tasks" : "Schedules"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className="h-6 gap-1 rounded-md px-1.5 text-[0.66rem] text-muted-foreground hover:text-brand-ink"
        >
          <Plus className="size-3" />
          New task
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="mt-2 flex items-center gap-3 overflow-hidden rounded-xl border border-dashed border-border px-3 py-2.5">
          <EmptyCalendar
            title="Schedules"
            badge="EMPTY"
            action="No runs yet"
            label="An empty schedule with no upcoming runs"
            className="w-24 shrink-0"
          />
          <p className="text-[0.7rem] leading-relaxed text-muted-foreground">
            Nothing scheduled yet. Ask the agent to schedule a task, or add one here. It will run
            through CloudHike Jobs.
          </p>
        </div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {list.map((schedule) => {
            const failed = schedule.lastStatus === "error";
            const ok = schedule.lastStatus === "ok";
            const past = runs.filter((entry) => entry.scheduleId === schedule.id).slice(0, 2);

            return (
              <li
                key={schedule.id}
                className="rounded-xl border border-border/60 bg-muted/40 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ring-1",
                      failed
                        ? "bg-rose-50 text-rose-600 ring-rose-100"
                        : "bg-card text-muted-foreground ring-border/60",
                    )}
                  >
                    {failed ? (
                      <TriangleAlert className="size-3" />
                    ) : ok ? (
                      <Check className="size-3 text-emerald-600" />
                    ) : (
                      <Clock3 className="size-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.76rem] font-medium">{schedule.title}</p>
                    <p className="truncate text-[0.62rem] text-muted-foreground">
                      {describeSchedule({ rule: schedule.rule })}
                    </p>
                    <p
                      suppressHydrationWarning
                      className="truncate text-[0.6rem] text-muted-foreground/80"
                    >
                      {schedule.lastRunAt
                        ? `Last run ${formatMoment(schedule.lastRunAt)}`
                        : "Never run"}
                      {schedule.enabled && schedule.nextRunAt
                        ? ` · Next ${formatMoment(schedule.nextRunAt)}`
                        : " · Paused"}
                    </p>
                    {schedule.action ? (
                      <p className="truncate text-[0.6rem] text-amber-700">
                        May send: {describeScheduleAction(schedule.action)}
                      </p>
                    ) : null}
                    {schedule.linkedWidgetTitle ? (
                      <p className="truncate text-[0.6rem] text-brand-ink">
                        Refreshes “{schedule.linkedWidgetTitle}” after each run
                      </p>
                    ) : null}
                    {schedule.jobsError ? (
                      <p className="mt-1 flex items-start gap-1 text-[0.6rem] leading-relaxed text-amber-700">
                        <TriangleAlert className="mt-0.5 size-2.5 shrink-0" />
                        {schedule.jobsError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Switch
                      size="sm"
                      checked={schedule.enabled}
                      disabled={toggling !== null}
                      onCheckedChange={(checked) => void toggle(schedule, checked)}
                      aria-label={`${schedule.enabled ? "Pause" : "Resume"} ${schedule.title}`}
                    />
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Edit ${schedule.title}`}
                        title="Edit"
                        onClick={() => {
                          setEditing(schedule);
                          setOpen(true);
                        }}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Run ${schedule.title} now`}
                        title="Run now"
                        onClick={() => void run(schedule)}
                        disabled={running !== null}
                        className="grid size-6 place-items-center rounded-md text-brand-ink hover:bg-muted disabled:opacity-40"
                      >
                        {running === schedule.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Play className="size-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${schedule.title}`}
                        onClick={() => void remove(schedule)}
                        disabled={removing !== null}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        {removing === schedule.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {past.length > 0 && (
                  <ul className="mt-1 ml-8 space-y-0.5 border-l border-border/60 pl-2">
                    {past.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-baseline gap-1.5 text-[0.58rem] text-muted-foreground"
                      >
                        <span
                          className={cn(
                            "size-1 shrink-0 rounded-full",
                            entry.status === "ok" ? "bg-emerald-500" : "bg-rose-500",
                          )}
                        />
                        <span suppressHydrationWarning className="shrink-0 tabular-nums">
                          {formatMoment(entry.createdAt)}
                        </span>
                        <span className="min-w-0 truncate" title={entry.reply ?? undefined}>
                          {entry.reply ?? "No reply"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2">
          <p className="text-[0.62rem] font-semibold tracking-wide text-emerald-800 uppercase">
            {preview.title} · saved to the chat
          </p>
          {preview.sent.length > 0 ? (
            <p className="mt-1 rounded-md bg-amber-50 px-1.5 py-1 text-[0.64rem] leading-relaxed text-amber-900">
              Sent: {preview.sent.map((entry) => describeScheduleAction(entry)).join(" · ")}
            </p>
          ) : null}
          <p className="mt-1 line-clamp-4 text-[0.68rem] leading-relaxed whitespace-pre-wrap text-emerald-900/80">
            {preview.text}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-[0.72rem] text-destructive">
          {error}
        </p>
      )}

      <p className="mt-2 text-[0.62rem] leading-relaxed text-muted-foreground">
        CloudHike Jobs starts each task on time, using Browserbase when the task needs a page and
        the agent's tools otherwise. History keeps every result.
      </p>

      <ScheduleDialog
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        agentId={agentId}
        schedule={editing}
        widgets={widgets}
        onSaved={(schedule) => {
          setList((current) =>
            current.some((entry) => entry.id === schedule.id)
              ? current.map((entry) => (entry.id === schedule.id ? schedule : entry))
              : [...current, schedule],
          );
          setOpen(false);
          setEditing(null);
          router.refresh();
        }}
      />
    </section>
  );
}

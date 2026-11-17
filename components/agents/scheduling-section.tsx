"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  Clock3,
  History,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Settings2,
  TriangleAlert,
} from "lucide-react";

import { refreshWidgetNowAction, updateWidgetScheduleAction } from "@/app/actions/widgets";
import { ScheduleRuleFields } from "@/components/agents/schedule-rule-fields";
import { SchedulesSection } from "@/components/agents/schedules-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SCHEDULE_TIMEZONES,
  browserTimeZone,
  type AgentScheduleRunSummary,
  type AgentScheduleSummary,
} from "@/lib/agent-schedule-options";
import { describeNextWidgetRefresh } from "@/lib/widget-schedule";
import { describeScheduleRule, nextRunForRule, type ScheduleRule } from "@/lib/schedule-rule";
import { describeScheduleAction } from "@/lib/schedule-action";
import { memoryExcerpt } from "@/lib/memory-types";
import type { WidgetRecord, WidgetRefreshRun } from "@/lib/widget-types";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

type Tab = "widgets" | "regular" | "history";

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
 * The agent's scheduling home: widgets first (they update themselves), then
 * recurring agent tasks, then one combined execution history. Every row can be
 * paused, and each widget's frequency is editable without leaving the panel.
 */
export function SchedulingSection({
  agentId,
  schedules,
  scheduleRuns,
  widgets,
  widgetRuns,
}: {
  agentId: number;
  schedules: AgentScheduleSummary[];
  scheduleRuns: AgentScheduleRunSummary[];
  widgets: WidgetRecord[];
  widgetRuns: WidgetRefreshRun[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("widgets");
  const [widgetList, setWidgetList] = useState(widgets);
  const [editing, setEditing] = useState<WidgetRecord | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = useMemo(() => {
    const tasks = scheduleRuns.map((run) => ({
      id: `task-${run.id}`,
      kind: "Task" as const,
      title: schedules.find((schedule) => schedule.id === run.scheduleId)?.title ?? "Agent task",
      status: run.status,
      at: run.createdAt,
      note: run.reply,
      full: run.result,
      trigger: run.trigger,
      sent: run.sent,
      recalled: run.recalled,
      icon: CalendarClock,
    }));

    const updates = widgetRuns.map((run) => ({
      id: `widget-${run.id}`,
      kind: "Widget" as const,
      title: run.widgetTitle,
      status: run.status,
      at: run.createdAt,
      note: run.note,
      full: run.note,
      trigger: "widget",
      sent: [] as AgentScheduleRunSummary["sent"],
      recalled: [] as AgentScheduleRunSummary["recalled"],
      icon: RefreshCw,
    }));

    return [...tasks, ...updates].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }, [scheduleRuns, schedules, widgetRuns]);

  async function toggleWidget(widget: WidgetRecord, enabled: boolean) {
    if (toggling !== null) return;
    setToggling(widget.id);
    setError(null);

    try {
      const result = await updateWidgetScheduleAction({ id: widget.id, enabled });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWidgetList((current) =>
        current.map((entry) => (entry.id === widget.id ? result.widget : entry)),
      );
      router.refresh();
    } catch (toggleError) {
      console.error("[widgets] schedule toggle failed", toggleError);
      setError("We couldn't change that widget schedule.");
    } finally {
      setToggling(null);
    }
  }

  async function refreshNow(widget: WidgetRecord) {
    if (refreshing !== null) return;
    setRefreshing(widget.id);
    setError(null);

    try {
      const result = await refreshWidgetNowAction({ id: widget.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWidgetList((current) =>
        current.map((entry) => (entry.id === widget.id ? result.widget : entry)),
      );
      router.refresh();
    } finally {
      setRefreshing(null);
    }
  }

  const tabs: { id: Tab; label: string; count: number; icon: typeof LayoutGrid }[] = [
    { id: "widgets", label: "Widget Scheduling", count: widgetList.length, icon: LayoutGrid },
    { id: "regular", label: "Regular Scheduling", count: schedules.length, icon: CalendarClock },
    { id: "history", label: "History", count: history.length, icon: History },
  ];

  return (
    <section className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="grid size-6 place-items-center rounded-md bg-muted text-foreground ring-1 ring-border">
            <CalendarClock className="size-3.5" />
          </span>
          <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Scheduling
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[0.62rem] text-muted-foreground">
          <Clock3 className="size-3" />
          CloudHike Jobs
        </span>
      </div>

      {/* The panel rail is narrow, so this control runs below the shared `sm`
          size: 11px labels, tighter padding, a lower pill and slightly smaller icons. */}
      <div className="mt-3">
        <SegmentedControl
          size="sm"
          fullWidth
          kind="tabs"
          variant="tray"
          className="[--ui-seg-fs:11px]! [--ui-seg-h:23px]! [--ui-seg-px:7px]! [--ui-seg-icon:13px]! [--ui-seg-gap:10px]!"
          value={tab}
          onChange={(val) => setTab(val as Tab)}
          options={[
            {
              value: "widgets",
              label: "Widgets",
              count: widgetList.length,
              icon: <LayoutGrid className="size-3.5" />,
            },
            {
              value: "regular",
              label: "Tasks",
              count: schedules.length,
              icon: <CalendarClock className="size-3.5" />,
            },
            {
              value: "history",
              label: "History",
              count: history.length,
              icon: <History className="size-3.5" />,
            },
          ]}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-destructive/5 px-2 py-1.5 text-[0.68rem] text-destructive">
          {error}
        </p>
      )}

      {tab === "widgets" && (
        <div className="mt-2">
          <p className="px-1 text-[0.66rem] leading-relaxed text-muted-foreground">
            Every widget re-reads what it tracks and replaces only its data. New widgets start
            twice daily at 8 AM and 6 PM in your time zone.
          </p>

          {widgetList.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
              No widgets yet. Ask the agent for a metric and accept its widget offer — the update
              schedule is created with it.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {widgetList.map((widget) => (
                <li
                  key={widget.id}
                  className="rounded-xl border border-border/60 bg-card p-2.5 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink ring-1 ring-brand-border">
                      <LayoutGrid className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.76rem] font-medium">{widget.title}</p>
                      <p className="mt-0.5 text-[0.62rem] leading-relaxed text-muted-foreground">
                        {describeScheduleRule(widget.scheduleRule)}
                      </p>
                      <p
                        suppressHydrationWarning
                        className="text-[0.6rem] text-muted-foreground/80"
                      >
                        {widget.refreshEnabled
                          ? `Next ${describeNextWidgetRefresh(widget.nextRefreshAt, widget.refreshTimezone)}`
                          : "Paused — no automatic updates"}
                      </p>
                      {widget.jobsError ? (
                        <p className="mt-1 flex items-start gap-1 text-[0.6rem] leading-relaxed text-amber-700">
                          <TriangleAlert className="mt-0.5 size-2.5 shrink-0" />
                          {widget.jobsError}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Switch
                        size="sm"
                        checked={widget.refreshEnabled}
                        disabled={toggling !== null}
                        onCheckedChange={(checked) => void toggleWidget(widget, checked)}
                        aria-label={`${widget.refreshEnabled ? "Pause" : "Resume"} updates for ${widget.title}`}
                      />
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => void refreshNow(widget)}
                          disabled={refreshing !== null}
                          title="Update now"
                          aria-label={`Update ${widget.title} now`}
                          className="grid size-6 place-items-center rounded-md text-brand-ink hover:bg-muted disabled:opacity-40"
                        >
                          {refreshing === widget.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(widget)}
                          title="Change update frequency"
                          aria-label={`Change update schedule for ${widget.title}`}
                          className="grid size-6 place-items-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                        >
                          <Settings2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "regular" && (
        <SchedulesSection
          agentId={agentId}
          schedules={schedules}
          runs={scheduleRuns}
          widgets={widgetList}
          embedded
        />
      )}

      {tab === "history" && (
        <div className="mt-2">
          <p className="px-1 text-[0.66rem] leading-relaxed text-muted-foreground">
            Every scheduled task run and widget update, newest first. Results are saved here even
            when the chat transcript is cleared.
          </p>

          {history.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-4 text-center text-[0.7rem] text-muted-foreground">
              No executions yet.
            </p>
          ) : (
            <ul className="mt-2 max-h-[28rem] space-y-1.5 overflow-y-auto pr-0.5">
              {history.map((run) => {
                const Icon = run.icon;
                return (
                  <li
                    key={run.id}
                    className="rounded-xl border border-border/60 bg-card p-2.5 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ring-1",
                          run.status === "ok"
                            ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                            : "bg-rose-50 text-rose-600 ring-rose-100",
                        )}
                      >
                        {run.status === "ok" ? (
                          <Check className="size-3" />
                        ) : (
                          <TriangleAlert className="size-3" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="truncate text-[0.74rem] font-medium">{run.title}</span>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.54rem] font-semibold tracking-wide text-muted-foreground uppercase">
                            {run.kind}
                          </span>
                          {run.kind === "Task" && (
                            <span className="text-[0.56rem] text-muted-foreground">
                              {run.trigger}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[0.6rem] text-muted-foreground">
                          <Icon className="mr-1 inline size-2.5" />
                          {formatMoment(run.at)}
                        </p>
                        {run.sent.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {run.sent.map((entry, index) => (
                              <li
                                key={`${entry.at}-${index}`}
                                className="rounded-md bg-amber-50/70 px-1.5 py-1 text-[0.6rem] leading-relaxed text-amber-900 ring-1 ring-amber-100"
                              >
                                <span className="font-semibold uppercase tracking-wide">
                                  Sent
                                </span>{" "}
                                {describeScheduleAction(entry)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {run.recalled.length > 0 ? (
                          <ul className="mt-1 flex flex-wrap gap-1">
                            {run.recalled.map((note) => (
                              <li
                                key={note.id}
                                title={note.content}
                                className="max-w-full truncate rounded-md bg-brand-soft/60 px-1.5 py-0.5 text-[0.58rem] text-brand-ink ring-1 ring-brand-border/60"
                              >
                                Memory #{note.id}: {memoryExcerpt(note.content, 44)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {run.full ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer list-none text-[0.62rem] font-medium text-brand-ink hover:underline">
                              View result
                            </summary>
                            <p className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-muted/50 px-2 py-1.5 text-[0.64rem] leading-relaxed whitespace-pre-wrap text-foreground/80">
                              {run.full}
                            </p>
                          </details>
                        ) : (
                          <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                            {run.note ?? "No result saved."}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <WidgetScheduleDialog
        key={editing?.id ?? "none"}
        widget={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={(saved) => {
          setWidgetList((current) =>
            current.map((entry) => (entry.id === saved.id ? saved : entry)),
          );
          setEditing(null);
          router.refresh();
        }}
      />
    </section>
  );
}

function WidgetScheduleDialog({
  widget,
  open,
  onOpenChange,
  onSaved,
}: {
  widget: WidgetRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (widget: WidgetRecord) => void;
}) {
  const [rule, setRule] = useState<ScheduleRule | null>(widget?.scheduleRule ?? null);
  const [enabled, setEnabled] = useState(widget?.refreshEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!widget) return null;

  const currentRule = rule ?? widget.scheduleRule;
  const nextAt = enabled ? nextRunForRule(currentRule) : null;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const result = await updateWidgetScheduleAction({
        id: widget!.id,
        rule: currentRule,
        enabled,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.widget);
    } catch (saveError) {
      console.error("[widgets] schedule dialog save failed", saveError);
      setError("We couldn't save that schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="flex items-start gap-3 pr-8">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="font-heading text-base font-semibold">
                Widget update schedule
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[0.76rem] leading-relaxed">
                “{widget.title}” refreshes its data automatically through CloudHike Jobs.
              </DialogDescription>
            </div>
          </div>

          <ScheduleRuleFields
            rule={currentRule}
            onChange={setRule}
            disabled={saving}
          />

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
            <div>
              <p className="text-[0.72rem] font-medium">Automatic updates</p>
              <p className="text-[0.62rem] text-muted-foreground">
                {enabled ? "On — pause it any time." : "Paused — the data stays as it is."}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Automatic widget updates"
            />
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-soft px-3 py-2">
            <p className="text-[0.64rem] font-semibold tracking-wide text-brand-ink uppercase">
              Schedule details
            </p>
            <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
              {describeScheduleRule(currentRule)}
            </p>
            <p className="text-[0.64rem] text-muted-foreground">
              {enabled && nextAt
                ? `Next update ${describeNextWidgetRefresh(nextAt.toISOString(), currentRule.timezone)}`
                : "Saved paused; resume whenever you like."}
            </p>
          </div>

          {widget.jobsError ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[0.66rem] leading-relaxed text-amber-800">
              {widget.jobsError}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-[0.7rem] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2">
          <DialogClose
            render={
              <Button type="button" variant="ghost" size="sm" className="h-7 text-[0.7rem]" />
            }
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-[0.7rem]"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

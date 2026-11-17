"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Pause, Play, Pencil, RefreshCw, Trash2 } from "lucide-react";

import { ScheduleDialog } from "@/components/agents/schedule-dialog";
import { WidgetRuleDialog } from "@/components/jobs/widget-rule-dialog";
import { Switch } from "@/components/ui/switch";
import type { AgentScheduleSummary, ScheduleRule } from "@/lib/agent-schedule-options";
import type { WidgetRecord } from "@/lib/widget-types";
import {
  deleteAgentScheduleAction,
  runAgentScheduleNowAction,
  setAgentScheduleEnabledAction,
} from "@/app/actions/schedules";
import {
  deleteWidgetAction,
  refreshWidgetNowAction,
  updateWidgetScheduleAction,
} from "@/app/actions/widgets";
import { cn } from "@/lib/utils";

type JobRow = {
  id: string;
  title: string;
  owner: string;
  rule: string;
  enabled: boolean;
  next: string;
  lastStatus: "ok" | "error" | null;
  href: string;
  kind: "agent" | "widget";
  dbId: number;
  /** Full rule object, so the widget dialog keeps the time zone and clock. */
  ruleObject?: ScheduleRule;
  /** The agent schedule itself, so Edit opens the same dialog as the agent panel. */
  schedule?: AgentScheduleSummary;
};

type ActionResult = { ok: true } | { ok: false; error: string };

const RUN_LABELS: Record<string, string> = {
  once: "Once",
  interval: "Interval",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function JobCard({ row, onEdit }: { row: JobRow; onEdit: (row: JobRow) => void }) {
  const router = useRouter();
  const isAgent = row.kind === "agent";
  const enabled = row.enabled;

  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = running || toggling || deleting;

  async function handleRun() {
    setRunning(true);
    setError(null);
    const result = isAgent
      ? await runAgentScheduleNowAction({ id: row.dbId })
      : await refreshWidgetNowAction({ id: row.dbId });
    setRunning(false);
    if (result.ok) router.refresh();
    else setError("That run didn't finish. Please try again.");
  }

  async function handleToggle(nextEnabled: boolean) {
    setToggling(true);
    setError(null);
    const result = isAgent
      ? await setAgentScheduleEnabledAction({ id: row.dbId, enabled: nextEnabled })
      : await updateWidgetScheduleAction({ id: row.dbId, enabled: nextEnabled });
    setToggling(false);
    if (result.ok) router.refresh();
    else setError("We couldn't change that schedule. Please try again.");
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${row.title}"? Previous runs stay in chat.`)) return;
    setDeleting(true);
    setError(null);
    const result = isAgent
      ? await deleteAgentScheduleAction({ id: row.dbId })
      : await deleteWidgetAction({ id: row.dbId });
    setDeleting(false);
    if (result.ok) router.refresh();
    else setError("We couldn't delete that schedule. Please try again.");
  }

  return (
    <li className="rounded-xl border border-border/60 bg-muted/40 p-3.5 transition-colors hover:bg-muted/60">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ring-1",
            enabled
              ? "bg-card text-muted-foreground ring-border/60"
              : "bg-rose-50 text-rose-600 ring-rose-100",
          )}
          aria-hidden="true"
        >
          {enabled ? <Play className="size-3" /> : <Pause className="size-3" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.78rem] font-medium">{row.title}</p>
          <p className="mt-1 truncate text-[0.64rem] text-muted-foreground/80">
            {row.owner} · {enabled ? row.next : "Paused"}
            {row.lastStatus === "error" ? " · last run failed" : ""}
          </p>
          <p className="mt-1 text-[0.6rem] text-muted-foreground/80">
            {isAgent ? "" : "Refresh: "}
            {RUN_LABELS[row.rule] ?? row.rule}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => void handleRun()}
            aria-label="Run now"
            title="Run now"
            className="grid size-5 place-items-center rounded-md text-brand-ink hover:bg-muted disabled:opacity-40"
            disabled={busy}
          >
            {running ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
          </button>

          <Switch
            size="sm"
            checked={enabled}
            disabled={busy}
            onCheckedChange={handleToggle}
            aria-label={enabled ? "Pause" : "Resume"}
            className="mt-0.5 shrink-0"
          />

          <button
            type="button"
            onClick={() => onEdit(row)}
            aria-label="Edit"
            title="Edit"
            className="grid size-5 place-items-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3" />
          </button>

          {deleting ? (
            <span className="grid size-5 place-items-center rounded-md text-muted-foreground/50">
              <Loader2 className="size-2.5 animate-spin" />
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleDelete()}
              aria-label="Delete"
              title="Delete"
              className="grid size-5 place-items-center rounded-md text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              disabled={busy}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[0.66rem] text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function JobSection({
  title,
  hint,
  icon,
  rows,
  onEdit,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  rows: JobRow[];
  onEdit: (row: JobRow) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {icon}
            {title}
          </p>
          <p className="mt-1 text-[0.72rem] text-muted-foreground">{hint}</p>
        </div>
        <span className="text-[0.66rem] text-muted-foreground tabular-nums">
          {rows.length} total
        </span>
      </div>

      <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((row) => (
          <JobCard key={row.id} row={row} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}

type ScheduledJobsBoardProps = {
  agentRuns: JobRow[];
  widgetRuns: JobRow[];
  /** This workspace's widgets, for the linked-widget picker in the edit dialog. */
  widgets: WidgetRecord[];
};

/** Renders all scheduled jobs with per-card run / pause / edit / delete actions. */
export function ScheduledJobsBoard({ agentRuns, widgetRuns, widgets }: ScheduledJobsBoardProps) {
  const router = useRouter();
  const [editingAgent, setEditingAgent] = useState<AgentScheduleSummary | null>(null);
  const [editingWidget, setEditingWidget] = useState<JobRow | null>(null);

  return (
    <div className="mt-6 space-y-6">
      <JobSection
        title="Agent jobs"
        hint="Tasks an agent runs on a cadence, with its tools and its approval mode."
        icon={<CalendarClock className="size-3.5" />}
        rows={agentRuns}
        onEdit={(row) => {
          if (row.schedule) setEditingAgent(row.schedule);
        }}
      />
      <JobSection
        title="Widget updates"
        hint="Read-only refreshes that keep a dashboard card's data current."
        icon={<RefreshCw className="size-3.5" />}
        rows={widgetRuns}
        onEdit={(row) => setEditingWidget(row)}
      />

      <ScheduleDialog
        key={editingAgent?.id ?? "jobs-edit"}
        open={editingAgent !== null}
        onOpenChange={(next) => {
          if (!next) setEditingAgent(null);
        }}
        agentId={editingAgent?.agentId ?? 0}
        schedule={editingAgent}
        widgets={widgets}
        onSaved={() => {
          setEditingAgent(null);
          router.refresh();
        }}
      />

      <WidgetRuleDialog
        key={editingWidget?.id ?? "jobs-widget-edit"}
        open={editingWidget !== null}
        onOpenChange={(next) => {
          if (!next) setEditingWidget(null);
        }}
        widget={
          editingWidget?.ruleObject
            ? {
                id: editingWidget.dbId,
                title: editingWidget.title,
                scheduleRule: editingWidget.ruleObject,
              }
            : null
        }
        onSaved={() => {
          setEditingWidget(null);
          router.refresh();
        }}
      />
    </div>
  );
}

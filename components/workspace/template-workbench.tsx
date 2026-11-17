"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  KeyRound,
  LineChart,
  PenLine,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";

import type { ProjectSummary } from "@/lib/project-types";
import { moveTaskAction } from "@/app/actions/tasks";
import { refreshWidgetNowAction } from "@/app/actions/widgets";
import { useComposerIntent } from "@/components/agents/composer-intent";
import { TeamsManager } from "@/components/teams/teams-manager";
import { ProjectWorkbench } from "@/components/workspace/project-workbench";
import type { AgentSummary } from "@/lib/agent-options";
import type { TeamSummary } from "@/lib/team-types";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/task-types";
import {
  getTemplateWorkbench,
  templateAppsLabel,
  type TemplateWorkbenchId,
} from "@/lib/template-workspaces";

/**
 * The template's own pane in the agent workspace.
 *
 * Each dashboard template opens a different reading of the same workspace, and
 * every panel is built from records that actually exist (the board, the
 * schedules, the saved library, the working tree). Nothing here invents a number
 * or a status: an empty panel says what would fill it.
 */

export type WorkbenchData = {
  tasks: {
    id: number;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
  }[];
  schedules: {
    id: number;
    title: string;
    nextRunAt: string | null;
    lastRunAt: string | null;
    enabled: boolean;
    lastStatus: "ok" | "error" | null;
  }[];
  skills: { name: string; description: string }[];
  diagrams: { name: string; description: string }[];
  logins: { host: string; url: string; label: string | null }[];
  widgets: { id: number; title: string; metrics: { label: string; value: string; delta?: string }[] }[];
  /** What this agent filed while researching; the research pane's findings. */
  notes: { id: number; content: string; tags: string[]; createdAt: string }[];
  /** Developer template only: this board's teams and the agents it can staff. */
  agents?: AgentSummary[];
  teams?: TeamSummary[];
};

const TEMPLATE_ICONS: Record<TemplateWorkbenchId, typeof Sparkles> = {
  creator: PenLine,
  daily: Sun,
  business: LineChart,
  developer: Terminal,
  research: BookOpen,
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Backlog",
  doing: "In progress",
  review: "Review",
  done: "Done",
};

const STATUS_TONES: Record<TaskStatus, string> = {
  todo: "border-border bg-muted/50 text-muted-foreground",
  doing: "border-brand-border bg-brand-soft text-brand-ink",
  review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/** Dates are formatted after mount so the server and browser never disagree. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function formatWhen(iso: string | null, mounted: boolean): string {
  if (!iso) return "not scheduled";
  if (!mounted) return "…";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function TemplateWorkbench({
  template,
  data,
  projects = [],
}: {
  template: string;
  data: WorkbenchData;
  /** Attached code projects, for the developer template's picker. */
  projects?: ProjectSummary[];
}) {

  const workbench = getTemplateWorkbench(template);
  const composer = useComposerIntent();
  const mounted = useMounted();
  // Stated in the pane, because it is the scope a run on this board obeys.
  const appsLabel = templateAppsLabel(template) ?? "every connected";
  const [tab, setTab] = useState(workbench?.tabs[0]?.id ?? "files");

  // Each template re-reads its own last tab (or its first one). A tab id the
  // new template does not render can never be restored, so the pane is never
  // left looking empty after a switch.
  useEffect(() => {
    const ids = workbench?.tabs.map((entry) => entry.id) ?? [];
    const fallback = ids[0] ?? "files";
    let stored: string | null = null;

    if (workbench) {
      try {
        stored = window.localStorage.getItem(`alcatraz-workbench-tab:${workbench.id}`);
      } catch {
        // Private mode: the first tab still opens.
      }
    }

    setTab(stored && ids.includes(stored) ? stored : fallback);
  }, [workbench]);

  function chooseTab(next: string) {
    setTab(next);
    if (!workbench) return;
    try {
      window.localStorage.setItem(`alcatraz-workbench-tab:${workbench.id}`, next);
    } catch {
      // Ignore storage failures; the tab still changes for this render.
    }
  }

  if (!workbench) return null;

  const Icon = TEMPLATE_ICONS[workbench.id];

  return (
    // The dock header already names this pane, so the body leads with one line
    // of orientation instead of repeating the title inside its own card.
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex items-start gap-1.5">
        <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 text-[0.62rem] leading-relaxed text-muted-foreground">
          {workbench.blurb}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {workbench.tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => chooseTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
              tab === entry.id
                ? "border-brand-border bg-brand-soft text-brand-ink"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {workbench.prompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={() => composer?.prefill(prompt.prompt)}
            title={prompt.prompt}
            className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.6rem] text-foreground/80 transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-brand-ink"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <div className="min-h-0">
        {workbench.id === "developer" ? (
          tab === "team" ? (
            <div className="max-h-[30rem] overflow-y-auto pr-0.5">
              <TeamsManager teams={data.teams ?? []} agents={data.agents ?? []} />
            </div>
          ) : (
            <ProjectWorkbench tab={tab} projects={projects} onRequestTab={chooseTab} />
          )
        ) : null}

        {workbench.id === "creator" ? (
          tab === "queue" ? (
            <CreatorQueue data={data} mounted={mounted} />
          ) : (
            <LibraryList
              skills={data.skills}
              diagrams={data.diagrams}
              skillsHref="/dashboard/skills"
              diagramsHref="/dashboard/diagrams"
              emptyNote="Save the voice, the pillars and the platform rules as a skill — every run then writes in it."
            />
          )
        ) : null}

        {workbench.id === "daily" ? (
          tab === "today" ? (
            <DailyToday data={data} mounted={mounted} />
          ) : (
            <ScheduleList schedules={data.schedules} mounted={mounted} />
          )
        ) : null}

        {workbench.id === "business" ? (
          tab === "numbers" ? (
            <BusinessNumbers widgets={data.widgets} />
          ) : (
            <ScheduleList schedules={data.schedules} mounted={mounted} />
          )
        ) : null}

        {workbench.id === "research" ? (
          tab === "shelf" ? (
            <ResearchShelf data={data} />
          ) : (
            <ResearchBriefs data={data} mounted={mounted} />
          )
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span
          className="min-w-0 truncate text-[0.56rem] text-muted-foreground"
          title={`A run on this board may only use ${appsLabel} apps`}
        >
          Runs use {appsLabel} apps
        </span>
        <Link
          href="/dashboard/dashboards"
          className="inline-flex shrink-0 items-center gap-1 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
        >
          Template: {workbench.id}
          <ArrowUpRight className="size-2.5" />
        </Link>
      </div>
    </div>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <p className="px-1 py-2 text-[0.66rem] leading-relaxed text-muted-foreground">{children}</p>;
}

function PanelShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
        <p className="min-w-0 truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "doing",
  doing: "review",
  review: "done",
  done: "todo",
};

/**
 * The publishing queue. Each chip is a real write: it advances the card through
 * the board's own columns (the same ordering the kanban uses), then refreshes
 * the page so the card and the board agree.
 */
function CreatorQueue({ data, mounted }: { data: WorkbenchData; mounted: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(data.tasks);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTasks(data.tasks), [data.tasks]);

  const open = tasks.filter((task) => task.status !== "done");

  async function advance(task: WorkbenchData["tasks"][number]) {
    if (busy !== null) return;

    const next = NEXT_STATUS[task.status];
    setBusy(task.id);
    setError(null);

    try {
      const result = await moveTaskAction({ id: task.id, status: next, index: 0 });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTasks((current) =>
        current.map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)),
      );
      router.refresh();
    } catch {
      setError("That card could not be moved. Sign in again and retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.64rem] text-destructive">
          {error}
        </p>
      ) : null}
      <PanelShell title={`Drafts and reviews · ${open.length}`}>
        {open.length === 0 ? (
          <EmptyLine>
            Nothing drafted yet. Ask for a batch above, then send it to the board — every card keeps its
            status here.
          </EmptyLine>
        ) : (
          <ul className="max-h-[15rem] divide-y divide-border/60 overflow-y-auto">
            {open.map((task) => (
              <li key={task.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[0.68rem]" title={task.title}>
                  {task.title}
                </span>
                <button
                  type="button"
                  onClick={() => void advance(task)}
                  disabled={busy !== null}
                  title={`Move to ${STATUS_LABELS[NEXT_STATUS[task.status]]}`}
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-px text-[0.55rem] font-medium transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-brand-ink disabled:opacity-50",
                    STATUS_TONES[task.status],
                  )}
                >
                  {busy === task.id ? "Moving…" : STATUS_LABELS[task.status]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      <Link
        href="/dashboard/tasks"
        className="inline-flex items-center gap-1 px-1 text-[0.6rem] text-muted-foreground transition-colors hover:text-foreground"
      >
        <FolderKanban className="size-2.5" />
        Open the task board
      </Link>

      <PanelShell title={`Publishing runs · ${data.schedules.length}`}>
        {data.schedules.length === 0 ? (
          <EmptyLine>No recurring brief yet. Schedule one from a reply, or from the agent panel.</EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.schedules.slice(0, 5).map((schedule) => (
              <li key={schedule.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[0.66rem]">
                <CalendarClock className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{schedule.title}</span>
                <span className="shrink-0 text-[0.58rem] text-muted-foreground">
                  {schedule.enabled ? formatWhen(schedule.nextRunAt, mounted) : "paused"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    </div>
  );
}

function ScheduleList({
  schedules,
  mounted,
}: {
  schedules: WorkbenchData["schedules"];
  mounted: boolean;
}) {
  if (schedules.length === 0) {
    return <EmptyLine>This agent has no scheduled runs yet. A daily or weekly brief makes one.</EmptyLine>;
  }

  return (
    <PanelShell title={`Runs · ${schedules.length}`}>
      <ul className="divide-y divide-border/60">
        {schedules.map((schedule) => (
          <li key={schedule.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                !schedule.enabled
                  ? "bg-muted-foreground/40"
                  : schedule.lastStatus === "error"
                    ? "bg-rose-500"
                    : schedule.lastStatus === "ok"
                      ? "bg-emerald-500"
                      : "bg-brand-ink/50",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[0.66rem]" title={schedule.title}>
              {schedule.title}
            </span>
            <span className="shrink-0 text-[0.56rem] text-muted-foreground">
              {schedule.enabled ? formatWhen(schedule.nextRunAt, mounted) : "paused"}
            </span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}

function DailyToday({ data, mounted }: { data: WorkbenchData; mounted: boolean }) {
  const router = useRouter();
  const today = todayIso();
  const [completed, setCompleted] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A refresh from the server is the truth; local ticks start fresh from it.
  useEffect(() => setCompleted([]), [data.tasks]);

  const due = data.tasks.filter(
    (task) =>
      task.status !== "done" &&
      !completed.includes(task.id) &&
      task.dueDate !== null &&
      task.dueDate <= today,
  );

  /** The same board move the kanban uses: the card lands in Done. */
  async function complete(task: WorkbenchData["tasks"][number]) {
    if (busy !== null) return;

    setBusy(task.id);
    setError(null);

    try {
      const result = await moveTaskAction({ id: task.id, status: "done", index: 0 });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCompleted((current) => [...current, task.id]);
      router.refresh();
    } catch {
      setError("That card could not be moved. Sign in again and retry.");
    } finally {
      setBusy(null);
    }
  }
  const dueToday = data.schedules.filter(
    (schedule) =>
      schedule.enabled &&
      schedule.nextRunAt !== null &&
      new Date(schedule.nextRunAt).toDateString() === new Date().toDateString(),
  );

  return (
    <div className="space-y-2.5">
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.64rem] text-destructive"
        >
          {error}
        </p>
      ) : null}

      <PanelShell title={`Due now · ${due.length}`}>
        {due.length === 0 ? (
          <EmptyLine>
            Nothing on the board has a date for today. The board keeps dates you set, never ones it guesses.
          </EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60">
            {due.map((task) => (
              <li key={task.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <CheckCircle2 className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[0.68rem]">{task.title}</span>
                <span
                  className={cn(
                    "shrink-0 text-[0.56rem]",
                    task.dueDate !== null && task.dueDate < today
                      ? "text-rose-600 dark:text-rose-300"
                      : "text-muted-foreground",
                  )}
                >
                  {task.dueDate === today ? "Today" : `Overdue · ${task.dueDate}`}
                </span>
                <button
                  type="button"
                  onClick={() => void complete(task)}
                  disabled={busy !== null}
                  title="Move this card to Done"
                  className="shrink-0 rounded-full border border-border px-1.5 py-px text-[0.55rem] font-medium text-muted-foreground transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-brand-ink disabled:opacity-50"
                >
                  {busy === task.id ? "…" : "Done"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      <PanelShell title={`Runs today · ${dueToday.length}`}>
        {dueToday.length === 0 ? (
          <EmptyLine>No scheduled run left today. The Runs tab lists the whole rhythm.</EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60">
            {dueToday.map((schedule) => (
              <li key={schedule.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <CalendarClock className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[0.66rem]">{schedule.title}</span>
                <span className="shrink-0 text-[0.58rem] text-muted-foreground">
                  {formatWhen(schedule.nextRunAt, mounted)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    </div>
  );
}

/**
 * The measured cards, with a real **Update** per card: it calls the same
 * owner-scoped refresh the widget menu uses, then shows the metrics it saved.
 * A failure (no model connection, a model at its limit) is reported as-is.
 */
function BusinessNumbers({ widgets }: { widgets: WorkbenchData["widgets"] }) {
  const router = useRouter();
  const composer = useComposerIntent();
  const [rows, setRows] = useState(widgets);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(widgets), [widgets]);

  const measured = rows.filter((widget) => widget.metrics.length > 0);

  async function update(id: number) {
    if (busy !== null) return;

    setBusy(id);
    setError(null);

    try {
      const result = await refreshWidgetNowAction({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const metrics = result.widget.data.metrics.map((metric) => ({
        label: metric.label,
        value: metric.value,
        delta: metric.delta,
      }));
      setRows((current) =>
        current.map((widget) => (widget.id === id ? { ...widget, metrics } : widget)),
      );
      router.refresh();
    } catch {
      setError("That card could not be updated. Sign in again and retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.64rem] text-destructive">
          {error}
        </p>
      ) : null}

      {measured.length === 0 ? (
        <EmptyLine>
          No measured card on this dashboard yet. The template's setup cards hold steps, not numbers — ask the
          agent for revenue or pipeline and it will build a card once an app returns a real figure.
        </EmptyLine>
      ) : (
        measured.map((widget) => (
          <PanelShell key={widget.id} title={widget.title} action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  composer?.prefill(
                    `Explain the “${widget.title}” card on this dashboard: what each number means, the period it covers and where it came from. Read the connected finance or CRM app before answering — say which source you used and what you could not read.`,
                  )
                }
                className="text-[0.56rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => void update(widget.id)}
                disabled={busy !== null}
                className="text-[0.56rem] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {busy === widget.id ? "Updating…" : "Update"}
              </button>
            </div>
          }>
            <ul className="divide-y divide-border/60">
              {widget.metrics.slice(0, 4).map((metric) => (
                <li
                  key={`${widget.id}-${metric.label}`}
                  className="flex items-baseline gap-2 px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[0.66rem] text-muted-foreground">
                    {metric.label}
                  </span>
                  <span className="shrink-0 text-[0.72rem] font-semibold tabular-nums">{metric.value}</span>
                  {metric.delta ? (
                    <span className="shrink-0 text-[0.56rem] text-muted-foreground">{metric.delta}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </PanelShell>
        ))
      )}

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 px-1 text-[0.6rem] text-muted-foreground hover:text-foreground"
      >
        <FolderKanban className="size-2.5" />
        Open the dashboard for the full cards
      </Link>
    </div>
  );
}

function ResearchShelf({ data }: { data: WorkbenchData }) {
  return (
    <div className="space-y-2.5">
      <LibraryList
        skills={data.skills}
        diagrams={data.diagrams}
        skillsHref="/dashboard/skills"
        diagramsHref="/dashboard/diagrams"
        emptyNote="Save a research method or a source list as a skill, so every run starts from the same rules."
        compact
      />

      <PanelShell title={`Signed-in sites · ${data.logins.length}`}>
        {data.logins.length === 0 ? (
          <EmptyLine>
            No saved sign-in yet. Ask the agent to open a source it cannot read, then sign in through the live
            browser once.
          </EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.logins.slice(0, 6).map((login) => (
              <li key={login.host} className="flex items-center gap-2 px-2.5 py-1.5">
                <KeyRound className="size-3 shrink-0 text-muted-foreground" />
                <a
                  href={login.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[0.66rem] hover:underline"
                >
                  {login.label || login.host}
                </a>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
    </div>
  );
}

/**
 * What the research agent has actually filed, then the runs that keep finding it.
 * A memory note is written by `save_memory` or on the Memory page, so this panel
 * reads stored rows, never a summary of them.
 */
function ResearchBriefs({ data, mounted }: { data: WorkbenchData; mounted: boolean }) {
  const composer = useComposerIntent();

  return (
    <div className="space-y-2.5">
      <PanelShell
        title={`Saved findings · ${data.notes.length}`}
        action={
          <Link
            href="/dashboard/memory"
            className="text-[0.56rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Memory
          </Link>
        }
      >
        {data.notes.length === 0 ? (
          <EmptyLine>
            Nothing filed yet. Ask the agent to save what it learned — a note outlives the conversation and
            comes back on later runs.
          </EmptyLine>
        ) : (
          <ul className="max-h-[16rem] divide-y divide-border/60 overflow-y-auto">
            {data.notes.slice(0, 8).map((note) => (
              <li key={note.id} className="group flex items-start gap-2 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[0.66rem] leading-relaxed">{note.content}</p>
                  {note.tags.length > 0 ? (
                    <p className="mt-0.5 truncate text-[0.55rem] text-muted-foreground">
                      {note.tags.map((tag) => `#${tag}`).join(" ")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    composer?.prefill(
                      `What do I already know about this, and what is still open? Finding #${note.id}: “${note.content}”\n\nUse recall_memory for related notes, give a link for every claim, and mark anything you cannot verify.`,
                    )
                  }
                  className="shrink-0 rounded-full border border-border px-1.5 py-px text-[0.55rem] text-muted-foreground opacity-0 transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-brand-ink focus-visible:opacity-100 group-hover:opacity-100"
                  title="Ask about this finding"
                >
                  Ask
                </button>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      <ScheduleList schedules={data.schedules} mounted={mounted} />
    </div>
  );
}

function LibraryList({
  skills,
  diagrams,
  skillsHref,
  diagramsHref,
  emptyNote,
  compact = false,
}: {
  skills: { name: string; description: string }[];
  diagrams: { name: string; description: string }[];
  skillsHref: string;
  diagramsHref: string;
  emptyNote: string;
  compact?: boolean;
}) {
  if (skills.length === 0 && diagrams.length === 0) return <EmptyLine>{emptyNote}</EmptyLine>;

  return (
    <div className="space-y-2.5">
      {skills.length > 0 ? (
        <PanelShell title={`Skills · ${skills.length}`}>
          <ul className={cn("divide-y divide-border/60", !compact && "max-h-[12rem] overflow-y-auto")}>
            {skills.map((skill) => (
              <li key={skill.name} className="px-2.5 py-1.5">
                <p className="truncate text-[0.66rem] font-medium">{skill.name}</p>
                <p className="line-clamp-1 text-[0.58rem] text-muted-foreground">{skill.description}</p>
              </li>
            ))}
          </ul>
          <Link
            href={skillsHref}
            className="flex items-center gap-1 border-t border-border/60 px-2.5 py-1 text-[0.58rem] text-muted-foreground hover:text-foreground"
          >
            <FileText className="size-2.5" /> Manage skills
          </Link>
        </PanelShell>
      ) : null}

      {diagrams.length > 0 ? (
        <PanelShell title={`Diagrams · ${diagrams.length}`}>
          <ul className="max-h-[10rem] divide-y divide-border/60 overflow-y-auto">
            {diagrams.map((diagram) => (
              <li key={diagram.name} className="px-2.5 py-1.5">
                <p className="truncate text-[0.66rem] font-medium">{diagram.name}</p>
                <p className="line-clamp-1 text-[0.58rem] text-muted-foreground">{diagram.description}</p>
              </li>
            ))}
          </ul>
          <Link
            href={diagramsHref}
            className="flex items-center gap-1 border-t border-border/60 px-2.5 py-1 text-[0.58rem] text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="size-2.5" /> Manage diagrams
          </Link>
        </PanelShell>
      ) : null}
    </div>
  );
}

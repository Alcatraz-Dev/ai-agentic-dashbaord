"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  KeyRound,
  LineChart,
  Loader2,
  PenLine,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";

import { useComposerIntent } from "@/components/agents/composer-intent";
import { ProjectWorkbench } from "@/components/workspace/project-workbench";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@/lib/task-types";
import { getTemplateWorkbench, type TemplateWorkbenchId } from "@/lib/template-workspaces";

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

export function TemplateWorkbench({ template, data }: { template: string; data: WorkbenchData }) {
  const workbench = getTemplateWorkbench(template);
  const composer = useComposerIntent();
  const mounted = useMounted();
  const [tab, setTab] = useState(workbench?.tabs[0]?.id ?? "files");

  if (!workbench) return null;

  const Icon = TEMPLATE_ICONS[workbench.id];
  const isDeveloper = workbench.id === "developer";

  return (
    <div className="flex min-h-0 flex-col gap-2.5 rounded-2xl border border-border bg-card/60 p-2.5">
      <div className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.78rem] font-semibold">{workbench.label}</p>
          <p className="mt-0.5 text-[0.62rem] leading-relaxed text-muted-foreground">
            {workbench.blurb}
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {workbench.tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
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

      {!isDeveloper ? (
        <div className="flex flex-wrap gap-1">
          {workbench.prompts.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={() => composer?.prefill(prompt.prompt)}
              className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.6rem] text-foreground/80 transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-brand-ink"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0">
        {workbench.id === "developer" ? <ProjectWorkbench tab={tab} /> : null}

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
            <ResearchShelf data={data} mounted={mounted} />
          ) : (
            <ScheduleList schedules={data.schedules} mounted={mounted} />
          )
        ) : null}
      </div>

      <Link
        href="/dashboard/dashboards"
        className="inline-flex items-center gap-1 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
      >
        Template: {workbench.id}
        <ArrowUpRight className="size-2.5" />
      </Link>
    </div>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <p className="px-1 py-2 text-[0.66rem] leading-relaxed text-muted-foreground">{children}</p>;
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <p className="border-b border-border/70 px-2.5 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function CreatorQueue({ data, mounted }: { data: WorkbenchData; mounted: boolean }) {
  const open = data.tasks.filter((task) => task.status !== "done");
  const queued = data.schedules.filter((schedule) => schedule.enabled);

  return (
    <div className="space-y-2.5">
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
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-px text-[0.55rem] font-medium",
                    STATUS_TONES[task.status],
                  )}
                >
                  {STATUS_LABELS[task.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>

      <PanelShell title={`Publishing runs · ${queued.length}`}>
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
  const today = todayIso();
  const due = data.tasks.filter(
    (task) => task.status !== "done" && task.dueDate !== null && task.dueDate <= today,
  );
  const dueToday = data.schedules.filter(
    (schedule) =>
      schedule.enabled &&
      schedule.nextRunAt !== null &&
      new Date(schedule.nextRunAt).toDateString() === new Date().toDateString(),
  );

  return (
    <div className="space-y-2.5">
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

function BusinessNumbers({ widgets }: { widgets: WorkbenchData["widgets"] }) {
  const measured = widgets.filter((widget) => widget.metrics.length > 0);

  return (
    <div className="space-y-2.5">
      {measured.length === 0 ? (
        <EmptyLine>
          No measured card on this dashboard yet. The template's setup cards hold steps, not numbers — ask the
          agent for revenue or pipeline and it will build a card once an app returns a real figure.
        </EmptyLine>
      ) : (
        measured.map((widget) => (
          <PanelShell key={widget.id} title={widget.title}>
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

function ResearchShelf({ data, mounted }: { data: WorkbenchData; mounted: boolean }) {
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
                <span className="shrink-0 text-[0.56rem] text-muted-foreground">
                  {formatWhen(login.host ? null : null, mounted)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PanelShell>
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
            <Loader2 className="size-2.5" /> Manage diagrams
          </Link>
        </PanelShell>
      ) : null}
    </div>
  );
}

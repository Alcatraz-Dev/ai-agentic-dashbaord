import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Play } from "lucide-react";

import { listAgentSchedules } from "@/lib/agent-schedules";
import { listAgentsForUser } from "@/lib/agents";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetsForUser } from "@/lib/widgets";
import { EmptyCalendar } from "@/components/aui/illustrations/empty-calendar";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { ScheduledJobsBoard } from "@/components/jobs/scheduled-jobs-board";
import type { AgentScheduleSummary, ScheduleRule } from "@/lib/agent-schedule-options";

export const metadata: Metadata = { title: "Scheduled jobs" };

const RULE_WORD: Record<string, string> = {
  once: "One-off",
  interval: "Interval",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** Relative to now, so the clock doesn't depend on the server's time zone. */
function nextRunLabel(iso: string | null): string {
  if (!iso) return "Not scheduled";

  const diff = Date.parse(iso) - Date.now();
  if (Number.isNaN(diff)) return "Not scheduled";
  if (diff <= 0) return "Due now";

  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;

  return `in ${Math.round(hours / 24)}d`;
}

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
  /** Full agent schedule, so Edit opens the same dialog as the agent panel. */
  schedule?: AgentScheduleSummary;
  /** Full rule object, so widget edits keep the time zone and clock. */
  ruleObject?: ScheduleRule;
};

/**
 * Every piece of recurring work in the workspace, in one read-only list: what
 * agents run on a cadence and which widgets keep themselves fresh. Creation and
 * the full rule editor stay where the work lives (agent panel / widget menu) so
 * there is exactly one place that owns each schedule.
 */
export default async function ScheduledJobsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const agents = await listAgentsForUser(profile.id);
  const widgets = await listWidgetsForUser(profile.id);

  // --- Agent schedules ---
  const agentRuns: JobRow[] = (
    await Promise.all(
      agents.map(async (agent) => {
        const schedules = await listAgentSchedules(profile.id, agent.id);
        return schedules.map((schedule) => ({
          id: `agent-${schedule.id}`,
          title: schedule.title,
          owner: agent.name,
          rule: RULE_WORD[schedule.rule.frequency] ?? "Scheduled",
          enabled: schedule.enabled,
          next: nextRunLabel(schedule.nextRunAt),
          lastStatus: schedule.lastStatus,
          href: `/dashboard/agents/${agent.id}`,
          kind: "agent" as const,
          dbId: schedule.id,
          schedule,
          ruleObject: schedule.rule,
        }));
      }),
    )
  ).flat();

  // --- Widget updates ---
  const widgetRuns: JobRow[] = widgets.map((widget) => ({
    id: `widget-${widget.id}`,
    title: widget.title,
    owner: agents.find((agent) => agent.id === widget.agentId)?.name ?? "Widget",
    rule: RULE_WORD[widget.scheduleRule.frequency] ?? "Scheduled",
    enabled: widget.refreshEnabled,
    next: nextRunLabel(widget.nextRefreshAt),
    lastStatus: widget.lastRefreshStatus as "ok" | "error" | null,
    href: "/dashboard",
    kind: "widget" as const,
    dbId: widget.id,
    ruleObject: widget.scheduleRule,
  }));

  const total = agentRuns.length + widgetRuns.length;
  const active = [...agentRuns, ...widgetRuns].filter((run) => run.enabled).length;

  return (
    <div className="aui-page max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Recurring work</p>
          <h1 className="aui-title mt-2">Scheduled jobs</h1>
          <p className="aui-subtitle mt-2">
            Agent tasks and widget refreshes that run on their own clock. Each one is created and
            edited where its work lives, so this page is the single honest view of what repeats.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <Play className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{active}</span> active ·
          <span className="tabular-nums">{total - active}</span> paused
        </span>
      </div>

      {total === 0 ? (
        <IllustratedEmpty
          className="mt-6 py-10"
          art={<EmptyCalendar />}
          artClassName="w-32"
          title="Nothing scheduled yet"
          text="Ask an agent to run something on a cadence from chat, or open an agent's Scheduling tab to add a job."
          action={
            agents.length > 0 ? (
              <Link
                href={`/dashboard/agents/${agents[0].id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.74rem] font-medium transition-colors hover:bg-muted"
              >
                Open {agents[0].name}
                <ArrowUpRight className="size-3" />
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[0.74rem] font-medium transition-colors hover:bg-muted"
              >
                Create an agent
                <ArrowUpRight className="size-3" />
              </Link>
            )
          }
        />
      ) : (
        <ScheduledJobsBoard agentRuns={agentRuns} widgetRuns={widgetRuns} widgets={widgets} />
      )}

      {total > 0 && (
        <p className="mt-6 text-[0.68rem] leading-relaxed text-muted-foreground">
          Pausing everything for the workspace lives in{" "}
          <Link
            href="/dashboard/settings"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Settings
          </Link>
          . A scheduled agent job can send or post only the one action you confirmed on its form;
          everything else still needs your approval.
        </p>
      )}
    </div>
  );
}
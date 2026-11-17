import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ChartNoAxesCombined,
  Check,
  Globe2,
  Layers3,
  Sparkles,
} from "lucide-react";

import { CreateAgentButton } from "@/components/dashboard/create-agent-dialog";
import { NextBestStep } from "@/components/dashboard/next-best-step";
import { TemplateSuggestionStrip } from "@/components/agents/template-suggestion-strip";
import { WorkspaceTips } from "@/components/dashboard/workspace-tips";
import { WidgetGrid } from "@/components/dashboard/widget-grid";
import { buttonVariants } from "@/components/ui/button";
import { listAgentsForUser } from "@/lib/agents";
import { countSchedulesForUser } from "@/lib/agent-schedules";
import { getAppAccountLabels, getConnectedToolkits } from "@/lib/composio/connections";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetsForUser } from "@/lib/widgets";

export const metadata: Metadata = { title: "Dashboard" };

const starters = [
  {
    icon: ChartNoAxesCombined,
    label: "A metric worth watching",
    prompt: "Track a competitor's pricing page and tell me what changed.",
  },
  {
    icon: Globe2,
    label: "A browser task",
    prompt: "Open our help centre and summarise the five most common questions.",
  },
  {
    icon: CalendarClock,
    label: "A recurring brief",
    prompt: "Every Monday at 9, summarise unread email and flag anything urgent.",
  },
];

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await ensureUserRecord(user);
  const dashboard = await getDashboardForUser(user.id);
  const [widgets, agents, apps, scheduleCount, appAccounts] = await Promise.all([
    listWidgetsForUser(profile.id, dashboard?.id ?? null),
    listAgentsForUser(profile.id),
    getConnectedToolkits(profile.id),
    countSchedulesForUser(profile.id),
    getAppAccountLabels(profile.id),
  ]);

  if (widgets.length === 0) {
    const signals = [
      ["Web + cloud browser", Globe2],
      [
        apps.length > 0
          ? `${apps.length} ${apps.length === 1 ? "app" : "apps"} connected`
          : "Apps ready to connect",
        Layers3,
      ],
      [
        scheduleCount > 0
          ? `${scheduleCount} ${scheduleCount === 1 ? "schedule" : "schedules"} running`
          : "Schedules + approvals",
        Check,
      ],
    ] as const;

    const counters = [
      { label: "Agents", value: agents.length, hint: "Ready to work" },
      { label: "Widgets", value: widgets.length, hint: "Made in chat" },
      { label: "Schedules", value: scheduleCount, hint: "Reusable runs" },
    ];

    return (
      <section className="premium-panel relative flex flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="premium-grid pointer-events-none absolute inset-0 opacity-45 [mask-image:radial-gradient(80%_70%_at_28%_22%,black,transparent)]" />
        <div className="pointer-events-none absolute -top-40 -left-28 size-[22rem] rounded-full bg-brand-soft blur-3xl" />

        {/* Hero: one statement, two actions, the three things the workspace can already do. */}
        <div className="relative px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6 lg:px-10 lg:pt-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0 lg:max-w-[40rem]">
              <span className="aui-chip text-[0.6rem] font-semibold tracking-[0.1em] uppercase">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Workspace ready
              </span>

              <h1 className="mt-4 text-[1.85rem] leading-[1.06] font-semibold tracking-[-0.045em] text-balance sm:text-[2.15rem] xl:text-[2.45rem]">
                Your command centre starts with one agent.
              </h1>
              <p className="mt-3 max-w-2xl text-[0.85rem] leading-6 text-muted-foreground sm:text-[0.88rem] sm:leading-7">
                Give an agent a model and a real task. It can search, browse, use your connected
                apps and report back. Widgets appear here as it finds something worth keeping.
              </p>

              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.7rem] text-muted-foreground">
                {signals.map(([label, Icon]) => (
                  <li key={label} className="inline-flex items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0 text-brand-ink" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5 lg:shrink-0 lg:pb-1">
              <CreateAgentButton
                id="dashboard-create-agent"
                className="h-10 w-full justify-center gap-2 rounded-xl bg-foreground px-4 text-[0.82rem] font-semibold text-background shadow-sm hover:bg-foreground/90 sm:w-auto"
              />
              <Link
                href="/dashboard/apps"
                className={buttonVariants({
                  variant: "outline",
                  className:
                    "h-10 w-full justify-center gap-1.5 rounded-xl border-border bg-card px-4 text-[0.82rem] font-semibold text-foreground shadow-sm hover:bg-muted sm:w-auto",
                })}
              >
                Connect an app
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Three equal cards: what to do next, prompts to copy, what the workspace holds. */}
        <div className="relative border-t border-border/70 px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NextBestStep hasAgent={agents.length > 0} />

            <div
              id="starter-prompts"
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.82rem] font-semibold tracking-tight">A good first run</p>
                  <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground">
                    Copy a prompt into a new agent.
                  </p>
                </div>
              </div>

              <ul className="flex-1 divide-y divide-border/70 border-t border-border/70">
                {starters.map(({ icon: Icon, label, prompt }, index) => (
                  <li
                    key={label}
                    className="flex gap-2.5 px-3.5 py-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border bg-background font-mono text-[0.58rem] font-medium text-muted-foreground tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold">
                        <Icon className="size-3 shrink-0 text-brand-ink" />
                        {label}
                      </p>
                      <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
                        &ldquo;{prompt}&rdquo;
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:col-span-2 xl:col-span-1">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                  <Layers3 className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.82rem] font-semibold tracking-tight">Workspace</p>
                  <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground">
                    What exists right now.
                  </p>
                </div>
              </div>

              <ul className="flex-1 divide-y divide-border/70 border-t border-border/70">
                {counters.map((counter) => (
                  <li
                    key={counter.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-[0.72rem] font-medium">{counter.label}</span>
                      <span className="block truncate text-[0.6rem] text-muted-foreground">
                        {counter.hint}
                      </span>
                    </span>
                    <span className="text-lg font-semibold tracking-tight tabular-nums">
                      {counter.value}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href="/dashboard/settings"
                className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-2.5 text-[0.68rem] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                Workspace settings
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Setup checklist: real completion state, driven by the same data above. */}
        <div className="relative border-t border-border/70 px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
          <WorkspaceTips
            hasAgent={agents.length > 0}
            connectedApps={apps.length}
            scheduleCount={scheduleCount}
          />
        </div>

        {/* The same template picks the chat offers, for a board with no cards. */}
        <div className="relative border-t border-border/70 px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
          <TemplateSuggestionStrip />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Dashboard</p>
          <h1 className="aui-title mt-2 text-xl">Your live widgets</h1>
          <p className="aui-subtitle mt-2">
            {widgets.length} {widgets.length === 1 ? "widget" : "widgets"} · ask an agent to add
            another, or open one to edit it in chat.
          </p>
        </div>
        <span className="aui-chip text-[0.66rem] font-medium">
          <Sparkles className="size-3 text-brand-ink" />
          Built with your agents
        </span>
      </header>

      <WidgetGrid
        initialWidgets={widgets}
        background={dashboard?.appearance ?? null}
        connectedApps={apps}
        appAccounts={appAccounts}
      />
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { ArrowUpRight, CalendarClock, Check, Plug, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The getting-started checklist on an empty dashboard. Completion comes from
 * real workspace state (an agent exists, an app is connected, a schedule
 * runs), so the progress row never fakes anything and survives a reload.
 */
export function WorkspaceTips({
  hasAgent,
  connectedApps,
  scheduleCount,
}: {
  hasAgent: boolean;
  connectedApps: number;
  scheduleCount: number;
}) {
  const router = useRouter();

  const tips = [
    {
      id: "agent",
      icon: Sparkles,
      title: "Create an agent",
      description: "Give an agent a model, then hand it a real task from the chat.",
      action: "Create",
      run: () => document.getElementById("dashboard-create-agent")?.click(),
      done: hasAgent,
    },
    {
      id: "app",
      icon: Plug,
      title: "Connect an app",
      description: "Give the workspace access to Gmail, Slack, Notion or another tool.",
      action: connectedApps > 0 ? "Manage apps" : "Browse apps",
      run: () => router.push("/dashboard/apps"),
      done: connectedApps > 0,
    },
    {
      id: "schedule",
      icon: CalendarClock,
      title: "Plan a recurring run",
      description: "Turn a useful prompt into a scheduled brief once it produces good work.",
      action: scheduleCount > 0 ? "Review runs" : "Open settings",
      run: () => router.push("/dashboard/settings"),
      done: scheduleCount > 0,
    },
  ];

  const doneCount = tips.filter((tip) => tip.done).length;
  const percent = Math.round((doneCount / tips.length) * 100);

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="aui-eyebrow">Setup</p>
          <p className="mt-1.5 text-[0.92rem] font-semibold tracking-tight">Ways to get moving</p>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            Three steps to a dashboard that keeps itself up to date.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:pb-0.5">
          <div
            className="h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-muted sm:w-32"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={tips.length}
            aria-valuenow={doneCount}
            aria-label="Setup progress"
          >
            <div
              className="brand-gradient h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[0.68rem] font-semibold tabular-nums">
            {doneCount}/{tips.length}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-3">
        {tips.map(({ id, icon: Icon, title, description, action, run, done }, index) => (
          <div
            key={id}
            className={cn(
              "flex min-w-0 flex-col rounded-xl border p-3 transition-colors sm:p-3.5",
              done
                ? "border-border/70 bg-muted/30"
                : "border-border bg-card hover:border-brand-border/70",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg border",
                  done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "border-brand-border bg-brand-soft text-brand-ink",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={2.6} /> : <Icon className="size-4" />}
              </span>
              <span className="font-mono text-[0.6rem] text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>

            <p className="mt-2.5 text-[0.78rem] leading-tight font-semibold">{title}</p>
            <p className="mt-1 flex-1 text-[0.68rem] leading-relaxed text-muted-foreground">
              {description}
            </p>

            {done ? (
              <span className="mt-3 inline-flex items-center gap-1 text-[0.64rem] font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="size-3" strokeWidth={3} />
                Done
              </span>
            ) : (
              <button
                type="button"
                onClick={run}
                className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[0.68rem] font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-auto sm:self-start"
              >
                {action}
                <ArrowUpRight className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

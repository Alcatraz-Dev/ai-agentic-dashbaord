"use client";

import { useRouter } from "next/navigation";

import { ArrowRight, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  reason: string;
};

/**
 * The empty dashboard is a decision point, not a dead end. The first option is
 * always the shortest path to a useful first run; choosing one either opens the
 * existing Create AI agent dialog or moves to the relevant workspace surface.
 */
export function NextBestStep({ hasAgent }: { hasAgent: boolean }) {
  const router = useRouter();

  const options: Step[] = hasAgent
    ? [
        {
          id: "give-task",
          label: "Give the agent a task",
          reason:
            "Your workspace has an agent. Pick one of the starter prompts below and run a real task.",
        },
        {
          id: "connect-app",
          label: "Connect an app",
          reason:
            "An app gives the agent something concrete to read from or act on beyond the open web.",
        },
        {
          id: "schedules",
          label: "Review schedules",
          reason:
            "Turn a useful prompt into a recurring brief once you know it produces good work.",
        },
      ]
    : [
        {
          id: "create-agent",
          label: "Create your first agent",
          reason:
            "An agent with a model is the shortest route to a live run, a trace and your first saved widget.",
        },
        {
          id: "connect-app",
          label: "Connect an app first",
          reason:
            "Connect Gmail, Slack, Notion or another tool now so the first agent starts with useful access.",
        },
        {
          id: "browse-apps",
          label: "Browse available apps",
          reason:
            "See what the workspace can reach before deciding which tools the first agent should use.",
        },
      ];

  function accept(option: Step) {
    if (option.id === "create-agent") {
      document.getElementById("dashboard-create-agent")?.click();
      return;
    }
    if (option.id === "give-task") {
      document.getElementById("starter-prompts")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    if (option.id === "schedules") {
      router.push("/dashboard/settings");
      return;
    }
    router.push("/dashboard/apps");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.82rem] font-semibold tracking-tight">Next best step</p>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground">
            Pick one — it opens the right surface.
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border/70 border-t border-border/70">
        {options.map((option, index) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => accept(option)}
              className={cn(
                "group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                index === 0 && "bg-brand-soft/25",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[0.6rem] font-semibold tabular-nums",
                  index === 0
                    ? "border-brand-border bg-brand-soft text-brand-ink"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "text-[0.76rem] leading-tight font-semibold",
                      index === 0 && "text-brand-ink",
                    )}
                  >
                    {option.label}
                  </span>
                  {index === 0 ? (
                    <span className="rounded-full border border-brand-border bg-brand-soft px-1.5 py-0.5 text-[0.53rem] font-semibold tracking-[0.08em] text-brand-ink uppercase">
                      Best
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[0.68rem] leading-relaxed text-muted-foreground">
                  {option.reason}
                </span>
              </span>

              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-ink" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, ListTodo, Play, Users } from "lucide-react";

import { formatTokenTotal } from "@/lib/task-types";
import type { WorkspaceTaskActivity } from "@/lib/tasks";

const KIND_LOOK = {
  role: { icon: Users, label: "Role" },
  step: { icon: ListTodo, label: "Step" },
  card: { icon: ArrowRight, label: "Card" },
  run: { icon: Play, label: "Run" },
} as const;

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Board-wide history, newest first: role changes, step ticks, column moves and
 * the newest runs of every card in one list, with a run's cost and status.
 */
export function TaskActivityFeed({ entries }: { entries: WorkspaceTaskActivity[] }) {
  const runCount = entries.filter((entry) => entry.kind === "run").length;

  return (
    <section className="premium-panel mt-4 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div>
          <p className="aui-eyebrow">Task activity</p>
          <h2 className="mt-1 text-[0.95rem] font-semibold">What moved on the board</h2>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Role changes, step ticks, column moves and the newest runs across every card. Each card
            keeps its own timeline with its full run history.
          </p>
        </div>
        <span className="aui-chip text-[0.66rem]">
          <span className="font-semibold text-foreground tabular-nums">{entries.length}</span>{" "}
          shown
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <ListTodo className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-[0.78rem] font-medium">Nothing has happened yet</p>
          <p className="mx-auto mt-0.5 max-w-sm text-[0.7rem] leading-relaxed text-muted-foreground">
            Assign a role, tick a step, move a card or run one and it appears here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const look = KIND_LOOK[entry.kind];
            const Icon = look.icon;
            const isRun = entry.kind === "run";

            return (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  {isRun ? (
                    <>
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.76rem]">
                        <span
                          className={`size-1.5 rounded-full ${
                            entry.status === "error" ? "bg-rose-500" : "bg-emerald-500"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="font-medium">{entry.roleLabel} run</span>
                        <span className="text-[0.68rem] text-muted-foreground">
                          {entry.agentName ?? "no agent"} ·{" "}
                          {entry.trigger === "schedule" ? "schedule" : "run now"}
                        </span>
                        {entry.tokens !== null && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.58rem] font-medium text-muted-foreground tabular-nums">
                            {formatTokenTotal(entry.tokens)} tok
                          </span>
                        )}
                      </p>
                      {entry.reply && (
                        <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                          {entry.reply}
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                        {entry.taskTitle} · {when(entry.at)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-[0.76rem] font-medium">{entry.detail}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                        {entry.taskTitle} · {when(entry.at)}
                      </p>
                    </>
                  )}
                </div>

                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-semibold text-muted-foreground">
                  {look.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-5 py-2.5">
        <span className="text-[0.66rem] text-muted-foreground tabular-nums">
          {runCount} {runCount === 1 ? "run" : "runs"} in this list
        </span>
        <Link
          href="/dashboard/tasks"
          className="text-[0.68rem] font-medium text-brand-ink hover:underline"
        >
          Open the task board
        </Link>
      </div>
    </section>
  );
}

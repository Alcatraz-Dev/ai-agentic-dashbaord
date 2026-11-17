"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, ListTodo, Loader2, Play, Users } from "lucide-react";

import { taskRunReplyAction, taskRunsAction } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { memoryExcerpt } from "@/lib/memory-types";
import {
  formatTokenTotal,
  runTokenTotal,
  type TaskActivityEntry,
  type TaskRunRecord,
  type TaskRunSummary,
  type TaskSummary,
} from "@/lib/task-types";
import { cn } from "@/lib/utils";

/**
 * One card's timeline: the role and step changes the server recorded, merged
 * with every run, newest first. A run's reply is loaded only when the owner
 * opens it, so a long history never bloats the board payload.
 */

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND_ICON = {
  role: Users,
  step: ListTodo,
  card: ArrowRight,
  run: Play,
} as const;

function RunRow({
  run,
  reply,
  loading,
  onToggle,
}: {
  run: TaskRunSummary;
  reply: string | undefined;
  loading: boolean;
  onToggle: () => void;
}) {
  const tokens = runTokenTotal(run);
  const open = reply !== undefined;

  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5 ring-1 ring-border/50">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            run.status === "error" ? "bg-rose-500" : "bg-emerald-500",
          )}
          aria-hidden="true"
        />
        <span className="text-[0.66rem] font-semibold">{run.roleLabel}</span>
        <span className="text-[0.62rem] text-muted-foreground">
          {run.agent?.name ?? "no agent"} · {run.trigger === "schedule" ? "schedule" : "run now"}
        </span>
        {tokens !== null && (
          <span className="rounded-full bg-card px-1.5 py-0.5 text-[0.58rem] font-medium text-muted-foreground ring-1 ring-border tabular-nums">
            {formatTokenTotal(tokens)} tok
          </span>
        )}
        <span className="ml-auto text-[0.6rem] text-muted-foreground tabular-nums">
          {timeLabel(run.createdAt)}
        </span>
      </div>

      {run.reply && (
        <p
          className={cn(
            "mt-0.5 text-[0.64rem] leading-relaxed whitespace-pre-line text-muted-foreground",
            !open && "line-clamp-2",
          )}
        >
          {open ? reply : run.reply}
        </p>
      )}

      {run.recalled.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {run.recalled.map((note) => (
            <li
              key={note.id}
              title={note.content}
              className="max-w-full truncate rounded-md bg-brand-soft/60 px-1.5 py-0.5 text-[0.58rem] text-brand-ink ring-1 ring-brand-border/60"
            >
              Memory #{note.id}: {memoryExcerpt(note.content, 40)}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mt-1 inline-flex items-center gap-1 text-[0.6rem] font-medium text-brand-ink underline-offset-4 hover:underline"
      >
        {loading ? <Loader2 className="size-2.5 animate-spin" /> : null}
        {open ? "Hide full reply" : "Show full reply"}
      </button>
    </div>
  );
}

export function TaskActivity({ task }: { task: TaskSummary }) {
  const [history, setHistory] = useState<TaskRunRecord[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [loadingReply, setLoadingReply] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoadingHistory(true);
    setError(null);

    const result = await taskRunsAction({ id: task.id });
    setLoadingHistory(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setHistory(result.runs);
  }

  async function toggleReply(runId: number) {
    if (replies[runId] !== undefined) {
      setReplies((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
      return;
    }

    setLoadingReply(runId);
    setError(null);
    const result = await taskRunReplyAction({ runId });
    setLoadingReply(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setReplies((current) => ({ ...current, [runId]: result.result }));
  }

  const entries: TaskActivityEntry[] = history
    ? [
        ...task.activity.filter((entry) => entry.kind !== "run"),
        ...history.map(
          (run): TaskActivityEntry => ({
            kind: "run",
            id: `run:${run.id}`,
            at: run.createdAt,
            run,
          }),
        ),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    : task.activity;

  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Activity
        </span>
        <span className="text-[0.62rem] text-muted-foreground tabular-nums">
          {task.runCount} {task.runCount === 1 ? "run" : "runs"}
        </span>
      </div>
      <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
        Role moves, step changes and every run of this card, newest first.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[0.64rem] font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="mt-2 space-y-1">
        {entries.length === 0 && (
          <p className="rounded-lg border border-dashed border-border/80 px-2 py-2 text-center text-[0.64rem] text-muted-foreground">
            Nothing yet — assign a role, tick a step, or use Run now.
          </p>
        )}

        {entries.map((entry) => {
          if (entry.kind === "run") {
            return (
              <RunRow
                key={entry.id}
                run={entry.run}
                reply={replies[entry.run.id]}
                loading={loadingReply === entry.run.id}
                onToggle={() => void toggleReply(entry.run.id)}
              />
            );
          }

          const Icon = KIND_ICON[entry.kind];
          return (
            <div key={entry.id} className="flex items-center gap-1.5 px-0.5 py-0.5">
              <span className="grid size-4 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-2.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.64rem] text-foreground">
                {entry.detail}
              </span>
              <span className="shrink-0 text-[0.58rem] text-muted-foreground tabular-nums">
                {timeLabel(entry.at)}
              </span>
            </div>
          );
        })}
      </div>

      {task.runCount > 3 && history === null && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void loadHistory()}
          disabled={loadingHistory}
          className="mt-2 h-7 w-full gap-1.5 text-[0.68rem]"
        >
          {loadingHistory ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          Load all {task.runCount} runs
        </Button>
      )}

      {history !== null && (
        <p className="mt-2 text-[0.6rem] text-muted-foreground">
          Showing all {history.length} stored {history.length === 1 ? "run" : "runs"}.
        </p>
      )}
    </div>
  );
}

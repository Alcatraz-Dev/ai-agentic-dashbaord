"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Download, Loader2, Play, Search } from "lucide-react";

import { runAgentScheduleNowAction } from "@/app/actions/schedules";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { EmptyCalendar } from "@/components/aui/illustrations/empty-calendar";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentScheduleRunWithContext } from "@/lib/agent-schedule-options";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

function formatMoment(iso: string): string {
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
 * Every schedule run in the workspace, newest first, filtered as you type.
 * Opens a run in full; pages in 15s rather than loading more from the server.
 */
function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** YYYY-MM-DD → local midnight, for the date picker. */
function parseDay(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function RecentRuns({
  runs,
  initialAgentId = "all",
  initialDate = "",
}: {
  runs: AgentScheduleRunWithContext[];
  /** Deep link from the schedule calendar. */
  initialAgentId?: number | "all";
  /** YYYY-MM-DD in the viewer's local time. */
  initialDate?: string;
}) {
  const [query, setQuery] = useState("");
  const [agent, setAgent] = useState(String(initialAgentId));
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState(initialDate);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<AgentScheduleRunWithContext | null>(null);

  const agents = useMemo(() => {
    const byId = new Map<number, string>();
    for (const run of runs) byId.set(run.agentId, run.agentName);
    return [...byId.entries()]
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [runs]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return runs.filter((run) => {
      if (agent !== "all" && String(run.agentId) !== agent) return false;
      if (status !== "all" && run.status !== status) return false;
      if (date && localDay(run.createdAt) !== date) return false;
      if (!needle) return true;

      return [run.agentName, run.scheduleTitle, run.reply ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [runs, query, agent, status, date]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, agent, status, date]);

  const visible = matching.slice(0, limit);
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.ceil(limit / PAGE_SIZE)));

  function goToPage(next: number) {
    setLimit(Math.min(pageCount, Math.max(1, next)) * PAGE_SIZE);
  }

  return (
    <section className="premium-panel mt-6 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
        <div>
          <h2 className="text-[0.9rem] font-semibold">Recent schedule runs</h2>
          <p className="mt-0.5 text-[0.72rem] text-muted-foreground">
            {runs.length === 0
              ? "Nothing has run yet."
              : `${runs.length} runs across your agents, newest first.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <TextField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents, schedules, replies"
            aria-label="Search runs"
            prefix={<Search className="size-3.5" />}
            size="sm"
            clearable
            className="w-56 max-w-full"
          />

          <Select
            options={[
              { value: "all", label: "All agents" },
              ...agents.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
            value={agent}
            onChange={(value) => setAgent(value)}
            aria-label="Filter by agent"
            size="sm"
            className="max-w-32"
          />

          <SegmentedControl
            options={[
              { value: "all", label: "Any status" },
              { value: "ok", label: "Succeeded" },
              { value: "error", label: "Failed" },
            ]}
            value={status}
            onChange={setStatus}
            size="sm"
            variant="tray"
            aria-label="Filter by status"
          />

          <div className="flex items-center gap-1">
            <DatePicker
              value={parseDay(date)}
              onChange={(next) => setDate(localDay(next.toISOString()))}
              placeholder="Any day"
              aria-label="Filter by day"
              size="sm"
              className="w-[8.5rem]"
            />
            {date && (
              <button
                type="button"
                onClick={() => setDate("")}
                className="text-[0.68rem] text-muted-foreground underline hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>

          <a
            href="/api/exports/schedule-runs"
            download
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[0.74rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Download className="size-3.5" />
            CSV
          </a>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-5 py-4">
          <IllustratedEmpty
            art={<EmptyCalendar />}
            artClassName="w-28"
            className="border-0 bg-transparent px-0 py-1"
            title={runs.length === 0 ? "No runs yet" : "No runs match"}
            text={
              runs.length === 0
                ? "Run a schedule from an agent's panel and it will appear here."
                : "Clear a filter or search for another agent."
            }
          />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {visible.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => setSelected(run)}
                  className="flex w-full items-start gap-3 px-5 py-2.5 text-left transition hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      run.status === "ok" ? "bg-emerald-500" : "bg-rose-500",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[0.78rem]">
                      <span className="font-medium">{run.scheduleTitle}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{run.agentName}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                      {run.reply ?? "No reply"}
                    </p>
                  </div>
                  <span
                    suppressHydrationWarning
                    className="shrink-0 text-[0.66rem] text-muted-foreground tabular-nums"
                  >
                    {formatMoment(run.createdAt)}
                  </span>
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-2.5">
            <p className="text-[0.68rem] text-muted-foreground tabular-nums">
              Showing {visible.length} of {matching.length}
            </p>
            {pageCount > 1 && (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        goToPage(page - 1);
                      }}
                      aria-disabled={page === 1}
                      className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink
                      href="#"
                      isActive
                      onClick={(event) => {
                        event.preventDefault();
                        goToPage(page);
                      }}
                      className="text-[0.72rem]"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        goToPage(page + 1);
                      }}
                      aria-disabled={page === pageCount}
                      className={page === pageCount ? "pointer-events-none opacity-50" : undefined}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </>
      )}

      <RunDialog run={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function RunDialog({
  run,
  onClose,
}: {
  run: AgentScheduleRunWithContext | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function runNow() {
    if (!run || running) return;

    setRunning(true);
    setResult(null);

    try {
      const outcome = await runAgentScheduleNowAction({ id: run.scheduleId });
      setResult(
        outcome.ok
          ? { ok: true, text: outcome.reply }
          : { ok: false, text: outcome.error },
      );
      if (outcome.ok) router.refresh();
    } catch {
      setResult({ ok: false, text: "That run didn't finish. Please try again." });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={run !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {run && (
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <div className="shrink-0 border-b border-border/60 px-5 py-4 pr-10">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.62rem] font-medium",
                    run.status === "ok"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700",
                  )}
                >
                  {run.status === "ok" ? "ok" : "failed"}
                </span>
                <span
                  suppressHydrationWarning
                  className="text-[0.68rem] text-muted-foreground tabular-nums"
                >
                  {formatMoment(run.createdAt)}
                </span>
              </div>
              <DialogTitle className="mt-1.5 font-heading text-base font-semibold">
                {run.scheduleTitle}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[0.76rem] text-muted-foreground">
                <Link href={`/dashboard/agents/${run.agentId}`} className="text-brand-ink hover:underline">
                  {run.agentName}
                </Link>{" "}
                · scheduled run
              </DialogDescription>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <p className="text-[0.8rem] leading-relaxed whitespace-pre-wrap">
                {run.reply ?? "This run produced no reply."}
              </p>

              {result && (
                <div
                  className={cn(
                    "mt-3 rounded-lg border px-3 py-2 text-[0.74rem] leading-relaxed whitespace-pre-wrap",
                    result.ok
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                      : "border-rose-200 bg-rose-50/70 text-rose-900",
                  )}
                >
                  <p className="mb-0.5 text-[0.62rem] font-semibold tracking-[0.08em] uppercase">
                    {result.ok ? "New reply" : "Run failed"}
                  </p>
                  {result.text}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={runNow}
                disabled={running}
                className="rounded-xl"
              >
                {running ? <Spinner className="size-3.5" /> : <Play className="size-3.5" />}
                {running ? "Running…" : "Run schedule now"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

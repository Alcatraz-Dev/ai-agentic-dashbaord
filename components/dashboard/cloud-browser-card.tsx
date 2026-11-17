"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Loader2, RotateCcw } from "lucide-react";

import { resetBrowserProfileAction } from "@/app/actions/agents";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  shortBrowserSessionId,
  type BrowserSessionWithAgent,
  type BrowserUsageSummary,
} from "@/lib/browser-session-types";
import { cn } from "@/lib/utils";

function formatMoment(iso: string | null): string {
  if (!iso) return "—";
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
 * Workspace view of the cloud browser: how much each agent has used it, the
 * recent sessions with replay links, and one control to drop the shared
 * profile (logins included) every agent browses with.
 */
export function CloudBrowserCard({
  usage,
  sessions,
  profileActive,
}: {
  usage: BrowserUsageSummary[];
  sessions: BrowserSessionWithAgent[];
  /** Whether this workspace already has a saved Browserbase profile. */
  profileActive: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(profileActive);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** "all" or an agent id, filtered in the browser. */
  const [agent, setAgent] = useState("all");

  const agents = useMemo(() => {
    const byId = new Map<number, string>();
    for (const row of usage) byId.set(row.agentId, row.agentName);
    for (const session of sessions) byId.set(session.agentId, session.agentName);
    return [...byId.entries()]
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [usage, sessions]);

  const visibleUsage = agent === "all" ? usage : usage.filter((row) => String(row.agentId) === agent);
  const visibleSessions =
    agent === "all" ? sessions : sessions.filter((session) => String(session.agentId) === agent);

  const totalActions = visibleUsage.reduce((total, row) => total + row.actions, 0);
  const totalSessions = visibleUsage.reduce((total, row) => total + row.sessions, 0);
  const busiest = Math.max(1, ...visibleUsage.map((row) => row.actions));

  async function reset() {
    if (resetting) return;

    setResetting(true);
    setError(null);

    try {
      const result = await resetBrowserProfileAction();

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setActive(false);
      setConfirming(false);
      setNotice(
        result.hadProfile
          ? "Browser profile cleared. The next browser task starts signed out."
          : "There was no saved browser profile to clear.",
      );
      router.refresh();
    } catch (resetError) {
      console.error("[agents] browser profile reset request failed", resetError);
      setError("We couldn't reset the browser profile. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="premium-panel mt-6 rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[0.9rem] font-semibold">Cloud browser</h2>
          <p className="mt-0.5 max-w-md text-[0.72rem] leading-relaxed text-muted-foreground">
            One saved browser profile is shared by every agent, so a site an agent signed into stays
            signed in. Sessions start only when a task needs one and are released when the reply is
            ready.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] font-medium",
              active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                active ? "bg-emerald-500" : "bg-muted-foreground/50",
              )}
            />
            {active ? "Profile saved" : "No profile yet"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNotice(null);
              setError(null);
              setConfirming(true);
            }}
            disabled={!active || resetting}
            className="h-8 gap-1.5 rounded-lg text-[0.74rem]"
          >
            {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            Reset profile
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[0.74rem] text-rose-700">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[0.74rem] text-emerald-800">
          {notice}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          options={[
            { value: "all", label: "All agents" },
            ...agents.map((entry) => ({ value: entry.id, label: entry.name })),
          ]}
          value={agent}
          onChange={(value) => setAgent(value)}
          aria-label="Filter by agent"
          size="sm"
          className="max-w-40"
        />

        <a
          href="/api/exports/browser-sessions"
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[0.74rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Download className="size-3.5" />
          CSV
        </a>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Actions per agent
            </h3>
            <span className="text-[0.62rem] text-muted-foreground tabular-nums">
              {totalActions} in {totalSessions} {totalSessions === 1 ? "session" : "sessions"}
            </span>
          </div>

          {visibleUsage.length === 0 ? (
            <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
              {usage.length === 0
                ? "No browser work yet. Turn on a browser tool for an agent and ask it to open a page."
                : "This agent hasn't used the cloud browser yet."}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {visibleUsage.map((row) => (
                <li key={row.agentId}>
                  <Link
                    href={`/dashboard/agents/${row.agentId}`}
                    className="flex items-center gap-2 text-[0.74rem] hover:text-brand-ink"
                  >
                    <AgentAvatar
                      avatar={row.agentAvatar}
                      color={row.agentColor}
                      className="size-5 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{row.agentName}</span>
                    <span className="shrink-0 text-[0.68rem] text-muted-foreground tabular-nums">
                      {row.actions} {row.actions === 1 ? "action" : "actions"}
                    </span>
                  </Link>
                  <div className="mt-1 ml-7 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${Math.max(4, Math.round((row.actions / busiest) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Recent sessions
            </h3>
            {visibleSessions.length > 0 && (
              <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                newest {visibleSessions.length}
              </span>
            )}
          </div>

          {visibleSessions.length === 0 ? (
            <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">
              Sessions appear here once an agent has used the cloud browser. Each row links to its
              replay.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {visibleSessions.map((session) => (
                <li key={session.id}>
                  <a
                    href={session.replayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open this session in Browserbase"
                    className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <AgentAvatar
                      avatar={session.agentAvatar}
                      color={session.agentColor}
                      className="size-5 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[0.72rem] font-medium">
                          {session.agentName}
                        </span>
                        <span className="truncate font-mono text-[0.62rem] text-muted-foreground">
                          #{shortBrowserSessionId(session.sessionId)}
                        </span>
                      </span>
                      <span className="block truncate text-[0.62rem] text-muted-foreground">
                        {session.actions} {session.actions === 1 ? "action" : "actions"} ·{" "}
                        <span suppressHydrationWarning>{formatMoment(session.endedAt)}</span>
                      </span>
                    </span>
                    {session.status === "failed" && (
                      <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.58rem] font-medium text-rose-700">
                        failed
                      </span>
                    )}
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground/60 group-hover:text-brand-ink" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the browser profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Every agent will be signed out of every site it logged into through the cloud browser.
              Replay links and session history are kept, and the next browser task starts with a
              fresh profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={resetting} onClick={reset}>
              {resetting ? "Resetting…" : "Reset profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Loader2,
  Plug,
  Search,
  SearchX,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";

import { AppIcon } from "@/components/integrations/app-icon";
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
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { LogoCluster } from "@/components/aui/illustrations/logo-cluster";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterMenu, type FilterValue } from "@/components/ui/filter-menu";
import { Input } from "@/components/ui/input";
import { INTEGRATION_CATEGORIES, type IntegrationCategory } from "@/lib/integrations/catalog";
import {
  CONNECT_CHANNEL,
  type ConnectMessage,
  type IntegrationApp,
  type IntegrationsOverview,
} from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

/**
 * The Apps page body: every offered app, what it does, and whether this
 * workspace can already use it. Connecting hands off to Composio's hosted flow
 * in a new tab; the page refreshes when the user comes back to the callback URL.
 */

type Filter = IntegrationCategory | "All";

/** Cards rendered per batch. The catalog is 1,700+, so never mount them all. */
const PAGE_SIZE = 60;

function StatusPill({
  status,
  waiting = false,
}: {
  status: IntegrationApp["status"];
  waiting?: boolean;
}) {
  if (waiting) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-700 ring-1 ring-amber-600/15">
        <Loader2 className="size-2.5 animate-spin" />
        Waiting
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
        <Check className="size-2.5" strokeWidth={3} />
        Connected
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-700 ring-1 ring-amber-600/15">
        Finish setup
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.62rem] font-semibold text-rose-700 ring-1 ring-rose-600/15">
        Needs attention
      </span>
    );
  }
  return null;
}

function AppCard({
  app,
  configured,
  busy,
  waiting,
  onConnect,
  onDisconnect,
  onDetails,
}: {
  app: IntegrationApp;
  configured: boolean;
  busy: boolean;
  /** The hosted sign-in is open for this app right now. */
  waiting: boolean;
  onConnect: (app: IntegrationApp) => void;
  onDisconnect: (app: IntegrationApp) => void;
  onDetails: (app: IntegrationApp) => void;
}) {
  const action =
    app.status === "active"
      ? "disconnect"
      : app.status === "pending"
        ? "finish"
        : app.status === "error"
          ? "reconnect"
          : "connect";

  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-colors duration-200",
        app.status === "active"
          ? "border-emerald-200/70 hover:border-emerald-300"
          : "border-border hover:border-foreground/20 hover:shadow-[var(--shadow-soft)]",
      )}
    >
      <HoverCard>
        <div className="flex items-start gap-3">
          <HoverCardTrigger
            render={
              <button
                type="button"
                aria-label={`Preview ${app.name}`}
                className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <AppIcon app={app} size="lg" />
          </HoverCardTrigger>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-[0.92rem] font-semibold tracking-tight">{app.name}</h3>
              <StatusPill status={app.status} waiting={waiting} />
            </div>
            <p className="mt-1 line-clamp-2 text-[0.75rem] leading-relaxed text-muted-foreground">
              {app.description}
            </p>
          </div>
        </div>
        <HoverCardContent align="start" className="w-72">
          <div className="flex items-center gap-2.5">
            <AppIcon app={app} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] font-semibold">{app.name}</p>
              <p className="text-[0.66rem] text-muted-foreground">
                {app.category}
                {app.toolCount ? ` · ${app.toolCount} tools` : ""}
              </p>
            </div>
          </div>
          <p className="mt-2.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            {app.description}
          </p>
          <p className="mt-2 text-[0.64rem] font-medium text-brand-ink">
            Open Details to inspect its capabilities.
          </p>
        </HoverCardContent>
      </HoverCard>

      {app.capabilities.length > 0 && (
        <ul className="mt-3 mb-3 flex flex-wrap gap-1">
          {app.capabilities.slice(0, 3).map((capability) => (
            <li
              key={capability}
              className="rounded-full bg-muted/50 px-2 py-0.5 text-[0.64rem] text-foreground/70 ring-1 ring-border/40"
            >
              {capability}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.66rem] text-muted-foreground">
          {app.status === "active" && !waiting ? (
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
          ) : null}
          <span className="truncate">
            {waiting
              ? "Finish the sign-in in the other window"
              : app.status === "active" && app.accountLabel
                ? app.accountLabel
                : [app.toolCount ? `${app.toolCount} tools` : null, app.category]
                    .filter(Boolean)
                    .join(" · ")}
          </span>
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onDetails(app)}
            className="text-muted-foreground"
          >
            Details
          </Button>

          {action === "disconnect" ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => onDisconnect(app)}
              className="text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              type="button"
              variant={
                app.status === "disconnected" || action === "reconnect" ? "default" : "outline"
              }
              size="xs"
              disabled={!configured || busy || waiting}
              onClick={() => onConnect(app)}
              className={cn(
                app.status === "disconnected" &&
                  configured &&
                  "bg-foreground text-background shadow-sm hover:bg-foreground/90",
              )}
            >
              {busy || waiting ? (
                <Spinner className="size-3" />
              ) : (
                <Plug className="size-3" />
              )}
              {waiting
                ? "Waiting"
                : action === "finish"
                  ? "Finish"
                  : action === "reconnect"
                    ? "Reconnect"
                    : "Connect"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function AppsBrowser({ overview }: { overview: IntegrationsOverview }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValue>({ category: [] });
  const selectedCategories = filters.category ?? [];
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<IntegrationApp | null>(null);
  const [details, setDetails] = useState<IntegrationApp | null>(null);
  /** Toolkit whose hosted flow we are polling, if any. */
  const [waiting, setWaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The hosted flow's window, so it can be closed once the job is done. */
  const popupRef = useRef<Window | null>(null);
  const waitingRef = useRef<string | null>(null);

  useEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      popupRef.current?.close();
      popupRef.current = null;
    };
  }, []);

  /** One place for "this app is live now": close the popup and resync the page. */
  const finishConnection = useCallback(
    (app: IntegrationApp) => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      popupRef.current?.close();
      popupRef.current = null;
      setWaiting(null);
      setBusy(null);
      setDetails(null);
      setFallbackUrl(null);
      setError(null);
      setNotice(`${app.name} is connected. Agents can use it now.`);
      router.refresh();
    },
    [router],
  );

  // The callback window reports through a same-origin channel; polling below is
  // the fallback for browsers without BroadcastChannel.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CONNECT_CHANNEL);
    channel.onmessage = async (event: MessageEvent<ConnectMessage>) => {
      const data = event.data;
      if (data?.type !== "alcatraz:connected") return;

      const slug = waitingRef.current ?? data.toolkit;
      if (!slug || (data.toolkit && data.toolkit !== slug)) return;

      const app = overview.apps.find((entry) => entry.slug === slug);
      if (!app) return;

      if (data.status === "error") {
        if (pollTimer.current) clearTimeout(pollTimer.current);
        setWaiting(null);
        setError(`${app.name} wasn't connected. Nothing was saved — try again.`);
        return;
      }

      try {
        const response = await fetch(
          `/api/integrations/status?toolkit=${encodeURIComponent(slug)}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => null)) as { status?: string } | null;
        if (response.ok && body?.status === "active") finishConnection(app);
      } catch {
        // The poll loop is still running: it will pick the account up.
      }
    };

    return () => channel.close();
  }, [overview.apps, finishConnection]);

  /**
   * After the hosted page opens, ask Composio until the account is ACTIVE.
   * The card in chat does the same; here it keeps the dialog honest instead of
   * telling the user to reload.
   */
  function pollUntilActive(app: IntegrationApp) {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setWaiting(app.slug);

    const deadline = Date.now() + 5 * 60 * 1000;
    /** Timestamp of the first tick that saw the sign-in window closed. */
    let closedAt = 0;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/integrations/status?toolkit=${encodeURIComponent(app.slug)}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => null)) as {
          status?: string;
          error?: string;
        } | null;

        if (response.ok && data?.status === "active") {
          finishConnection(app);
          return;
        }

        if (response.ok && data?.status === "error") {
          setWaiting(null);
          setError(`${app.name} couldn't be connected. Try again.`);
          return;
        }
      } catch {
        // A blip isn't a failure; keep polling until the deadline.
      }

      // The callback screen closes the window itself on success, so a closed
      // window gets one grace check before we assume the user gave up.
      if (popupRef.current?.closed) {
        if (!closedAt) {
          closedAt = Date.now();
        } else if (Date.now() - closedAt > 4_000) {
          popupRef.current = null;
          setWaiting(null);
          setNotice(
            `The sign-in window closed. If you finished, reload this page to see ${app.name}.`,
          );
          return;
        }
      } else {
        closedAt = 0;
      }

      if (Date.now() > deadline) {
        popupRef.current = null;
        setWaiting(null);
        setNotice(`Still waiting for ${app.name}. Finish it in the other window, then reload.`);
        return;
      }

      pollTimer.current = setTimeout(check, 3_000);
    };

    pollTimer.current = setTimeout(check, 3_000);
  }
  /** Set when the popup was blocked, so the link is still reachable. */
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const categories = useMemo(() => {
    const present = new Set(overview.apps.map((app) => app.category));
    return INTEGRATION_CATEGORIES.filter((category) => present.has(category));
  }, [overview.apps]);

  // A new search or filter starts at the top of its own result set.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, filters]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return overview.apps.filter((app) => {
      if (selectedCategories.length > 0 && !selectedCategories.includes(app.category)) return false;
      if (!needle) return true;
      return (
        app.name.toLowerCase().includes(needle) ||
        app.description.toLowerCase().includes(needle) ||
        app.capabilities.some((capability) => capability.toLowerCase().includes(needle))
      );
    });
  }, [overview.apps, selectedCategories, query]);

  const connected = visible.filter((app) => app.status !== "disconnected");
  const available = visible.filter((app) => app.status === "disconnected");
  const shown = available.slice(0, limit);
  const filtering = query.trim().length > 0 || selectedCategories.length > 0;
  const detailsAction = !details
    ? "connect"
    : details.status === "active"
      ? "disconnect"
      : details.status === "pending"
        ? "finish"
        : details.status === "error"
          ? "reconnect"
          : "connect";

  async function connect(app: IntegrationApp) {
    if (busy) return;
    setBusy(app.slug);
    setError(null);
    setNotice(null);
    setFallbackUrl(null);

    // Opened before the request: a popup after an await is usually blocked.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    popupRef.current = tab;

    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: app.slug }),
      });
      const data = (await response.json().catch(() => null)) as {
        redirectUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.redirectUrl) {
        tab?.close();
        popupRef.current = null;
        setError(data?.error ?? `We couldn't start the ${app.name} connection.`);
        return;
      }

      // A new window keeps this page (and its filters) in place; the hosted
      // flow returns to /connect/callback, which closes it and reports back.
      if (tab) tab.location.replace(data.redirectUrl);
      else setFallbackUrl(data.redirectUrl);

      setNotice(`Finish connecting ${app.name} in the new tab. This page updates automatically.`);
      pollUntilActive(app);
    } catch (connectError) {
      console.error("[apps] connect failed", connectError);
      tab?.close();
      popupRef.current = null;
      setError(`We couldn't reach the connection service. Please try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(app: IntegrationApp) {
    if (busy) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setWaiting(null);
    setBusy(app.slug);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: app.slug }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? `We couldn't disconnect ${app.name}.`);
        return;
      }

      setPendingDisconnect(null);
      setNotice(`${app.name} disconnected. Agents can no longer use it.`);
      router.refresh();
    } catch (disconnectError) {
      console.error("[apps] disconnect failed", disconnectError);
      setError("We couldn't reach the connection service. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {!overview.configured && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 text-[0.76rem] leading-relaxed text-amber-900">
            <p className="font-semibold">Connections aren&apos;t configured yet</p>
            <p className="mt-0.5 text-amber-800/90">
              Add <code className="rounded bg-amber-100 px-1 py-0.5 text-[0.7rem]">COMPOSIO_API_KEY</code>{" "}
              to the environment and reload. The key comes from your Composio project settings.
            </p>
            <a
              href="https://dashboard.composio.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 font-medium text-amber-900 underline underline-offset-2"
            >
              Open Composio
              <ArrowUpRight className="size-3" />
            </a>
          </div>
        </div>
      )}

      {notice && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-brand-soft px-3 py-2 text-[0.74rem] text-brand-ink ring-1 ring-brand-border">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          {notice}
          {fallbackUrl && (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
            >
              Open the sign-in page
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/5 px-3 py-2 text-[0.74rem] text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${overview.apps.length.toLocaleString()} apps, e.g. mail, invoices, design`}
            aria-label="Search apps"
            className="h-9 rounded-xl border-border bg-card pr-8 pl-9 text-[0.8rem] shadow-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <FilterMenu
          groups={[
            {
              id: "category",
              label: "Category",
              options: categories.map((category) => ({ id: category, label: category })),
            },
          ]}
          value={filters}
          onChange={setFilters}
          title="Filter apps"
          hints={false}
          defaultOpen={[]}
        />
      </div>

      {connected.length > 0 && (
        <section className="premium-panel overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-[0.78rem] font-semibold tracking-[-0.01em]">Connected apps</h2>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium text-foreground/70 tabular-nums ring-1 ring-border/60">
                {connected.length}
              </span>
            </div>
            <p className="text-[0.66rem] text-muted-foreground">
              Agents can use these right now
            </p>
          </div>

          <div className="grid gap-px bg-border/50 sm:grid-cols-2 xl:grid-cols-3">
            {connected.map((app) => (
              <div
                key={app.slug}
                className="group/app flex items-center gap-3 bg-card px-3.5 py-3 transition-colors hover:bg-brand-soft/50"
              >
                <AppIcon app={app} size="md" className="shadow-none ring-1 ring-border/60" />
                <button
                  type="button"
                  onClick={() => setDetails(app)}
                  className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Manage ${app.name}`}
                >
                  <p className="truncate text-[0.8rem] font-medium">{app.name}</p>
                  <p className="truncate text-[0.64rem] text-muted-foreground">
                    {app.status === "pending"
                      ? "Finish setup on Composio"
                      : app.accountLabel ?? app.category}
                    {app.toolCount ? ` · ${app.toolCount.toLocaleString()} tools` : ""}
                  </p>
                </button>
                <span
                  title={app.status === "active" ? "Connected" : "Needs attention"}
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    app.status === "active"
                      ? "bg-emerald-500"
                      : app.status === "error"
                        ? "bg-rose-500"
                        : "bg-amber-500",
                  )}
                />
                <button
                  type="button"
                  aria-label={`Disconnect ${app.name}`}
                  title="Disconnect"
                  disabled={busy !== null}
                  onClick={() => setPendingDisconnect(app)}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/app:opacity-100 disabled:opacity-40"
                >
                  <Unplug className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {available.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-[0.66rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-brand-ink/60" />
            {connected.length > 0 ? "Available" : "All apps"}
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6rem] text-foreground/70 tabular-nums ring-1 ring-border/50">
              {available.length}
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((app) => (
              <AppCard
                key={app.slug}
                app={app}
                configured={overview.configured}
                busy={busy === app.slug}
                waiting={waiting === app.slug}
                onConnect={connect}
                onDisconnect={setPendingDisconnect}
                onDetails={setDetails}
              />
            ))}
          </div>

          {available.length > shown.length && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                className="rounded-full bg-card px-4"
              >
                Load more apps
              </Button>
              <p className="text-[0.66rem] text-muted-foreground tabular-nums">
                Showing {shown.length.toLocaleString()} of {available.length.toLocaleString()}
              </p>
            </div>
          )}
        </section>
      )}

      {visible.length === 0 && (
        <IllustratedEmpty
          art={<LogoCluster />}
          artClassName="w-40"
          title={query.trim() ? `No app matches “${query.trim()}”` : "Nothing in this category yet"}
          text="Try another word, or clear the filter to see every app."
          action={
            filtering ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilters({ category: [] });
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      <p className="pt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
        Connections are stored by Composio and scoped to your account only. Agents use them through a
        session that lists just the apps you connected. Revoke one here and agents lose access
        immediately.{" "}
        <Link href="/dashboard/settings" className="underline underline-offset-2 hover:text-foreground">
          Workspace settings
        </Link>
      </p>

      <Dialog
        open={details !== null}
        onOpenChange={(open) => {
          if (!open) setDetails(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {details ? (
            <>
              {/* pr-8 keeps the dialog's own close button clear of the title. */}
              <DialogHeader className="pr-8">
                <div className="flex items-start gap-3">
                  <AppIcon app={details} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <DialogTitle className="min-w-0 truncate text-left text-base">
                        {details.name}
                      </DialogTitle>
                      {/* Inline, not in the corner: the corner belongs to the dialog's X. */}
                      <StatusPill
                        status={details.status}
                        waiting={waiting === details.slug}
                      />
                    </div>
                    <DialogDescription className="mt-0.5 text-left text-[0.75rem]">
                      {details.category}
                      {details.toolCount ? ` · ${details.toolCount} tools` : ""}
                      {details.status === "active" && details.accountLabel
                        ? ` · ${details.accountLabel}`
                        : ""}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <p className="text-[0.78rem] leading-relaxed text-muted-foreground">
                {details.description}
              </p>

              {details.capabilities.length > 0 ? (
                <div>
                  <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    What an agent can do
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {details.capabilities.map((capability) => (
                      <li
                        key={capability}
                        className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[0.76rem] text-foreground/85 ring-1 ring-border/40"
                      >
                        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                          <Check className="size-2.5" strokeWidth={3.5} />
                        </span>
                        {capability}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                  {details.toolCount
                    ? `This app exposes ${details.toolCount.toLocaleString()} tools through Composio. Ask an agent what it can do after you connect it.`
                    : "Connect this app and ask an agent what it can do — Composio lists the actions for it after sign-in."}
                </p>
              )}

              {waiting === details.slug ? (
                <p className="flex items-center gap-2 rounded-lg bg-brand-soft px-2.5 py-1.5 text-[0.72rem] text-brand-ink ring-1 ring-brand-border">
                  <Spinner className="size-3" />
                  Waiting for you to finish on Composio&apos;s page…
                </p>
              ) : (
                <p className="flex items-start gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[0.7rem] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0" />
                  Sign-in happens on Composio&apos;s page. Alcatraz never sees the password, and
                  disconnecting revokes the saved sign-in immediately.
                </p>
              )}

              <DialogFooter className="gap-1.5 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetails(null)}
                  className="text-muted-foreground"
                >
                  Close
                </Button>

                {detailsAction === "disconnect" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      setPendingDisconnect(details);
                      setDetails(null);
                    }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!overview.configured || busy !== null || waiting === details.slug}
                    onClick={() => void connect(details)}
                    className="gap-1.5 bg-foreground text-background shadow-sm hover:bg-foreground/90"
                  >
                    {busy === details.slug ? (
                      <Spinner className="size-3" />
                    ) : (
                      <Plug className="size-3" />
                    )}
                    {detailsAction === "finish"
                      ? "Finish setup"
                      : detailsAction === "reconnect"
                        ? "Reconnect"
                        : "Connect"}
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDisconnect !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnect(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {pendingDisconnect?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents will lose access immediately and the saved sign-in is revoked at Composio. You
              can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy !== null}
              onClick={() => {
                if (pendingDisconnect) void disconnect(pendingDisconnect);
              }}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

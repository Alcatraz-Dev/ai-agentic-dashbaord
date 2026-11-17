"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Plug, ShieldCheck, TriangleAlert } from "lucide-react";

import { AppIcon } from "@/components/integrations/app-icon";
import { Button } from "@/components/ui/button";
import { getIntegration } from "@/lib/integrations/catalog";
import { CONNECT_CHANNEL, type ConnectMessage } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

/**
 * The generative connect card.
 *
 * Produced by a `connect_request` event, not by a hard-coded flow: the agent
 * decided an app was needed, this card asks for it. The hosted flow runs in a
 * popup that closes itself when it finishes; this card hears the result on the
 * connect channel, verifies against Composio, and only then lets the chat
 * continue — so the agent confirms the connection before it uses it.
 */

export type ConnectionRequest = {
  /** Composio toolkit slug. */
  toolkit: string;
  name: string;
  reason: string;
};

type CardState = "idle" | "connecting" | "waiting" | "verifying" | "connected" | "error";

const POLL_MS = 3_000;
const MAX_WAIT_MS = 5 * 60 * 1_000;

const CHIP: Record<CardState, { label: string; className: string }> = {
  idle: { label: "Needs approval", className: "bg-brand-soft text-brand-ink" },
  connecting: { label: "Opening", className: "bg-brand-soft text-brand-ink" },
  waiting: { label: "Waiting", className: "bg-amber-50 text-amber-700" },
  verifying: { label: "Verifying", className: "bg-brand-soft text-brand-ink" },
  connected: { label: "Verified", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Not connected", className: "bg-rose-50 text-rose-700" },
};

export function ConnectionCard({
  request,
  onConnected,
  onDismiss,
}: {
  request: ConnectionRequest;
  onConnected: (request: ConnectionRequest) => void;
  onDismiss: (toolkit: string) => void;
}) {
  const integration = getIntegration(request.toolkit);
  const app = integration ?? {
    slug: request.toolkit,
    name: request.name,
    icon: "notion" as const,
    color: "#2563EB",
    description: "",
    capabilities: [],
    category: "Files" as const,
  };

  const [state, setState] = useState<CardState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [checking, setChecking] = useState(false);
  /** Set when the browser refused the popup, so the link can still be opened. */
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  /** The hosted flow's window, so we can close it once the job is done. */
  const popupRef = useRef<Window | null>(null);
  /** The poll and the channel message can both land: continue only once. */
  const finishedRef = useRef(false);

  const busy = state === "connecting" || state === "waiting" || state === "verifying";

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/integrations/status?toolkit=${encodeURIComponent(request.toolkit)}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as {
        status?: string;
        accountLabel?: string | null;
      } | null;
      if (!response.ok || !data || typeof data.status !== "string") return null;
      return { status: data.status, accountLabel: data.accountLabel ?? null };
    } catch {
      // A blip isn't a failure: the caller decides whether to keep waiting.
      return null;
    }
  }, [request.toolkit]);

  const finish = useCallback(
    (label: string | null) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      setAccountLabel(label);
      setNotice(null);
      setError(null);
      setState("connected");
      popupRef.current?.close();
      popupRef.current = null;
      onConnected(request);
    },
    [onConnected, request],
  );

  /** A pending account we can't see yet, with a stable failure sentence. */
  const fail = useCallback(
    (message?: string) => {
      setState("error");
      setError(message ?? `${app.name} couldn't be connected. Nothing was saved — try again.`);
      popupRef.current?.close();
      popupRef.current = null;
    },
    [app.name],
  );

  // Clock for the "waiting" step, so the card shows something is happening.
  useEffect(() => {
    if (state !== "waiting" && state !== "verifying") return;
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [state]);

  // Poll while the user is off finishing the hosted flow. Stops on success, on
  // a hard failure, when the popup is closed, and after the wait budget.
  useEffect(() => {
    if (state !== "waiting" && state !== "verifying") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deadline = Date.now() + MAX_WAIT_MS;

    const step = async () => {
      if (cancelled) return;

      const status = await fetchStatus();
      if (cancelled) return;

      if (status?.status === "active") {
        finish(status.accountLabel);
        return;
      }

      if (status?.status === "error") {
        fail(`${app.name} couldn't be connected. Nothing was saved — try again.`);
        return;
      }

      if (popupRef.current?.closed) {
        // The callback screen closes the popup the moment it finishes, so give
        // the status endpoint one beat before deciding the user gave up.
        timer = setTimeout(async () => {
          if (cancelled) return;
          const retry = await fetchStatus();
          if (cancelled) return;

          if (retry?.status === "active") {
            finish(retry.accountLabel);
            return;
          }
          if (retry?.status === "error") {
            fail();
            return;
          }

          popupRef.current = null;
          setState("idle");
          setNotice(`The sign-in window closed. If you finished, choose Check again.`);
        }, 1_500);
        return;
      }

      if (Date.now() > deadline) {
        popupRef.current = null;
        setState("idle");
        setNotice(`Still waiting on ${app.name}. Finish it in the other window, then check again.`);
        return;
      }

      timer = setTimeout(step, POLL_MS);
    };

    timer = setTimeout(step, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [state, app.name, fetchStatus, finish, fail]);

  // The popup has no opener reference (we null it), so it reports through a
  // same-origin channel. Polling remains the fallback when this is unsupported.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CONNECT_CHANNEL);
    let cancelled = false;

    channel.onmessage = async (event: MessageEvent<ConnectMessage>) => {
      const data = event.data;
      if (cancelled || data?.type !== "alcatraz:connected") return;
      if (data.toolkit && data.toolkit !== request.toolkit) return;

      if (data.status === "error") {
        fail(`${app.name} wasn't connected. Nothing was saved — you can try again.`);
        return;
      }

      setNotice(null);
      setState((current) => (current === "connected" ? current : "verifying"));

      const status = await fetchStatus();
      if (cancelled) return;

      if (status?.status === "active") finish(status.accountLabel);
      else if (status?.status === "error") fail();
      else setState("waiting");
    };

    return () => {
      cancelled = true;
      channel.close();
    };
  }, [request.toolkit, app.name, fetchStatus, finish, fail]);

  // Close the popup if the card goes away while it's still open.
  useEffect(() => {
    return () => {
      popupRef.current?.close();
      popupRef.current = null;
    };
  }, []);

  async function connect() {
    if (busy) return;

    setState("connecting");
    finishedRef.current = false;
    setError(null);
    setNotice(null);
    setAccountLabel(null);
    setElapsed(0);
    setFallbackUrl(null);

    // Opened synchronously: after an await most browsers block the popup.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    popupRef.current = tab;

    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: request.toolkit }),
      });
      const data = (await response.json().catch(() => null)) as {
        redirectUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.redirectUrl) {
        tab?.close();
        popupRef.current = null;
        setState("error");
        setError(data?.error ?? `We couldn't start the ${app.name} connection.`);
        return;
      }

      if (tab) tab.location.replace(data.redirectUrl);
      else setFallbackUrl(data.redirectUrl);

      setState("waiting");
    } catch (connectError) {
      console.error("[agents] connect card failed", connectError);
      tab?.close();
      popupRef.current = null;
      setState("error");
      setError("We couldn't reach the connection service. Please try again.");
    }
  }

  async function checkNow() {
    if (checking || busy) return;

    setChecking(true);
    setNotice(null);

    const status = await fetchStatus();
    setChecking(false);

    if (status?.status === "active") {
      finish(status.accountLabel);
      return;
    }

    if (status?.status === "error") {
      fail();
      return;
    }

    setNotice(`Not connected yet. Finish the sign-in, then check again.`);
  }

  const connected = state === "connected";
  const chip = CHIP[state];
  const reason = request.reason ? `Alcatraz needs ${app.name} ${request.reason}.` : `Alcatraz needs ${app.name} to finish this request.`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card ring-1 transition-colors",
        connected
          ? "border-emerald-200/80 ring-emerald-100/70"
          : state === "error"
            ? "border-rose-200/80 ring-rose-100/70"
            : "border-brand-border ring-brand-border",
      )}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <AppIcon app={app} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[0.84rem] font-semibold">
                {connected ? `${app.name} is connected` : `Connect ${app.name}`}
              </p>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold tracking-wide uppercase",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            </div>

            <p className="mt-0.5 text-[0.74rem] leading-relaxed text-muted-foreground">
              {connected
                ? `Your agent can use ${app.name}${
                    accountLabel ? ` as ${accountLabel}` : ""
                  } from its next message on.`
                : reason}
            </p>

            {state === "idle" && app.capabilities.length > 0 && (
              <p className="mt-1 truncate text-[0.67rem] text-muted-foreground/80">
                {app.capabilities.slice(0, 3).join(" · ")}
              </p>
            )}

            {(state === "waiting" || state === "verifying") && (
              <ol className="mt-2.5 space-y-1.5">
                <li className="flex items-center gap-1.5 text-[0.71rem] text-foreground/85">
                  {state === "verifying" ? (
                    <Check className="size-3 shrink-0 text-emerald-600" strokeWidth={3} />
                  ) : (
                    <Loader2 className="size-3 shrink-0 animate-spin text-brand-ink" />
                  )}
                  <span className="truncate">
                    {state === "verifying"
                      ? "Signed in on Composio"
                      : `Sign in to ${app.name}`}
                  </span>
                  {state === "waiting" && (
                    <span className="ml-auto shrink-0 text-[0.66rem] tabular-nums text-muted-foreground">
                      {elapsed}s
                    </span>
                  )}
                </li>
                <li
                  className={cn(
                    "flex items-center gap-1.5 text-[0.71rem]",
                    state === "verifying" ? "text-foreground/85" : "text-muted-foreground/70",
                  )}
                >
                  {state === "verifying" ? (
                    <Loader2 className="size-3 shrink-0 animate-spin text-brand-ink" />
                  ) : (
                    <span className="mx-[3px] size-1.5 shrink-0 rounded-full border border-muted-foreground/40" />
                  )}
                  Verifying with Composio
                </li>
              </ol>
            )}

            {state === "waiting" && (
              <p className="mt-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                A window opened for the sign-in. This card updates on its own — no need to come
                back here.
                {fallbackUrl && (
                  <>
                    {" "}
                    <a
                      href={fallbackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-ink underline underline-offset-2"
                    >
                      Open it again
                    </a>
                  </>
                )}
              </p>
            )}

            {connected && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[0.71rem] text-emerald-700">
                <Check className="size-3" strokeWidth={3} />
                Verified by Composio — continuing your request.
              </p>
            )}

            {state === "error" && error && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-[0.71rem] leading-relaxed text-rose-700">
                <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                {error}
              </p>
            )}

            {notice && !connected && (
              <p className="mt-2 text-[0.69rem] leading-relaxed text-amber-800">{notice}</p>
            )}
          </div>
        </div>
      </div>

      {!connected ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2">
          {state === "waiting" || state === "verifying" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={state === "verifying" || checking}
                onClick={() => void checkNow()}
                className="h-7 gap-1.5 bg-card px-2.5 text-[0.72rem] font-medium"
              >
                {checking ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Check className="size-3" />
                )}
                Check again
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[0.72rem] text-muted-foreground"
                onClick={() => {
                  popupRef.current?.close();
                  popupRef.current = null;
                  setState("idle");
                  setNotice(`Stopped waiting. You can connect ${app.name} whenever you're ready.`);
                }}
              >
                Stop waiting
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => void connect()}
                disabled={state === "connecting"}
                className="h-7 gap-1.5 bg-foreground px-2.5 text-[0.72rem] font-medium text-background shadow-sm hover:bg-foreground/90"
              >
                {state === "connecting" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plug className="size-3" />
                )}
                {state === "connecting"
                  ? "Opening…"
                  : state === "error"
                    ? `Try ${app.name} again`
                    : `Connect ${app.name}`}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[0.72rem] text-muted-foreground"
                onClick={() => onDismiss(request.toolkit)}
              >
                Not now
              </Button>
            </>
          )}

          <Link
            href="/dashboard/apps"
            className="ml-auto inline-flex items-center gap-1 text-[0.67rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            All apps
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 border-t border-emerald-100/80 bg-emerald-50/50 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-emerald-800">
            <ShieldCheck className="size-3" />
            Manage or revoke it any time in Apps.
          </span>
          <Link
            href="/dashboard/apps"
            className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-emerald-800 underline-offset-2 hover:underline"
          >
            Open
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      )}

      {!connected && (
        <p className="border-t border-border/60 px-3 py-1.5 text-[0.62rem] text-muted-foreground">
          Sign-in happens on Composio&apos;s page — Alcatraz never sees your password.
        </p>
      )}
    </div>
  );
}

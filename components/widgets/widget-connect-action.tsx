"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { getIntegration, resolveIntegrationSlug } from "@/lib/integrations/catalog";
import { CONNECT_CHANNEL, type ConnectMessage } from "@/lib/integrations/types";
import { cn } from "@/lib/utils";

/**
 * The Connect control a widget row shows for an app it names.
 *
 * It runs the same hosted Composio flow the Apps page and the chat's Connect
 * card use: the window is opened before the request (a popup after an await is
 * blocked), the callback screen reports on the shared channel, and status
 * polling stays the fallback because a closed popup is never proof. When the
 * account turns active the dashboard refreshes, so the row shows Connected
 * without a reload.
 */

const POLL_MS = 3000;
const MAX_WAIT_MS = 5 * 60 * 1000;

type Phase = "idle" | "connecting" | "waiting" | "connected" | "error";

export function WidgetConnectAction({
  slug,
  connectedApps,
  accountLabel,
  lastCheckedAt,
  className,
}: {
  /** The row's Composio logo slug; resolved to a toolkit slug. */
  slug: string;
  /** Toolkits the owner already has an active account for. */
  connectedApps: string[];
  /** The account behind that connection, when the surface loaded it. */
  accountLabel?: string | null;
  /** ISO timestamp of the last status check. */
  lastCheckedAt?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const app = getIntegration(slug);
  const toolkit = resolveIntegrationSlug(slug) ?? app?.slug ?? slug;
  const name = app?.name ?? "this app";
  const alreadyConnected =
    connectedApps.includes(toolkit) || (app ? connectedApps.includes(app.slug) : false);

  const [phase, setPhase] = useState<Phase>(alreadyConnected ? "connected" : "idle");
  const popupRef = useRef<Window | null>(null);
  const deadlineRef = useRef(0);

  const finish = useCallback(() => {
    popupRef.current?.close();
    popupRef.current = null;
    setPhase("connected");
    router.refresh();
  }, [router]);

  const readStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/integrations/status?toolkit=${encodeURIComponent(toolkit)}`);
      const data = (await response.json().catch(() => null)) as { status?: string } | null;
      return data?.status ?? null;
    } catch {
      return null;
    }
  }, [toolkit]);

  // The callback screen broadcasts; polling below is the fallback.
  useEffect(() => {
    if (phase !== "waiting" || typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel(CONNECT_CHANNEL);
    channel.onmessage = (event: MessageEvent<ConnectMessage>) => {
      const data = event.data;
      if (data?.type !== "alcatraz:connected") return;
      if (data.toolkit && resolveIntegrationSlug(data.toolkit) !== toolkit) return;
      void readStatus().then((status) => {
        if (status === "active") finish();
      });
    };

    return () => {
      channel.onmessage = null;
      channel.close();
    };
  }, [phase, toolkit, readStatus, finish]);

  useEffect(() => {
    if (phase !== "waiting") return;

    let cancelled = false;
    deadlineRef.current = Date.now() + MAX_WAIT_MS;

    const timer = setInterval(() => {
      void (async () => {
        if (cancelled) return;
        if (Date.now() > deadlineRef.current) {
          setPhase("idle");
          return;
        }
        const status = await readStatus();
        if (!cancelled && status === "active") finish();
      })();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, readStatus, finish]);

  // A card can go away while the popup is open.
  useEffect(() => {
    return () => {
      popupRef.current?.close();
      popupRef.current = null;
    };
  }, []);

  async function connect() {
    if (phase === "connecting" || phase === "waiting") return;

    setPhase("connecting");

    // Opened synchronously: after an await most browsers block the popup.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    popupRef.current = tab;

    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await response.json().catch(() => null)) as {
        redirectUrl?: string;
      } | null;

      if (!response.ok || !data?.redirectUrl) {
        tab?.close();
        popupRef.current = null;
        setPhase("error");
        return;
      }

      if (tab) tab.location.replace(data.redirectUrl);
      setPhase("waiting");
    } catch {
      tab?.close();
      popupRef.current = null;
      setPhase("error");
    }
  }

  if (phase === "connected") {
    const checked = lastCheckedAt
      ? new Date(lastCheckedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : null;

    return (
      <span
        title={`Connected${accountLabel ? ` as ${accountLabel}` : ""}${checked ? ` · checked ${checked}` : ""}`}
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-current/10 px-1.5 py-px text-[0.5rem] font-medium ring-1 ring-current/20 text-emerald-600 dark:text-emerald-300",
          className,
        )}
      >
        <Check className="size-2.5" strokeWidth={3} />
        Connected
      </span>
    );
  }

  const busy = phase === "connecting" || phase === "waiting";
  const label = busy ? (phase === "connecting" ? "Opening…" : "Waiting") : phase === "error" ? "Retry" : "Connect";

  return (
    <button
      type="button"
      onClick={connect}
      disabled={busy}
      title={
        phase === "waiting"
          ? `Finish signing in to ${name} in the other window`
          : `Connect ${name}`
      }
      aria-label={`${phase === "error" ? "Try connecting" : "Connect"} ${name}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-current/10 px-1.5 py-px text-[0.5rem] font-semibold ring-1 ring-current/20 transition-colors disabled:opacity-70",
        phase === "error"
          ? "text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
          : "text-brand-ink hover:bg-brand-soft",
        className,
      )}
    >
      {busy ? <Loader2 className="size-2.5 animate-spin" /> : null}
      {label}
    </button>
  );
}

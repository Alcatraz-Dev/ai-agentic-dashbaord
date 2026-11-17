"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, TriangleAlert, X } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getIntegration } from "@/lib/integrations/catalog";
import { CONNECT_CHANNEL, type ConnectMessage } from "@/lib/integrations/types";

/**
 * Landing screen for the hosted connect flow.
 *
 * Deliberately not a page of the app: the flow runs in a popup, and loading the
 * dashboard shell into it is exactly what this screen prevents. It reports the
 * result on the connect channel, closes itself, and only falls back to a
 * "close this window" view when the browser won't let it (opened as a tab, or
 * popup closing is blocked).
 */

type Outcome = "success" | "error";

const CLOSE_DELAY_MS = 900;
const STILL_OPEN_MS = 600;

/** Composio's redirect params aren't fully documented, so accept the shapes. */
function readOutcome(params: URLSearchParams): Outcome {
  const failure =
    params.get("error") ??
    params.get("error_description") ??
    params.get("status") ??
    params.get("connectionStatus");

  if (!failure) return "success";

  const value = failure.toLowerCase();
  if (["success", "connected", "active", "ok"].includes(value)) return "success";
  if (["error", "failed", "failure", "denied", "cancelled", "canceled"].includes(value)) {
    return "error";
  }
  // `status=success` style values pass through above; anything else that is
  // present is treated as a description of what went wrong.
  return "error";
}

export function ConnectCallback() {
  const params = useSearchParams();
  const toolkitSlug = params.get("toolkit") ?? params.get("toolkit_slug");
  const outcome = readOutcome(params);
  /** Composio may not forward the slug; the copy falls back to the generic line. */
  const appName = toolkitSlug ? (getIntegration(toolkitSlug)?.name ?? null) : null;

  const [stillOpen, setStillOpen] = useState(false);

  useEffect(() => {
    const message: ConnectMessage = {
      type: "alcatraz:connected",
      toolkit: toolkitSlug,
      status: outcome,
    };

    // Broadcast first: the opener needs the result even if closing is blocked.
    try {
      const channel = new BroadcastChannel(CONNECT_CHANNEL);
      channel.postMessage(message);
      channel.close();
    } catch (error) {
      console.error("[connect] could not notify the opener", error);
    }

    const closeTimer = window.setTimeout(() => {
      window.close();
      window.setTimeout(() => setStillOpen(true), STILL_OPEN_MS);
    }, CLOSE_DELAY_MS);

    return () => window.clearTimeout(closeTimer);
  }, [outcome, toolkitSlug]);

  const success = outcome === "success";

  return (
    <main className="bg-blueprint flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center">
          <Wordmark />
        </div>

        {/* `bg-white` is remapped to `--card` under `.dark` in globals.css, so this
            card follows the theme while keeping the app's glass look. */}
        <div className="premium-panel rounded-2xl p-6 text-center">
          <div
            className={
              success
                ? "mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
                : "mx-auto flex size-11 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-100"
            }
          >
            {success ? (
              <Check className="size-5" strokeWidth={3} />
            ) : (
              <TriangleAlert className="size-5" />
            )}
          </div>

          <h1 className="mt-4 text-[1.02rem] font-semibold tracking-tight text-foreground">
            {success
              ? appName
                ? `${appName} is connected`
                : "Connection complete"
              : "Connection didn't finish"}
          </h1>
          <p className="mt-1.5 text-[0.78rem] leading-relaxed text-muted-foreground">
            {success
              ? "Alcatraz verified the sign-in. You can go back to the tab you started from — it updates on its own."
              : "The app wasn't connected. Nothing changed, and you can try again from the Apps page."}
          </p>

          {!stillOpen && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <span
                className={
                  success
                    ? "size-1.5 animate-pulse rounded-full bg-emerald-500"
                    : "size-1.5 animate-pulse rounded-full bg-rose-500"
                }
              />
              {success ? "Closing this window…" : "Returning you to Alcatraz…"}
            </p>
          )}

          {stillOpen && (
            <div className="mt-5 space-y-2">
              <p className="text-[0.7rem] text-muted-foreground">
                This window can&apos;t close itself. That&apos;s fine — close it and continue in
                Alcatraz.
              </p>
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/apps" />}
                className="w-full gap-1.5 bg-foreground text-background shadow-sm hover:bg-foreground/90"
              >
                Go to Apps
                <ArrowRight className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => window.close()}
                className="w-full gap-1.5 text-muted-foreground"
              >
                <X className="size-3.5" />
                Close window
              </Button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[0.66rem] text-muted-foreground">
          Connections are managed by Composio and scoped to your account.
        </p>
      </div>
    </main>
  );
}

"use client";

import { ExternalLink, Loader2, Monitor, Moon } from "lucide-react";

import { useLiveBrowser } from "@/hooks/use-live-browser";
import { cn } from "@/lib/utils";

/**
 * What the agent is looking at right now.
 *
 * One component, two shapes: a thin strip under the chat header while a reply
 * is streaming, and a larger card in the config panel's Cloud browser section.
 * Both read the same store, so the poller is shared.
 */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * A dimmed browser window drawn in tokens. It stands in for the real frame
 * before one has arrived, so the slot still reads as a screen rather than a
 * blank rectangle. `loading` makes it breathe while the session boots.
 */
function GhostScreen({
  className,
  loading = false,
  size = "full",
}: {
  className?: string;
  loading?: boolean;
  /** `full` is the panel mock; `mini` is the chat thumbnail. */
  size?: "full" | "mini";
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "overflow-hidden rounded-lg bg-background/70 text-left ring-1 ring-border/60 shadow-sm",
        loading && "animate-pulse",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-border/50 bg-muted/40 px-2 py-1.5">
        <span className="size-1 rounded-full bg-rose-400/60" />
        <span className="size-1 rounded-full bg-amber-400/60" />
        <span className="size-1 rounded-full bg-emerald-400/60" />
        <span className="ml-1 h-1 flex-1 rounded-full bg-muted-foreground/25" />
      </div>

      {size === "full" ? (
        <div className="space-y-1 px-2 py-2">
          <span className="block h-1 w-3/5 rounded-full bg-muted-foreground/25" />
          <span className="block h-1 w-2/5 rounded-full bg-muted-foreground/15" />
          <span className="mt-1.5 block h-6 rounded bg-muted-foreground/10" />
        </div>
      ) : (
        <div className="space-y-0.5 px-1.5 py-1">
          <span className="block h-0.5 w-full rounded-full bg-muted-foreground/25" />
          <span className="block h-0.5 w-2/3 rounded-full bg-muted-foreground/15" />
          <span className="block h-1.5 w-full rounded-sm bg-muted-foreground/10" />
        </div>
      )}
    </div>
  );
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wide text-white uppercase",
        className,
      )}
    >
      <span className="size-1 animate-pulse rounded-full bg-white" />
      Live
    </span>
  );
}

export function LiveBrowser({ variant = "chat" }: { variant?: "chat" | "panel" }) {
  const live = useLiveBrowser();

  const host = hostOf(live.url);
  const heading = live.title || host || "Cloud browser";
  /** Only a real page behind a real frame is worth a link. */
  const frameUrl = live.image && /^https?:\/\//i.test(live.url) ? live.url : null;

  const openLink = live.liveViewUrl ? (
    <a
      href={live.liveViewUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open this session in Browserbase"
      className="inline-flex items-center gap-1 text-[0.62rem] font-medium text-brand-ink hover:underline text-brand-ink"
    >
      Open live view
      <ExternalLink className="size-2.5" strokeWidth={2.4} />
    </a>
  ) : null;

  // The panel always shows the preview, so the card doubles as a window into
  // the cloud computer even when no session is running.
  if (variant === "panel" && live.agentId === null) {
    return (
      <div className="mt-2.5 overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/50 px-2.5 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[0.66rem] font-medium">
            <Monitor className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">Cloud browser</span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
            <span className="size-1 rounded-full bg-muted-foreground/50" />
            Sleeping
          </span>
        </div>

        <div className="relative grid aspect-[16/10] w-full place-items-center overflow-hidden bg-gradient-to-b from-muted/30 to-muted/70">
          <div className="px-4 text-center">
            <GhostScreen className="mx-auto w-[168px]" />

            <p className="mt-2 flex items-center justify-center gap-1 text-[0.7rem] font-medium text-foreground/80">
              <Moon className="size-3 text-muted-foreground" />
              Computer sleeping…
            </p>
            <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
              It wakes up when a task needs a page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div className="mt-2.5 overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/50 px-2.5 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[0.66rem] font-medium">
            <Monitor className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{heading}</span>
          </span>
          <LiveDot />
        </div>

        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-b from-muted/30 to-muted/70">
          {live.image ? (
            <img
              src={live.image}
              alt={`Live view of ${heading}`}
              className="size-full object-cover object-top"
            />
          ) : (
            <div className="grid size-full place-items-center px-4">
              <div className="text-center">
                <GhostScreen loading className="mx-auto w-[70%] max-w-[220px]" />

                <p className="mt-2 flex items-center justify-center gap-1 text-[0.7rem] font-medium text-foreground/80">
                  <Loader2 className="size-3 animate-spin text-muted-foreground" />
                  Starting the browser…
                </p>
                <p className="mx-auto mt-0.5 max-w-[200px] truncate text-[0.62rem] text-muted-foreground">
                  {host ? `Loading ${host}` : "The first frame appears in a moment."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
          {frameUrl ? (
            // The page the frame shows: open it in a tab once it has loaded.
            <a
              href={frameUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open ${frameUrl} in a new tab`}
              className="min-w-0 truncate text-[0.62rem] text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground"
            >
              {frameUrl}
            </a>
          ) : (
            <span className="truncate text-[0.62rem] text-muted-foreground" title={live.url}>
              {live.url || host || "New tab"}
            </span>
          )}
          {openLink}
        </div>
      </div>
    );
  }

  // Chat's strip stays put too: it is the same preview, just thinner.
  if (live.agentId === null) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border/60 bg-muted/30 px-4 py-2">
        <div className="grid h-11 w-20 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border/60">
          <GhostScreen size="mini" className="w-12 rounded-md" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[0.72rem] font-medium text-foreground/80">
            <span className="size-1.5 rounded-full bg-muted-foreground/40" />
            Computer sleeping…
          </p>
          <p className="truncate text-[0.64rem] text-muted-foreground">
            It wakes up when a task needs a page.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wide text-muted-foreground uppercase">
          Sleeping
        </span>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border/60 bg-muted/40 px-4 py-2">
      <div className="relative h-11 w-20 shrink-0 overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/60">
        {live.image ? (
          <img
            src={live.image}
            alt={`Live view of ${heading}`}
            className="size-full object-cover object-top"
          />
        ) : (
          // No frame yet: a breathing window mock instead of a blank box.
          <div className="grid size-full place-items-center">
            <GhostScreen loading size="mini" className="w-12 rounded-md" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* The pill sits with the title, so it never covers the frame. */}
        <p className="flex items-center gap-1.5 truncate text-[0.72rem] font-medium">
          <LiveDot />
          <span className="truncate">{heading}</span>
        </p>
        <p className="truncate text-[0.64rem] text-muted-foreground" title={live.url}>
          {live.url || "opening a page…"}
        </p>
      </div>

      {openLink}
    </div>
  );
}

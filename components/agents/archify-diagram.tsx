"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

import { MermaidDiagram } from "@/components/agents/mermaid-diagram";
import { isArchifySource } from "@/lib/archify/types";
import { cn } from "@/lib/utils";

/**
 * One Archify diagram, drawn on the server and shown in a sandboxed iframe.
 *
 * Archify's renderer is Node-only and emits a complete interactive HTML page
 * (~800 KB with the viewer). The page is fetched on demand, cached per source
 * in this tab, and isolated with `sandbox="allow-scripts"`: its own scripts run,
 * but it gets an opaque origin and cannot reach the app, cookies or storage.
 *
 * A legacy saved diagram is still Mermaid source; those rows keep rendering
 * through the old component instead of being migrated or lost.
 */

const CLIENT_CACHE_LIMIT = 8;
const htmlCache = new Map<string, string>();

function cacheSet(source: string, html: string) {
  htmlCache.set(source, html);
  while (htmlCache.size > CLIENT_CACHE_LIMIT) {
    const oldest = htmlCache.keys().next().value;
    if (oldest === undefined) break;
    htmlCache.delete(oldest);
  }
}

export function ArchifyDiagram({
  source,
  className,
  height = 440,
  autoHeight = false,
}: {
  source: string;
  className?: string;
  /** Starting iframe height. With `autoHeight`, the diagram can grow past it. */
  height?: number;
  /** Follow the artifact's own height report, capped at 680px. */
  autoHeight?: boolean;
}) {
  const archify = isArchifySource(source);
  const [html, setHtml] = useState<string | null>(() =>
    archify ? (htmlCache.get(source) ?? null) : null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(archify && !htmlCache.has(source));
  const [frameHeight, setFrameHeight] = useState(height);
  const [showSource, setShowSource] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setFrameHeight(height);

    if (!archify) {
      setHtml(null);
      setError("");
      setLoading(false);
      return;
    }

    const cached = htmlCache.get(source);
    if (cached) {
      setHtml(cached);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError("");

    // Typing in the IR editor should not spawn a renderer per keystroke.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/archify/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
          signal: controller.signal,
        });

        if (cancelled) return;

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? "Archify couldn't draw this diagram.");
          setLoading(false);
          return;
        }

        const artifact = await response.text();
        if (cancelled) return;
        cacheSet(source, artifact);
        setHtml(artifact);
        setLoading(false);
      } catch (fetchError) {
        if (cancelled) return;
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        console.error("[archify] render request failed", fetchError);
        setError("We couldn't reach the diagram renderer. Please try again.");
        setLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [archify, height, source]);

  useEffect(() => {
    if (!autoHeight) return;

    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (!data || data.type !== "archify:height") return;
      const next = Number(data.height);
      if (!Number.isFinite(next) || next <= 0) return;
      setFrameHeight(Math.min(Math.max(Math.round(next), 280), 680));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [autoHeight, html]);

  // Legacy rows stay readable; nothing new is saved in this format.
  if (!archify) return <MermaidDiagram code={source} />;

  if (error) {
    return (
      <div className={cn("overflow-hidden rounded-xl border border-border/70 bg-muted/40", className)}>
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/50 px-2.5 py-1.5 text-[0.66rem] text-muted-foreground">
          <TriangleAlert className="size-3 text-amber-600" />
          Archify couldn&apos;t draw this diagram.
        </div>
        <p className="px-3 pt-2 text-[0.7rem] leading-relaxed text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => setShowSource((open) => !open)}
          className="mx-3 mt-1 rounded-md px-1.5 py-0.5 text-[0.64rem] font-medium text-brand-ink transition hover:bg-brand-soft"
        >
          {showSource ? "Hide the JSON" : "Show the JSON"}
        </button>
        {showSource ? (
          <pre className="mx-3 my-2 max-h-48 overflow-auto rounded-lg bg-background/70 p-2 font-mono text-[0.62rem] leading-relaxed whitespace-pre-wrap">
            {source}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!html) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 text-[0.7rem] text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        <Loader2 className="size-3.5 animate-spin" />
        {loading ? "Drawing with Archify…" : "Preparing the diagram…"}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <iframe
        ref={iframeRef}
        title="Archify diagram"
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
        srcDoc={html}
        loading="lazy"
        className="w-full rounded-xl border border-border/60 bg-white"
        style={{ height: autoHeight ? frameHeight : height }}
      />
      {loading ? (
        <span className="pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[0.6rem] text-muted-foreground shadow-sm ring-1 ring-border">
          <Loader2 className="size-2.5 animate-spin" />
          Redrawing
        </span>
      ) : null}
    </div>
  );
}

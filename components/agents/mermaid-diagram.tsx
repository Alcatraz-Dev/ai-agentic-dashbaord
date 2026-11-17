"use client";

import { useEffect, useId, useState } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * One ```mermaid fence, drawn as an SVG in the browser.
 *
 * Mermaid is a large library, so it is imported dynamically *inside* the
 * effect: it never reaches the server render or the initial chat bundle. The
 * diagram is rendered with `securityLevel: "strict"`, so HTML in labels is not
 * executed and generated links are inert — the model's output is data.
 *
 * A block that fails to parse keeps its source visible instead of vanishing:
 * the owner still has the diagram text and a plain reason.
 */
export function MermaidDiagram({ code }: { code: string }) {
  const rawId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const source = code.trim();
      if (!source) {
        setSvg(null);
        return;
      }

      try {
        const mermaid = (await import("mermaid")).default;
        const dark =
          typeof document !== "undefined" &&
          (document.documentElement.classList.contains("dark") ||
            document.documentElement.dataset.theme === "dark");

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
          fontFamily: "inherit",
        });

        const { svg: rendered } = await mermaid.render(`mermaid-${rawId}`, source);
        if (cancelled) return;
        setSvg(rendered);
        setFailed(false);
      } catch (renderError) {
        console.error("[chat] mermaid diagram could not be drawn", renderError);
        if (!cancelled) setFailed(true);
      }
    }

    void draw();

    return () => {
      cancelled = true;
    };
  }, [code, rawId]);

  if (failed) {
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/70 bg-muted/40">
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/50 px-2.5 py-1 text-[0.62rem] text-muted-foreground">
          <TriangleAlert className="size-3 text-amber-600" />
          This diagram couldn&apos;t be drawn — the source is below.
        </div>
        <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[0.7rem] leading-relaxed">
          {code}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 flex h-24 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-[0.68rem] text-muted-foreground">
        Drawing the diagram…
      </div>
    );
  }

  return (
    <div
      className="my-2 overflow-x-auto rounded-xl border border-border/70 bg-card px-3 py-3 [&_svg]:mx-auto [&_svg]:max-w-full"
      // Mermaid's own sanitised output (securityLevel "strict").
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import type { CSSProperties, ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

/**
 * A real empty list, drawn with one of the free affectUI illustrations.
 *
 * The illustration is decorative (the EmptyState text carries the meaning), so it is
 * hidden from assistive tech and cannot be dragged or hovered by accident.
 *
 * `layout="stacked"` (default) puts the scene above the copy; `artClassName` sizes it,
 * because the illustrations keep their own aspect ratios (portrait folder, wide grid).
 * `layout="overlay"` lets the scene fill the whole panel and lays the copy over its
 * bottom edge behind a dark scrim, so the artwork is the empty state rather than an
 * ornament above it.
 */
export function IllustratedEmpty({
  art,
  artClassName,
  title,
  text,
  action,
  layout = "stacked",
  className,
}: {
  art: ReactNode;
  /** Width of the scene in the stacked layout, e.g. `w-20` for the portrait folder. */
  artClassName?: string;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  layout?: "stacked" | "overlay";
  className?: string;
}) {
  if (layout === "overlay") {
    return (
      <div
        className={cn(
          "ui-ie-overlay relative isolate flex min-h-[210px] flex-col justify-end overflow-hidden rounded-xl border border-border/70",
          className,
        )}
      >
        {/* The scene (sky included) fills the whole panel – `.ui-ie-fill` resizes it in globals.css. */}
        <div
          aria-hidden="true"
          className="ui-ie-fill pointer-events-none absolute inset-0 select-none"
        >
          {art}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/40 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0">
          <EmptyState
            bare
            icon={null}
            title={title}
            text={text}
            action={action}
            className="px-4 pb-4"
            style={
              {
                "--ui-est-title": "#ffffff",
                "--ui-est-text": "rgba(255, 255, 255, 0.82)",
              } as CSSProperties
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-6 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn("pointer-events-none w-36 shrink-0 select-none", artClassName)}
      >
        {art}
      </div>
      <EmptyState bare icon={null} title={title} text={text} action={action} className="mt-3" />
    </div>
  );
}

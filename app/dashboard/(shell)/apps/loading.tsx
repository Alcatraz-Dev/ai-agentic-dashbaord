import { Plug } from "lucide-react";

import { Skeleton } from "@/components/ui/shimmer-loader";

/**
 * Navigation placeholder for the Apps page. The page itself waits on Composio
 * (one sync + a toolkit count), so this keeps the header, search and grid on
 * screen instead of a blank pane while the overview loads.
 */
export default function AppsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl" aria-busy="true">
      <p className="sr-only">Loading apps…</p>

      <div aria-hidden className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="block h-2.5 w-24 rounded-full bg-muted" />
          <span className="mt-2.5 block h-7 w-28 rounded-lg bg-muted" />
          <div className="mt-2 w-full max-w-xl space-y-1.5">
            <span className="block h-3 w-[92%] rounded-full bg-muted" />
            <span className="block h-3 w-[64%] rounded-full bg-muted" />
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pr-3.5 pl-1.5">
          <span className="grid size-8 place-items-center rounded-[0.6rem] bg-muted text-foreground ring-1 ring-border">
            <Plug className="size-4" />
          </span>
          <span className="h-2.5 w-24 rounded-full bg-muted" />
        </div>
      </div>

      <div aria-hidden className="mt-5 space-y-4">
        <div className="flex flex-col gap-2.5">
          <span className="block h-9 w-full rounded-full border border-border/70 bg-card" />
          <div className="flex flex-wrap gap-1.5">
            {[36, 62, 74, 58, 52, 92, 116, 58, 66, 60].map((width, index) => (
              <span
                key={index}
                className="h-8 rounded-full border border-border/70 bg-card"
                style={{ width }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block h-2.5 w-40 rounded-full bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Skeleton width={48} height={48} radius={12} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton width={96} height={14} radius={999} />
                    <Skeleton width="100%" height={10} radius={999} />
                    <Skeleton width="60%" height={10} radius={999} />
                  </div>
                </div>
                <div className="mt-3 mb-3 flex flex-wrap gap-1">
                  <Skeleton width={80} height={20} radius={999} />
                  <Skeleton width={96} height={20} radius={999} />
                  <Skeleton width={64} height={20} radius={999} />
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                  <Skeleton width={80} height={10} radius={999} />
                  <span className="h-6 w-16 rounded-full bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

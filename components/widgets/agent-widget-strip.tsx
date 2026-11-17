"use client";

import { LayoutGrid } from "lucide-react";

import { WidgetCard } from "@/components/widgets/widget-card";
import { WidgetMenu } from "@/components/widgets/widget-menu";
import type { WidgetRecord } from "@/lib/widget-types";

/**
 * The widget rail above the chat transcript. It scrolls horizontally so the
 * conversation stays the page's focus, and each card keeps its dashboard
 * actions: update now, edit with the agent, or delete.
 *
 * Colours follow the active palette so the rail matches the user's theme.
 */
export function AgentWidgetStrip({
  widgets,
  onDelete,
  onRefresh,
  onApplied,
  onEdit,
}: {
  widgets: WidgetRecord[];
  onDelete: (widget: WidgetRecord) => Promise<string | null>;
  onRefresh: (widget: WidgetRecord) => Promise<string | null>;
  onApplied: (widget: WidgetRecord) => void;
  onEdit: (widget: WidgetRecord) => void;
}) {
  if (widgets.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 px-5 pt-3">
        <LayoutGrid className="size-4 text-border" />
        <p className="text-[0.7rem] font-semibold tracking-[0.12em] text-foreground/60 uppercase">
          Widgets
        </p>
        <span className="rounded-full bg-border/50 px-1.5 py-0.5 text-[0.62rem] font-semibold text-border/80 tabular-nums dark:bg-border/15 dark:text-border/30">
          {widgets.length}
        </span>
        <span className="ml-auto hidden text-[0.62rem] text-foreground/45 sm:block">
          Live from this agent · scroll for more
        </span>
      </div>

      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 py-3 [scrollbar-width:thin]"
        aria-label="Widgets created by this agent"
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="w-[296px] shrink-0 snap-start">
            <WidgetCard
              widget={widget}
              size="medium"
              variant="strip"
              actions={
                <WidgetMenu
                  widget={widget}
                  onDelete={() => onDelete(widget)}
                  onRefresh={() => onRefresh(widget)}
                  onApplied={(updated) => onApplied(updated)}
                  onEdit={() => onEdit(widget)}
                />
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
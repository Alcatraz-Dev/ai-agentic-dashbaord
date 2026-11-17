"use client";

import { useEffect, useRef, useState } from "react";

import { WidgetCard } from "@/components/widgets/widget-card";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";
import type { WidgetSize } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * A template's real starting layout, drawn from the same records the server
 * seeds: the actual cards, their forms, styles and grid cells, scaled down to
 * the picker thumbnail. Nothing is invented for the preview and no model is
 * called — connecting the apps and asking the briefs questions is what turns
 * these into live data.
 *
 * The frame is laid out at the dashboard's own pixel sizes and scaled by its
 * measured width, so the cards keep their true proportions (and their text
 * shrinks with them) instead of being re-laid out for the thumbnail.
 */

const COLUMNS = 3;
/** Matches the desktop dashboard: 311px columns, 80px rows, 14px gap. */
const COLUMN_WIDTH = 311;
const ROW_HEIGHT = 80;
const GAP = 14;

const SPAN_WIDTH: Record<WidgetSize, number> = { small: 1, medium: 1, large: 2 };
const CARD_HEIGHT: Record<WidgetSize, number> = { small: 176, medium: 254, large: 356 };

const FRAME_WIDTH = COLUMN_WIDTH * COLUMNS + GAP * (COLUMNS - 1);

export function TemplatePreview({
  template,
  className,
}: {
  template: string;
  className?: string;
}) {
  const blueprint = getTemplateBlueprint(template);
  const widgets = blueprint?.widgets ?? [];
  const frameRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const update = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(width / FRAME_WIDTH);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (widgets.length === 0) return null;

  const frameHeight = widgets.reduce(
    (tallest, widget) => Math.max(tallest, widget.y * (ROW_HEIGHT + GAP) + CARD_HEIGHT[widget.size]),
    0,
  );

  return (
    <span
      ref={frameRef}
      aria-hidden="true"
      className={cn(
        "relative block overflow-hidden bg-gradient-to-b from-muted/40 to-muted/70",
        className,
      )}
      style={{ aspectRatio: `${FRAME_WIDTH} / ${frameHeight}` }}
    >
      <span
        className="absolute top-0 left-0 block origin-top-left"
        style={{
          width: FRAME_WIDTH,
          height: frameHeight,
          transform: `scale(${scale})`,
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        {widgets.map((widget) => (
          <span
            key={widget.key}
            className="absolute block"
            style={{
              left: widget.x * (COLUMN_WIDTH + GAP),
              top: widget.y * (ROW_HEIGHT + GAP),
              width: COLUMN_WIDTH * SPAN_WIDTH[widget.size] + GAP * (SPAN_WIDTH[widget.size] - 1),
              height: CARD_HEIGHT[widget.size],
            }}
          >
            <WidgetCard
              size={widget.size}
              className="h-full"
              widget={{
                title: widget.title,
                icon: widget.icon,
                illustration: widget.illustration,
                design: widget.design,
                form: widget.form,
                data: widget.data,
              }}
            />
          </span>
        ))}
      </span>
    </span>
  );
}

"use client";

import { Loader2 } from "lucide-react";

import { WIDGET_SIZES, type WidgetSize } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

const LABELS: Record<WidgetSize, { short: string; name: string }> = {
  small: { short: "S", name: "Small" },
  medium: { short: "M", name: "Medium" },
  large: { short: "L", name: "Large" },
};

/** Compact small / medium / large switch shown on a dashboard widget. */
export function WidgetSizeSwitch({
  size,
  onChange,
  saving = false,
}: {
  size: WidgetSize;
  onChange: (size: WidgetSize) => void;
  saving?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Widget size"
      className="flex items-center gap-0.5 rounded-full bg-card p-0.5 shadow-sm ring-1 ring-border"
    >
      {WIDGET_SIZES.map((option) => {
        const active = size === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={`${LABELS[option].name} widget`}
            title={`${LABELS[option].name} layout`}
            disabled={saving}
            onClick={() => {
              if (!active) onChange(option);
            }}
            className={cn(
              "grid size-6 place-items-center rounded-full text-[0.6rem] font-semibold transition",
              active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {saving && active ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              LABELS[option].short
            )}
          </button>
        );
      })}
    </div>
  );
}

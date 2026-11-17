import type { ReactNode } from "react";

import { WidgetFormBody } from "@/components/widgets/widget-forms";
import { getWidgetIcon } from "@/components/widgets/widget-icon";
import {
  WIDGET_FONTS,
  WIDGET_HEADING_SIZES,
  WIDGET_SHADOWS,
  backgroundStyle,
  type WidgetAppearance,
} from "@/lib/widget-appearance";
import type { AppAccountSummary } from "@/lib/integrations/types";
import {
  effectiveWidgetForm,
  getWidgetDesign,
  type WidgetDesignKey,
  type WidgetForm,
  type WidgetIconKey,
  type WidgetIllustrationKey,
  type WidgetPayload,
  type WidgetSize,
} from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * One widget, rendered from plain data.
 *
 * A widget is a form (one of twenty-seven) plus a style (one of seventeen). Both are
 * stored, and every size is derived from the same payload in one render — no
 * model call, no pre-generated layout. The form can only be one the data can
 * honestly support. An owner's appearance choices are applied as inline tokens
 * on top of the chosen design, so a reset restores the design exactly.
 */

export type WidgetCardModel = {
  title: string;
  icon: WidgetIconKey;
  illustration?: WidgetIllustrationKey;
  design: WidgetDesignKey;
  form: WidgetForm;
  data: WidgetPayload;
  updatedAt?: string | null;
  /** Owner customization; null/undefined keeps the design's own look. */
  appearance?: WidgetAppearance | null;
};

const HEIGHTS: Record<WidgetSize, string> = {
  small: "h-[176px]",
  medium: "h-[254px]",
  large: "h-[356px]",
};

function updatedLabel(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WidgetCard({
  widget,
  size = "medium",
  variant = "dashboard",
  className,
  actions,
  connectedApps,
  appAccounts,
  paused,
}: {
  widget: WidgetCardModel;
  size?: WidgetSize;
  /** `strip` keeps a compact preview for the chat rail. */
  variant?: "dashboard" | "strip" | "preview";
  className?: string;
  /** Overlaid top-right controls (size switch, menu). */
  actions?: ReactNode;
  /**
   * Connected toolkits. When given, a row that names an app offers a real
   * Connect action; without it the row keeps its stored text.
   */
  connectedApps?: string[];
  /** Which account sits behind each connected toolkit. */
  appAccounts?: Record<string, AppAccountSummary>;
  /** True when automatic updates are off, so the card says so in place. */
  paused?: boolean;
}) {
  const design = getWidgetDesign(widget.design);
  const Icon = getWidgetIcon(widget.icon);
  const form = effectiveWidgetForm({
    form: widget.form,
    design: widget.design,
    data: widget.data,
  });

  const look = widget.appearance ?? null;
  const pad = look?.padding ?? 14;
  const showTitle = look ? look.header.title : true;
  const showIcon = look ? look.header.icon : true;
  const showUpdated = look ? look.header.updated : false;
  const overlay = look?.background.kind === "image" ? (look.background.overlay ?? 35) : 0;

  return (
    <article
      className={cn(
        "group/widget relative flex flex-col overflow-hidden rounded-2xl border",
        design.shell,
        variant === "strip" ? "h-[196px]" : HEIGHTS[size],
        look?.textColor ? "widget-custom-ink" : null,
        className,
      )}
      style={{
        ...(look ? backgroundStyle(look.background) : {}),
        ...(look
          ? {
              borderRadius: look.radius,
              boxShadow: WIDGET_SHADOWS[look.shadow],
              borderWidth: look.borderWidth,
              borderStyle: "solid",
              borderColor: look.borderColor ?? undefined,
              fontFamily: WIDGET_FONTS[look.font],
            }
          : {}),
        ...(look?.textColor ? { color: look.textColor } : {}),
      }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-16 -right-10 size-40 rounded-full blur-3xl",
          design.glow,
        )}
      />
      {/* The style's own decoration, so two styles differ in texture, not only
          in colour: dots, a drafting grid, corner rays or a soft mesh. */}
      {design.decoration && design.decoration !== "none" ? (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0",
            design.decoration === "mesh"
              ? "opacity-[0.12]"
              : design.decoration === "grid"
                ? "opacity-[0.08]"
                : design.decoration === "rays"
                  ? "opacity-[0.07]"
                  : "opacity-[0.05]",
          )}
          style={
            design.decoration === "grid"
              ? {
                  backgroundImage:
                    "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }
              : design.decoration === "rays"
                ? {
                    backgroundImage:
                      "conic-gradient(from 210deg at 85% -10%, currentColor 0deg, transparent 90deg, currentColor 180deg, transparent 250deg)",
                  }
                : design.decoration === "mesh"
                  ? {
                      backgroundImage:
                        "radial-gradient(circle at 15% 15%, currentColor 0%, transparent 45%), radial-gradient(circle at 85% 85%, currentColor 0%, transparent 45%)",
                    }
                  : {
                      backgroundImage:
                        "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
                      backgroundSize: "16px 16px",
                    }
          }
        />
      ) : null}
      {overlay > 0 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: `rgba(0, 0, 0, ${overlay / 100})` }}
        />
      ) : null}

      <header
        className={cn("relative z-10 flex items-start gap-2", !look && "px-3.5 pt-3")}
        style={look ? { padding: `${pad}px ${pad}px 0` } : undefined}
      >
        {showIcon ? (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-[9px]",
              design.iconTile,
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </span>
        ) : null}
        <div
          className="min-w-0 flex-1"
          style={look ? { textAlign: look.align } : undefined}
        >
          {showTitle ? (
            <h3
              className={cn(
                "mt-0.5 min-w-0 truncate text-[0.8rem] leading-tight font-semibold tracking-[-0.01em]",
                design.title,
                design.heading,
              )}
              style={look ? { fontSize: WIDGET_HEADING_SIZES[look.headingSize] } : undefined}
              title={widget.title}
            >
              {widget.title}
            </h3>
          ) : null}
          {showUpdated && widget.updatedAt ? (
            <p className={cn("mt-0.5 truncate text-[0.6rem]", design.muted)}>
              Updated {updatedLabel(widget.updatedAt)}
            </p>
          ) : null}
          {paused && !widget.updatedAt ? (
            <p
              className={cn("mt-0.5 truncate text-[0.6rem]", design.muted)}
              title="Automatic updates are off — connect the apps this card names, then turn updates on from its menu."
            >
              Updates paused
            </p>
          ) : null}
        </div>
        {actions ? <div className="relative z-20 shrink-0">{actions}</div> : null}
      </header>

      <div
        className={cn(
          "relative z-10 flex min-h-0 flex-1 flex-col",
          !look && "px-3.5 pt-2 pb-3",
        )}
        style={look ? { padding: `8px ${pad}px ${pad}px`, textAlign: look.align } : undefined}
      >
        <WidgetFormBody
          form={form}
          size={size}
          data={widget.data}
          design={design}
          illustration={widget.illustration ?? "spark"}
          connectedApps={connectedApps}
          appAccounts={appAccounts}
        />
      </div>
    </article>
  );
}

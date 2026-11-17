"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock, RefreshCw } from "lucide-react";

import {
  catchUpWidgetsAction,
  deleteWidgetAction,
  duplicateWidgetAction,
  refreshWidgetNowAction,
  setWidgetLockAction,
  updateWidgetAppearanceAction,
  updateWidgetLayoutAction,
  updateWidgetSizeAction,
} from "@/app/actions/widgets";
import { DashboardBackgroundButton } from "@/components/dashboard/dashboard-background-dialog";
import { WidgetCustomizeDrawer } from "@/components/dashboard/widget-customize-drawer";
import { WidgetCard } from "@/components/widgets/widget-card";
import { WidgetMenu } from "@/components/widgets/widget-menu";
import {
  backgroundStyle,
  normalizeDashboardAppearance,
  type DashboardAppearance,
} from "@/lib/widget-appearance";
import {
  WIDGET_COLUMNS,
  WIDGET_GAP,
  WIDGET_ROW_HEIGHT,
  WIDGET_SPANS,
  columnsForWidth,
  moveWidget,
  resizeWidget,
  resolveLayout,
  spanFor,
  type LayoutWidget,
} from "@/lib/widget-layout";
import type { AgentModelCatalog, AgentSummary } from "@/lib/agent-options";
import type { AppAccountSummary } from "@/lib/integrations/types";
import type { WidgetRecord, WidgetSize } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * The dashboard grid.
 *
 * Desktop uses a three-column, 80px-row grid. A card can be dragged anywhere
 * (it follows the pointer, then snaps to the nearest cell) and resized from any
 * corner (it snaps to the next size). Both paths re-flow every card through
 * `lib/widget-layout.ts`, so two widgets can never overlap; the same maths runs
 * on the server before anything is stored. Sizes, positions, appearance and the
 * dashboard background all persist, so a reload restores the exact layout.
 */

type DragState = {
  id: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  originX: number;
  originY: number;
  size: WidgetSize;
  dirX: number;
  dirY: number;
  columnWidth: number;
  maxBottom: number;
};

type DragTarget = { x: number; y: number; size: WidgetSize; w: number; h: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const SIZE_NAMES: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** Freshness label for the grid toolbar; empty when the timestamp is unusable. */
function relativeUpdated(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The cell/size the card will land on, used for the drop outline and the commit. */
function dragTargetFor(state: DragState): DragTarget {
  const originSpan = WIDGET_SPANS[state.size];
  const columnStep = state.columnWidth + WIDGET_GAP;
  const rowStep = WIDGET_ROW_HEIGHT + WIDGET_GAP;

  if (state.mode === "move") {
    return {
      x: clamp(
        state.originX + Math.round(state.dx / columnStep),
        0,
        WIDGET_COLUMNS - originSpan.w,
      ),
      y: clamp(
        state.originY + Math.round(state.dy / rowStep),
        0,
        Math.max(0, state.maxBottom - originSpan.h),
      ),
      size: state.size,
      ...originSpan,
    };
  }

  const wantedW = clamp(
    originSpan.w + Math.round((state.dx * state.dirX) / columnStep),
    1,
    2,
  );
  const wantedH = clamp(
    originSpan.h + Math.round((state.dy * state.dirY) / rowStep),
    2,
    4,
  );
  const grew = wantedW > originSpan.w || wantedH > originSpan.h;
  const shrank = wantedW < originSpan.w || wantedH < originSpan.h;
  let size: WidgetSize = state.size;

  if (grew && !shrank) {
    size = wantedW >= 2 || wantedH >= 4 ? "large" : "medium";
  } else if (shrank && !grew) {
    size = originSpan.w >= 2 || originSpan.h >= 4 ? "medium" : "small";
  } else if (grew && shrank) {
    const horizontal =
      Math.abs(state.dx) / columnStep >= Math.abs(state.dy) / rowStep;
    if (horizontal) size = wantedW >= 2 ? "large" : "medium";
    else size = wantedH <= 2 ? "small" : "medium";
  }

  const span = WIDGET_SPANS[size];

  let x = state.originX;
  let y = state.originY;
  if (state.dirX < 0) x += originSpan.w - span.w;
  if (state.dirY < 0) y += originSpan.h - span.h;

  return {
    x: clamp(x, 0, WIDGET_COLUMNS - span.w),
    y: clamp(y, 0, Math.max(0, state.maxBottom - span.h)),
    size,
    ...span,
  };
}

function toLayout(list: WidgetRecord[]): LayoutWidget[] {
  return list.map((widget) => ({
    id: widget.id,
    size: widget.size,
    positionX: widget.positionX,
    positionY: widget.positionY,
  }));
}

function applyLayout(list: WidgetRecord[], layout: LayoutWidget[]): WidgetRecord[] {
  const byId = new Map(layout.map((entry) => [entry.id, entry]));
  return list.map((widget) => {
    const entry = byId.get(widget.id);
    return entry
      ? {
          ...widget,
          size: entry.size,
          positionX: entry.positionX,
          positionY: entry.positionY,
        }
      : widget;
  });
}

function normalized(list: WidgetRecord[], columns: number): WidgetRecord[] {
  const base = toLayout(list);
  const placements = resolveLayout(base, columns);
  return applyLayout(
    list,
    base.map((entry) => ({
      ...entry,
      positionX: placements.get(entry.id)?.x ?? entry.positionX,
      positionY: placements.get(entry.id)?.y ?? entry.positionY,
    })),
  );
}

export function WidgetGrid({
  initialWidgets,
  background,
  autoCatchUp = true,
  models,
  agents,
  connectedApps,
  appAccounts,
}: {
  initialWidgets: WidgetRecord[];
  background?: DashboardAppearance | null;
  /** Model list offered by each widget's "Edit with AI". */
  models?: AgentModelCatalog;
  /**
   * This dashboard's agents. Every board keeps its own team, so “Edit with
   * agent” resolves against these instead of the widget's stored agent id,
   * which can belong to a dashboard the owner is no longer looking at.
   */
  agents?: AgentSummary[];
  /** Off for previews and tests: the catch-up action needs a signed-in owner. */
  autoCatchUp?: boolean;
  /** Toolkits with an active account, so app rows can offer Connect. */
  connectedApps?: string[];
  /** Which account sits behind each toolkit, for a connected row's label. */
  appAccounts?: Record<string, AppAccountSummary>;
}) {
  const [widgets, setWidgets] = useState(initialWidgets);
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [catchingUp, setCatchingUp] = useState(false);
  const [columns, setColumns] = useState(WIDGET_COLUMNS);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [customizingId, setCustomizingId] = useState<number | null>(null);
  const [dashboardBackground, setDashboardBackground] = useState(() =>
    normalizeDashboardAppearance(background),
  );

  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const compute = () => setColumns(columnsForWidth(window.innerWidth));
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Overdue widgets catch up when the dashboard is viewed. The action claims
  // them server-side, so a second tab (or a re-mount) does nothing.
  useEffect(() => {
    if (!autoCatchUp || started.current) return;
    started.current = true;

    void (async () => {
      setCatchingUp(true);
      try {
        const result = await catchUpWidgetsAction();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (result.widgets.length > 0) {
          const updated = new Map(result.widgets.map((widget) => [widget.id, widget]));
          setWidgets((current) =>
            current.map((widget) => {
              const fresh = updated.get(widget.id);
              return fresh ? { ...widget, ...fresh } : widget;
            }),
          );
        }
      } catch (catchUpError) {
        console.error("[widgets] catch-up request failed", catchUpError);
        setError("Widget catch-up didn't finish. Use Update now on a widget to retry.");
      } finally {
        setCatchingUp(false);
      }
    })();
  }, []);

  const placements = useMemo(() => {
    const base = toLayout(widgets);
    if (columns === WIDGET_COLUMNS) return resolveLayout(base, columns);

    // Below desktop the stored three-column cells are meaningless; stack the
    // cards in their saved reading order with no empty rows.
    const ordered = [...base]
      .sort(
        (a, b) =>
          a.positionY - b.positionY || a.positionX - b.positionX || a.id - b.id,
      )
      .map((entry, index) => ({ ...entry, positionX: 0, positionY: index }));
    return resolveLayout(ordered, columns);
  }, [widgets, columns]);

  const gridBottom = useMemo(
    () =>
      widgets.reduce(
        (bottom, widget) =>
          Math.max(bottom, widget.positionY + WIDGET_SPANS[widget.size].h),
        4,
      ),
    [widgets],
  );

  const dragPreview = drag ? dragTargetFor(drag) : null;
  const dragMoved = Boolean(drag && (Math.abs(drag.dx) > 3 || Math.abs(drag.dy) > 3));

  const agentCount = useMemo(
    () => new Set(widgets.map((widget) => widget.agentId)).size,
    [widgets],
  );
  const freshest = useMemo(
    () =>
      widgets.reduce((latest, widget) => {
        const stamp = widget.syncedAt ?? widget.updatedAt;
        return stamp > latest ? stamp : latest;
      }, ""),
    [widgets],
  );
  const showDropPreview = Boolean(
    drag &&
      dragPreview &&
      dragMoved &&
      (dragPreview.x !== drag.originX ||
        dragPreview.y !== drag.originY ||
        dragPreview.size !== drag.size),
  );

  const customizing = widgets.find((widget) => widget.id === customizingId) ?? null;

  function replaceWidget(updated: WidgetRecord) {
    setWidgets((current) =>
      current.map((widget) => (widget.id === updated.id ? { ...widget, ...updated } : widget)),
    );
  }

  async function refresh(widget: WidgetRecord): Promise<string | null> {
    setError(null);
    const result = await refreshWidgetNowAction({ id: widget.id });
    if (!result.ok) return result.error;
    replaceWidget(result.widget);
    return null;
  }

  async function changeSize(widget: WidgetRecord, size: WidgetSize) {
    if (savingId !== null || widget.locked) return;

    const previous = widgetsRef.current;
    setError(null);
    setSavingId(widget.id);
    setWidgets(
      applyLayout(previous, resizeWidget(toLayout(previous), widget.id, size, columns)),
    );

    try {
      const result = await updateWidgetSizeAction({ id: widget.id, size });
      if (!result.ok) {
        setWidgets(previous);
        setError(result.error);
        return;
      }
      setWidgets(result.widgets);
    } catch (sizeError) {
      console.error("[widgets] size save failed", sizeError);
      setWidgets(previous);
      setError("We couldn't resize that widget. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(widget: WidgetRecord): Promise<string | null> {
    setError(null);
    const removed = widgetsRef.current.find((item) => item.id === widget.id) ?? null;
    setWidgets((current) => current.filter((item) => item.id !== widget.id));

    const result = await deleteWidgetAction({ id: widget.id });
    if (!result.ok) {
      if (removed) {
        const restore = removed;
        setWidgets((current) => {
          if (current.some((item) => item.id === restore.id)) return current;
          return [...current, restore];
        });
      }
      return result.error;
    }
    return null;
  }

  async function duplicate(widget: WidgetRecord) {
    setError(null);
    const result = await duplicateWidgetAction({ id: widget.id });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWidgets((current) => normalized([...current, result.widget], columns));
  }

  async function toggleLock(widget: WidgetRecord) {
    setError(null);
    const result = await setWidgetLockAction({ id: widget.id, locked: !widget.locked });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    replaceWidget(result.widget);
  }

  async function resetDesign(widget: WidgetRecord) {
    setError(null);
    const result = await updateWidgetAppearanceAction({ id: widget.id, appearance: null });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    replaceWidget(result.widget);
  }

  async function commit(state: DragState) {
    if (Math.abs(state.dx) < 4 && Math.abs(state.dy) < 4) return;

    const target = dragTargetFor(state);
    const previous = widgetsRef.current;

    if (state.mode === "move") {
      if (target.x === state.originX && target.y === state.originY) return;

      setSavingId(state.id);
      setWidgets(
        applyLayout(
          previous,
          moveWidget(toLayout(previous), state.id, target.x, target.y, WIDGET_COLUMNS),
        ),
      );

      try {
        const result = await updateWidgetLayoutAction({
          id: state.id,
          x: target.x,
          y: target.y,
        });
        if (!result.ok) {
          setWidgets(previous);
          setError(result.error);
          return;
        }
        setWidgets(result.widgets);
      } catch (moveError) {
        console.error("[widgets] move save failed", moveError);
        setWidgets(previous);
        setError("We couldn't move that widget. Please try again.");
      } finally {
        setSavingId(null);
      }
      return;
    }

    if (
      target.size === state.size &&
      target.x === state.originX &&
      target.y === state.originY
    ) {
      return;
    }

    setSavingId(state.id);
    setWidgets(
      applyLayout(
        previous,
        resizeWidget(toLayout(previous), state.id, target.size, WIDGET_COLUMNS, {
          x: target.x,
          y: target.y,
        }),
      ),
    );

    try {
      const result = await updateWidgetSizeAction({
        id: state.id,
        size: target.size,
        x: target.x,
        y: target.y,
      });
      if (!result.ok) {
        setWidgets(previous);
        setError(result.error);
        return;
      }
      setWidgets(result.widgets);
    } catch (resizeError) {
      console.error("[widgets] resize save failed", resizeError);
      setWidgets(previous);
      setError("We couldn't resize that widget. Please try again.");
    } finally {
      setSavingId(null);
    }
  }

  function beginDrag(
    event: React.PointerEvent,
    widget: WidgetRecord,
    mode: "move" | "resize",
    dirX = 1,
    dirY = 1,
  ) {
    if (savingId !== null || widget.locked || columns !== WIDGET_COLUMNS) return;

    const target = event.target as HTMLElement;
    if (
      mode === "move" &&
      (target.closest("[data-no-drag]") || target.closest("[data-resize-handle]"))
    ) {
      return;
    }

    // Dialogs, menus and popovers opened from a card are React children of that
    // card but live in a portal outside its DOM. Without this guard the handler
    // called preventDefault() on their pointerdown, so a field like the "Edit
    // with AI" prompt could never take focus or text.
    if (!(event.currentTarget as HTMLElement).contains(target)) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = gridRef.current?.getBoundingClientRect();
    const columnWidth = rect ? (rect.width - WIDGET_GAP * (columns - 1)) / columns : 240;
    const maxBottom = Math.max(4, gridBottom + 2);

    const state: DragState = {
      id: widget.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      originX: widget.positionX,
      originY: widget.positionY,
      size: widget.size,
      dirX,
      dirY,
      columnWidth,
      maxBottom,
    };

    dragRef.current = state;
    setDrag(state);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor =
      mode === "move" ? "grabbing" : dirX === dirY ? "nwse-resize" : "nesw-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const next: DragState = {
        ...state,
        dx: (moveEvent.clientX - state.startX) * state.dirX,
        dy: (moveEvent.clientY - state.startY) * state.dirY,
      };
      dragRef.current = next;
      setDrag(next);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };

    const finish = (save: boolean) => {
      cleanup();
      const final = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (save && final) void commit(final);
    };

    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      finish(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
  }

  const backgroundIsCustom = dashboardBackground.background.kind !== "theme";
  const overlay =
    dashboardBackground.background.kind === "image"
      ? (dashboardBackground.background.overlay ?? 45)
      : 0;

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.75rem] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {catchingUp ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[0.68rem] font-medium text-brand-ink ring-1 ring-brand-border">
              <RefreshCw className="size-3 animate-spin" />
              Catching up overdue widgets…
            </p>
          ) : null}
          {savingId !== null ? (
            <p className="inline-flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving layout…
            </p>
          ) : null}
          <p className="hidden items-center gap-1 text-[0.66rem] text-muted-foreground md:flex">
            <span className="font-medium tabular-nums text-foreground">{widgets.length}</span>
            {widgets.length === 1 ? "widget" : "widgets"}
            <span aria-hidden>·</span>
            <span className="font-medium tabular-nums text-foreground">{agentCount}</span>
            {agentCount === 1 ? "agent" : "agents"}
            {freshest ? (
              <>
                <span aria-hidden>·</span>
                updated {relativeUpdated(freshest)}
              </>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <p className="hidden text-[0.62rem] text-muted-foreground lg:block">
            Drag to move · corner to resize · Esc cancels
          </p>
          <DashboardBackgroundButton
            appearance={dashboardBackground}
            onSaved={setDashboardBackground}
          />
        </div>

      </div>

      <div
        className={cn(
          "relative",
          backgroundIsCustom && "isolate overflow-hidden rounded-2xl border border-border/60 p-3",
        )}
        style={backgroundIsCustom ? backgroundStyle(dashboardBackground.background) : undefined}
      >
        {overlay > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: `rgba(0, 0, 0, ${overlay / 100})` }}
          />
        ) : null}

        <div
          ref={gridRef}
          className="relative z-10 grid gap-3.5"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gridAutoRows: `${WIDGET_ROW_HEIGHT}px`,
          }}
        >
          {showDropPreview && dragPreview ? (
            <div
              aria-hidden="true"
              className="pointer-events-none relative z-20 rounded-2xl border-2 border-dashed border-brand-border bg-brand-soft/50"
              style={{
                gridColumn: `${dragPreview.x + 1} / span ${dragPreview.w}`,
                gridRow: `${dragPreview.y + 1} / span ${dragPreview.h}`,
              }}
            >
              <span className="absolute top-2 right-2 rounded-full bg-brand-ink px-2 py-0.5 text-[0.56rem] font-semibold text-brand-on shadow-sm">
                {drag?.mode === "resize"
                  ? `${SIZE_NAMES[dragPreview.size]} · ${dragPreview.w}×${dragPreview.h}`
                  : "Move here"}
              </span>
            </div>
          ) : null}

          {widgets.map((widget) => {
            const placement = placements.get(widget.id) ?? { x: 0, y: 0 };
            const span = spanFor(widget.size, columns);
            const dragging = drag?.id === widget.id;
            const moving = dragging && drag?.mode === "move";
            // Prefer the agent that owns this card, but only if it lives on this
            // dashboard; otherwise hand the edit to this board's first agent.
            const editAgent =
              agents?.find((agent) => agent.id === widget.agentId) ?? agents?.[0] ?? null;

            return (
              <div
                key={widget.id}
                className={cn(
                  "group/card relative h-full min-w-0",
                  !widget.locked && columns === WIDGET_COLUMNS && "cursor-grab active:cursor-grabbing",
                  moving && "z-40",
                  dragging && "will-change-transform",
                )}
                style={{
                  gridColumn: `${placement.x + 1} / span ${span.w}`,
                  gridRow: `${placement.y + 1} / span ${span.h}`,
                  transform: moving
                    ? `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(1.015)`
                    : undefined,
                  transition: dragging ? "none" : "box-shadow 160ms ease",
                  touchAction:
                    !widget.locked && columns === WIDGET_COLUMNS ? "none" : undefined,
                  userSelect: dragging ? "none" : undefined,
                }}
                onPointerDown={(event) => beginDrag(event, widget, "move")}
              >
                <WidgetCard
                  widget={widget}
                  size={widget.size}
                  connectedApps={connectedApps}
                  appAccounts={appAccounts}
                  paused={!widget.refreshEnabled}
                  className={cn("h-full", moving && "shadow-2xl")}
                  actions={
                    <div
                      data-no-drag
                      className="flex items-center opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover/widget:opacity-100"
                    >
                      <WidgetMenu
                        widget={widget}
                        catalog={models}
                        onDelete={() => remove(widget)}
                        onRefresh={() => refresh(widget)}
                        onResize={(size) => void changeSize(widget, size)}
                        resizing={savingId === widget.id}
                        onApplied={replaceWidget}
                        onCustomize={() => setCustomizingId(widget.id)}
                        onDuplicate={() => void duplicate(widget)}
                        onToggleLock={() => void toggleLock(widget)}
                        onResetDesign={() => void resetDesign(widget)}
                        editAgentName={editAgent?.name}
                        editHref={
                          editAgent
                            ? `/dashboard/agents/${editAgent.id}?editWidget=${widget.id}`
                            : undefined
                        }
                      />
                    </div>
                  }
                />

                {widget.locked ? (
                  <span
                    title="Locked"
                    className="absolute bottom-2 left-2 z-30 grid size-5 place-items-center rounded-full bg-card/90 text-muted-foreground ring-1 ring-border"
                  >
                    <Lock className="size-2.5" />
                  </span>
                ) : null}

                {dragging && drag?.mode === "resize" && dragPreview ? (
                  <span className="pointer-events-none absolute top-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-brand-ink px-2 py-0.5 text-[0.58rem] font-semibold text-brand-on shadow-sm">
                    {SIZE_NAMES[dragPreview.size]} · {dragPreview.w}×{dragPreview.h}
                  </span>
                ) : null}

                {!widget.locked && columns === WIDGET_COLUMNS ? (
                  <>
                    {(
                      [
                        { dirX: 1, dirY: 1, cursor: "nwse-resize", corner: "right-1 bottom-1", grip: true },
                        { dirX: -1, dirY: 1, cursor: "nesw-resize", corner: "bottom-1 left-1", grip: false },
                        { dirX: 1, dirY: -1, cursor: "nesw-resize", corner: "top-1 right-1", grip: false },
                        { dirX: -1, dirY: -1, cursor: "nwse-resize", corner: "top-1 left-1", grip: false },
                      ] as const
                    ).map((handle) => (
                      <span
                        key={handle.corner}
                        data-resize-handle
                        aria-hidden="true"
                        title={handle.grip ? "Drag to resize" : undefined}
                        onPointerDown={(event) =>
                          beginDrag(event, widget, "resize", handle.dirX, handle.dirY)
                        }
                        className={cn(
                          "absolute z-30 grid size-5 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100",
                          handle.corner,
                        )}
                        style={{ cursor: handle.cursor, touchAction: "none" }}
                      >
                        {handle.grip ? (
                          <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                            <path
                              d="M7.5 2.5 2.5 7.5M9.5 5.5 5.5 9.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                    ))}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <WidgetCustomizeDrawer
        widget={customizing}
        models={models}
        agents={agents}
        open={customizing !== null}
        onOpenChange={(open) => {
          if (!open) setCustomizingId(null);
        }}
        onSaved={replaceWidget}
        onResize={(size) => {
          if (customizing) void changeSize(customizing, size);
        }}
        onDuplicate={() => {
          if (customizing) void duplicate(customizing);
        }}
      />
    </div>
  );
}

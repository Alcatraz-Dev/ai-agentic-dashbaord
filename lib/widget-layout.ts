/**
 * The dashboard's grid maths.
 *
 * Widgets are placed on a fixed three-column grid on desktop (two on tablets,
 * one on phones). Positions are stored in grid cells, sizes map to column and
 * row spans, and `resolveLayout` pushes anything that collides downwards, so a
 * stored dashboard can never render two cards on top of each other.
 */

import type { WidgetSize } from "@/lib/widget-types";

export const WIDGET_COLUMNS = 3;
/** Row height in px; matches `grid-auto-rows` in the dashboard grid. */
export const WIDGET_ROW_HEIGHT = 80;
export const WIDGET_GAP = 14;

export const WIDGET_SPANS: Record<WidgetSize, { w: number; h: number }> = {
  small: { w: 1, h: 2 },
  medium: { w: 1, h: 3 },
  large: { w: 2, h: 4 },
};

export type LayoutWidget = {
  id: number;
  size: WidgetSize;
  positionX: number;
  positionY: number;
};

export type WidgetPlacement = { x: number; y: number };

export function spanFor(size: WidgetSize, columns: number): { w: number; h: number } {
  const span = WIDGET_SPANS[size] ?? WIDGET_SPANS.medium;
  return { w: Math.min(span.w, columns), h: span.h };
}

export function columnsForWidth(width: number): number {
  if (width >= 1280) return WIDGET_COLUMNS;
  if (width >= 640) return 2;
  return 1;
}

/** Rows a card occupies in total, for placing a duplicate below the grid. */
export function layoutBottom(widgets: LayoutWidget[]): number {
  let bottom = 0;
  for (const widget of widgets) {
    bottom = Math.max(bottom, widget.positionY + WIDGET_SPANS[widget.size].h);
  }
  return bottom;
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

/**
 * Placed cells for every widget. Items are visited top-to-bottom, left-to-right
 * (then by id), each is clamped inside the grid, and one that would collide is
 * pushed down until it fits. Pure: the client previews with it and the server
 * persists with it.
 */
export function resolveLayout(
  widgets: LayoutWidget[],
  columns: number = WIDGET_COLUMNS,
): Map<number, WidgetPlacement> {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const result = new Map<number, WidgetPlacement>();

  const ordered = [...widgets].sort(
    (a, b) =>
      a.positionY - b.positionY ||
      a.positionX - b.positionX ||
      a.id - b.id,
  );

  for (const widget of ordered) {
    const { w, h } = spanFor(widget.size, columns);
    const x = Math.min(Math.max(0, Math.round(widget.positionX)), Math.max(0, columns - w));
    let y = Math.max(0, Math.round(widget.positionY));
    while (placed.some((cell) => overlaps({ x, y, w, h }, cell))) y += 1;
    placed.push({ x, y, w, h });
    result.set(widget.id, { x, y });
  }

  return result;
}

/**
 * Places new cards around cards that already exist, without ever moving the
 * anchors. The templates use it when they add their starter cards to a
 * dashboard that already has some: the existing cells are fixed, each new card
 * keeps its template cell when that cell is free and is pushed down otherwise.
 *
 * `resolveLayout` is the wrong tool here because it re-places the anchors too,
 * and a caller that only persists the new rows would leave an anchor at a cell
 * another card had been moved into.
 */
export function placeAround(
  anchors: LayoutWidget[],
  items: LayoutWidget[],
  columns: number = WIDGET_COLUMNS,
): Map<number, WidgetPlacement> {
  const taken = anchors.map((anchor) => {
    const { w, h } = spanFor(anchor.size, columns);
    return {
      x: Math.min(Math.max(0, Math.round(anchor.positionX)), Math.max(0, columns - w)),
      y: Math.max(0, Math.round(anchor.positionY)),
      w,
      h,
    };
  });

  const result = new Map<number, WidgetPlacement>();
  const ordered = [...items].sort(
    (a, b) =>
      a.positionY - b.positionY || a.positionX - b.positionX || a.id - b.id,
  );

  for (const item of ordered) {
    const { w, h } = spanFor(item.size, columns);
    const x = Math.min(Math.max(0, Math.round(item.positionX)), Math.max(0, columns - w));
    let y = Math.max(0, Math.round(item.positionY));
    while (taken.some((cell) => overlaps({ x, y, w, h }, cell))) y += 1;

    taken.push({ x, y, w, h });
    result.set(item.id, { x, y });
  }

  return result;
}

/** Moves one widget and re-resolves the rest, returning the new stored order. */
export function moveWidget(
  widgets: LayoutWidget[],
  id: number,
  x: number,
  y: number,
  columns: number = WIDGET_COLUMNS,
): LayoutWidget[] {
  const next = widgets.map((widget) =>
    widget.id === id
      ? { ...widget, positionX: Math.max(0, Math.round(x)), positionY: Math.max(0, Math.round(y)) }
      : widget,
  );
  const placements = resolveLayout(next, columns);

  return next.map((widget) => {
    const placement = placements.get(widget.id);
    return placement ? { ...widget, positionX: placement.x, positionY: placement.y } : widget;
  });
}

/** Resizes one widget, optionally moves its origin, and re-flows collisions. */
export function resizeWidget(
  widgets: LayoutWidget[],
  id: number,
  size: WidgetSize,
  columns: number = WIDGET_COLUMNS,
  position?: { x: number; y: number },
): LayoutWidget[] {
  const next = widgets.map((widget) =>
    widget.id === id
      ? {
          ...widget,
          size,
          ...(position
            ? {
                positionX: Math.max(0, Math.round(position.x)),
                positionY: Math.max(0, Math.round(position.y)),
              }
            : {}),
        }
      : widget,
  );
  const placements = resolveLayout(next, columns);

  return next.map((widget) => {
    const placement = placements.get(widget.id);
    return placement ? { ...widget, positionX: placement.x, positionY: placement.y } : widget;
  });
}

"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import {
  isWidgetSize,
  type WidgetEditProposal,
  type WidgetRecord,
  type WidgetSize,
} from "@/lib/widget-types";
import {
  applyWidgetEditForUser,
  deleteWidgetForUser,
  duplicateWidgetForUser,
  getWidgetForUser,
  resizeWidgetForUser,
  setWidgetLockedForUser,
  updateWidgetAppearanceForUser,
  updateWidgetLayoutForUser,
  updateWidgetScheduleForUser,
} from "@/lib/widgets";
import { normalizeScheduleRule } from "@/lib/schedule-rule";
import { syncWidgetScheduleJobs } from "@/lib/schedule-jobs";
import { widgetLimitError } from "@/lib/plan-usage";
import { proposeWidgetEditForUser } from "@/lib/widget-edit-service";
import {
  catchUpWidgetsForUser,
  refreshWidgetForUser,
} from "@/lib/widget-refresh-service";

export type WidgetActionResult =
  | { ok: true }
  | { ok: false; error: string };

function widgetId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Persists a dashboard size switch. The caller updates optimistically. */
export async function updateWidgetSizeAction(input: {
  id: number;
  size: WidgetSize;
  /** Optional origin for a corner resize that opens left/up. */
  x?: number;
  y?: number;
}): Promise<
  { ok: true; widgets: WidgetRecord[] } | { ok: false; error: string }
> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };
  if (!isWidgetSize(input.size)) return { ok: false, error: "That size isn't available." };
  const hasPosition = input.x !== undefined || input.y !== undefined;
  if (hasPosition && (!Number.isFinite(input.x) || !Number.isFinite(input.y))) {
    return { ok: false, error: "That position isn't valid." };
  }

  // Outside the try: an unauthenticated call must redirect, not become a toast.
  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const widgets = await resizeWidgetForUser(
      profile.id,
      id,
      input.size,
      hasPosition ? { x: Number(input.x), y: Number(input.y) } : undefined,
    );
    if (!widgets) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true, widgets };
  } catch (error) {
    console.error("[widgets] size update failed", error);
    return { ok: false, error: "We couldn't resize that widget. Please try again." };
  }
}

/** Drag-and-drop: stores one widget's grid cell and re-flows the neighbours. */
export async function updateWidgetLayoutAction(input: {
  id: number;
  x: number;
  y: number;
}): Promise<
  { ok: true; widgets: WidgetRecord[] } | { ok: false; error: string }
> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return { ok: false, error: "That position isn't valid." };
  }

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const widgets = await updateWidgetLayoutForUser(profile.id, id, {
      x: Math.round(input.x),
      y: Math.round(input.y),
    });
    if (!widgets) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true, widgets };
  } catch (error) {
    console.error("[widgets] layout update failed", error);
    return { ok: false, error: "We couldn't move that widget. Please try again." };
  }
}

/** Saves the appearance drawer's draft for one widget. */
export async function updateWidgetAppearanceAction(input: {
  id: number;
  appearance: unknown;
}): Promise<{ ok: true; widget: WidgetRecord } | { ok: false; error: string }> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const widget = await updateWidgetAppearanceForUser(profile.id, id, input.appearance);
    if (!widget) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true, widget };
  } catch (error) {
    console.error("[widgets] appearance update failed", error);
    return { ok: false, error: "We couldn't save that appearance. Please try again." };
  }
}

/** Lock/unlock one widget against dragging and resizing. */
export async function setWidgetLockAction(input: {
  id: number;
  locked: boolean;
}): Promise<{ ok: true; widget: WidgetRecord } | { ok: false; error: string }> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const widget = await setWidgetLockedForUser(profile.id, id, input.locked);
    if (!widget) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true, widget };
  } catch (error) {
    console.error("[widgets] lock update failed", error);
    return { ok: false, error: "We couldn't update that widget. Please try again." };
  }
}

/** Duplicates one widget below the grid, keeping its look and schedule. */
export async function duplicateWidgetAction(input: {
  id: number;
}): Promise<{ ok: true; widget: WidgetRecord } | { ok: false; error: string }> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  const limitError = await widgetLimitError(profile.id);
  if (limitError) return { ok: false, error: limitError };

  try {
    const widget = await duplicateWidgetForUser(profile.id, id);
    if (!widget) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true, widget };
  } catch (error) {
    console.error("[widgets] duplicate failed", error);
    return { ok: false, error: "We couldn't duplicate that widget. Please try again." };
  }
}

/** "Update now": runs one widget's read-only update and returns the new card. */
export async function refreshWidgetNowAction(input: {
  id: number;
}): Promise<
  { ok: true; widget: WidgetRecord; note: string } | { ok: false; error: string }
> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const result = await refreshWidgetForUser(profile.id, id);
    if (!result.ok) return result;

    revalidatePath("/dashboard");
    return result;
  } catch (error) {
    console.error("[widgets] manual refresh failed", error);
    return { ok: false, error: "We couldn't update that widget. Please try again." };
  }
}

/**
 * Overdue catch-up, triggered when the dashboard is opened. Claims the widgets
 * server-side, so a second tab (or a re-mount) finds nothing left to run.
 */
export async function catchUpWidgetsAction(): Promise<
  { ok: true; widgets: WidgetRecord[] } | { ok: false; error: string }
> {
  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    // One widget per dashboard open: three sequential model calls could hold
    // the request (and the page's catch-up indicator) for minutes. The cron and
    // the next visit pick up the rest.
    const widgets = await catchUpWidgetsForUser(profile.id, 1);
    if (widgets.length > 0) revalidatePath("/dashboard");
    return { ok: true, widgets };
  } catch (error) {
    console.error("[widgets] overdue catch-up failed", error);
    return { ok: false, error: "We couldn't catch up the overdue widgets." };
  }
}

/** "Edit with AI": asks the agent for a reviewed change; writes nothing. */
export async function requestWidgetEditAction(input: {
  id: number;
  request: string;
}): Promise<
  { ok: true; proposal: WidgetEditProposal } | { ok: false; error: string }
> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    return await proposeWidgetEditForUser(profile.id, id, input.request);
  } catch (error) {
    console.error("[widgets] edit request failed", error);
    return { ok: false, error: "We couldn't prepare that change. Please try again." };
  }
}

/** Applies a reviewed edit — only after the owner clicks Apply. */
export async function applyWidgetEditAction(input: {
  widgetId: number;
  edit: unknown;
}): Promise<{ ok: true; widget: WidgetRecord } | { ok: false; error: string }> {
  const id = widgetId(input.widgetId);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const widget = await applyWidgetEditForUser(profile.id, id, input.edit);
    if (!widget) return { ok: false, error: "That widget could not be found." };

    // A reviewed edit can change the refresh cadence; keep the Jobs schedule in
    // step before the card is shown as saved.
    if (
      typeof input.edit === "object" &&
      input.edit !== null &&
      "refreshMinutes" in input.edit
    ) {
      await syncWidgetScheduleJobs(widget.id).catch((error) =>
        console.error("[widgets] could not sync the edited schedule to Jobs", error),
      );
    }

    revalidatePath("/dashboard");
    return { ok: true, widget: (await getWidgetForUser(profile.id, id)) ?? widget };
  } catch (error) {
    console.error("[widgets] apply edit failed", error);
    return { ok: false, error: "We couldn't apply that change. Please try again." };
  }
}

/** Pause/resume or change one widget's automatic update rule. */
export async function updateWidgetScheduleAction(input: {
  id: number;
  rule?: unknown;
  enabled?: boolean;
}): Promise<{ ok: true; widget: WidgetRecord } | { ok: false; error: string }> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const current = await getWidgetForUser(profile.id, id);
    if (!current) return { ok: false, error: "That widget could not be found." };

    const widget = await updateWidgetScheduleForUser(profile.id, id, {
      rule: input.rule ? normalizeScheduleRule(input.rule, current.scheduleRule) : current.scheduleRule,
      enabled: input.enabled ?? current.refreshEnabled,
    });
    if (!widget) return { ok: false, error: "That widget could not be found." };

    await syncWidgetScheduleJobs(widget.id).catch((error) =>
      console.error("[widgets] could not sync the update schedule to Jobs", error),
    );

    revalidatePath("/dashboard");
    return { ok: true, widget: (await getWidgetForUser(profile.id, id)) ?? widget };
  } catch (error) {
    console.error("[widgets] schedule update failed", error);
    return { ok: false, error: "We couldn't change that schedule. Please try again." };
  }
}

/** Deletes one widget, owner-scoped in the query. */
export async function deleteWidgetAction(input: { id: number }): Promise<WidgetActionResult> {
  const id = widgetId(input.id);
  if (!id) return { ok: false, error: "That widget could not be found." };

  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  try {
    const deleted = await deleteWidgetForUser(profile.id, id);
    if (!deleted) return { ok: false, error: "That widget could not be found." };

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[widgets] delete failed", error);
    return { ok: false, error: "We couldn't delete that widget. Please try again." };
  }
}

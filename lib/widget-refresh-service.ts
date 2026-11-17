import "server-only";

import {
  claimOverdueWidgets,
  finishWidgetRefresh,
  getWidgetForUser,
  getWidgetRefreshTarget,
  getWidgetRefreshTargetForUser,
  listDueWidgetRefreshes,
  listWidgetsForAgent,
  reserveWidgetRefresh,
  type WidgetRefreshTarget,
} from "@/lib/widgets";
import type { WidgetPayload, WidgetRecord } from "@/lib/widget-types";
import { runReadOnlyWidgetUpdate } from "@/lib/widget-refresh";

/**
 * Runs a widget's read-only update and records the outcome.
 *
 * Every path — the cron tick, CloudHike Jobs, "Update now" and the dashboard
 * catch-up — goes through here, so a widget has one refresh behaviour and one
 * real history. A failed update keeps the last good data and records an error.
 */

const FAILED_NOTE = "Update failed; the last data was kept.";
const DUPLICATE_NOTE = "No change since the last update.";

/** Why an update ran: shown in the history next to its result. */
export type WidgetRefreshTrigger = "schedule" | "manual" | "agent" | "catchup";

/** Runs in flight, so a catch-up and a cron tick can't update one widget twice. */
const runningWidgets = new Set<number>();

function canonical(value: WidgetPayload | null | undefined): string {
  if (!value) return "";
  const normalize = (items: unknown[] | undefined) =>
    (items ?? []).map((item) => JSON.stringify(item)).join("|");
  return [normalize(value.metrics), normalize(value.series), normalize(value.items), value.footnote ?? ""].join("#");
}

/** True when a read-only run returned exactly what the widget already shows. */
function isDuplicate(target: WidgetRefreshTarget, data: WidgetPayload | undefined): boolean {
  if (!data) return false;
  return canonical(target.data) === canonical(data);
}

async function execute(
  target: WidgetRefreshTarget,
  trigger: WidgetRefreshTrigger = "schedule",
): Promise<{ ok: true; note: string; duplicate: boolean } | { ok: false; error: string }> {
  if (runningWidgets.has(target.id)) {
    return { ok: false, error: "That widget is already updating." };
  }

  runningWidgets.add(target.id);
  const startedAt = Date.now();

  try {
    const outcome = await runReadOnlyWidgetUpdate(target);
    const duplicate = isDuplicate(target, outcome.data);

    await finishWidgetRefresh(target.id, {
      ...outcome,
      // A duplicate is recorded but not delivered again: the stored data, its
      // timestamp and the card stay exactly as they were.
      data: duplicate ? undefined : outcome.data,
      note: duplicate ? DUPLICATE_NOTE : outcome.note,
      duplicate,
      trigger,
      durationMs: Date.now() - startedAt,
    });

    return { ok: true, note: duplicate ? DUPLICATE_NOTE : outcome.note, duplicate };
  } catch (error) {
    console.error(`[widgets] refresh failed for widget ${target.id}`, error);
    await finishWidgetRefresh(target.id, {
      status: "error",
      note: FAILED_NOTE,
      trigger,
      durationMs: Date.now() - startedAt,
    }).catch((recordError) =>
      console.error("[widgets] could not record a refresh failure", recordError),
    );
    return { ok: false, error: FAILED_NOTE };
  } finally {
    runningWidgets.delete(target.id);
  }
}

export type WidgetRefreshResult =
  | { ok: true; widget: WidgetRecord; note: string }
  | { ok: false; error: string };

/** "Update now": owner-scoped, waits for the update, returns the new card. */
export async function refreshWidgetForUser(
  profileId: number,
  widgetId: number,
): Promise<WidgetRefreshResult> {
  const target = await getWidgetRefreshTargetForUser(profileId, widgetId);
  if (!target) return { ok: false, error: "That widget could not be found." };

  const result = await execute(target, "manual");
  if (!result.ok) return result;

  const widget = await getWidgetForUser(profileId, target.id);
  if (!widget) return { ok: false, error: "That widget could not be found." };

  return { ok: true, widget, note: result.note };
}

/** Scheduled/Jobs path: no browser session, so the row is loaded by id. */
export async function refreshWidgetById(
  widgetId: number,
  trigger: WidgetRefreshTrigger = "schedule",
): Promise<{ ok: boolean; note: string }> {
  const target = await getWidgetRefreshTarget(widgetId);
  if (!target) return { ok: false, note: "That widget could not be found." };

  const result = await execute(target, trigger);
  return { ok: result.ok, note: result.ok ? result.note : result.error };
}

/**
 * Refreshes this agent's widgets after one of its scheduled tasks ran.
 *
 * A schedule can produce the numbers a widget shows, so waiting for the
 * widget's own Jobs cron would leave the card stale. Failures keep the last
 * good data, exactly like a scheduled refresh. Bounded so one agent run cannot
 * spend its whole Jobs timeout updating cards.
 */
export async function refreshWidgetsForAgent(
  profileId: number,
  agentId: number,
  limit = 2,
): Promise<number> {
  const widgets = await listWidgetsForAgent(profileId, agentId);
  let refreshed = 0;

  for (const widget of widgets.slice(0, Math.max(1, limit))) {
    const result = await refreshWidgetById(widget.id, "agent");
    if (result.ok) refreshed += 1;
  }

  return refreshed;
}

/**
 * Overdue catch-up when the dashboard is opened. Claims first, so a second tab
 * (or React's double mount) sees nothing left to do, then refreshes up to
 * `limit` widgets and hands back the updated records.
 */
export async function catchUpWidgetsForUser(
  profileId: number,
  limit = 3,
): Promise<WidgetRecord[]> {
  const claimed = await claimOverdueWidgets(profileId, limit);
  if (claimed.length === 0) return [];

  const updated: WidgetRecord[] = [];

  // Sequential: a burst of refreshes hits the same model endpoint.
  for (const row of claimed) {
    const target = await getWidgetRefreshTargetForUser(profileId, row.id);
    if (!target) continue;

    await execute(target, "catchup");

    // Return the row whether the update succeeded or failed: a failure sets
    // `last_refresh_status = error`, which is the card's only feedback that the
    // catch-up ran. Returning only successes left the old timestamp on screen.
    const widget = await getWidgetForUser(profileId, row.id);
    if (widget) updated.push(widget);
  }

  return updated;
}

/**
 * The cron tick: claims due widgets and runs them. The caller decides whether
 * Jobs takes each one instead; this is the inline path used when Jobs is not
 * configured.
 */
export async function refreshDueWidgets(limit = 3): Promise<number> {
  const due = await listDueWidgetRefreshes(limit);
  let ran = 0;

  for (const row of due) {
    // Claim the slot first, so a second tick can't run the same widget.
    if (!(await reserveWidgetRefresh(row.id))) continue;

    const result = await refreshWidgetById(row.id, "schedule");
    if (result.ok) ran += 1;
  }

  return ran;
}

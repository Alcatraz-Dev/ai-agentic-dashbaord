import "server-only";

import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";

import { deleteJobsSchedule } from "@/lib/jobs";
import { nextRunForRule, scheduleRuleFromCron, type ScheduleRule } from "@/lib/schedule-rule";
import {
  DEFAULT_WIDGET_APPEARANCE,
  isDefaultWidgetAppearance,
  normalizeWidgetAppearance,
} from "@/lib/widget-appearance";
import {
  WIDGET_COLUMNS,
  layoutBottom,
  placeAround,
  resolveLayout,
  type LayoutWidget,
} from "@/lib/widget-layout";
import {
  DEFAULT_WIDGET_REFRESH_CRON,
  nextWidgetRefreshAfter,
  widgetRefreshMinutes,
  widgetScheduleRule,
  widgetScheduleValues,
} from "@/lib/widget-schedule";
import { getDashboardStarters } from "@/lib/dashboard-starters";

import { agents, dashboards, db, users, widgetRefreshRuns, widgets } from "@/db";
import {
  effectiveWidgetForm,
  isWidgetIllustrationKey,
  normalizeWidgetEdit,
  mergeWidgetData,
  widgetDesignComboUsed,
  widgetFormSupported,
  type WidgetDesignOption,
  type WidgetEdit,
  type WidgetPayload,
  type WidgetProposal,
  type WidgetRecord,
  type WidgetRefreshRun,
  type WidgetSize,
} from "@/lib/widget-types";

/**
 * Widget storage and the data side of their refresh schedule.
 *
 * Every read is scoped to the signed-in owner in the query itself, so a widget
 * id from another account simply matches no row. The agent tools and the HTTP
 * route share these helpers. The unattended refresher loads a row by id only
 * because the cron/Jobs worker has no browser session; it still writes nothing
 * but `data` and the refresh bookkeeping.
 */

const recordColumns = {
  id: widgets.id,
  agentId: widgets.agentId,
  title: widgets.title,
  subtitle: widgets.subtitle,
  icon: widgets.icon,
  illustration: widgets.illustration,
  design: widgets.design,
  chart: widgets.chart,
  form: widgets.form,
  data: widgets.data,
  size: widgets.size,
  positionX: widgets.positionX,
  positionY: widgets.positionY,
  appearance: widgets.appearance,
  locked: widgets.locked,
  sourcePrompt: widgets.sourcePrompt,
  refreshMinutes: widgets.refreshMinutes,
  refreshCron: widgets.refreshCron,
  refreshTimezone: widgets.refreshTimezone,
  scheduleFrequency: widgets.scheduleFrequency,
  scheduleTimes: widgets.scheduleTimes,
  scheduleWeekday: widgets.scheduleWeekday,
  scheduleMonthDay: widgets.scheduleMonthDay,
  scheduleDate: widgets.scheduleDate,
  scheduleIntervalMinutes: widgets.scheduleIntervalMinutes,
  refreshEnabled: widgets.refreshEnabled,
  jobsScheduleId: widgets.jobsScheduleId,
  jobsError: widgets.jobsError,
  nextRefreshAt: widgets.nextRefreshAt,
  lastRefreshAt: widgets.lastRefreshAt,
  lastRefreshStatus: widgets.lastRefreshStatus,
  lastRefreshNote: widgets.lastRefreshNote,
  updatedAt: widgets.updatedAt,
  syncedAt: widgets.syncedAt,
  agentName: agents.name,
  agentAvatar: agents.avatar,
  agentColor: agents.color,
};

type RecordRow = {
  id: number;
  agentId: number;
  title: string;
  subtitle: string | null;
  icon: string;
  illustration: string;
  design: string;
  chart: string;
  form: string;
  data: WidgetPayload;
  size: string;
  positionX: number;
  positionY: number;
  appearance: WidgetRecord["appearance"];
  locked: boolean;
  sourcePrompt: string | null;
  refreshMinutes: number;
  refreshCron: string;
  refreshTimezone: string | null;
  scheduleFrequency: string;
  scheduleTimes: { hour: number; minute: number }[] | null;
  scheduleWeekday: number;
  scheduleMonthDay: number;
  scheduleDate: string | null;
  scheduleIntervalMinutes: number;
  refreshEnabled: boolean;
  jobsScheduleId: string | null;
  jobsError: string | null;
  nextRefreshAt: Date | null;
  lastRefreshAt: Date | null;
  lastRefreshStatus: string | null;
  lastRefreshNote: string | null;
  updatedAt: Date;
  syncedAt: Date | null;
  agentName: string;
  agentAvatar: string;
  agentColor: string;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function serialize(row: RecordRow): WidgetRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName,
    agentAvatar: row.agentAvatar,
    agentColor: row.agentColor,
    title: row.title,
    subtitle: row.subtitle,
    icon: row.icon as WidgetRecord["icon"],
    illustration: isWidgetIllustrationKey(row.illustration) ? row.illustration : "spark",
    design: row.design as WidgetRecord["design"],
    form: effectiveWidgetForm({
      form: row.form,
      chart: row.chart,
      design: row.design,
      data: row.data,
    }),
    data: row.data,
    size: (row.size === "small" || row.size === "large" ? row.size : "medium") as WidgetSize,
    positionX: row.positionX,
    positionY: row.positionY,
    appearance: row.appearance ? normalizeWidgetAppearance(row.appearance) : null,
    locked: row.locked,
    sourcePrompt: row.sourcePrompt,
    refreshMinutes: row.refreshMinutes,
    scheduleRule: widgetScheduleRule(row),
    refreshCron: row.refreshCron,
    refreshTimezone: row.refreshTimezone,
    refreshEnabled: row.refreshEnabled,
    jobsScheduleId: row.jobsScheduleId,
    jobsError: row.jobsError,
    nextRefreshAt: iso(row.nextRefreshAt),
    lastRefreshAt: iso(row.lastRefreshAt),
    lastRefreshStatus:
      row.lastRefreshStatus === "ok" || row.lastRefreshStatus === "error"
        ? row.lastRefreshStatus
        : null,
    lastRefreshNote: row.lastRefreshNote,
    updatedAt: row.updatedAt.toISOString(),
    syncedAt: iso(row.syncedAt),
  };
}

function baseQuery() {
  return db
    .select(recordColumns)
    .from(widgets)
    .innerJoin(agents, eq(widgets.agentId, agents.id));
}

/**
 * Widgets on one dashboard, oldest first. Without a dashboard id it returns
 * every widget the owner has (the chat's `list_widgets` tool wants that).
 */
export async function listWidgetsForUser(
  profileId: number,
  dashboardId?: number | null,
): Promise<WidgetRecord[]> {
  const scoped = Number.isInteger(dashboardId) && (dashboardId ?? 0) > 0;
  const rows = await baseQuery()
    .where(
      scoped
        ? and(eq(widgets.ownerId, profileId), eq(widgets.dashboardId, dashboardId as number))
        : eq(widgets.ownerId, profileId),
    )
    .orderBy(asc(widgets.positionY), asc(widgets.positionX), asc(widgets.id));

  return rows.map(serialize);
}

/** Widgets created by one agent, used by the strip at the top of its chat. */
export async function listWidgetsForAgent(
  profileId: number,
  agentId: number,
): Promise<WidgetRecord[]> {
  if (!Number.isInteger(agentId) || agentId <= 0) return [];

  const rows = await baseQuery()
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.agentId, agentId)))
    .orderBy(asc(widgets.id));

  return rows.map(serialize);
}

export async function getWidgetForUser(
  profileId: number,
  widgetId: number,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [row] = await baseQuery()
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.id, widgetId)))
    .limit(1);

  return row ? serialize(row) : null;
}

/** Form + style pairs already present on the owner's dashboard. */
export async function listWidgetDesignsForUser(
  profileId: number,
): Promise<{ design: string; form: string }[]> {
  const rows = await db
    .select({
      design: widgets.design,
      form: widgets.form,
      chart: widgets.chart,
      data: widgets.data,
    })
    .from(widgets)
    .where(eq(widgets.ownerId, profileId));

  return rows.map((row) => ({
    design: row.design,
    form: effectiveWidgetForm({
      form: row.form,
      chart: row.chart,
      design: row.design,
      data: row.data,
    }),
  }));
}

/** Whether a new form + style pair is still free on this dashboard. */
export async function isWidgetDesignAvailableForUser(
  profileId: number,
  design: WidgetDesignOption,
): Promise<boolean> {
  const used = await listWidgetDesignsForUser(profileId);
  return !widgetDesignComboUsed(design, used);
}

/**
 * Creates a widget on the owner's dashboard. The agent must belong to the
 * owner, and the chosen design must be one of the two the agent proposed.
 * Every widget starts its own hourly refresh schedule immediately.
 * Returns null when the agent, dashboard or design is not available.
 */
export async function createWidgetForUser(input: {
  profileId: number;
  /** The dashboard the card lands on — never inferred from the owner. */
  dashboardId: number;
  agentId: number;
  proposal: WidgetProposal;
  design: WidgetDesignOption;
  /** Browser IANA zone; the default twice-daily cron runs in this zone. */
  timezone?: string | null;
}): Promise<WidgetRecord | null> {
  const { profileId, dashboardId, agentId, proposal, design } = input;
  const timezone = input.timezone ?? null;
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);
  if (!agent) return null;

  if (!Number.isInteger(dashboardId) || dashboardId <= 0) return null;
  const [dashboard] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, dashboardId), eq(dashboards.ownerId, profileId)))
    .limit(1);
  if (!dashboard) return null;

  if (!widgetFormSupported(proposal.data, design.form)) return null;
  if (!(await isWidgetDesignAvailableForUser(profileId, design))) return null;

  const now = new Date();

  // New widgets land under everything already on the dashboard.
  const existing = await db
    .select({ size: widgets.size, positionY: widgets.positionY })
    .from(widgets)
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.dashboardId, dashboard.id)));
  const positionY = layoutBottom(
    existing.map((widget) => ({
      id: 0,
      size: (widget.size === "small" || widget.size === "large"
        ? widget.size
        : "medium") as WidgetSize,
      positionX: 0,
      positionY: widget.positionY,
    })),
  );

  const [row] = await db
    .insert(widgets)
    .values({
      ownerId: profileId,
      dashboardId: dashboard.id,
      agentId,
      title: proposal.title,
      icon: proposal.icon,
      illustration: proposal.illustration,
      design: design.design,
      chart: design.form,
      form: design.form,
      data: proposal.data,
      size: "medium",
      positionX: 0,
      positionY,
      locked: false,
      sourcePrompt: proposal.sourcePrompt ?? null,
      refreshMinutes: widgetRefreshMinutes(DEFAULT_WIDGET_REFRESH_CRON),
      refreshCron: DEFAULT_WIDGET_REFRESH_CRON,
      refreshTimezone: timezone,
      refreshEnabled: true,
      scheduleFrequency: "daily",
      scheduleTimes: [
        { hour: 8, minute: 0 },
        { hour: 18, minute: 0 },
      ],
      scheduleIntervalMinutes: 720,
      nextRefreshAt: nextWidgetRefreshAfter(DEFAULT_WIDGET_REFRESH_CRON, timezone, now),
    })
    .returning({ id: widgets.id });

  if (!row) throw new Error("The widget insert returned no row.");
  return getWidgetForUser(profileId, row.id);
}

/**
 * A diagram widget: the library row's Archify JSON IR, drawn live on the
 * dashboard. It is paused from the start — a recurring model refresh has nothing
 * to add to a diagram, and the source is edited in the library — so it never
 * spends tokens updating itself.
 */
export async function createDiagramWidgetForUser(input: {
  profileId: number;
  dashboardId: number;
  agentId: number;
  title: string;
  diagramName: string;
  source: string;
  footnote?: string | null;
}): Promise<WidgetRecord | null> {
  const { profileId, dashboardId, agentId } = input;
  if (!Number.isInteger(agentId) || agentId <= 0) return null;

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);
  if (!agent) return null;

  const [dashboard] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, dashboardId), eq(dashboards.ownerId, profileId)))
    .limit(1);
  if (!dashboard) return null;

  const existing = await db
    .select({ size: widgets.size, positionY: widgets.positionY })
    .from(widgets)
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.dashboardId, dashboard.id)));

  const positionY = layoutBottom(
    existing.map((widget) => ({
      id: 0,
      size: (widget.size === "small" || widget.size === "large"
        ? widget.size
        : "medium") as WidgetSize,
      positionX: 0,
      positionY: widget.positionY,
    })),
  );

  const data: WidgetPayload = {
    metrics: [],
    series: [],
    items: [],
    diagram: {
      name: input.diagramName.slice(0, 80),
      source: input.source.slice(0, 20_000),
    },
    ...(input.footnote?.trim() ? { footnote: input.footnote.trim().slice(0, 200) } : {}),
  };

  const [row] = await db
    .insert(widgets)
    .values({
      ownerId: profileId,
      dashboardId: dashboard.id,
      agentId,
      title: input.title.slice(0, 80),
      icon: "layers",
      illustration: "spark",
      design: "diagram:classic",
      chart: "diagram",
      form: "diagram",
      data,
      size: "medium",
      positionX: 0,
      positionY,
      locked: false,
      sourcePrompt: `Diagram: ${input.diagramName}`.slice(0, 400),
      refreshMinutes: widgetRefreshMinutes(DEFAULT_WIDGET_REFRESH_CRON),
      refreshCron: DEFAULT_WIDGET_REFRESH_CRON,
      refreshTimezone: null,
      refreshEnabled: false,
      nextRefreshAt: null,
    })
    .returning({ id: widgets.id });

  if (!row) throw new Error("The diagram widget insert returned no row.");
  return getWidgetForUser(profileId, row.id);
}

/**
 * Seeds a dashboard from its template: the template's own small grid of setup
 * cards, app rows and briefs, never invented metrics. It needs an agent because
 * every widget belongs to the agent that can update it; without one the empty
 * state is the better start. Every card starts paused, because the content is
 * the owner's to act on until the apps behind it are connected.
 *
 * Cards whose title is already on the dashboard are skipped, so applying a
 * template twice (or re-applying it later) never duplicates them, and
 * `maxWidgets` lets the caller respect the plan's remaining allowance.
 */
export async function createStarterWidgetsForUser(input: {
  profileId: number;
  dashboardId: number;
  agentId: number;
  template: string;
  /** How many cards may still be added (the plan's remaining allowance). */
  maxWidgets?: number;
}): Promise<number> {
  const starters = getDashboardStarters(input.template);
  if (starters.length === 0) return 0;

  const { profileId, dashboardId, agentId } = input;
  if (!Number.isInteger(agentId) || agentId <= 0) return 0;

  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.ownerId, profileId)))
    .limit(1);
  if (!agent) return 0;

  const [dashboard] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .where(and(eq(dashboards.id, dashboardId), eq(dashboards.ownerId, profileId)))
    .limit(1);
  if (!dashboard) return 0;

  const existing = await db
    .select({
      title: widgets.title,
      size: widgets.size,
      positionX: widgets.positionX,
      positionY: widgets.positionY,
    })
    .from(widgets)
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.dashboardId, dashboardId)));

  const taken = new Set(existing.map((widget) => widget.title.trim().toLowerCase()));
  const allowance = Number.isFinite(input.maxWidgets)
    ? Math.max(0, Math.floor(input.maxWidgets ?? 0))
    : Number.POSITIVE_INFINITY;

  const pending = starters
    .filter((starter) => !taken.has(starter.title.toLowerCase()))
    .slice(0, allowance);
  if (pending.length === 0) return 0;

  // Place the template's cards around whatever is already on the dashboard.
  // The existing cards are fixed anchors: their stored cells are never moved
  // here, so a new card has to be the one that moves. (Re-resolving the whole
  // board would place an existing card somewhere new in memory and then leave
  // it at its stored cell, which is how two cards ended up in one cell.)
  const anchors: LayoutWidget[] = existing.map((widget, index) => ({
    id: -(index + 1),
    size: normalizeStoredSize(widget.size),
    positionX: widget.positionX,
    positionY: widget.positionY,
  }));
  const placements = placeAround(
    anchors,
    pending.map((starter, index) => ({
      id: index + 1,
      size: starter.size,
      positionX: starter.x,
      positionY: starter.y,
    })),
  );

  let created = 0;

  for (const [index, starter] of pending.entries()) {
    const placement = placements.get(index + 1) ?? { x: starter.x, y: starter.y };

    const [row] = await db
      .insert(widgets)
      .values({
        ownerId: profileId,
        dashboardId,
        agentId,
        title: starter.title,
        icon: starter.icon,
        illustration: starter.illustration,
        design: starter.design,
        chart: starter.form,
        form: starter.form,
        data: starter.data,
        size: starter.size,
        positionX: placement.x,
        positionY: placement.y,
        locked: false,
        sourcePrompt: starter.sourcePrompt ?? null,
        refreshCron: DEFAULT_WIDGET_REFRESH_CRON,
        refreshMinutes: widgetRefreshMinutes(DEFAULT_WIDGET_REFRESH_CRON),
        refreshEnabled: false,
        scheduleFrequency: "daily",
        scheduleTimes: [
          { hour: 8, minute: 0 },
          { hour: 18, minute: 0 },
        ],
        scheduleIntervalMinutes: 720,
        nextRefreshAt: null,
      })
      .returning({ id: widgets.id });

    if (row) created += 1;
  }

  return created;
}

/** Pauses/resumes or changes the automatic update frequency of one widget. */
export async function updateWidgetScheduleForUser(
  profileId: number,
  widgetId: number,
  input: { rule: ScheduleRule; enabled: boolean },
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const now = new Date();
  const rule = input.rule;

  const [updated] = await db
    .update(widgets)
    .set({
      ...widgetScheduleValues(rule),
      refreshEnabled: input.enabled,
      nextRefreshAt: input.enabled ? nextRunForRule(rule, now) : null,
      updatedAt: now,
    })
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .returning({ id: widgets.id });

  return updated ? getWidgetForUser(profileId, widgetId) : null;
}

type WidgetLayoutChange = { size?: WidgetSize; x?: number; y?: number };

function normalizeStoredSize(value: string): WidgetSize {
  return value === "small" || value === "large" ? value : "medium";
}

/**
 * Applies one layout change (size, cell or both) and re-flows every widget, so
 * no two cards can overlap. Positions are persisted per row; the returned list
 * is what the dashboard renders, and the client previews the same maths with
 * `lib/widget-layout.ts` before the write lands.
 */
async function reflowWidgetsForUser(
  profileId: number,
  change: WidgetLayoutChange & { id: number },
): Promise<WidgetRecord[] | null> {
  const [targetRow] = await db
    .select({ dashboardId: widgets.dashboardId })
    .from(widgets)
    .where(and(eq(widgets.id, change.id), eq(widgets.ownerId, profileId)))
    .limit(1);
  if (!targetRow) return null;

  // A layout change only re-flows the dashboard it happened on; the same
  // owner's other dashboards keep their own arrangement.
  const dashboardId = targetRow.dashboardId;
  const rows = await db
    .select({
      id: widgets.id,
      size: widgets.size,
      positionX: widgets.positionX,
      positionY: widgets.positionY,
    })
    .from(widgets)
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.dashboardId, dashboardId)))
    .orderBy(asc(widgets.id));

  const items: LayoutWidget[] = rows.map((row) => ({
    id: row.id,
    size: normalizeStoredSize(row.size),
    positionX: row.positionX,
    positionY: row.positionY,
  }));

  const target = items.find((item) => item.id === change.id)!;
  if (change.size) target.size = change.size;
  if (change.x !== undefined) target.positionX = Math.max(0, Math.round(change.x));
  if (change.y !== undefined) target.positionY = Math.max(0, Math.round(change.y));

  const placements = resolveLayout(items, WIDGET_COLUMNS);
  const byId = new Map(items.map((item) => [item.id, item]));
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const placement = placements.get(row.id);
      const item = byId.get(row.id);
      if (!placement || !item) continue;

      const sizeChanged = item.size !== normalizeStoredSize(row.size);
      if (
        placement.x === row.positionX &&
        placement.y === row.positionY &&
        !sizeChanged
      ) {
        continue;
      }

      await tx
        .update(widgets)
        .set({
          positionX: placement.x,
          positionY: placement.y,
          ...(sizeChanged ? { size: item.size } : {}),
          updatedAt: now,
        })
        .where(and(eq(widgets.id, row.id), eq(widgets.ownerId, profileId)));
    }
  });

  return listWidgetsForUser(profileId, dashboardId);
}

/** Moves one widget to a grid cell and pushes any collision down. */
export async function updateWidgetLayoutForUser(
  profileId: number,
  widgetId: number,
  change: { x: number; y: number },
): Promise<WidgetRecord[] | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;
  return reflowWidgetsForUser(profileId, { id: widgetId, x: change.x, y: change.y });
}

/** Resizes one widget and re-flows the neighbours that it would cover. */
export async function updateWidgetSizeForUser(
  profileId: number,
  widgetId: number,
  size: WidgetSize,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const list = await reflowWidgetsForUser(profileId, { id: widgetId, size });
  if (!list) return null;
  return list.find((widget) => widget.id === widgetId) ?? null;
}

/** Resizes one widget (and optionally anchors it to a new cell) and re-flows. */
export async function resizeWidgetForUser(
  profileId: number,
  widgetId: number,
  size: WidgetSize,
  position?: { x: number; y: number },
): Promise<WidgetRecord[] | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;
  return reflowWidgetsForUser(profileId, { id: widgetId, size, ...position });
}

/** Stores the owner's visual customization, or clears it on a design reset. */
export async function updateWidgetAppearanceForUser(
  profileId: number,
  widgetId: number,
  input: unknown,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const appearance =
    input === null || input === undefined
      ? null
      : isDefaultWidgetAppearance(normalizeWidgetAppearance(input))
        ? null
        : normalizeWidgetAppearance(input);

  const [updated] = await db
    .update(widgets)
    .set({ appearance, updatedAt: new Date() })
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .returning({ id: widgets.id });

  return updated ? getWidgetForUser(profileId, widgetId) : null;
}

/** Locks or unlocks one widget against drag and resize. */
export async function setWidgetLockedForUser(
  profileId: number,
  widgetId: number,
  locked: boolean,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [updated] = await db
    .update(widgets)
    .set({ locked, updatedAt: new Date() })
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .returning({ id: widgets.id });

  return updated ? getWidgetForUser(profileId, widgetId) : null;
}

/** Copies one widget (design, data, appearance and schedule) below the grid. */
export async function duplicateWidgetForUser(
  profileId: number,
  widgetId: number,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [source] = await db
    .select()
    .from(widgets)
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .limit(1);
  if (!source) return null;

  const rows = await db
    .select({ size: widgets.size, positionY: widgets.positionY })
    .from(widgets)
    .where(eq(widgets.ownerId, profileId));

  const positionY = layoutBottom(
    rows.map((row) => ({
      id: 0,
      size: normalizeStoredSize(row.size),
      positionX: 0,
      positionY: row.positionY,
    })),
  );

  const now = new Date();
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    jobsScheduleId: _jobsScheduleId,
    jobsError: _jobsError,
    lastRefreshAt: _lastRefreshAt,
    lastRefreshStatus: _lastRefreshStatus,
    lastRefreshNote: _lastRefreshNote,
    ...rest
  } = source;

  const [row] = await db
    .insert(widgets)
    .values({
      ...rest,
      title: `${source.title} (copy)`.slice(0, 64),
      positionX: source.positionX,
      positionY,
      locked: false,
      jobsScheduleId: null,
      jobsError: null,
      nextRefreshAt: nextWidgetRefreshAfter(source.refreshCron, source.refreshTimezone, now),
      lastRefreshAt: null,
      lastRefreshStatus: null,
      lastRefreshNote: null,
      updatedAt: now,
    })
    .returning({ id: widgets.id });

  return row ? getWidgetForUser(profileId, row.id) : null;
}

export async function deleteWidgetForUser(
  profileId: number,
  widgetId: number,
): Promise<boolean> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return false;

  const [owned] = await db
    .select({ jobsScheduleId: widgets.jobsScheduleId })
    .from(widgets)
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .limit(1);

  if (!owned) return false;

  if (owned.jobsScheduleId) {
    await deleteJobsSchedule(owned.jobsScheduleId).catch((error) =>
      console.error("[widgets] could not delete the Jobs schedule", error),
    );
  }

  const rows = await db
    .delete(widgets)
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .returning({ id: widgets.id });

  return rows.length > 0;
}

/**
 * Applies a reviewed edit. Called only when the owner clicks Apply, so the
 * proposal itself never writes. A schedule change moves the next refresh from
 * now; a data change stamps `syncedAt` like a manual refresh.
 */
export async function applyWidgetEditForUser(
  profileId: number,
  widgetId: number,
  input: unknown,
): Promise<WidgetRecord | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const current = await getWidgetForUser(profileId, widgetId);
  if (!current) return null;

  const edit = normalizeWidgetEdit(
    { ...(typeof input === "object" && input ? input : {}), widgetId },
    current,
  );
  if (!edit) return current;

  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };

  if (edit.title !== undefined) values.title = edit.title;
  if (edit.icon !== undefined) values.icon = edit.icon;
  if (edit.illustration !== undefined) values.illustration = edit.illustration;
  if (edit.design !== undefined) values.design = edit.design;
  if (edit.form !== undefined) {
    values.form = edit.form;
    values.chart = edit.form;
  }
  if (edit.sourcePrompt !== undefined) values.sourcePrompt = edit.sourcePrompt;
  if (edit.data !== undefined) {
    values.data = edit.data;
    values.syncedAt = now;
  }
  if (edit.refreshMinutes !== undefined) {
    const cron =
      edit.refreshMinutes === 30
        ? "*/30 * * * *"
        : edit.refreshMinutes === 60
          ? "0 * * * *"
          : edit.refreshMinutes === 360
            ? "0 */6 * * *"
            : "0 8 * * *";
    const rule = scheduleRuleFromCron(cron, current.refreshTimezone);
    values.refreshMinutes = edit.refreshMinutes;
    values.refreshCron = cron;
    values.scheduleFrequency = rule.frequency;
    values.scheduleTimes = rule.times;
    values.scheduleWeekday = rule.weekday;
    values.scheduleMonthDay = rule.monthDay;
    values.scheduleDate = rule.date;
    values.scheduleIntervalMinutes = rule.intervalMinutes;
    values.nextRefreshAt = nextWidgetRefreshAfter(cron, current.refreshTimezone, now);
  }

  const [updated] = await db
    .update(widgets)
    .set(values)
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .returning({ id: widgets.id });

  return updated ? getWidgetForUser(profileId, widgetId) : null;
}

/** Everything a read-only update needs, loaded either owner-scoped or by id. */
export type WidgetRefreshTarget = {
  id: number;
  ownerId: number;
  agentId: number;
  agentName: string;
  provider: string;
  enabledTools: string[] | null;
  title: string;
  subtitle: string | null;
  sourcePrompt: string | null;
  data: WidgetPayload;
  refreshMinutes: number;
  refreshCron: string;
  refreshTimezone: string | null;
};

const refreshColumns = {
  id: widgets.id,
  ownerId: widgets.ownerId,
  agentId: widgets.agentId,
  agentName: agents.name,
  provider: agents.provider,
  enabledTools: agents.enabledTools,
  title: widgets.title,
  subtitle: widgets.subtitle,
  sourcePrompt: widgets.sourcePrompt,
  data: widgets.data,
  refreshMinutes: widgets.refreshMinutes,
  refreshCron: widgets.refreshCron,
  refreshTimezone: widgets.refreshTimezone,
  scheduleFrequency: widgets.scheduleFrequency,
  scheduleTimes: widgets.scheduleTimes,
  scheduleWeekday: widgets.scheduleWeekday,
  scheduleMonthDay: widgets.scheduleMonthDay,
  scheduleDate: widgets.scheduleDate,
  scheduleIntervalMinutes: widgets.scheduleIntervalMinutes,
};

function toRefreshTarget(row: {
  id: number;
  ownerId: number;
  agentId: number;
  agentName: string;
  provider: string;
  enabledTools: string[] | null;
  title: string;
  subtitle: string | null;
  sourcePrompt: string | null;
  data: WidgetPayload;
  refreshMinutes: number;
  refreshCron: string;
  refreshTimezone: string | null;
}): WidgetRefreshTarget {
  return {
    ...row,
    enabledTools: Array.isArray(row.enabledTools) ? row.enabledTools : null,
  };
}

/** Owner-scoped load used by "Update now" and the dashboard catch-up. */
export async function getWidgetRefreshTargetForUser(
  profileId: number,
  widgetId: number,
): Promise<WidgetRefreshTarget | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [row] = await db
    .select(refreshColumns)
    .from(widgets)
    .innerJoin(agents, eq(widgets.agentId, agents.id))
    .where(and(eq(widgets.id, widgetId), eq(widgets.ownerId, profileId)))
    .limit(1);

  return row ? toRefreshTarget(row) : null;
}

/** Unscoped load for a scheduled/Jobs worker, which has no browser session. */
export async function getWidgetRefreshTarget(
  widgetId: number,
): Promise<WidgetRefreshTarget | null> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return null;

  const [row] = await db
    .select(refreshColumns)
    .from(widgets)
    .innerJoin(agents, eq(widgets.agentId, agents.id))
    .where(eq(widgets.id, widgetId))
    .limit(1);

  return row ? toRefreshTarget(row) : null;
}

/**
 * Widgets whose own cron schedule is due, for the cron tick. A paused
 * workspace contributes nothing, matching the agent schedules.
 */
export async function listDueWidgetRefreshes(
  limit = 3,
): Promise<{ id: number; refreshMinutes: number }[]> {
  const rows = await db
    .select({ id: widgets.id, refreshMinutes: widgets.refreshMinutes })
    .from(widgets)
    .innerJoin(users, eq(users.id, widgets.ownerId))
    .where(
      and(
        eq(users.schedulesPaused, false),
        eq(widgets.refreshEnabled, true),
        // Jobs owns the clock once a widget has a remote schedule; the local
        // due timestamp is only the fallback when it doesn't.
        isNull(widgets.jobsScheduleId),
        or(isNull(widgets.nextRefreshAt), lte(widgets.nextRefreshAt, new Date())),
      ),
    )
    .orderBy(asc(widgets.nextRefreshAt))
    .limit(Math.max(1, Math.min(limit, 10)));

  return rows;
}

/**
 * Claims overdue widgets for a dashboard view. The conditional update moves
 * `next_refresh_at` forward, so two tabs opening at once can't run the same
 * widget twice.
 */
export async function claimOverdueWidgets(
  profileId: number,
  limit = 3,
): Promise<{ id: number; refreshMinutes: number }[]> {
  const now = new Date();
  const due = await db
    .select({
      id: widgets.id,
      refreshMinutes: widgets.refreshMinutes,
      refreshCron: widgets.refreshCron,
      refreshTimezone: widgets.refreshTimezone,
    })
    .from(widgets)
    .where(
      and(
        eq(widgets.ownerId, profileId),
        eq(widgets.refreshEnabled, true),
        isNull(widgets.jobsScheduleId),
        or(isNull(widgets.nextRefreshAt), lte(widgets.nextRefreshAt, now)),
      ),
    )
    .orderBy(asc(widgets.nextRefreshAt))
    .limit(Math.max(1, Math.min(limit, 6)));

  const claimed: { id: number; refreshMinutes: number }[] = [];

  for (const row of due) {
    const [updated] = await db
      .update(widgets)
      .set({
        nextRefreshAt: nextWidgetRefreshAfter(
          row.refreshCron,
          row.refreshTimezone,
          new Date(now.getTime() + 60_000),
        ),
        updatedAt: now,
      })
      .where(
        and(
          eq(widgets.id, row.id),
          eq(widgets.ownerId, profileId),
          or(isNull(widgets.nextRefreshAt), lte(widgets.nextRefreshAt, now)),
        ),
      )
      .returning({ id: widgets.id });

    if (updated) claimed.push(row);
  }

  return claimed;
}

/**
 * Moves a due widget forward before a Jobs worker takes it, so the next tick
 * doesn't queue a second update for the same slot.
 */
export async function reserveWidgetRefresh(widgetId: number): Promise<boolean> {
  const [row] = await db
    .select({
      id: widgets.id,
      refreshCron: widgets.refreshCron,
      refreshTimezone: widgets.refreshTimezone,
    })
    .from(widgets)
    .where(eq(widgets.id, widgetId))
    .limit(1);

  if (!row) return false;

  await db
    .update(widgets)
    .set({
      nextRefreshAt: nextWidgetRefreshAfter(
        row.refreshCron,
        row.refreshTimezone,
        new Date(Date.now() + 60_000),
      ),
      updatedAt: new Date(),
    })
    .where(eq(widgets.id, widgetId));

  return true;
}

export type WidgetRefreshOutcome = {
  /** \"ok\" when the update ran, \"error\" when it couldn't. */
  status: "ok" | "error";
  note: string;
  /** Only when the read-only run actually produced new data. */
  data?: WidgetPayload;
  /** What started it: schedule, manual, agent or catchup. */
  trigger?: string;
  /** True when the read-only run drove the cloud browser. */
  browserUsed?: boolean;
  /** True when the data matched what is stored, so nothing was re-delivered. */
  duplicate?: boolean;
  durationMs?: number;
};

/**
 * Records one refresh run and updates the widget's bookkeeping. A run without
 * `data` keeps the last good numbers — the read-only update can fail without
 * blanking what the owner already sees. Data that arrives is merged, so a field
 * the update didn't cover keeps its stored value.
 */
export async function finishWidgetRefresh(
  widgetId: number,
  outcome: WidgetRefreshOutcome,
): Promise<void> {
  if (!Number.isInteger(widgetId) || widgetId <= 0) return;

  const now = new Date();
  const [row] = await db
    .select({
      refreshMinutes: widgets.refreshMinutes,
      refreshCron: widgets.refreshCron,
      refreshTimezone: widgets.refreshTimezone,
      data: widgets.data,
    })
    .from(widgets)
    .where(eq(widgets.id, widgetId))
    .limit(1);

  const note = outcome.note.slice(0, 300);
  const merged = outcome.data
    ? mergeWidgetData(row?.data ?? { metrics: [], series: [], items: [] }, outcome.data)
    : null;

  await db.insert(widgetRefreshRuns).values({
    widgetId,
    status: outcome.status,
    note,
    trigger: outcome.trigger ?? "schedule",
    browserUsed: outcome.browserUsed ?? false,
    duplicate: outcome.duplicate ?? false,
    durationMs: outcome.durationMs ?? null,
  });

  await db
    .update(widgets)
    .set({
      lastRefreshAt: now,
      lastRefreshStatus: outcome.status,
      lastRefreshNote: note,
      nextRefreshAt: nextWidgetRefreshAfter(
        row?.refreshCron ?? DEFAULT_WIDGET_REFRESH_CRON,
        row?.refreshTimezone ?? null,
        new Date(now.getTime() + 60_000),
      ),
      updatedAt: now,
      ...(merged ? { data: merged, syncedAt: now } : {}),
    })
    .where(eq(widgets.id, widgetId));
}

/** Real refresh runs for the widgets one agent created, newest first. */
export async function listWidgetRefreshRuns(
  profileId: number,
  agentId: number,
  limit = 8,
): Promise<WidgetRefreshRun[]> {
  if (!Number.isInteger(agentId) || agentId <= 0) return [];

  const rows = await db
    .select({
      id: widgetRefreshRuns.id,
      widgetId: widgetRefreshRuns.widgetId,
      widgetTitle: widgets.title,
      status: widgetRefreshRuns.status,
      note: widgetRefreshRuns.note,
      trigger: widgetRefreshRuns.trigger,
      browserUsed: widgetRefreshRuns.browserUsed,
      duplicate: widgetRefreshRuns.duplicate,
      durationMs: widgetRefreshRuns.durationMs,
      createdAt: widgetRefreshRuns.createdAt,
    })
    .from(widgetRefreshRuns)
    .innerJoin(widgets, eq(widgets.id, widgetRefreshRuns.widgetId))
    .where(and(eq(widgets.ownerId, profileId), eq(widgets.agentId, agentId)))
    .orderBy(desc(widgetRefreshRuns.id))
    .limit(Math.max(1, Math.min(limit, 25)));

  return rows.map((row) => ({
    id: row.id,
    widgetId: row.widgetId,
    widgetTitle: row.widgetTitle,
    status: row.status === "error" ? "error" : "ok",
    note: row.note,
    trigger: row.trigger,
    browserUsed: row.browserUsed,
    duplicate: row.duplicate,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
  }));
}

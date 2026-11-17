import "server-only";

import { randomUUID } from "node:crypto";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import {
  normalizeWidgetEdit,
  normalizeWidgetProposal,
  widgetText,
  WIDGET_ICON_KEYS,
  WIDGET_ILLUSTRATION_KEYS,
  WIDGET_LIMITS,
} from "@/lib/widget-types";
import { getTemplateBlueprint, templateStarterCount } from "@/lib/dashboard-starters";
import { widgetLimitError } from "@/lib/plan-usage";
import { getWidgetForUser, listWidgetDesignsForUser, listWidgetsForUser } from "@/lib/widgets";

/**
 * Widget tools.
 *
 * The agent has no power to put pixels on the dashboard: it can *offer* a
 * widget, *propose* one with data and two to four finished styles, or *propose
 * an edit* for review. The owner's click creates or applies every change; no
 * tool writes a widget row itself.
 */

export const widgetMetricSchema = z.object({
  label: z.string().max(40).describe("Short label, e.g. “Open tickets”."),
  value: z.string().max(24).describe("The headline number or text, e.g. “1,284” or “98.2%”."),
  delta: z.string().max(24).optional().describe("Optional change, e.g. “+12.4%” or “-3”."),
  trend: z.enum(["up", "down", "flat"]).optional().describe("Direction the delta represents."),
});

export const widgetPointSchema = z.object({
  label: z.string().max(20).describe("Axis label, e.g. “Mon” or “W1”."),
  value: z.number().describe("Numeric value for the chart."),
});

export const widgetItemSchema = z.object({
  title: z.string().max(80).describe("One row's name."),
  meta: z.string().max(48).optional().describe("Short secondary text, e.g. a status, time or owner."),
  tone: z.enum(["neutral", "positive", "warning"]).optional(),
  value: z
    .string()
    .max(20)
    .optional()
    .describe("A per-row figure, e.g. “$1,280”, “12” or “98%”. Real values only."),
  delta: z.string().max(18).optional().describe("A per-row change, e.g. “+12.4%”."),
  trend: z.enum(["up", "down", "flat"]).optional().describe("Direction the row's delta represents."),
  status: z
    .string()
    .max(20)
    .optional()
    .describe("A short state label, e.g. “Running”, “Blocked” or “Sent”."),
  done: z.boolean().optional().describe("Checklist rows: whether the task is complete."),
  logo: z
    .string()
    .max(32)
    .optional()
    .describe(
      "App or brand slug for a row logo, e.g. “slack”, “gmail” or “notion”. Lowercase letters, digits, dash, underscore or dot only.",
    ),
  spark: z
    .array(z.number())
    .max(WIDGET_LIMITS.itemSpark)
    .optional()
    .describe(
      "An optional per-row micro-series for a sparkline: real points in order, at least two. Omit when there is no real series for that row.",
    ),
});

/** The data shape the model fills in for a widget. Shared with the syncer. */
const iconSchema = z.enum(WIDGET_ICON_KEYS);

export const widgetDataParameters = z.object({
  metrics: z
    .array(widgetMetricSchema)
    .max(WIDGET_LIMITS.metrics)
    .default([])
    .describe(
      "Headline numbers, most important first. Omit the ones the source doesn't provide; the widget keeps its previous metrics when this is empty.",
    ),
  series: z
    .array(widgetPointSchema)
    .max(WIDGET_LIMITS.series)
    .default([])
    .describe(
      "Real points in order. Point forms need at least three; a single point is a number, not a chart. Empty if the source has no series.",
    ),
  items: z
    .array(widgetItemSchema)
    .max(WIDGET_LIMITS.items)
    .default([])
    .describe(
      "Rows for list, checklist, inbox, agenda and briefing forms. Empty for a numbers-only widget; empty also keeps the stored rows.",
    ),
  goals: z
    .array(
      z.object({
        label: z.string().max(28).describe("What the target is."),
        value: z.number().describe("How far along it is, in the target's unit."),
        target: z.number().describe("The target itself, greater than zero."),
      }),
    )
    .max(WIDGET_LIMITS.goals)
    .optional()
    .describe(
      "Tracked targets for the rings, dials and meters forms. Real progress only; omit when there is no target to measure against.",
    ),
  figureIcon: iconSchema
    .optional()
    .describe("Icon key shown beside the headline figure in figure layouts."),
  footnote: z
    .string()
    .max(WIDGET_LIMITS.footnote)
    .optional()
    .describe("Optional short caption, e.g. the period covered."),
});

const designSchema = z.enum([
  "classic",
  "illustrated",
  "pop",
  "glass",
  "neon",
  "editorial",
  "clean",
  "minimalist",
  "retro",
  "tech",
  "luxury",
  "organic",
  "paper",
  "candy",
  "noir",
  "blueprint",
  "terminal",
]);

const formSchema = z.enum([
  "number",
  "trend",
  "bars",
  "heat",
  "gauge",
  "waffle",
  "ranking",
  "split",
  "tiles",
  "feed",
  "podium",
  "timeline",
  "scene",
  "kpi",
  "rows",
  "checklist",
  "inbox",
  "news",
  "activity",
  "agenda",
  "forecast",
  "rings",
  "dials",
  "meters",
  "donut",
  "briefing",
]);

const illustrationSchema = z.enum(WIDGET_ILLUSTRATION_KEYS);
const refreshSchema = z.union([
  z.literal(30),
  z.literal(60),
  z.literal(360),
  z.literal(1440),
]);

const suggestParameters = z.object({
  title: z.string().max(WIDGET_LIMITS.title).describe("What the widget would be called."),
  reason: z
    .string()
    .max(180)
    .describe("One sentence on why this information belongs on the dashboard."),
});

const proposeParameters = z.object({
  title: z.string().max(WIDGET_LIMITS.title),
  icon: iconSchema.describe("Icon key that fits the subject."),
  illustration: illustrationSchema
    .optional()
    .describe(
      "Colorful illustration for the illustrated style. Omit to let the app pick one that fits the icon.",
    ),
  sourcePrompt: z
    .string()
    .max(WIDGET_LIMITS.sourcePrompt)
    .optional()
    .describe(
      "What this widget tracks, in your own words, including where to read it. Every widget re-reads this on its own schedule, so be concrete about the numbers and the source.",
    ),
  data: widgetDataParameters,
  options: z
    .array(z.object({ design: designSchema, form: formSchema }))
    .min(2)
    .max(4)
    .describe(
      "Two to four looks. Each pairs a different form (what the data supports) with a style (classic, illustrated, pop, glass, neon, editorial, clean, minimalist, retro, tech, luxury, organic). Every option must use a different style, and the forms must come from different layout families when the data allows: figure (number, tiles, scene), chart (trend, bars, heat, kpi, forecast), share (gauge, waffle, split, donut, rings, dials, meters), list (ranking, feed, rows, checklist, inbox, activity, agenda), rank (podium), grid (news, briefing) or timeline. Never repeat a form + style already on the dashboard.",
    ),
});

const listParameters = z.object({});

const LAYOUT_TEMPLATES = ["creator", "daily", "business", "developer", "research"] as const;

const proposeLayoutParameters = z.object({
  template: z
    .enum(LAYOUT_TEMPLATES)
    .describe(
      "Which starting layout to suggest: creator (audience and publishing), daily (today view), business (revenue and pipeline), developer (reviews, checks, errors) or research (sources and digests).",
    ),
  reason: z
    .string()
    .max(180)
    .optional()
    .describe("One sentence on why this layout fits the owner's work."),
});

/** Shared with the dashboard's focused edit runner. */
export const widgetEditParameters = z.object({
  widgetId: z.number().int().describe("The stored widget id from list_widgets."),
  summary: z
    .string()
    .max(WIDGET_LIMITS.editSummary)
    .describe("One short sentence describing the change, shown on the review card."),
  title: z.string().max(WIDGET_LIMITS.title).optional(),
  icon: iconSchema.optional(),
  illustration: illustrationSchema.optional(),
  design: designSchema.optional(),
  form: formSchema.optional(),
  data: widgetDataParameters
    .optional()
    .describe("Send the complete new data, not a fragment."),
  sourcePrompt: z.string().max(WIDGET_LIMITS.sourcePrompt).optional(),
  refreshMinutes: refreshSchema
    .optional()
    .describe("Refresh cadence: 30 (30m), 60 (hourly), 360 (6h) or 1440 (daily)."),
});

function noOwner(): string {
  return "This chat has no signed-in owner, so widgets aren't available. Ask the user to reload and try again.";
}

const suggestWidget = tool<typeof suggestParameters, AgentToolRunState>({
  name: "suggest_widget",
  description:
    "Offer to turn the information you just produced into a live dashboard widget. The chat shows a card with 'Create widget' and 'Not now'. Call this once, after your answer is written, when a persistent visual would genuinely help; do not call it for every reply.",
  parameters: suggestParameters,
  execute: async ({ title, reason }, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state) return noOwner();

    const cleanTitle = widgetText(title, WIDGET_LIMITS.title);
    if (!cleanTitle) return "Give the widget a short title.";

    state.widgetOffers.push({
      id: randomUUID(),
      title: cleanTitle,
      reason: widgetText(reason, 180) || "This would be easier to follow as a live widget.",
    });

    return "The offer card is on screen with Create widget / Not now. Stop here and let the user decide; do not create anything yet.";
  },
});

const proposeWidget = tool<typeof proposeParameters, AgentToolRunState>({
  name: "propose_widget",
  description:
    "Show two to four finished widget designs for the user to choose from, each in a different style and, when the data allows, a different layout family. Call this only after the user accepted a widget suggestion or explicitly asked for a widget. Fill in real data from the conversation; never invent numbers. The app creates the widget when the user picks a design, so do not claim it was added.",
  parameters: proposeParameters,
  execute: async (input, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return noOwner();

    // A full dashboard must not collect more proposals: the picker would only
    // fail at creation time. Tell the owner before showing any designs.
    const limitError = await widgetLimitError(state.ownerId);
    if (limitError) {
      return `${limitError} Do not show widget designs; tell the owner they need to upgrade or delete a widget first.`;
    }

    const used = await listWidgetDesignsForUser(state.ownerId);
    const proposal = normalizeWidgetProposal(input, used);
    if (!proposal) {
      return "That proposal couldn't be shown. Keep the title, at least one metric/series/item/goal, and two form + style pairs the data supports from different layout families where possible; do not repeat a form + style already on the dashboard.";
    }

    // The strip and the user must be able to tell the options apart.
    if (proposal.options.length < 2) {
      return "Offer at least two different styles from different layout families. Pick other forms and styles and try again.";
    }

    state.widgetProposals.push({ id: randomUUID(), proposal });
    return "The designs are on screen, each a different style with its own 'Use this design' button. Tell the user in one short sentence to pick one; the app adds the widget at medium size.";
  },
});

const listWidgets = tool<typeof listParameters, AgentToolRunState>({
  name: "list_widgets",
  description:
    "List the owner's dashboard widgets with their ids, current data, design and any schedule. Call this before editing a widget, or when the user asks what is on their dashboard.",
  parameters: listParameters,
  execute: async (_input, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return noOwner();

    const records = await listWidgetsForUser(state.ownerId);
    if (records.length === 0) return "The dashboard has no widgets yet.";

    return JSON.stringify(
      records.map((widget) => ({
        id: widget.id,
        title: widget.title,
        agent: widget.agentName,
        size: widget.size,
        design: widget.design,
        form: widget.form,
        icon: widget.icon,
        refresh: {
          minutes: widget.refreshMinutes,
          nextAt: widget.nextRefreshAt,
          lastAt: widget.lastRefreshAt,
          status: widget.lastRefreshStatus,
        },
        sourcePrompt: widget.sourcePrompt,
        updatedAt: widget.updatedAt,
        data: widget.data,
      })),
    );
  },
});

const proposeWidgetEdit = tool<typeof widgetEditParameters, AgentToolRunState>({
  name: "propose_widget_edit",
  description:
    "Propose a change to a widget the owner already has. This does NOT change anything: the chat shows a review card with the old and new values, and only the owner clicking Apply writes it. Call list_widgets first for the id and current data. You may revise the title, icon, illustration, style, form, data, tracking prompt and refresh schedule. A form must be supported by the data. Send the complete data object when data changes. Never claim the edit was applied.",
  parameters: widgetEditParameters,
  execute: async (input, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return noOwner();

    const widget = await getWidgetForUser(state.ownerId, input.widgetId);
    if (!widget) {
      return "No widget with that id belongs to this user. Call list_widgets and use one of those ids.";
    }

    const edit = normalizeWidgetEdit(input, widget);
    if (!edit) {
      return "That proposal had no real change, or the values were invalid. Compare with the current widget, change at least one field, and call propose_widget_edit again.";
    }

    state.widgetEdits.push({ id: randomUUID(), widget, edit });
    return "The review card is on screen with Apply / Discard. Nothing has changed yet; tell the user to review it and do not say it was applied.";
  },
});

const proposeLayout = tool<typeof proposeLayoutParameters, AgentToolRunState>({
  name: "propose_layout",
  description:
    "Suggest a complete starting dashboard layout — a template with several cards already placed — and show it as a real preview. The app adds the cards only when the owner clicks Add. Use it when the dashboard is empty or when the owner asks what to set up, not for a single widget.",
  parameters: proposeLayoutParameters,
  execute: async ({ template, reason }, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return noOwner();

    const blueprint = getTemplateBlueprint(template);
    if (!blueprint || templateStarterCount(template) === 0) {
      return "That template has no starter cards. Suggest creator, daily, business, developer or research.";
    }

    state.layoutProposals.push({
      id: randomUUID(),
      template,
      reason: widgetText(reason ?? "", 180) || blueprint.focus,
    });

    return `The ${template} layout preview is on screen with an Add card. Nothing has been added yet; tell the owner in one sentence what it would set up and let them click Add.`;
  },
});

/** Widget tools, attached to every run regardless of the agent's switches. */
export const WIDGET_TOOLS: Tool<AgentToolRunState>[] = [
  suggestWidget,
  proposeWidget,
  listWidgets,
  proposeWidgetEdit,
  proposeLayout,
];

export const WIDGET_TOOL_LABELS: Record<string, string> = {
  suggest_widget: "Offering a dashboard widget",
  propose_widget: "Designing your widget",
  list_widgets: "Checking your widgets",
  propose_widget_edit: "Preparing a widget edit for review",
  propose_layout: "Preparing a starting layout",
};

export const WIDGET_TOOL_SUMMARIES: { name: string; summary: string }[] = [
  {
    name: "suggest_widget",
    summary:
      "Offer to turn a result into a live dashboard widget (the user gets a Create / Not now card). Each widget refreshes itself on its own schedule.",
  },
  {
    name: "propose_widget",
    summary:
      "Show two to four finished designs, each a different style and layout family, using real data after the user accepts; the app adds the chosen one.",
  },
  {
    name: "list_widgets",
    summary: "List the owner's dashboard widgets and their current data before editing one.",
  },
  {
    name: "propose_widget_edit",
    summary:
      "Propose a widget edit (title, form, style, illustration, data, tracking prompt, schedule) for the owner to review and Apply; never changes it directly.",
  },
  {
    name: "propose_layout",
    summary:
      "Suggest a whole starting layout (creator, daily, business, developer or research) with its real cards previewed; the owner's Add click creates them.",
  },
];

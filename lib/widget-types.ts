/**
 * Shared widget vocabulary.
 *
 * Client-safe: the design catalog, icon keys, sizes and the normalizers every
 * writer (agent tool, API route, scheduler) uses. Nothing here touches the
 * database or the model, and a widget is always plain data — never markup or a
 * generated component — so the same spec renders identically on the dashboard,
 * in the chat strip and in a design preview.
 */

import type { WidgetAppearance } from "@/lib/widget-appearance";

export type WidgetSize = "small" | "medium" | "large";
export type WidgetTrend = "up" | "down" | "flat";
export type WidgetItemTone = "neutral" | "positive" | "warning";

export const WIDGET_SIZES: WidgetSize[] = ["small", "medium", "large"];

/**
 * The twenty-seven visual forms a widget can take: thirteen primitives, thirteen
 * composed layouts modeled on real app widgets, and the saved-diagram form. Data decides which
 * forms are possible: a point-based form needs at least three real points, a
 * feed needs real rows, and a percentage form needs a value that can honestly
 * be a share.
 */
export type WidgetForm =
  | "diagram"
  | "number"
  | "trend"
  | "bars"
  | "heat"
  | "gauge"
  | "waffle"
  | "ranking"
  | "split"
  | "tiles"
  | "feed"
  | "podium"
  | "timeline"
  | "scene"
  | "kpi"
  | "rows"
  | "checklist"
  | "inbox"
  | "news"
  | "activity"
  | "agenda"
  | "forecast"
  | "rings"
  | "dials"
  | "meters"
  | "donut"
  | "briefing";

/**
 * Layout families. Two forms in the same family read as the same card, so one
 * proposal offers different families whenever the data can support them.
 */
export type WidgetFormFamily =
  | "diagram"
  | "figure"
  | "chart"
  | "share"
  | "list"
  | "rank"
  | "grid"
  | "timeline";

/** @deprecated Kept for old callers; a widget stores a form now. */
export type WidgetChart = WidgetForm;

export type WidgetFormMeta = {
  key: WidgetForm;
  name: string;
  description: string;
  /** Coarse layout group, used to keep one proposal varied. */
  family: WidgetFormFamily;
};

export const WIDGET_FORMS: WidgetFormMeta[] = [
  { key: "number", name: "Number", description: "One figure, held large", family: "figure" },
  { key: "trend", name: "Trend", description: "A line through real points", family: "chart" },
  { key: "bars", name: "Bars", description: "Compared points as bars", family: "chart" },
  { key: "heat", name: "Heat", description: "Intensity over the series", family: "chart" },
  { key: "gauge", name: "Gauge", description: "A share of the whole", family: "share" },
  { key: "waffle", name: "Waffle", description: "A share in one hundred cells", family: "share" },
  { key: "ranking", name: "Ranking", description: "Ordered rows, first at the top", family: "list" },
  { key: "split", name: "Split", description: "Parts of one total", family: "share" },
  { key: "tiles", name: "Tiles", description: "A grid of key figures", family: "figure" },
  { key: "feed", name: "Feed", description: "Latest rows in order", family: "list" },
  { key: "podium", name: "Podium", description: "The top three, ranked", family: "rank" },
  { key: "timeline", name: "Timeline", description: "Events along one line", family: "timeline" },
  { key: "scene", name: "Scene", description: "An illustration with the figure", family: "figure" },
  { key: "kpi", name: "KPI strip", description: "Key figures over a chart", family: "chart" },
  { key: "rows", name: "Rows", description: "Apps or items with a sparkline", family: "list" },
  { key: "checklist", name: "Checklist", description: "Tasks with a done state", family: "list" },
  { key: "inbox", name: "Inbox chips", description: "Unread items as chips", family: "list" },
  { key: "news", name: "News tiles", description: "Headlines in a tile grid", family: "grid" },
  { key: "activity", name: "Agent activity", description: "What the agent is doing", family: "list" },
  { key: "agenda", name: "Agenda", description: "A day of events by time", family: "list" },
  { key: "forecast", name: "Forecast strip", description: "The next days, side by side", family: "chart" },
  { key: "rings", name: "Rings", description: "Progress as one or more rings", family: "share" },
  { key: "dials", name: "Dials", description: "Several gauges in one row", family: "share" },
  { key: "meters", name: "Meters", description: "Progress as horizontal meters", family: "share" },
  { key: "donut", name: "Donut", description: "Parts of a total in a donut", family: "share" },
  { key: "briefing", name: "Briefing", description: "A few short briefing cards", family: "grid" },
  {
    key: "diagram",
    name: "Diagram",
    description: "A saved Archify diagram, drawn live",
    family: "diagram",
  },
];

const FORM_BY_KEY = new Map(WIDGET_FORMS.map((form) => [form.key, form]));

export function getWidgetForm(key: string | null | undefined): WidgetFormMeta {
  return FORM_BY_KEY.get(key as WidgetForm) ?? WIDGET_FORMS[0];
}

export function isWidgetForm(value: unknown): value is WidgetForm {
  return typeof value === "string" && FORM_BY_KEY.has(value as WidgetForm);
}

/** The layout family a form belongs to; unknown keys fall back to "figure". */
export function widgetFormFamily(form: WidgetForm): WidgetFormFamily {
  return FORM_BY_KEY.get(form)?.family ?? "figure";
}

export type WidgetMetric = {
  label: string;
  value: string;
  delta?: string;
  trend?: WidgetTrend;
};

export type WidgetPoint = { label: string; value: number };

export type WidgetItem = {
  title: string;
  meta?: string;
  tone?: WidgetItemTone;
  /** A per-row figure, e.g. “$1,280” or “12”. */
  value?: string;
  /** A per-row change, shown as a pill beside the value. */
  delta?: string;
  /** Direction the row's delta represents. */
  trend?: WidgetTrend;
  /** A short status label, e.g. “Running” or “Done”. */
  status?: string;
  /** Checklist rows: whether the task is done. */
  done?: boolean;
  /** App or brand slug, drawn from Composio's logo CDN. */
  logo?: string;
  /** Optional micro-series for a row sparkline; real points only. */
  spark?: number[];
};

/** One tracked target, for rings, dials and meters. */
export type WidgetGoal = {
  label: string;
  value: number;
  target: number;
};

/** The plain-data payload a widget renders. */
export type WidgetPayload = {
  metrics: WidgetMetric[];
  series: WidgetPoint[];
  items: WidgetItem[];
  /** Tracked targets; percent forms derive their shares from these. */
  goals?: WidgetGoal[];
  /** Icon key shown beside the headline figure. */
  figureIcon?: WidgetIconKey;
  footnote?: string;
  /**
   * A saved diagram, drawn from its Archify JSON IR. Source, never an image, so
   * the card follows the palette and stays as current as the library row.
   */
  diagram?: { name: string; source: string };
};

/** One of the finished looks the agent offers for a widget. */
export type WidgetDesignOption = {
  design: WidgetDesignKey;
  form: WidgetForm;
};

/** What the agent proposes in the chat, before a design is chosen. */
export type WidgetProposal = {
  title: string;
  icon: WidgetIconKey;
  /** Colorful scene used by the illustrated style. */
  illustration: WidgetIllustrationKey;
  data: WidgetPayload;
  /** What the widget tracks; its own read-only update re-reads this. */
  sourcePrompt?: string;
  /** Two to four looks, each a different form + style pair. */
  options: WidgetDesignOption[];
};

/** A stored widget, serialized for the client. */
export type WidgetRecord = {
  id: number;
  agentId: number;
  agentName: string;
  agentAvatar: string;
  agentColor: string;
  title: string;
  subtitle: string | null;
  icon: WidgetIconKey;
  illustration: WidgetIllustrationKey;
  design: WidgetDesignKey;
  /** The stored visual form, or the closest supported form for an old row. */
  form: WidgetForm;
  data: WidgetPayload;
  size: WidgetSize;
  /** Stored grid cell (0-based) on the three-column dashboard. */
  positionX: number;
  positionY: number;
  /** Owner's visual customization; null means the design's own look. */
  appearance: WidgetAppearance | null;
  /** A locked widget can't be dragged or resized. */
  locked: boolean;
  sourcePrompt: string | null;
  /** Average interval, kept for the local cron fallback. */
  refreshMinutes: number;
  /** The update rule, shared with agent schedules. */
  scheduleRule: import("@/lib/schedule-rule").ScheduleRule;
  /** CloudHike Jobs cron for automatic updates (legacy mirror). */
  refreshCron: string;
  /** IANA zone the cron runs in. */
  refreshTimezone: string | null;
  /** Whether automatic updates are currently enabled. */
  refreshEnabled: boolean;
  /** CloudHike Jobs schedule id, null when only the local fallback is active. */
  jobsScheduleId: string | null;
  /** Why the Jobs sync failed, or null. */
  jobsError: string | null;
  /** ISO timestamp of the next due refresh. */
  nextRefreshAt: string | null;
  /** ISO timestamp of the last refresh attempt. */
  lastRefreshAt: string | null;
  /** Outcome of the last refresh attempt. */
  lastRefreshStatus: "ok" | "error" | null;
  /** One line on what the last refresh did, or why it failed. */
  lastRefreshNote: string | null;
  /** ISO timestamp. */
  updatedAt: string;
  /** ISO timestamp of the last refresh that replaced the data. */
  syncedAt: string | null;
};

/**
 * A reviewed change to a stored widget. The agent proposes one; nothing is
 * written until the owner clicks Apply.
 */
export type WidgetEdit = {
  widgetId: number;
  /** One line explaining the change, shown on the review card. */
  summary: string;
  title?: string;
  icon?: WidgetIconKey;
  illustration?: WidgetIllustrationKey;
  design?: WidgetDesignKey;
  /** A form the current data can actually support. */
  form?: WidgetForm;
  data?: WidgetPayload;
  sourcePrompt?: string | null;
  refreshMinutes?: WidgetRefreshMinutes;
};

/** The current widget plus the proposed edit, for the review card. */
export type WidgetEditProposal = {
  id: string;
  widget: WidgetRecord;
  edit: WidgetEdit;
};

/** One run of a widget's own refresh schedule, for the real history. */
export type WidgetRefreshRun = {
  id: number;
  widgetId: number;
  widgetTitle: string;
  status: "ok" | "error";
  note: string | null;
  /** "schedule" | "manual" | "agent" | "catchup" */
  trigger: string;
  /** True when the update drove the cloud browser. */
  browserUsed: boolean;
  /** True when the data was unchanged, so nothing was delivered again. */
  duplicate: boolean;
  durationMs: number | null;
  createdAt: string;
};

/** Legacy fallback defaults; new widgets schedule through lib/widget-schedule. */
export const WIDGET_REFRESH_MINUTES = 720;

export const WIDGET_REFRESH_OPTIONS = [30, 60, 360, 720, 1440] as const;
export type WidgetRefreshMinutes = (typeof WIDGET_REFRESH_OPTIONS)[number];

/** "hourly" / "every 30m" — for the card footer and the panel history. */
export function describeWidgetRefresh(minutes: number): string {
  if (minutes === 60) return "hourly";
  if (minutes === 24 * 60) return "daily";
  if (minutes % 60 === 0) return `every ${minutes / 60}h`;
  return `every ${minutes}m`;
}

/** Only the four supported cadences; anything else falls back. */
export function normalizeWidgetRefreshMinutes(
  value: unknown,
  fallback: WidgetRefreshMinutes = WIDGET_REFRESH_MINUTES,
): WidgetRefreshMinutes {
  const minutes = Number(value);
  return (WIDGET_REFRESH_OPTIONS as readonly number[]).includes(minutes)
    ? (minutes as WidgetRefreshMinutes)
    : fallback;
}

export const WIDGET_ICON_KEYS = [
  "activity",
  "bars",
  "bell",
  "calendar",
  "clock",
  "cpu",
  "database",
  "dollar",
  "file",
  "globe",
  "layers",
  "mail",
  "server",
  "shopping",
  "target",
  "trending",
  "users",
  "zap",
] as const;

export type WidgetIconKey = (typeof WIDGET_ICON_KEYS)[number];

export const WIDGET_ICON_LABELS: Record<WidgetIconKey, string> = {
  activity: "Activity pulse",
  bars: "Bar chart",
  bell: "Alerts",
  calendar: "Calendar",
  clock: "Time",
  cpu: "Model / compute",
  database: "Database",
  dollar: "Revenue",
  file: "Documents",
  globe: "Web / market",
  layers: "Stack / projects",
  mail: "Email",
  server: "Infrastructure",
  shopping: "Commerce",
  target: "Goals",
  trending: "Growth",
  users: "People",
  zap: "Automation",
};

export const WIDGET_ILLUSTRATION_KEYS = [
  "chart",
  "rocket",
  "coins",
  "team",
  "calendar",
  "mail",
  "globe",
  "shield",
  "bolt",
  "cloud",
  "target",
  "idea",
  "flow",
  "leaf",
  "music",
  "book",
  "coffee",
  "moon",
  "spark",
  "stack",
] as const;

export type WidgetIllustrationKey = (typeof WIDGET_ILLUSTRATION_KEYS)[number];

export const WIDGET_ILLUSTRATION_LABELS: Record<WidgetIllustrationKey, string> = {
  chart: "Rising chart",
  rocket: "Launch",
  coins: "Coins",
  team: "Team",
  calendar: "Calendar",
  mail: "Mail",
  globe: "Globe",
  shield: "Shield",
  bolt: "Bolt",
  cloud: "Cloud",
  target: "Target",
  idea: "Idea",
  flow: "Flow",
  leaf: "Leaf",
  music: "Music",
  book: "Book",
  coffee: "Coffee",
  moon: "Moon",
  spark: "Spark",
  stack: "Stack",
};

/** The scene that best fits an icon, so a proposal always has one. */
export const DEFAULT_ILLUSTRATION_BY_ICON: Record<WidgetIconKey, WidgetIllustrationKey> = {
  activity: "flow",
  bars: "chart",
  bell: "bolt",
  calendar: "calendar",
  clock: "moon",
  cpu: "spark",
  database: "stack",
  dollar: "coins",
  file: "book",
  globe: "globe",
  layers: "stack",
  mail: "mail",
  server: "cloud",
  shopping: "coins",
  target: "target",
  trending: "rocket",
  users: "team",
  zap: "bolt",
};

export type WidgetDesignKey =
  | "classic"
  | "illustrated"
  | "pop"
  | "glass"
  | "neon"
  | "editorial"
  | "clean";

export type WidgetDesign = {
  key: WidgetDesignKey;
  name: string;
  description: string;
  /** Tailwind classes; kept literal so the compiler sees every one. */
  shell: string;
  glow: string;
  title: string;
  muted: string;
  divider: string;
  iconTile: string;
  chip: string;
  value: string;
  positive: string;
  negative: string;
  neutral: string;
  /** Hex colour the chart draws with. */
  accent: string;
  /** Chart area wash opacity. */
  area: string;
  /** Optional heading typography override. */
  heading?: string;
  /** The illustrated style reserves header space for a scene. */
  illustrated?: boolean;
};

/**
 * The seven widget styles. Every option is complete on its own, so an agent
 * can offer any two to four without inventing colours or layout.
 */
export const WIDGET_DESIGNS: WidgetDesign[] = [
  {
    key: "classic",
    name: "Classic",
    description: "Clean card that follows your theme",
    shell:
      "border-border bg-card shadow-[0_18px_40px_-32px_rgba(15,23,42,0.4)]",
    glow: "bg-brand-from/25",
    title: "text-foreground",
    muted: "text-muted-foreground",
    divider: "border-border",
    iconTile: "brand-gradient text-brand-on shadow-sm shadow-black/10",
    chip: "bg-brand-soft text-brand-ink ring-1 ring-brand-border",
    value: "text-foreground",
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-muted-foreground",
    accent: "var(--brand-from)",
    area: "fill-brand-from/10",
  },
  {
    key: "illustrated",
    name: "Illustrated",
    description: "Warm paper with a playful color scene",
    shell:
      "border-amber-200 bg-[#fffaf0] dark:border-amber-500/25 dark:bg-amber-950/30 shadow-[0_18px_40px_-32px_rgba(180,83,9,0.35)]",
    glow: "bg-amber-200/60 dark:bg-amber-500/10",
    title: "text-stone-900 dark:text-amber-50",
    muted: "text-stone-600 dark:text-amber-200/70",
    divider: "border-amber-200/80 dark:border-amber-500/20",
    iconTile: "bg-amber-500 text-white shadow-sm shadow-amber-500/25",
    chip: "bg-white text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/25",
    value: "text-stone-900 dark:text-amber-50",
    positive: "text-emerald-700",
    negative: "text-rose-700",
    neutral: "text-stone-600 dark:text-amber-200/70",
    accent: "#d97706",
    area: "fill-amber-500/10",
    illustrated: true,
  },
  {
    key: "pop",
    name: "Pop",
    description: "Loud yellow, ink lines, hard shadow",
    shell:
      "border-2 border-slate-900 bg-[#ffe45e] shadow-[6px_6px_0_#111827] dark:border-yellow-300/40 dark:bg-[#1b1908] dark:shadow-[5px_5px_0_rgba(250,204,21,0.28)]",
    glow: "bg-fuchsia-400/30 dark:bg-fuchsia-500/15",
    title: "text-slate-950 dark:text-yellow-100",
    muted: "text-slate-800 dark:text-yellow-200/70",
    divider: "border-slate-900/20 dark:border-yellow-300/20",
    iconTile: "bg-slate-900 text-[#ffe45e] dark:bg-yellow-300 dark:text-slate-950",
    chip: "bg-white text-slate-900 ring-1 ring-slate-900 dark:bg-yellow-300/15 dark:text-yellow-100 dark:ring-yellow-300/30",
    value: "text-slate-950 dark:text-yellow-100",
    positive: "text-emerald-800",
    negative: "text-rose-700",
    neutral: "text-slate-700 dark:text-yellow-200/70",
    accent: "#7c3aed",
    area: "fill-violet-600/10",
    heading: "font-black tracking-[-0.03em]",
  },
  {
    key: "glass",
    name: "Glass",
    description: "Frosted panels with a cool bloom",
    shell:
      "border-white/70 bg-card/70 ring-1 ring-white/60 backdrop-blur-xl shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] dark:border-white/10 dark:ring-white/10",
    glow: "bg-brand-from/25",
    title: "text-foreground",
    muted: "text-muted-foreground",
    divider: "border-border",
    iconTile: "brand-gradient text-brand-on shadow-sm shadow-black/10",
    chip: "bg-primary/10 text-primary ring-1 ring-primary/15",
    value: "text-foreground",
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-muted-foreground",
    accent: "var(--brand-from)",
    area: "fill-brand-from/10",
  },
  {
    key: "neon",
    name: "Neon",
    description: "Midnight console with an electric lime glow",
    shell:
      "border-lime-300/30 bg-[#050810] shadow-[0_0_0_1px_rgba(163,230,53,0.15),0_24px_60px_-30px_rgba(163,230,53,0.35)]",
    glow: "bg-lime-300/20",
    title: "text-lime-50",
    muted: "text-lime-200/60",
    divider: "border-lime-300/20",
    iconTile: "bg-lime-300 text-slate-950 shadow-[0_0_18px_rgba(163,230,53,0.55)]",
    chip: "bg-lime-300/10 text-lime-200 ring-1 ring-lime-300/25",
    value: "text-white",
    positive: "text-emerald-300",
    negative: "text-rose-300",
    neutral: "text-lime-200/60",
    accent: "#a3e635",
    area: "fill-lime-300/10",
    heading: "font-mono tracking-[-0.04em]",
  },
  {
    key: "editorial",
    name: "Editorial",
    description: "Paper-white brief with ink and amber rules",
    shell:
      "border-stone-200 bg-[#fbf9f4] shadow-[0_18px_40px_-32px_rgba(68,64,60,0.5)] dark:border-stone-600/40 dark:bg-stone-900",
    glow: "bg-amber-200/50 dark:bg-amber-500/10",
    title: "text-stone-900 dark:text-stone-100",
    muted: "text-stone-500 dark:text-stone-400",
    divider: "border-stone-200 dark:border-stone-700",
    iconTile: "bg-stone-900 text-amber-50 dark:bg-stone-100 dark:text-stone-900",
    chip: "bg-stone-100 text-stone-600 ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
    value: "text-stone-900 dark:text-stone-100",
    positive: "text-emerald-700",
    negative: "text-rose-700",
    neutral: "text-stone-500 dark:text-stone-400",
    accent: "#b45309",
    area: "fill-amber-600/10",
    heading: "font-serif tracking-[-0.02em]",
  },
  {
    key: "clean",
    name: "Clean",
    description: "Quiet white with fine rules and no flourish",
    shell: "border-border/70 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)]",
    glow: "bg-transparent",
    title: "text-foreground",
    muted: "text-muted-foreground",
    divider: "border-border/70",
    iconTile: "bg-muted text-foreground",
    chip: "bg-muted text-foreground ring-1 ring-border/70",
    value: "text-foreground",
    positive: "text-emerald-600",
    negative: "text-rose-600",
    neutral: "text-muted-foreground",
    accent: "var(--foreground)",
    area: "fill-foreground/10",
    heading: "font-medium tracking-[-0.02em]",
  },
];

/** Old rows keep rendering after the catalog changed. */
const LEGACY_DESIGN_ALIASES: Record<string, WidgetDesignKey> = {
  aurora: "glass",
  midnight: "neon",
  sunrise: "pop",
  mint: "illustrated",
  graphite: "classic",
};

const DESIGN_BY_KEY = new Map(WIDGET_DESIGNS.map((design) => [design.key, design]));

export function getWidgetDesign(key: string | null | undefined): WidgetDesign {
  const resolved = LEGACY_DESIGN_ALIASES[String(key)] ?? key;
  return DESIGN_BY_KEY.get(resolved as WidgetDesignKey) ?? WIDGET_DESIGNS[0];
}

const ICON_BY_KEY = new Set<string>(WIDGET_ICON_KEYS);
const ILLUSTRATION_BY_KEY = new Set<string>(WIDGET_ILLUSTRATION_KEYS);

export function isWidgetIllustrationKey(value: unknown): value is WidgetIllustrationKey {
  return typeof value === "string" && ILLUSTRATION_BY_KEY.has(value);
}

export function isWidgetIconKey(value: unknown): value is WidgetIconKey {
  return typeof value === "string" && ICON_BY_KEY.has(value);
}

export function isWidgetDesignKey(value: unknown): value is WidgetDesignKey {
  return typeof value === "string" && DESIGN_BY_KEY.has(value as WidgetDesignKey);
}

export function isWidgetChart(value: unknown): value is WidgetChart {
  return value === "line" || value === "bars" || isWidgetForm(value);
}

/** A numeric reading from a display string; suffixes such as 1.2k / 3M work. */
export function widgetNumber(value: string): number | null {
  const raw = value.replace(/[,\s$£€]/g, "");
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return null;

  const suffix = raw.slice((match.index ?? 0) + match[0].length).toLowerCase();
  if (suffix.startsWith("k")) return parsed * 1_000;
  if (suffix.startsWith("m")) return parsed * 1_000_000;
  if (suffix.startsWith("b")) return parsed * 1_000_000_000;
  return parsed;
}

/** The first honest percentage metric, when the data has one. */
export function widgetPercentMetric(data: WidgetPayload): WidgetMetric | null {
  for (const metric of data.metrics) {
    if (!metric.value.includes("%")) continue;
    if (widgetNumber(metric.value) === null) continue;
    return metric;
  }
  return null;
}

/** The first honest percentage in the data, 0–100; null when there isn't one. */
export function widgetPercent(data: WidgetPayload): number | null {
  const metric = widgetPercentMetric(data);
  if (!metric) return null;
  const value = widgetNumber(metric.value);
  return value === null ? null : Math.max(0, Math.min(100, value));
}

/** Real numeric metric values, for the part-to-whole and tiles forms. */
export function widgetMetricValues(data: WidgetPayload): { label: string; value: number }[] {
  const values: { label: string; value: number }[] = [];
  for (const metric of data.metrics) {
    const value = widgetNumber(metric.value);
    if (value !== null) values.push({ label: metric.label, value });
  }
  return values;
}

/** One percent reading for the ring, dial and meter forms. */
export type WidgetGaugeDatum = { label: string; percent: number; value: string };

/**
 * Percent readings a widget can honestly draw. Tracked goals win; otherwise
 * the percentage metrics are the only values that can be a share.
 */
export function widgetGaugeData(data: WidgetPayload): WidgetGaugeDatum[] {
  const goals = data.goals ?? [];
  if (goals.length > 0) {
    return goals.map((goal) => {
      const percent = goal.target > 0 ? (goal.value / goal.target) * 100 : 0;
      return {
        label: goal.label,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        value: `${shortGoalValue(goal.value)}/${shortGoalValue(goal.target)}`,
      };
    });
  }

  const gauges: WidgetGaugeDatum[] = [];
  for (const metric of data.metrics) {
    if (!metric.value.includes("%")) continue;
    const parsed = widgetNumber(metric.value);
    if (parsed === null) continue;
    gauges.push({
      label: metric.label,
      percent: Math.max(0, Math.min(100, Math.round(parsed))),
      value: metric.value,
    });
  }
  return gauges;
}

function shortGoalValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Data decides whether a form can tell the truth. */
export function widgetFormSupported(data: WidgetPayload, form: WidgetForm): boolean {
  const points = data.series.length;
  const rows = data.items.length;
  const metrics = data.metrics.length;
  const gauges = widgetGaugeData(data).length;

  switch (form) {
    case "trend":
    case "bars":
    case "heat":
    case "timeline":
    case "podium":
    case "forecast":
      return points >= 3;
    case "gauge":
    case "waffle":
      return widgetPercent(data) !== null;
    case "rings":
      return gauges >= 1;
    case "dials":
    case "meters":
      return gauges >= 2;
    case "ranking":
      return rows >= 2 || points >= 3;
    case "split":
    case "donut":
      return widgetMetricValues(data).length >= 2 || points >= 3;
    case "tiles":
      return metrics >= 2;
    case "feed":
      return rows >= 1;
    case "kpi":
      return metrics >= 2 && points >= 3;
    case "rows":
    case "checklist":
    case "inbox":
    case "news":
    case "activity":
    case "agenda":
    case "briefing":
      return rows >= 2;
    case "diagram":
      return Boolean(data.diagram?.source);
    case "scene":
    case "number":
      return metrics >= 1 || points >= 1 || rows >= 1;
    default:
      return false;
  }
}

/** Every form this payload can support, in catalog order. */
export function availableWidgetForms(data: WidgetPayload): WidgetForm[] {
  return WIDGET_FORMS.map((form) => form.key).filter((form) => widgetFormSupported(data, form));
}

/** A supported form near the one that stopped working, so a refresh never turns a gauge into an unrelated chart. */
function closestWidgetForm(data: WidgetPayload, preferred: WidgetForm): WidgetForm {
  const supported = (form: WidgetForm) => widgetFormSupported(data, form);

  if (preferred === "gauge" || preferred === "waffle") {
    if (supported("split")) return "split";
    if (supported("tiles")) return "tiles";
  }
  if (preferred === "rings" || preferred === "dials" || preferred === "meters") {
    if (supported("gauge")) return "gauge";
    if (supported("split")) return "split";
    if (supported("tiles")) return "tiles";
  }
  if (preferred === "kpi" || preferred === "forecast") {
    if (supported("trend")) return "trend";
    if (supported("bars")) return "bars";
  }
  if (
    preferred === "rows" ||
    preferred === "checklist" ||
    preferred === "inbox" ||
    preferred === "activity" ||
    preferred === "agenda"
  ) {
    if (supported("feed")) return "feed";
    if (supported("ranking")) return "ranking";
  }
  if (preferred === "news" || preferred === "briefing") {
    if (supported("tiles")) return "tiles";
    if (supported("feed")) return "feed";
  }
  if (preferred === "donut" && supported("split")) return "split";
  if (preferred === "feed" && supported("ranking")) return "ranking";
  if (preferred === "ranking" && supported("feed")) return "feed";
  if (preferred === "split" && supported("tiles")) return "tiles";
  if (preferred === "podium" && supported("bars")) return "bars";
  if (preferred === "timeline" && supported("trend")) return "trend";

  return "number";
}

/**
 * The closest honest form for a row written before forms existed, or for an
 * edited payload that no longer supports its stored form. No data is changed.
 */
export function effectiveWidgetForm(input: {
  form?: unknown;
  chart?: unknown;
  design?: unknown;
  data: WidgetPayload;
}): WidgetForm {
  if (isWidgetForm(input.form)) {
    return widgetFormSupported(input.data, input.form)
      ? input.form
      : closestWidgetForm(input.data, input.form);
  }

  const data = input.data;
  // Legacy rows only have `chart`; honour it before auto-picking a form.
  if (data.series.length >= 3) {
    if (input.chart === "bars") return "bars";
    if (input.chart === "line") return "trend";
  }
  if (widgetPercent(data) !== null) return "gauge";
  if (data.series.length >= 3) return "trend";
  if (data.metrics.length >= 2) return "tiles";
  if (data.items.length >= 2) return "ranking";
  if (data.items.length >= 1) return "feed";
  if (input.design === "illustrated") return "scene";
  return "number";
}

/** The stored identity of one design: form and style cannot repeat together. */
export function widgetDesignCombo(option: Pick<WidgetDesignOption, "design" | "form">): string {
  return `${option.form}:${option.design}`;
}

export function widgetDesignComboUsed(
  option: Pick<WidgetDesignOption, "design" | "form">,
  existing: { design: string; form: string }[],
): boolean {
  const key = widgetDesignCombo(option);
  return existing.some((widget) => `${widget.form}:${widget.design}` === key);
}

export function isWidgetSize(value: unknown): value is WidgetSize {
  return value === "small" || value === "medium" || value === "large";
}

export function isWidgetTrend(value: unknown): value is WidgetTrend {
  return value === "up" || value === "down" || value === "flat";
}

export function isWidgetItemTone(value: unknown): value is WidgetItemTone {
  return value === "neutral" || value === "positive" || value === "warning";
}

export const WIDGET_LIMITS = {
  title: 64,
  subtitle: 110,
  metrics: 4,
  series: 12,
  items: 6,
  goals: 4,
  metricLabel: 28,
  metricValue: 18,
  delta: 18,
  pointLabel: 14,
  itemTitle: 64,
  itemMeta: 48,
  itemValue: 20,
  itemDelta: 18,
  itemStatus: 20,
  itemLogo: 32,
  itemSpark: 12,
  goalLabel: 28,
  footnote: 140,
  sourcePrompt: 600,
  designOptions: 4,
  editSummary: 240,
} as const;

/** Tags out, whitespace collapsed, capped. Widget text is never markup. */
export function widgetText(value: unknown, max: number): string {
  if (value === null || value === undefined) return "";
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";

  const clean = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function clampPoint(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(-1_000_000_000, Math.min(1_000_000_000, Math.round(parsed * 100) / 100));
}

/** A Composio-style logo slug: letters, digits, dash, underscore, dot. */
function normalizeLogoSlug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const slug = value.trim().toLowerCase().slice(0, WIDGET_LIMITS.itemLogo);
  return /^[a-z0-9_.-]+$/.test(slug) ? slug : undefined;
}

/** A row's micro-series: real finite points, at least two, at most twelve. */
function normalizeSpark(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points: number[] = [];
  for (const entry of value) {
    const point = clampPoint(entry);
    if (point === null) continue;
    points.push(point);
    if (points.length >= WIDGET_LIMITS.itemSpark) break;
  }
  return points.length >= 2 ? points : undefined;
}

/**
 * A payload safe to store and render. Returns null when nothing usable is in
 * it, so a malformed proposal can never create an empty card.
 */
export function normalizeWidgetData(input: unknown): WidgetPayload | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  const metrics: WidgetMetric[] = [];
  if (Array.isArray(record.metrics)) {
    for (const entry of record.metrics.slice(0, WIDGET_LIMITS.metrics)) {
      if (!entry || typeof entry !== "object") continue;
      const metric = entry as Record<string, unknown>;
      const label = widgetText(metric.label, WIDGET_LIMITS.metricLabel);
      const value = widgetText(metric.value, WIDGET_LIMITS.metricValue);
      if (!label || !value) continue;

      const delta = widgetText(metric.delta, WIDGET_LIMITS.delta) || undefined;
      const trend = isWidgetTrend(metric.trend) ? metric.trend : undefined;

      metrics.push({ label, value, ...(delta ? { delta } : {}), ...(trend ? { trend } : {}) });
    }
  }

  const series: WidgetPoint[] = [];
  if (Array.isArray(record.series)) {
    for (const entry of record.series.slice(0, WIDGET_LIMITS.series)) {
      if (!entry || typeof entry !== "object") continue;
      const point = entry as Record<string, unknown>;
      const label = widgetText(point.label, WIDGET_LIMITS.pointLabel);
      const value = clampPoint(point.value);
      if (!label || value === null) continue;
      series.push({ label, value });
    }
  }

  const items: WidgetItem[] = [];
  if (Array.isArray(record.items)) {
    for (const entry of record.items.slice(0, WIDGET_LIMITS.items)) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const title = widgetText(item.title, WIDGET_LIMITS.itemTitle);
      if (!title) continue;

      const meta = widgetText(item.meta, WIDGET_LIMITS.itemMeta) || undefined;
      const tone = isWidgetItemTone(item.tone) ? item.tone : undefined;
      const value = widgetText(item.value, WIDGET_LIMITS.itemValue) || undefined;
      const delta = widgetText(item.delta, WIDGET_LIMITS.itemDelta) || undefined;
      const trend = isWidgetTrend(item.trend) ? item.trend : undefined;
      const status = widgetText(item.status, WIDGET_LIMITS.itemStatus) || undefined;
      const done = typeof item.done === "boolean" ? item.done : undefined;
      const logo = normalizeLogoSlug(item.logo);
      const spark = normalizeSpark(item.spark);

      items.push({
        title,
        ...(meta ? { meta } : {}),
        ...(tone ? { tone } : {}),
        ...(value ? { value } : {}),
        ...(delta ? { delta } : {}),
        ...(trend ? { trend } : {}),
        ...(status ? { status } : {}),
        ...(done !== undefined ? { done } : {}),
        ...(logo ? { logo } : {}),
        ...(spark ? { spark } : {}),
      });
    }
  }

  const goals: WidgetGoal[] = [];
  if (Array.isArray(record.goals)) {
    for (const entry of record.goals.slice(0, WIDGET_LIMITS.goals)) {
      if (!entry || typeof entry !== "object") continue;
      const goal = entry as Record<string, unknown>;
      const label = widgetText(goal.label, WIDGET_LIMITS.goalLabel);
      const value = clampPoint(goal.value);
      const target = clampPoint(goal.target);
      if (!label || value === null || target === null || target <= 0) continue;
      goals.push({ label, value: Math.max(0, value), target });
    }
  }

  const diagramRecord =
    record.diagram && typeof record.diagram === "object"
      ? (record.diagram as Record<string, unknown>)
      : null;
  const diagramSource = diagramRecord ? widgetText(diagramRecord.source, 20_000) : "";
  const diagram = diagramSource
    ? {
        name: widgetText(diagramRecord?.name, WIDGET_LIMITS.itemTitle) || "Diagram",
        source: diagramSource,
      }
    : undefined;

  if (
    metrics.length === 0 &&
    series.length === 0 &&
    items.length === 0 &&
    goals.length === 0 &&
    !diagram
  ) {
    return null;
  }

  const footnote = widgetText(record.footnote, WIDGET_LIMITS.footnote) || undefined;
  const figureIcon = isWidgetIconKey(record.figureIcon) ? record.figureIcon : undefined;

  return {
    metrics,
    series,
    items,
    ...(goals.length > 0 ? { goals } : {}),
    ...(figureIcon ? { figureIcon } : {}),
    ...(footnote ? { footnote } : {}),
    ...(diagram ? { diagram } : {}),
  };
}

/**
 * Folds a refresh into what the card already shows. A field the update didn't
 * return keeps its stored value: an empty array means "the source had nothing
 * for this", not "clear it", so a run that only reports one number cannot wipe
 * a chart or a list.
 */
export function mergeWidgetData(
  current: WidgetPayload,
  update: WidgetPayload,
): WidgetPayload {
  const metrics = update.metrics.length > 0 ? update.metrics : current.metrics;
  const series = update.series.length > 0 ? update.series : current.series;
  const items = update.items.length > 0 ? update.items : current.items;
  const goals = update.goals?.length ? update.goals : current.goals;
  const figureIcon = update.figureIcon ?? current.figureIcon;
  const footnote = update.footnote?.trim() ? update.footnote : current.footnote;
  const diagram = update.diagram ?? current.diagram;

  return {
    metrics: [...metrics],
    series: [...series],
    items: [...items],
    ...(goals?.length ? { goals: [...goals] } : {}),
    ...(figureIcon ? { figureIcon } : {}),
    ...(footnote ? { footnote } : {}),
    ...(diagram ? { diagram } : {}),
  };
}

/**
 * A valid form from a proposed option. `chart` is read only for old callers:
 * line becomes trend and bars stays bars, and either must be supported by data.
 */
function proposedForm(
  option: Record<string, unknown>,
  data: WidgetPayload,
): WidgetForm | null {
  if (isWidgetForm(option.form)) {
    return widgetFormSupported(data, option.form) ? option.form : null;
  }
  if (option.chart === "bars" && widgetFormSupported(data, "bars")) return "bars";
  if (option.chart === "line" && widgetFormSupported(data, "trend")) return "trend";
  return null;
}

/**
 * Title plus the rest of a proposal, or null when the name is missing. Options
 * are filtered by eligible forms and by form + style combos already on the
 * dashboard; if the requested options leave fewer than two, free combos fill
 * the picker so the owner always has a real choice.
 */
export function normalizeWidgetProposal(
  input: unknown,
  used: { design: string; form: string }[] = [],
): WidgetProposal | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  const title = widgetText(record.title, WIDGET_LIMITS.title);
  if (!title) return null;

  const data = normalizeWidgetData(record.data);
  if (!data) return null;
  const payload: WidgetPayload = data;

  const options: WidgetDesignOption[] = [];
  const seen = new Set<string>();
  // Every offer is a genuinely different look, so the owner is choosing between
  // styles rather than four variations of the same card.
  const seenDesigns = new Set<string>();
  // Two forms in one family read as the same card, so one proposal stays inside
  // distinct families whenever the data can support enough of them.
  const seenFamilies = new Set<WidgetFormFamily>();

  function add(option: WidgetDesignOption, allowSameFamily = false) {
    const key = widgetDesignCombo(option);
    if (seen.has(key) || widgetDesignComboUsed(option, used)) return;
    if (seenDesigns.has(option.design)) return;
    if (!widgetFormSupported(payload, option.form)) return;
    const family = widgetFormFamily(option.form);
    if (!allowSameFamily && seenFamilies.has(family)) return;
    seen.add(key);
    seenDesigns.add(option.design);
    seenFamilies.add(family);
    options.push(option);
  }

  const rawOptions = Array.isArray(record.options) ? record.options : [];
  for (const entry of rawOptions) {
    if (options.length >= WIDGET_LIMITS.designOptions) break;
    if (!entry || typeof entry !== "object") continue;
    const option = entry as Record<string, unknown>;
    if (!isWidgetDesignKey(option.design)) continue;
    const form = proposedForm(option, payload);
    if (!form) continue;
    add({ design: option.design, form });
  }

  // Fill from the data's eligible forms, one per unseen family first. This keeps
  // the picker useful when the model asked for a combo the owner already has,
  // and guarantees the two options are different layouts, not just restyles.
  if (options.length < 2) {
    for (const form of availableWidgetForms(payload)) {
      if (options.length >= 2) break;
      if (seenFamilies.has(widgetFormFamily(form))) continue;
      const design = WIDGET_DESIGNS.find(
        (entry) => !widgetDesignComboUsed({ design: entry.key, form }, used),
      );
      if (design) add({ design: design.key, form });
    }
  }
  // Only when the data cannot support two families does a second option share
  // one: a real choice beats no widget.
  if (options.length < 2) {
    for (const form of availableWidgetForms(payload)) {
      for (const design of WIDGET_DESIGNS) {
        if (options.length >= 2) break;
        add({ design: design.key, form }, true);
      }
      if (options.length >= 2) break;
    }
  }

  if (options.length < 2) return null;

  const sourcePrompt = widgetText(record.sourcePrompt, WIDGET_LIMITS.sourcePrompt);
  const icon = isWidgetIconKey(record.icon) ? record.icon : "activity";
  const illustration = isWidgetIllustrationKey(record.illustration)
    ? record.illustration
    : DEFAULT_ILLUSTRATION_BY_ICON[icon];

  return {
    title,
    icon,
    illustration,
    data,
    ...(sourcePrompt ? { sourcePrompt } : {}),
    options: options.slice(0, WIDGET_LIMITS.designOptions),
  };
}

/**
 * Validates a proposed edit against the widget it targets. Only fields that
 * actually change survive; an edit with no real change is rejected, so the
 * review card can never apply a no-op.
 */
export function normalizeWidgetEdit(
  input: unknown,
  current: WidgetRecord,
): WidgetEdit | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  const widgetId = Number(record.widgetId);
  if (!Number.isInteger(widgetId) || widgetId !== current.id) return null;

  const edit: WidgetEdit = {
    widgetId,
    summary:
      widgetText(record.summary, WIDGET_LIMITS.editSummary) || "Requested widget change",
  };

  if (record.title !== undefined) {
    const title = widgetText(record.title, WIDGET_LIMITS.title);
    if (!title) return null;
    if (title !== current.title) edit.title = title;
  }

  if (isWidgetIconKey(record.icon) && record.icon !== current.icon) {
    edit.icon = record.icon;
  }

  if (
    isWidgetIllustrationKey(record.illustration) &&
    record.illustration !== current.illustration
  ) {
    edit.illustration = record.illustration;
  }

  if (isWidgetDesignKey(record.design) && record.design !== current.design) {
    edit.design = record.design;
  }

  if (record.data !== undefined) {
    const data = normalizeWidgetData(record.data);
    if (data && JSON.stringify(data) !== JSON.stringify(current.data)) edit.data = data;
  }

  const nextData = edit.data ?? current.data;
  if (isWidgetForm(record.form) && record.form !== current.form) {
    if (widgetFormSupported(nextData, record.form)) edit.form = record.form;
  }

  if (record.sourcePrompt !== undefined) {
    const sourcePrompt =
      widgetText(record.sourcePrompt, WIDGET_LIMITS.sourcePrompt) || null;
    if (sourcePrompt !== current.sourcePrompt) edit.sourcePrompt = sourcePrompt;
  }

  if (record.refreshMinutes !== undefined) {
    const refreshMinutes = normalizeWidgetRefreshMinutes(record.refreshMinutes, current.refreshMinutes as WidgetRefreshMinutes);
    if (refreshMinutes !== current.refreshMinutes) edit.refreshMinutes = refreshMinutes;
  }

  // Summary alone is not a change.
  const changed = Object.keys(edit).filter((key) => key !== "widgetId" && key !== "summary");
  return changed.length > 0 ? edit : null;
}

/** Two options with the chosen design first, for the preview card. */
export function orderProposalOptions(
  proposal: WidgetProposal,
  selected: WidgetDesignKey,
): WidgetDesignOption[] {
  return [...proposal.options].sort((a, b) =>
    a.design === selected ? -1 : b.design === selected ? 1 : 0,
  );
}

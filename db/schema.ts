import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  jsonb,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";

import type { AgentResultCard } from "@/lib/apps/results";
import type { AgentHandoffResult } from "@/lib/agent-team";
import type { TaskRoleAttachment, TaskToolSelection } from "@/lib/task-types";
import type { ScheduleActionPolicy, ScheduleSentAction } from "@/lib/schedule-action";
import type { DashboardAppearance, WidgetAppearance } from "@/lib/widget-appearance";
import type { WidgetPayload } from "@/lib/widget-types";

/** App-level mirror of a CloudHike Auth user. */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** CloudHike Auth user id. */
    authUserId: text("auth_user_id").notNull().unique(),
    name: text("name"),
    email: text("email").notNull().unique(),
    imageUrl: text("image_url"),
    /** "email" | "google" | "github" */
    provider: text("provider").notNull().default("email"),
    /** "free" | "pro"; limits live in lib/plans.ts. */
    plan: text("plan").notNull().default("free"),
    /** Browserbase Context id. Every cloud browser session this owner starts is attached to it, so logins, cookies and localStorage survive between sessions instead of asking them to sign in again. */
    browserContextId: text("browser_context_id"),
    /** Workspace-wide switch: the cron route skips every schedule while true. */
    schedulesPaused: boolean("schedules_paused").notNull().default(false),
    /** Email the owner when a scheduled run fails (needs RESEND_API_KEY). */
    scheduleAlerts: boolean("schedule_alerts").notNull().default(true),
    /** One email a day summarising the last 24h of scheduled runs. */
    scheduleDigest: boolean("schedule_digest").notNull().default(true),
    /** Marks the last digest so the cron route sends at most one per 24h. */
    scheduleDigestLastSentAt: timestamp("schedule_digest_last_sent_at"),
    /** Theme palette key from lib/themes.ts, synced across devices. */
    themePalette: text("theme_palette").notNull().default("alcatraz"),
    /** light | dark | system. */
    themeAppearance: text("theme_appearance").notNull().default("system"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

/** AI usage records one run's token consumption. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    /** Who this usage belongs to. */
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** What kind of activity this is. */
    activity: text("activity").notNull(), // "agent" | "browser" | "web_search"
    /** The model that was used (e.g. "gpt-4", "claude-3.5-sonnet"). */
    model: text("model"),
    /** Prompt tokens consumed. */
    tokensPrompt: integer("tokens_prompt").notNull().default(0),
    /** Completion tokens consumed. */
    tokensCompletion: integer("tokens_completion").notNull().default(0),
    /** Total tokens (prompt + completion). */
    tokensTotal: integer("tokens_total").notNull().default(0),
    /** Cost in USD, stored as numeric to preserve precision. */
    cost: numeric("cost").notNull().default("0"),
    /** What was run or observed. */
    runId: integer("run_id"),
    /** Optional reference: agent_schedule_runs, widget_refresh_runs, or browser_sessions. */
    refType: text("ref_type"), // "agent_schedule_run" | "widget_refresh_run" | "browser_session"
    /** When it started. */
    startedAt: timestamp("started_at").defaultNow().notNull(),
    /** When it ended. */
    endedAt: timestamp("ended_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_owner_idx").on(table.ownerId),
    index("ai_usage_activity_idx").on(table.activity),
    index("ai_usage_ref_idx").on(table.refType, table.runId),
  ],
);

/** A workspace created by a user on the Create Dashboard page. */
export const dashboards = pgTable(
  "dashboards",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Key into the icon catalog in `lib/dashboard-options.ts`. */
    icon: text("icon").notNull().default("layout-dashboard"),
    /** Key into the colour catalog in `lib/dashboard-options.ts`. */
    color: text("color").notNull().default("blue"),
    /** "blank" | "creator" | "daily" | "business" | "developer" | "research" */
    template: text("template").notNull().default("blank"),
    /** Dashboard background customization; null = the palette's own surface. */
    appearance: jsonb("appearance").$type<DashboardAppearance | null>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("dashboards_owner_idx").on(table.ownerId)],
);

/**
 * A code project the owner attached to the workspace: a cloned repository or a
 * folder on this machine. The developer agent reads it through the read-only
 * project tools; nothing is ever written into it.
 */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Shown in the picker, e.g. "acme/api" or the folder's own name. */
    name: text("name").notNull(),
    /** "repo" (cloned under .projects/<owner>) or "folder" (an existing path). */
    kind: text("kind").notNull().default("folder"),
    /** Absolute path on this machine. */
    location: text("location").notNull(),
    /** The https URL a repo was cloned from, null for a folder. */
    url: text("url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("projects_owner_idx").on(table.ownerId)],
);

/**
 * A team: a named group of this workspace's agents, one of which leads.
 *
 * Membership lives on `agents.team_id` (one team per agent), so moving someone
 * between teams is one column write and deleting a team only detaches its
 * members. `lead_agent_id` is deliberately not a foreign key: agents reference
 * teams, and a pair of cross-table FKs would make the two tables impossible to
 * create in either order. `lib/teams.ts` validates it on every write.
 */
export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The board this team works on; only that board's agents may join. */
    dashboardId: integer("dashboard_id").references(() => dashboards.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** A clay portrait (`shape:face[:motion]`), like an agent's. */
    avatar: text("avatar").notNull().default("circle:attentive"),
    /** Key into the twelve clay colours in `lib/agent-options.ts`. */
    color: text("color").notNull().default("blue"),
    /** One line on what the team is for; the lead's prompt states it. */
    objective: text("objective"),
    /** The agent a team chat runs with; null until the owner picks one. */
    leadAgentId: integer("lead_agent_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("teams_owner_idx").on(table.ownerId),
    index("teams_dashboard_idx").on(table.dashboardId),
  ],
);

/** An AI agent created from the sidebar / empty dashboard. */
export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * The dashboard this agent belongs to. The sidebar lists one dashboard's
     * team at a time; null only survives for rows created before dashboards
     * owned agents (the push backfilled them onto the owner's oldest board).
     */
    dashboardId: integer("dashboard_id").references(() => dashboards.id, { onDelete: "cascade" }),
    /** The team this agent works in; null = it works alone. */
    teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** Key into the avatar catalog in `lib/agent-options.ts`. */
    avatar: text("avatar").notNull().default("buddy"),
    /** Key into the colour catalog in `lib/agent-options.ts`. */
    color: text("color").notNull().default("blue"),
    /** "alcatraz" | "claude" | "chatgpt" | "codex" | "cursor" | "kimi" */
    provider: text("provider").notNull().default("alcatraz"),
    /** One short line on what this agent is for; kept apart from instructions. */
    objective: text("objective"),
    instructions: text("instructions"),
    /** "ask" | "auto" | "full" — how app actions that change data are approved. */
    approvalMode: text("approval_mode").notNull().default("ask"),
    /** Tool ids from `lib/agent-tool-options.ts`; null = every tool enabled. */
    enabledTools: jsonb("enabled_tools").$type<string[]>(),
    /** MCP tool keys `${serverId}:${toolName}`; null = every MCP tool. */
    mcpTools: jsonb("mcp_tools").$type<string[]>(),
    /** Workspace skill names this agent may load; null = every skill. */
    enabledSkills: jsonb("enabled_skills").$type<string[]>(),
    /** Custom plugin slugs this agent may call; null = every plugin. */
    enabledPlugins: jsonb("enabled_plugins").$type<string[]>(),
    /** Workspace diagram names this agent may load; NULL = every diagram. */
    enabledDiagrams: jsonb("enabled_diagrams").$type<string[]>(),
    /** Whether this agent keeps and uses memories between conversations. */
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agents_owner_idx").on(table.ownerId),
    index("agents_dashboard_idx").on(table.dashboardId),
    index("agents_team_idx").on(table.teamId),
  ],
);

/** Saved model configurations the user has connected (BYO AI models). */
export const agentModels = pgTable(
  "agent_models",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Model key, e.g. "openai/gpt-4" or "anthropic/claude-3.5-sonnet". */
    model: text("model").notNull(),
    /** Base URL for the model endpoint, e.g. https://api.openai.com/v1 or a custom proxy. */
    baseUrl: text("base_url").notNull(),
    /** API namespace, e.g. "chat_completions" or "responses". */
    api: text("api").notNull().default("chat_completions"),
    /** AES-256-GCM ciphertext of the API key. */
    apiKey: text("api_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("agent_models_owner_idx").on(table.ownerId)],
)

/** An MCP server the user connected themselves (streamable HTTP transport). */
export const agentMcpServers = pgTable(
  "agent_mcp_servers",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    /** AES-256-GCM ciphertext, or null when the server needs no auth. */
    apiKey: text("api_key"),
    /** OAuth grant (tokens, client id, token endpoint, expiry). Null for static-token or open servers. */
    oauth: text("oauth"),
    /** Tool names discovered at connect time; display only. */
    tools: jsonb("tools").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("agent_mcp_servers_owner_idx").on(table.ownerId)],
);

/** A reusable playbook the owner added to the workspace. */
export const customSkills = pgTable(
  "custom_skills",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** One line the prompt shows next to the name. */
    description: text("description").notNull(),
    /** Full Markdown / text instructions, loaded on demand. */
    instructions: text("instructions").notNull(),
    /** Uploaded filename, or null when the skill was written inline. */
    sourceName: text("source_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("custom_skills_owner_name_idx").on(table.ownerId, table.name),
    index("custom_skills_owner_idx").on(table.ownerId, table.createdAt),
  ],
);

/** A custom HTTP tool the owner added. */
export const customPlugins = pgTable(
  "custom_plugins",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Stable tool suffix, unique per owner: `plugin_<slug>`. */
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    url: text("url").notNull(),
    /** "GET" | "POST" */
    method: text("method").notNull().default("POST"),
    /** AES-256-GCM ciphertext of the Authorization header, or null. */
    authorization: text("authorization"),
    /** What the endpoint expects in `input`, shown in the prompt. */
    inputHint: text("input_hint"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("custom_plugins_owner_slug_idx").on(table.ownerId, table.slug),
    index("custom_plugins_owner_idx").on(table.ownerId, table.createdAt),
  ],
);

/** A reusable Archify diagram (JSON IR) the owner saved to the workspace. */
export const customDiagrams = pgTable(
  "custom_diagrams",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** One line the prompt shows next to the name. */
    description: text("description").notNull(),
    /** Archify JSON IR, fences already stripped; very old rows hold Mermaid. */
    source: text("source").notNull(),
    /** Uploaded filename, or null when the diagram was written inline. */
    sourceName: text("source_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("custom_diagrams_owner_name_idx").on(table.ownerId, table.name),
    index("custom_diagrams_owner_idx").on(table.ownerId, table.createdAt),
  ],
);

/** One durable note an agent keeps about its owner, between conversations. */
export const agentMemories = pgTable(
  "agent_memories",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** The note itself: one short, self-contained sentence or two. */
    content: text("content").notNull(),
    /** Lowercase keywords, used by recall scoring and by the graph. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** "agent" when save_memory wrote it, "owner" when it was written by hand. */
    source: text("source").notNull().default("agent"),
    /** How many times recall_memory returned it. */
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_memories_owner_idx").on(table.ownerId, table.createdAt),
    index("agent_memories_agent_idx").on(table.agentId, table.createdAt),
  ],
);

/** A recurring prompt for one agent. */
export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Short label in the schedule list. */
    title: text("title").notNull(),
    /** What the agent is asked on every run. */
    prompt: text("prompt").notNull(),
    /** "once" | "interval" | "daily" | "weekly" | "monthly" (the rule's source of truth). */
    frequency: text("frequency").notNull().default("daily"),
    /** Times of day in `timezone`, up to four. Daily/weekly/monthly use them. */
    times: jsonb("times").$type<{ hour: number; minute: number }[]>().notNull().default([]),
    /** 1–31, for monthly. */
    monthDay: integer("month_day").notNull().default(1),
    /** Minutes between runs, for interval. */
    intervalMinutes: integer("interval_minutes").notNull().default(60),
    /** `YYYY-MM-DD`, for a one-off run. */
    runDate: text("run_date"),
    /** Widget refreshed after a successful run, if any (no FK: widgets can be deleted). */
    linkedWidgetId: integer("linked_widget_id"),
    /** Shape: `ScheduleActionPolicy` in `lib/schedule-action.ts`. */
    action: jsonb("action").$type<ScheduleActionPolicy | null>(),
    /** Legacy mirror of `frequency` (hourly → interval), kept for old readers. */
    cadence: text("cadence").notNull().default("daily"),
    /** IANA zone the times mean; null = server local time. */
    timezone: text("timezone"),
    /** Legacy mirror of the first time in `times`. */
    hour: integer("hour").notNull().default(9),
    minute: integer("minute").notNull().default(0),
    /** 0 = Sunday … 6 = Saturday, for weekly. */
    weekday: integer("weekday").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at"),
    lastRunAt: timestamp("last_run_at"),
    /** "ok" | "error" | null */
    lastStatus: text("last_status"),
    /** Start of the previous reply, for the list. */
    lastReply: text("last_reply"),
    /** CloudHike Jobs recurring schedule id (null until synced). */
    jobsScheduleId: text("jobs_schedule_id"),
    /** Why the last Jobs sync failed, or null when it is in sync. */
    jobsError: text("jobs_error"),
    /** Last time this row was pushed to CloudHike Jobs. */
    jobsSyncedAt: timestamp("jobs_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_schedules_agent_idx").on(table.agentId),
    index("agent_schedules_due_idx").on(table.enabled, table.nextRunAt),
  ],
);

/** One execution of a schedule. */
export const agentScheduleRuns = pgTable(
  "agent_schedule_runs",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => agentSchedules.id, { onDelete: "cascade" }),
    /** "ok" | "error" */
    status: text("status").notNull(),
    /** Start of the reply, or the safe error message. */
    reply: text("reply"),
    /** The complete result, so history can show the whole reply. */
    result: text("result"),
    /** Exactly what this run sent or posted, in order (empty when it sent nothing). */
    sent: jsonb("sent").$type<ScheduleSentAction[]>(),
    /** Memories `recall_memory` returned during this run, so history shows them. */
    recalled: jsonb("recalled").$type<{ id: number; content: string }[]>(),
    /** "manual" | "cron" | "jobs" */
    trigger: text("trigger").notNull().default("manual"),
    /** True when this run drove the cloud browser. */
    browserUsed: boolean("browser_used").notNull().default(false),
    /** Browserbase session id, so the history can link to its replay. */
    browserSessionId: text("browser_session_id"),
    /** True when the reply matched the last delivery and was not re-delivered. */
    duplicate: boolean("duplicate").notNull().default(false),
    /** Wall-clock duration of the run, in milliseconds. */
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_schedule_runs_schedule_idx").on(table.scheduleId, table.id)],
);

/** A live card on the owner's dashboard. */
export const widgets = pgTable(
  "widgets",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dashboardId: integer("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    /** The agent that created it; edits happen in that agent's chat. */
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    /** Key into `WIDGET_ICONS` in `lib/widget-types.ts`. */
    icon: text("icon").notNull().default("activity"),
    /** Key into the 20-scene illustration catalog. */
    illustration: text("illustration").notNull().default("spark"),
    /** Key into `WIDGET_DESIGNS` in `lib/widget-types.ts`. */
    design: text("design").notNull().default("classic"),
    /** Legacy line/bars. New widgets store their visual form below. */
    chart: text("chart").notNull().default("line"),
    /** One of the 13 WidgetForm keys; "auto" for rows created before forms. */
    form: text("form").notNull().default("auto"),
    /** `WidgetData`: metrics, series, items and a footnote. */
    data: jsonb("data").$type<WidgetPayload>().notNull(),
    /** "small" | "medium" | "large"; new widgets start at medium. */
    size: text("size").notNull().default("medium"),
    /** Grid cell (0-based) the owner dragged it to. */
    positionX: integer("position_x").notNull().default(0),
    positionY: integer("position_y").notNull().default(0),
    /** Per-widget colors, background, radius, shadow, type and header options. */
    appearance: jsonb("appearance").$type<WidgetAppearance | null>(),
    /** Locked widgets ignore drag and resize until unlocked. */
    locked: boolean("locked").notNull().default(false),
    /** What the widget tracks, used to refresh it on its own schedule. */
    sourcePrompt: text("source_prompt"),
    /** Legacy: the agent schedule this widget used to follow. */
    scheduleId: integer("schedule_id").references(() => agentSchedules.id, {
      onDelete: "set null",
    }),
    /** Last time any refresh replaced `data`. */
    syncedAt: timestamp("synced_at"),
    /** "once" | "interval" | "daily" | "weekly" | "monthly" (the rule's source of truth). */
    scheduleFrequency: text("schedule_frequency").notNull().default("daily"),
    /** Times of day in `refresh_timezone`, up to four. Default twice a day, 8 AM and 6 PM. */
    scheduleTimes: jsonb("schedule_times")
      .$type<{ hour: number; minute: number }[]>()
      .notNull()
      .default([]),
    /** 0 = Sunday … 6 = Saturday, for weekly. */
    scheduleWeekday: integer("schedule_weekday").notNull().default(1),
    /** 1–31, for monthly. */
    scheduleMonthDay: integer("schedule_month_day").notNull().default(1),
    /** `YYYY-MM-DD`, for a one-off refresh. */
    scheduleDate: text("schedule_date"),
    /** Minutes between updates, for interval. */
    scheduleIntervalMinutes: integer("schedule_interval_minutes").notNull().default(720),
    /** Legacy average interval in minutes, mirrored from the rule. */
    refreshMinutes: integer("refresh_minutes").notNull().default(720),
    /** Legacy five-field cron mirrored from the rule, e.g. `0 8,18 * * *`. */
    refreshCron: text("refresh_cron").notNull().default("0 8,18 * * *"),
    /** IANA zone the rule means; null falls back to UTC at the scheduler. */
    /** Model key the owner last chose for "Edit with AI" (null = agent's model). */
    editModel: text("edit_model"),
    refreshTimezone: text("refresh_timezone"),
    /** Pause/resume the widget's automatic updates without deleting it. */
    refreshEnabled: boolean("refresh_enabled").notNull().default(true),
    /** CloudHike Jobs recurring schedule id (null until synced). */
    jobsScheduleId: text("jobs_schedule_id"),
    /** Why the last Jobs sync failed, or null when it is in sync. */
    jobsError: text("jobs_error"),
    /** When the next scheduled read-only update is due. */
    nextRefreshAt: timestamp("next_refresh_at"),
    /** Last completed refresh attempt (successful or not). */
    lastRefreshAt: timestamp("last_refresh_at"),
    /** "ok" | "error" | null. */
    lastRefreshStatus: text("last_refresh_status"),
    /** Short "what changed" line, shown in the history and on the card. */
    lastRefreshNote: text("last_refresh_note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("widgets_owner_idx").on(table.ownerId, table.id),
    index("widgets_dashboard_idx").on(table.dashboardId, table.id),
    index("widgets_agent_idx").on(table.agentId, table.id),
    index("widgets_schedule_idx").on(table.scheduleId),
    index("widgets_next_refresh_idx").on(table.nextRefreshAt),
  ],
);

/** One run of a widget's own refresh schedule. */
export const widgetRefreshRuns = pgTable(
  "widget_refresh_runs",
  {
    id: serial("id").primaryKey(),
    widgetId: integer("widget_id")
      .notNull()
      .references(() => widgets.id, { onDelete: "cascade" }),
    /** "ok" | "error" */
    status: text("status").notNull(),
    /** One line: what changed, or why the update couldn't run. */
    note: text("note"),
    /** "schedule" | "manual" | "agent" | "catchup" */
    trigger: text("trigger").notNull().default("schedule"),
    /** True when the read-only run drove the cloud browser. */
    browserUsed: boolean("browser_used").notNull().default(false),
    /** True when the run produced exactly the stored data, so nothing was delivered. */
    duplicate: boolean("duplicate").notNull().default(false),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("widget_refresh_runs_widget_idx").on(table.widgetId, table.id)],
);

/** One cloud-browser session the agent opened during a reply. */
export const browserSessions = pgTable(
  "browser_sessions",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Browserbase session id (used to build the replay link). */
    sessionId: text("session_id").notNull(),
    /** The persistent Context the session ran in. */
    contextId: text("context_id"),
    /** browser_open / browser_act / browser_extract calls in that session. */
    actions: integer("actions").notNull().default(0),
    /** "closed" | "failed" */
    status: text("status").notNull().default("closed"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("browser_sessions_agent_idx").on(table.agentId, table.id)],
);

/** One site the owner's cloud-browser profile is signed in to. */
export const browserLogins = pgTable(
  "browser_logins",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Hostname the session is for, e.g. "github.com". */
    host: text("host").notNull(),
    /** The page the login was completed on. */
    url: text("url").notNull(),
    /** Page title at sign-in time, for a human label. */
    label: text("label"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Last time the session was confirmed or refreshed. */
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("browser_logins_owner_host_idx").on(table.ownerId, table.host),
    index("browser_logins_owner_idx").on(table.ownerId, table.lastSeenAt),
  ],
);

/** One turn of an agent conversation, kept so a transcript survives a reload. */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: serial("id").primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** "user" | "assistant" */
    role: text("role").notNull(),
    content: text("content").notNull(),
    steps: jsonb("steps").$type<{ name: string; label: string }[]>(),
    sources: jsonb("sources").$type<{ title: string; url: string }[]>(),
    /** Result cards produced by app actions, rendered again after a reload. */
    cards: jsonb("cards").$type<AgentResultCard[]>(),
    /** Teammate answers this turn used, so a reload keeps the hand-off cards. */
    handoffs: jsonb("handoffs").$type<AgentHandoffResult[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_messages_agent_idx").on(table.agentId, table.id)],
);

/** One external app a user connected through Composio. */
export const appConnections = pgTable(
  "app_connections",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Composio toolkit slug, e.g. "gmail". */
    toolkit: text("toolkit").notNull(),
    /** Composio's connected account id (null until a connect link is created). */
    connectedAccountId: text("connected_account_id"),
    /** "pending" | "active" | "error" | "disconnected" */
    status: text("status").notNull().default("pending"),
    /** Account label Composio reports (an alias or handle), never a token. */
    accountLabel: text("account_label"),
    /** Last time Composio was asked about this connection. */
    lastCheckedAt: timestamp("last_checked_at"),
    connectedAt: timestamp("connected_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("app_connections_owner_toolkit_idx").on(table.ownerId, table.toolkit)],
);

/** One pending approval for an app action that changes data. */
export const agentApprovals = pgTable(
  "agent_approvals",
  {
    /** Token id, also carried inside the encrypted token. */
    jti: text("jti").notNull(),  // primaryKey removed due to drizzle-orm type issue
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Composio toolkit slug, e.g. "gmail". */
    toolkit: text("toolkit").notNull(),
    /** Composio action slug, e.g. "GMAIL_SEND_EMAIL". */
    action: text("action").notNull(),
    /** One line describing the change, shown on the approval card. */
    summary: text("summary").notNull(),
    /** "pending" | "approved" | "denied" */
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("agent_approvals_owner_idx").on(table.ownerId, table.agentId)],
);

/** A card on the workspace task board (one board per owner). */
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Optional detail, shown on the card and in the edit dialog. */
    notes: text("notes"),
    /** "todo" | "doing" | "done" */
    status: text("status").notNull().default("todo"),
    /** "low" | "normal" | "high" */
    priority: text("priority").notNull().default("normal"),
    /** Order inside its column, ascending from 0. */
    position: integer("position").notNull().default(0),
    /** YYYY-MM-DD in the owner's local sense, or null. */
    dueDate: text("due_date"),
    /** "manual" | "agent" — who put the card on the board. */
    source: text("source").notNull().default("manual"),
    /** The agent whose chat proposed it, when source = "agent". */
    sourceAgentId: integer("source_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    /** Built-in tools / skills / plugin tools / MCP servers / connected apps the owner picked for this card. */
    tools: jsonb("tools").$type<TaskToolSelection>(),
    /** The agent schedule that runs this card, once one was created from it. */
    scheduleId: integer("schedule_id").references(() => agentSchedules.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("tasks_owner_status_idx").on(table.ownerId, table.status, table.position)],
);

/** One role on a task (designer, frontend, reviewer, …), optionally staffed. */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** The agent doing this role; null while the role is still open. */
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** Role key: a seeded role from `TASK_ROLES`, or one the owner wrote. */
    role: text("role").notNull().default("lead"),
    /** That role's own progress on this card: todo | doing | review | done. */
    status: text("status").notNull().default("todo"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("task_assignees_task_role_idx").on(table.taskId, table.role),
    index("task_assignees_task_idx").on(table.taskId),
  ],
);

/**
 * A workspace role. The seeded catalog is copied in on first load, then the
 * owner owns it: rename it, rewrite its brief, attach a file, add a new one or
 * delete one. `task_assignees.role` stores the key, so a card keeps resolving
 * the role's current label and brief instead of a frozen copy.
 */
export const taskRoles = pgTable(
  "task_roles",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable key used by cards and tool calls, e.g. "designer". */
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** Chip tint key from `TASK_ROLE_TONES`. */
    tone: text("tone").notNull().default("neutral"),
    /** The brief a run in this role carries. */
    prompt: text("prompt").notNull().default(""),
    /** One line in the picker. */
    hint: text("hint").notNull().default(""),
    /** True for the seeded catalog, false for an owner-written role. */
    builtin: boolean("builtin").notNull().default(false),
    /** Uploaded briefs: [{ name, content }] with the text already extracted. */
    attachments: jsonb("attachments").$type<TaskRoleAttachment[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("task_roles_owner_key_idx").on(table.ownerId, table.key)],
);

/** One agent turn against a card: its Run now button, or its schedule. */
export const taskRuns = pgTable(
  "task_runs",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** The agent that ran it; kept null if the agent is later deleted. */
    agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** The role key the run used, so history keeps its own label. */
    role: text("role").notNull().default(""),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("ok"),
    /** First ~400 characters of the reply, enough for the card. */
    reply: text("reply"),
    /** The whole reply, when it fits. */
    result: text("result"),
    browserUsed: boolean("browser_used").notNull().default(false),
    durationMs: integer("duration_ms"),
    /** Tokens this run spent, when the provider reported usage. */
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    /** Memories `recall_memory` returned during this run. */
    recalled: jsonb("recalled").$type<{ id: number; content: string }[]>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("task_runs_task_idx").on(table.taskId, table.createdAt)],
);

/** A change worth showing on a card's timeline: a role moved, a step ticked. */
export const taskEvents = pgTable(
  "task_events",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** "role" | "step" */
    kind: text("kind").notNull(),
    /** One line, already worded for the timeline. */
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("task_events_task_idx").on(table.taskId, table.createdAt)],
);

/** One progress step inside a card: "Draft the copy", "Ship it". */
export const taskSteps = pgTable(
  "task_steps",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("task_steps_task_idx").on(table.taskId, table.position)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
export type AgentScheduleRun = typeof agentScheduleRuns.$inferSelect;
export type NewAgentScheduleRun = typeof agentScheduleRuns.$inferInsert;
export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;
export type AgentMcpServer = typeof agentMcpServers.$inferSelect;
export type NewAgentMcpServer = typeof agentMcpServers.$inferInsert;
export type CustomSkill = typeof customSkills.$inferSelect;
export type NewCustomSkill = typeof customSkills.$inferInsert;
export type CustomPlugin = typeof customPlugins.$inferSelect;
export type NewCustomPlugin = typeof customPlugins.$inferInsert;
export type CustomDiagram = typeof customDiagrams.$inferSelect;
export type NewCustomDiagram = typeof customDiagrams.$inferInsert;
export type AgentMemory = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
export type BrowserSession = typeof browserSessions.$inferSelect;
export type NewBrowserSession = typeof browserSessions.$inferInsert;
export type AppConnection = typeof appConnections.$inferSelect;
export type NewAppConnection = typeof appConnections.$inferInsert;
export type AgentApproval = typeof agentApprovals.$inferSelect;
export type NewAgentApproval = typeof agentApprovals.$inferInsert;
export type Widget = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
export type WidgetRefreshRun = typeof widgetRefreshRuns.$inferSelect;
export type NewWidgetRefreshRun = typeof widgetRefreshRuns.$inferInsert;
export type BrowserLogin = typeof browserLogins.$inferSelect;
export type NewBrowserLogin = typeof browserLogins.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;
export type TaskRole = typeof taskRoles.$inferSelect;
export type NewTaskRole = typeof taskRoles.$inferInsert;
export type TaskStep = typeof taskSteps.$inferSelect;
export type NewTaskStep = typeof taskSteps.$inferInsert;
export type TaskRun = typeof taskRuns.$inferSelect;
export type NewTaskRun = typeof taskRuns.$inferInsert;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;
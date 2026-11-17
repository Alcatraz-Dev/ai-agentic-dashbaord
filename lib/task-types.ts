import { AGENT_TOOL_OPTIONS } from "@/lib/agent-tool-options";

/**
 * Shared task-board vocabulary. Client-safe: the board, the server actions and
 * lib/tasks.ts all import these, so a status, a role or a tool selection can
 * never drift between the two halves of the app.
 */

/** The progress steps, left to right. A card moves one step with the arrows. */
export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Backlog",
  doing: "In progress",
  review: "In review",
  done: "Done",
};

/** One line under each column heading. */
export const TASK_STATUS_HINTS: Record<TaskStatus, string> = {
  todo: "Everything the workspace has decided to do.",
  doing: "Work in flight — keep it short.",
  review: "Waiting on a read-through, a test or an approval.",
  done: "Finished. Drag or step back out if it isn't.",
};

/** Shorter labels for a role's own progress, where space is tight. */
export const TASK_ROLE_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Queued",
  doing: "Working",
  review: "Review",
  done: "Done",
};

/** The column to the left/right, or null at either end. */
export function stepTaskStatus(status: TaskStatus, direction: -1 | 1): TaskStatus | null {
  const index = TASK_STATUSES.indexOf(status) + direction;
  return TASK_STATUSES[index] ?? null;
}

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** Soft cap on "In progress": the board warns, it never blocks the move. */
export const TASK_WIP_LIMIT = 5;

export const TASKS_MAX = 200;
export const TASK_TITLE_MAX = 140;
export const TASK_SUMMARY_MAX = 160;
export const TASK_NOTES_MAX = 2_000;

/* ------------------------------------------------------------------ roles -- */

/**
 * The roles a card can be staffed with. These are the workspace's *starting*
 * roles: `lib/tasks.ts` copies them into `task_roles` the first time the board
 * loads, and from then on the owner can rename, rewrite, delete or add roles
 * without touching code. The catalog here is the seed and the fallback.
 */
export const TASK_ROLES = [
  "lead",
  "planner",
  "designer",
  "frontend",
  "backend",
  "writer",
  "researcher",
  "reviewer",
  "creator",
  "publisher",
] as const;
export type TaskRole = (typeof TASK_ROLES)[number];

export type TaskRoleOption = {
  id: TaskRole;
  label: string;
  /** One line shown next to the role in the picker. */
  hint: string;
  /** The instruction a scheduled run for this role carries. */
  focus: string;
  /** Chip tint; identity-neutral, so it follows the palette's ink. */
  tone: string;
};

/** Tints a role can wear. Keys are stored, so a palette change retints them. */
export const TASK_ROLE_TONES = [
  "neutral",
  "brand",
  "violet",
  "sky",
  "emerald",
  "amber",
  "teal",
  "rose",
  "fuchsia",
  "indigo",
] as const;
export type TaskRoleTone = (typeof TASK_ROLE_TONES)[number];

export const TASK_ROLE_TONE_CLASSES: Record<TaskRoleTone, string> = {
  neutral: "bg-foreground/5 text-foreground ring-foreground/15",
  brand: "bg-brand-soft text-brand-ink ring-brand-border",
  violet:
    "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-400/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  fuchsia:
    "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/15 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
  indigo:
    "bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20",
};

export const TASK_ROLE_OPTIONS: TaskRoleOption[] = [
  {
    id: "lead",
    label: "Lead",
    hint: "Owns the card and pulls the other roles together.",
    focus:
      "You own this card: decide the next concrete step, do what you can yourself and report what is blocked.",
    tone: TASK_ROLE_TONE_CLASSES.neutral,
  },
  {
    id: "planner",
    label: "Planner",
    hint: "Breaks the card into ordered steps.",
    focus: "Break this card into a short ordered plan with owners and what done looks like.",
    tone: TASK_ROLE_TONE_CLASSES.brand,
  },
  {
    id: "designer",
    label: "Designer",
    hint: "Visual direction, layout and copy tone.",
    focus:
      "Take the design angle: layout, hierarchy, spacing, colour and wording, with concrete choices rather than moods.",
    tone: TASK_ROLE_TONE_CLASSES.violet,
  },
  {
    id: "frontend",
    label: "Frontend",
    hint: "The UI, components and client behaviour.",
    focus:
      "Own the frontend: which components change, the states they need (loading, empty, error) and the exact UI behaviour.",
    tone: TASK_ROLE_TONE_CLASSES.sky,
  },
  {
    id: "backend",
    label: "Backend",
    hint: "Data, actions, jobs and integrations.",
    focus:
      "Own the backend: schema, ownership checks, actions or jobs this card needs, and the failure cases.",
    tone: TASK_ROLE_TONE_CLASSES.emerald,
  },
  {
    id: "writer",
    label: "Writer",
    hint: "Copy, docs and the words of the thing.",
    focus:
      "Write the copy for this card: plain, specific and short, in the workspace's own voice.",
    tone: TASK_ROLE_TONE_CLASSES.amber,
  },
  {
    id: "researcher",
    label: "Researcher",
    hint: "Finds the facts and sources first.",
    focus:
      "Research this card first: find the facts, cite the sources you actually read, and say what you could not verify.",
    tone: TASK_ROLE_TONE_CLASSES.teal,
  },
  {
    id: "reviewer",
    label: "Reviewer",
    hint: "Checks the work before it ships.",
    focus:
      "Review the work on this card: what is wrong, what is missing, what would break — and only then approve it.",
    tone: TASK_ROLE_TONE_CLASSES.rose,
  },
  {
    id: "creator",
    label: "Creator",
    hint: "Makes the asset or the first draft.",
    focus: "Produce the asset this card needs as a complete first draft, not an outline.",
    tone: TASK_ROLE_TONE_CLASSES.fuchsia,
  },
  {
    id: "publisher",
    label: "Publisher",
    hint: "Ships it and reports where it landed.",
    focus:
      "Ship this card through the connected apps, then say exactly what was published and where.",
    tone: TASK_ROLE_TONE_CLASSES.indigo,
  },
];

/** "growth-ops" → "Growth Ops", used for a role key that has no row yet. */
export function roleLabelFromKey(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .slice(0, TASK_ROLE_LABEL_MAX);
}

/** The shape a card holds: enough to draw the chip and word the run. */
export type TaskRoleInfo = {
  key: string;
  label: string;
  /** Chip classes for this role's tint. */
  tone: string;
  /** The brief a run in this role carries. */
  prompt: string;
  hint: string;
  /** True for the seeded catalog, false for a role the owner wrote. */
  builtin: boolean;
};

/** A workspace role, including the files the owner attached to it. */
export type TaskRoleRecord = TaskRoleInfo & {
  id: number;
  attachments: TaskRoleAttachment[];
};

/** One uploaded brief for a role. Text only, so it can go straight in a prompt. */
export type TaskRoleAttachment = { name: string; content: string };

/**
 * The tone key behind a stored chip, even an older value with extra classes.
 * Null means "not one of ours", so a save can leave it untouched.
 */
export function toneKeyFromClasses(classes: string): TaskRoleTone | null {
  const keys = Object.keys(TASK_ROLE_TONE_CLASSES) as TaskRoleTone[];
  const exact = keys.find((key) => TASK_ROLE_TONE_CLASSES[key] === classes);
  if (exact) return exact;

  const background = classes.split(/\s+/).find((entry) => entry.startsWith("bg-"));
  if (!background) return null;

  return (
    keys.find((key) => TASK_ROLE_TONE_CLASSES[key].split(/\s+/).includes(background)) ?? null
  );
}

export function getTaskRoleTone(tone: unknown): TaskRoleTone {
  return (TASK_ROLE_TONES as readonly string[]).includes(String(tone))
    ? (tone as TaskRoleTone)
    : "neutral";
}

/** An unknown or deleted role still renders, as itself, with a neutral chip. */
export function getTaskRole(role: unknown): TaskRoleInfo {
  const key = typeof role === "string" && role.trim() ? role.trim().slice(0, 40) : "lead";
  const option = TASK_ROLE_OPTIONS.find((entry) => entry.id === key);

  if (option) {
    return {
      key: option.id,
      label: option.label,
      tone: option.tone,
      prompt: option.focus,
      hint: option.hint,
      builtin: true,
    };
  }

  return {
    key,
    label: roleLabelFromKey(key),
    tone: TASK_ROLE_TONE_CLASSES.neutral,
    prompt: "",
    hint: "A custom role from this workspace.",
    builtin: false,
  };
}

export function isTaskRole(value: unknown): value is TaskRole {
  return typeof value === "string" && (TASK_ROLES as readonly string[]).includes(value);
}

/** Any role key — built-in or written by the owner. */
export function isTaskRoleKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{1,38}$/.test(value);
}

export const TASK_ROLE_LABEL_MAX = 40;
export const TASK_ROLE_PROMPT_MAX = 4_000;
export const TASK_ROLE_HINT_MAX = 120;
export const TASK_ROLE_ATTACHMENTS_MAX = 4;
export const TASK_ROLE_FILE_BYTES_MAX = 20_000;
export const TASK_ROLES_MAX = 24;
export const TASK_ROLE_FILE_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json"] as const;

/** Soft cap on how many roles one card can carry. */
export const TASK_ASSIGNEES_MAX = 6;

/* ----------------------------------------------------------------- people -- */

/** Public identity of an agent, enough to draw its portrait and link to it. */
export type TaskAgentRef = {
  id: number;
  name: string;
  avatar: string;
  color: string;
};

/**
 * One role on a card: the role itself, who is on it (nullable while it is open)
 * and how far that part has got.
 */
export type TaskAssigneeSummary = {
  role: TaskRoleInfo;
  agent: TaskAgentRef | null;
  status: TaskStatus;
};

/* ------------------------------------------------------------------ steps -- */

/** One progress step inside a card: "Draft the copy", "Ship it". */
export type TaskStep = {
  id: number;
  title: string;
  done: boolean;
};

export const TASK_STEPS_MAX = 20;
export const TASK_STEP_TITLE_MAX = 140;

/* ------------------------------------------------------------------- runs -- */

/** What started a run: the card's Run now button, or its schedule. */
export type TaskRunTrigger = "manual" | "schedule";

/** One agent turn against a card, as the board shows it. */
export type TaskRunSummary = {
  id: number;
  /** The role key the run used, with its label resolved at read time. */
  roleKey: string;
  roleLabel: string;
  agent: TaskAgentRef | null;
  trigger: TaskRunTrigger;
  status: "ok" | "error";
  /** Up to ~400 characters; the whole reply is not sent to the board. */
  reply: string;
  browserUsed: boolean;
  /** Provider-reported tokens, or null when the run predates the columns. */
  promptTokens: number | null;
  completionTokens: number | null;
  /** Memories the agent looked up in this run (`recall_memory` hits). */
  recalled: { id: number; content: string }[];
  /** ISO timestamp. */
  createdAt: string;
};

/** One run with its whole reply, for the card's run history. */
export type TaskRunRecord = TaskRunSummary & { result: string };

/** The one line a run costs: prompt + completion, or null when unreported. */
export function runTokenTotal(run: {
  promptTokens: number | null;
  completionTokens: number | null;
}): number | null {
  if (run.promptTokens === null && run.completionTokens === null) return null;
  return (run.promptTokens ?? 0) + (run.completionTokens ?? 0);
}

/** "820", "12.4k", "1.2M" — short enough for one chip. */
export function formatTokenTotal(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 10_000) return `${Math.round(tokens / 1_000)}k`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(Math.round(tokens));
}

/* --------------------------------------------------------------- activity -- */

/**
 * One line on a card's timeline: a role change or a step change written by the
 * server, or a run read from `task_runs`. Runs keep their summary so the
 * timeline can show status, duration and tokens without a second query.
 */
export type TaskActivityEntry =
  | { kind: "role" | "step" | "card"; id: string; detail: string; at: string }
  | { kind: "run"; id: string; at: string; run: TaskRunSummary };

/* ------------------------------------------------------------- tools per card */

/**
 * What the owner picked for this card from the workspace: skills, plugin
 * tools, MCP servers and connected apps. The task run is told to use these.
 */
export type TaskToolSelection = {
  /** Built-in tool ids from `AGENT_TOOL_OPTIONS`; empty = the agent's own set. */
  builtin: string[];
  skills: string[];
  /** Workspace diagram names, loaded through `use_diagram`. */
  diagrams: string[];
  plugins: string[];
  mcpServers: number[];
  apps: string[];
};

export const EMPTY_TASK_TOOLS: TaskToolSelection = {
  builtin: [],
  skills: [],
  diagrams: [],
  plugins: [],
  mcpServers: [],
  apps: [],
};

export const TASK_TOOLS_MAX = 8;

function uniqueStrings(value: unknown, max: number, pattern?: RegExp): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 80 || seen.has(trimmed)) continue;
    if (pattern && !pattern.test(trimmed)) continue;

    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) break;
  }

  return result;
}

/** Stored selections are narrowed here, so an old or hand-edited row is safe. */
export function normalizeTaskTools(value: unknown): TaskToolSelection {
  const source = (value ?? {}) as Record<string, unknown>;
  const servers = Array.isArray(source.mcpServers) ? source.mcpServers : [];

  return {
    builtin: uniqueStrings(source.builtin, AGENT_TOOL_OPTIONS.length).filter((id) =>
      AGENT_TOOL_OPTIONS.some((option) => option.id === id),
    ),
    skills: uniqueStrings(source.skills, TASK_TOOLS_MAX * 2),
    diagrams: uniqueStrings(source.diagrams, TASK_TOOLS_MAX * 2),
    plugins: uniqueStrings(source.plugins, TASK_TOOLS_MAX * 2, /^[a-z0-9_-]+$/),
    mcpServers: [
      ...new Set(
        servers
          .map((entry) => Number(entry))
          .filter((entry) => Number.isInteger(entry) && entry > 0),
      ),
    ].slice(0, TASK_TOOLS_MAX),
    apps: uniqueStrings(source.apps, TASK_TOOLS_MAX * 2, /^[_a-z0-9-]+$/),
  };
}

export function taskToolCount(tools: TaskToolSelection): number {
  return (
    tools.builtin.length +
    tools.skills.length +
    tools.diagrams.length +
    tools.plugins.length +
    tools.mcpServers.length +
    tools.apps.length
  );
}

/**
 * Built-in tools are a narrower ceiling on the agent's own switches, not part of
 * the workspace-tool policy: picking only a built-in tool must not silently
 * strip every skill or plugin from the run.
 */
export function cardBuiltinTools(tools: TaskToolSelection | null | undefined): string[] | null {
  return tools && tools.builtin.length > 0 ? tools.builtin : null;
}

/* ------------------------------------------------------------------- cards -- */

/** The schedule that runs this card, when the owner created one from it. */
export type TaskScheduleRef = {
  id: number;
  title: string;
  agentId: number;
  /** ISO timestamp of the next run, or null when it is paused/one-off past. */
  nextRunAt: string | null;
};

/** "manual" when the board's composer made it, "agent" when a chat card did. */
export type TaskSource = "manual" | "agent";

export type TaskSummary = {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  position: number;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  source: TaskSource;
  /** The agent whose chat proposed it, with the link back to that chat. */
  sourceAgent: TaskAgentRef | null;
  /** Every role on the card, with whoever is on it and that part's progress. */
  assignees: TaskAssigneeSummary[];
  /** The card's own progress steps. */
  steps: TaskStep[];
  /** Skills / plugins / MCP servers / apps the run should use. */
  tools: TaskToolSelection;
  /** The newest runs against this card, newest first (at most 3). */
  runs: TaskRunSummary[];
  /** How many runs this card has ever had. */
  runCount: number;
  /** Role changes, step changes and runs, newest first (at most 12). */
  activity: TaskActivityEntry[];
  /** The schedule that runs this card, once the owner made one. */
  schedule: TaskScheduleRef | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A card the agent drafted in chat. Nothing is written until the owner clicks
 * Add to board, which calls the same server action as the inline composer.
 */
export type TaskProposal = {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** YYYY-MM-DD, or null. */
  dueDate: string | null;
  /** One line on why the card is worth doing, shown above the form. */
  summary: string;
  /** Role keys the agent suggests staffing the card with. */
  roles: string[];
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------- brief -- */

/** Prompts the model writes for a task run are bounded like schedule prompts. */
export const TASK_RUN_PROMPT_MAX = 4_000;

/** What a run needs to know about its role, however that role was written. */
export type TaskRunRole = { key: string; label: string; prompt: string };

/**
 * The brief a scheduled run of this card carries: the card, its open steps, the
 * tools the owner picked for it, and the brief of the role that is running it.
 */
export function taskRunPrompt(
  task: Pick<TaskSummary, "title" | "notes" | "steps" | "tools"> & { id?: number },
  role?: TaskRunRole,
  mcpLabels?: Record<number, string>,
): string {
  const chosen = role ?? getTaskRole("lead");
  const openSteps = (task.steps ?? []).filter((step) => !step.done).map((step) => step.title);
  const doneSteps = (task.steps ?? []).filter((step) => step.done).length;
  const tools = task.tools ?? EMPTY_TASK_TOOLS;

  const mcp = tools.mcpServers
    .map((id) => mcpLabels?.[id])
    .filter((label): label is string => Boolean(label));

  const picked = [
    tools.builtin.length > 0 ? `built-in tools: ${tools.builtin.join(", ")}` : "",
    tools.skills.length > 0 ? `workspace skills: ${tools.skills.join(", ")}` : "",
    tools.diagrams.length > 0
      ? `saved diagrams (load with use_diagram): ${tools.diagrams.join(", ")}`
      : "",
    tools.plugins.length > 0
      ? `plugin tools: ${tools.plugins.map((slug) => `plugin_${slug}`).join(", ")}`
      : "",
    mcp.length > 0 ? `MCP servers: ${mcp.join(", ")}` : "",
    tools.apps.length > 0 ? `connected apps: ${tools.apps.join(", ")}` : "",
  ].filter(Boolean);

  return [
    `Work on task #${task.id ?? ""}: ${task.title}`.replace("#:", "#"),
    task.notes ? `\nNotes: ${task.notes}` : "",
    `\nYour role: ${chosen.label}.${chosen.prompt ? ` ${chosen.prompt}` : ""}`,
    doneSteps > 0 ? `\nSteps already done: ${doneSteps}.` : "",
    openSteps.length > 0 ? `\nOpen steps: ${openSteps.join(" · ")}` : "",
    picked.length > 0
      ? `\nThe owner picked these for this card — use them when they help, and do not reach for tools outside them unless the card genuinely needs one: ${picked.join("; ")}.`
      : "",
    "\nWhen the card is finished or blocked, say so in one or two sentences and name what you changed or what is needed next.",
  ]
    .join("")
    .slice(0, TASK_RUN_PROMPT_MAX);
}

/** `YYYY-MM-DD` only — anything else clears the due date. */
export function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

/** Today in the browser's zone, which is how the due chips are read. */
export function todayKey(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function dueLabel(dueDate: string | null, today = todayKey()): string | null {
  if (!dueDate) return null;
  const diff = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return `In ${diff}d`;

  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

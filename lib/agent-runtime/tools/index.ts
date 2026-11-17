import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  AGENT_TOOL_OPTIONS,
  resolveAgentToolIds,
  type AgentToolId,
} from "@/lib/agent-tool-options";
import {
  browserAct,
  browserExtract,
  browserOpen,
  browserRequestLogin,
} from "@/lib/agent-runtime/tools/browser";
import { calculate } from "@/lib/agent-runtime/tools/calculator";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import {
  appFindActions,
  appRunAction,
  checkAppConnection,
} from "@/lib/agent-runtime/tools/integrations";
import { MEMORY_TOOL_LABELS } from "@/lib/agent-runtime/tools/memory";
import { readWebPage } from "@/lib/agent-runtime/tools/read-page";
import {
  TASK_TOOLS,
  TASK_TOOL_LABELS,
  TASK_TOOL_SUMMARIES,
} from "@/lib/agent-runtime/tools/tasks";
import {
  SCHEDULE_TOOLS,
  SCHEDULE_TOOL_LABELS,
  SCHEDULE_TOOL_SUMMARIES,
} from "@/lib/agent-runtime/tools/schedules";
import { webSearch } from "@/lib/agent-runtime/tools/web-search";
import {
  WIDGET_TOOLS,
  WIDGET_TOOL_LABELS,
  WIDGET_TOOL_SUMMARIES,
} from "@/lib/agent-runtime/tools/widgets";

/**
 * The tool registry.
 *
 * Every tool is a local function tool, so the runner, the prompt and the chat UI
 * (which shows tool steps) don't care what happens inside. Names, labels and
 * descriptions come from `lib/agent-tool-options.ts`, which is also what the
 * agent config panel reads, so the panel can never advertise a tool that does
 * not exist. Adding an integration means adding an option there and a
 * definition here.
 */

export type AgentToolDefinition = {
  /** Tool name the model calls, and the id stored on the agent. */
  id: AgentToolId;
  /** Human label the chat UI shows while the tool runs. */
  label: string;
  /** One line describing when to use it, included in the system prompt. */
  summary: string;
  tool: Tool<AgentToolRunState>;
};

const timeParameters = z.object({
  timeZone: z
    .string()
    .optional()
    .describe("IANA time zone such as Europe/Berlin. Defaults to UTC."),
});

const currentTime: AgentToolDefinition = {
  id: "current_time",
  label: "Checking the time",
  summary: "Get the current date and time (optionally in an IANA time zone).",
  tool: tool<typeof timeParameters, AgentToolRunState>({
    name: "current_time",
    description:
      "Get the current date and time. Use this whenever the answer depends on the actual current date, weekday or clock time.",
    parameters: timeParameters,
    execute: async ({ timeZone }) => {
      try {
        return new Date().toLocaleString("en-GB", {
          timeZone: timeZone || "UTC",
          dateStyle: "full",
          timeStyle: "short",
        });
      } catch {
        return `Unknown time zone "${timeZone}". Use an IANA name such as Europe/Berlin.`;
      }
    },
  }),
};

const search: AgentToolDefinition = {
  id: "web_search",
  label: "Searching the web",
  summary:
    "Search the live web for current facts, news and releases; runs on the workspace's selected search model and returns a grounded answer with sources.",
  tool: webSearch,
};

const readPage: AgentToolDefinition = {
  id: "read_webpage",
  label: "Reading a page",
  summary:
    "Open a public http(s) web page and return its readable text. Use it on a search result or a link the user shared.",
  tool: readWebPage,
};

const cloudOpen: AgentToolDefinition = {
  id: "browser_open",
  label: "Opening the cloud browser",
  summary:
    "Open a URL in a real cloud browser (Browserbase) and return the visible page text. Use it for pages that need JavaScript, a sign-in or interaction; a search-engine URL can be used to search interactively.",
  tool: browserOpen,
};

const cloudAct: AgentToolDefinition = {
  id: "browser_act",
  label: "Driving the cloud browser",
  summary:
    "Perform one real action in the cloud browser: click a button, type into a field, fill and submit a form, press a key, scroll. Use it whenever the task needs interaction rather than reading.",
  tool: browserAct,
};

const cloudExtract: AgentToolDefinition = {
  id: "browser_extract",
  label: "Reading the open page",
  summary:
    "Extract specific details (prices, table rows, names, confirmation codes) from the page already open in the cloud browser, instead of dumping the whole page.",
  tool: browserExtract,
};

const cloudLogin: AgentToolDefinition = {
  id: "browser_request_login",
  label: "Waiting for a sign-in",
  summary:
    "Ask the owner to sign in to the site already open in the live cloud browser, and wait while they do it in the live view. Use it only after a page you opened in this run is actually signed out; never for a saved site you haven't opened.",
  tool: browserRequestLogin,
};

const math: AgentToolDefinition = {
  id: "calculate",
  label: "Calculating",
  summary:
    "Evaluate arithmetic exactly (+, -, *, /, %, ^, parentheses, sqrt, round, min, max, log, pi…). Use it instead of estimating numbers.",
  tool: calculate,
};

/** Every definition, in catalog order. */
const DEFINITIONS: AgentToolDefinition[] = [
  currentTime,
  search,
  readPage,
  cloudOpen,
  cloudAct,
  cloudExtract,
  cloudLogin,
  math,
].sort(
  (a, b) =>
    AGENT_TOOL_OPTIONS.findIndex((option) => option.id === a.id) -
    AGENT_TOOL_OPTIONS.findIndex((option) => option.id === b.id),
);

export const AGENT_TOOLS: AgentToolDefinition[] = DEFINITIONS;

/**
 * App tools.
 *
 * Attached to every run regardless of the agent's switches: this is how the
 * agent discovers what an app can do, asks for access (the connect card), and
 * runs read-only actions. Mutating actions are sealed into an approval token
 * and never executed by the model.
 */
type ConnectionTool = {
  name: "check_app_connection" | "app_find_actions" | "app_run_action";
  label: string;
  summary: string;
  tool: Tool<AgentToolRunState>;
};

const CONNECTION_TOOLS: ConnectionTool[] = [
  {
    name: "check_app_connection",
    label: "Checking the app connection",
    summary:
      "Verify an external app (Gmail, Slack, Notion, GitHub, …) and show a Connect card when it isn't connected. Call it before relying on an app the user says they just connected.",
    tool: checkAppConnection,
  },
  {
    name: "app_find_actions",
    label: "Looking up app actions",
    summary:
      "List an app's actions with their slugs and whether each is read-only or needs approval. Call it before app_run_action.",
    tool: appFindActions,
  },
  {
    name: "app_run_action",
    label: "Running an app action",
    summary:
      "Run one app action. Read-only actions run now; actions that change data show an approval card and must not be called again.",
    tool: appRunAction,
  },
];

/**
 * Tools attached to a run: the agent's own tools, plus the app trio and the
 * widget quartet. Widgets and apps are part of the product, not switches, so
 * every agent can use them.
 */
export function getAgentTools(
  enabled?: string[] | null,
  only?: string[] | null,
): Tool<AgentToolRunState>[] {
  const allowed = new Set(resolveAgentToolIds(enabled));
  // A board card can name a smaller set than the agent's own switches.
  const narrowed = only ? new Set(only) : null;
  return [
    ...AGENT_TOOLS.filter(
      (entry) => allowed.has(entry.id) && (!narrowed || narrowed.has(entry.id)),
    ).map((entry) => entry.tool),
    ...CONNECTION_TOOLS.map((entry) => entry.tool),
    ...TASK_TOOLS,
    ...WIDGET_TOOLS,
    ...SCHEDULE_TOOLS,
  ];
}

/** Tool descriptions for the system prompt, limited to what the agent has on. */
export function listAgentToolSummaries(
  enabled?: string[] | null,
  only?: string[] | null,
): { name: string; summary: string }[] {
  const allowed = new Set(resolveAgentToolIds(enabled));
  const narrowed = only ? new Set(only) : null;
  return [
    ...AGENT_TOOLS.filter(
      (entry) => allowed.has(entry.id) && (!narrowed || narrowed.has(entry.id)),
    ).map(({ id, summary }) => ({
      name: id,
      summary,
    })),
    ...CONNECTION_TOOLS.map(({ name, summary }) => ({ name, summary })),
    ...TASK_TOOL_SUMMARIES,
    ...WIDGET_TOOL_SUMMARIES,
    ...SCHEDULE_TOOL_SUMMARIES,
  ];
}

/**
 * `GMAIL_FETCH_EMAILS` → "Gmail: fetch emails". Composio and other MCP servers
 * name their tools in caps, which would look like a debug log in the chat.
 */
function humanizeToolName(name: string): string {
  const parts = name.split("_").filter(Boolean);
  if (parts.length < 2) return name;

  const [head, ...rest] = parts;
  const tail = rest.join(" ").toLowerCase();

  // `GMAIL_FETCH_EMAILS` / `COMPOSIO_SEARCH_TOOLS` are service-prefixed. A
  // lowercase name like `create_issue` is one phrase, not "Create: issue".
  const brandPrefixed = /^[A-Z0-9]{3,}$/.test(head);
  if (!brandPrefixed) return `${head.toLowerCase()} ${tail}`.replace(/^\w/, (c) => c.toUpperCase());

  const prefix = head === "COMPOSIO" ? "Composio" : head.charAt(0) + head.slice(1).toLowerCase();
  return `${prefix}: ${tail}`;
}

/** Human label for a tool call, falling back to the raw name. */
export function getAgentToolLabel(name: string): string {
  const known = AGENT_TOOLS.find((entry) => entry.id === name)?.label;
  if (known) return known;

  if (name === "use_skill") return "Loading a skill";
  if (name === "use_diagram") return "Loading a diagram";

  const memory = MEMORY_TOOL_LABELS[name];
  if (memory) return memory;

  if (name.startsWith("plugin_")) {
    const label = name
      .slice("plugin_".length)
      .replace(/_/g, " ")
      .replace(/^\w/, (character) => character.toUpperCase());
    return `Plugin: ${label}`;
  }

  const connection = CONNECTION_TOOLS.find((entry) => entry.name === name)?.label;
  if (connection) return connection;

  const task = TASK_TOOL_LABELS[name];
  if (task) return task;

  const widget = WIDGET_TOOL_LABELS[name];
  if (widget) return widget;

  const schedule = SCHEDULE_TOOL_LABELS[name];
  if (schedule) return schedule;

  return humanizeToolName(name);
}

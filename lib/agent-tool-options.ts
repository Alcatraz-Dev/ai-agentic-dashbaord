/**
 * The built-in tools an agent can be given, in the order the config panel lists
 * them. Client-safe: no server-only imports, so the panel and the runtime can
 * both read it.
 */

export type AgentToolId =
  | "web_search"
  | "read_webpage"
  | "browser_open"
  | "browser_act"
  | "browser_extract"
  | "browser_request_login"
  | "calculate"
  | "current_time";

export type AgentToolOption = {
  id: AgentToolId;
  /** Row title in the config panel. */
  name: string;
  /** What the chat shows while the tool runs. */
  label: string;
  /** One line explaining the tool in the panel. */
  description: string;
  /** Line the system prompt uses to advertise the tool. */
  summary: string;
};

export const AGENT_TOOL_OPTIONS: AgentToolOption[] = [
  {
    id: "web_search",
    name: "Web search",
    label: "Searching the web",
    description: "Look up current facts, news and releases, with sources.",
    summary:
      "Search the live web for current facts, news and releases; runs on the workspace's selected search model and returns a grounded answer with sources.",
  },
  {
    id: "read_webpage",
    name: "Read web page",
    label: "Reading a page",
    description: "Open a public page and read its text.",
    summary:
      "Open a public http(s) web page and return its readable text. Use it on a search result or a link the user shared.",
  },
  {
    id: "browser_open",
    name: "Cloud browser",
    label: "Opening the cloud browser",
    description: "Open any page in a real browser, including JavaScript apps and sign-ins.",
    summary:
      "Open a URL in a real cloud browser (Browserbase) and return the visible page text. Use it for pages that need JavaScript, a sign-in or interaction; a search-engine URL can be used to search interactively.",
  },
  {
    id: "browser_act",
    name: "Browser actions",
    label: "Driving the cloud browser",
    description: "Click, type, fill forms, press keys and scroll in the live browser.",
    summary:
      "Perform one real action in the cloud browser: click a button, type into a field, fill and submit a form, press a key, scroll. Use it whenever the task needs interaction rather than reading.",
  },
  {
    id: "browser_extract",
    name: "Browser extract",
    label: "Reading the open page",
    description: "Pull prices, lists or codes out of the page that is open.",
    summary:
      "Extract specific details (prices, table rows, names, confirmation codes) from the page already open in the cloud browser, instead of dumping the whole page.",
  },
  {
    id: "browser_request_login",
    name: "Browser sign-in",
    label: "Waiting for a sign-in",
    description: "Ask the owner to sign in in the live browser, and wait while they do.",
    summary:
      "Ask the owner to sign in to the site already open in the live cloud browser, and wait while they do it in the live view. Use it only after a page you opened in this run is actually signed out; never for a saved site you haven't opened.",
  },
  {
    id: "calculate",
    name: "Calculator",
    label: "Calculating",
    description: "Work out arithmetic exactly instead of estimating.",
    summary:
      "Evaluate arithmetic exactly (+, -, *, /, %, ^, parentheses, sqrt, round, min, max, log, pi…). Use it instead of estimating numbers.",
  },
  {
    id: "current_time",
    name: "Current time",
    label: "Checking the time",
    description: "Get today's date and clock time in any time zone.",
    summary: "Get the current date and time (optionally in an IANA time zone).",
  },
];

export const ALL_AGENT_TOOL_IDS: AgentToolId[] = AGENT_TOOL_OPTIONS.map((option) => option.id);

/**
 * The hosted search + page-reader pair. The chat composer's Browser chip
 * toggles them together; the config panel still has a switch per tool. The
 * cloud-browser tools below are a separate group, because they cost a real
 * browser session.
 */
export const WEB_AGENT_TOOL_IDS: AgentToolId[] = ["web_search", "read_webpage"];

/**
 * The cloud-browser tools. They share one Browserbase session per turn, which
 * is opened by the first call and released when the reply is finished.
 */
export const BROWSER_AGENT_TOOL_IDS: AgentToolId[] = [
  "browser_open",
  "browser_act",
  "browser_extract",
  "browser_request_login",
];

/**
 * Per-message tool budget. Lives here (not in the server-only run context) so
 * the chat can show what is left.
 */
export const AGENT_TOOL_LIMITS = {
  searches: 4,
  pages: 6,
  /** Cloud-browser calls (open, act, extract) per reply. */
  browser: 12,
} as const;

export function isAgentToolId(value: string): value is AgentToolId {
  return ALL_AGENT_TOOL_IDS.includes(value as AgentToolId);
}

/** Keeps only known ids and returns them in catalog order. */
export function normalizeAgentToolIds(values: string[]): AgentToolId[] {
  const wanted = new Set(values);
  return ALL_AGENT_TOOL_IDS.filter((id) => wanted.has(id));
}

/**
 * Stored ids → the tools this agent may call. `null` (agents created before
 * tools were configurable) means every built-in tool is on.
 */
export function resolveAgentToolIds(stored: string[] | null | undefined): AgentToolId[] {
  if (!Array.isArray(stored)) return [...ALL_AGENT_TOOL_IDS];
  return normalizeAgentToolIds(stored);
}

/** True when every web tool is available to the agent. */
export function hasWebTools(stored: string[] | null | undefined): boolean {
  const enabled = resolveAgentToolIds(stored);
  return WEB_AGENT_TOOL_IDS.every((id) => enabled.includes(id));
}

/** True when the agent may drive the cloud browser. */
export function hasBrowserTools(stored: string[] | null | undefined): boolean {
  const enabled = resolveAgentToolIds(stored);
  return BROWSER_AGENT_TOOL_IDS.some((id) => enabled.includes(id));
}

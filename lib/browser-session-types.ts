/**
 * Client-safe cloud-browser session types.
 *
 * The config panel renders these; the replay link is derived from the session
 * id, so the browser never needs a second request.
 */

export type BrowserSessionStatus = "closed" | "failed";

export type BrowserSessionSummary = {
  id: number;
  /** Browserbase session id. */
  sessionId: string;
  /** browser_open / browser_act / browser_extract calls in the session. */
  actions: number;
  status: BrowserSessionStatus;
  /** ISO strings, formatted in the browser. */
  startedAt: string | null;
  endedAt: string;
  /** Browserbase's page for the session, including its replay. */
  replayUrl: string;
};

/** A session plus the agent it belongs to, for the workspace settings page. */
export type BrowserSessionWithAgent = BrowserSessionSummary & {
  agentId: number;
  agentName: string;
  agentAvatar: string;
  agentColor: string;
};

/** How much cloud-browser work one agent has done, newest usage first. */
export type BrowserUsageSummary = {
  agentId: number;
  agentName: string;
  agentAvatar: string;
  agentColor: string;
  /** Sessions recorded for this agent. */
  sessions: number;
  /** Total browser actions across those sessions. */
  actions: number;
  lastUsedAt: string | null;
};

export function browserSessionReplayUrl(sessionId: string): string {
  return `https://www.browserbase.com/sessions/${encodeURIComponent(sessionId)}`;
}

/** Browserbase ids are uuids; the panel shows the first block. */
export function shortBrowserSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

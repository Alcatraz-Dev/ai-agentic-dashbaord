import "server-only";

import { AGENT_TOOL_LIMITS } from "@/lib/agent-tool-options";
import type { AgentResultCard } from "@/lib/apps/results";
import type { AgentToolSource } from "@/lib/agent-runtime/protocol";
import type { BrowserLoginVisit } from "@/lib/browser-login-policy";
import type { CloudBrowserSession } from "@/lib/browserbase/session";
import type { AgentModelConnection } from "@/lib/agent-runtime/models";
import type { AgentApprovalMode } from "@/lib/agent-options";
import type { ScheduleActionPolicy, ScheduleSentAction } from "@/lib/schedule-action";
import type { TaskProposal, TaskToolSelection } from "@/lib/task-types";

export { AGENT_TOOL_LIMITS };

/**
 * Per-run tool budget. One object is created per chat request and passed to
 * the run as its context, so every tool call in that turn shares the counters
 * and a model can't loop on search, page reads or browser actions.
 */
export type AgentToolRunState = {
  searches: number;
  pages: number;
  /** Cloud-browser calls used this turn (open, act, extract). */
  browserActions: number;
  /** Pages the search tool cited, surfaced as citations in the transcript. */
  sources: AgentToolSource[];
  /**
   * Pages the cloud browser has inspected in this run, in order, and whether
   * each looked signed out. `browser_request_login` refuses a saved site until
   * this run has opened it and seen a signed-out page.
   */
  browserVisits: BrowserLoginVisit[];
  /**
   * Apps the agent asked the user to connect during this turn. The runner
   * turns each one into a `connect_request` event exactly once.
   */
  connectionRequests: { toolkit: string; reason: string }[];
  /**
   * Result cards produced by app actions this turn. The runner forwards each
   * one to the chat once, in the order the actions ran.
   */
  results: AgentResultCard[];
  /**
   * Widget offers made this turn. The runner streams each one as a
   * `widget_offer` event so the chat can show the Create / Not now card.
   */
  widgetOffers: {
    id: string;
    title: string;
    reason: string;
  }[];
  /**
   * Widget proposals made this turn, forwarded once as `widget_options`
   * events. The user's pick creates the row.
   */
  widgetProposals: { id: string; proposal: import("@/lib/widget-types").WidgetProposal }[];
  /**
   * Whole-dashboard layout proposals made this turn, forwarded as
   * `layout_proposal` cards. Only the owner's Add click creates any card.
   */
  layoutProposals: { id: string; template: string; reason: string }[];
  /**
   * Proposed widget edits, forwarded as `widget_edit` review cards. Nothing is
   * written until the owner clicks Apply.
   */
  widgetEdits: import("@/lib/widget-types").WidgetEditProposal[];
  /**
   * Schedule confirmation cards proposed this turn. Nothing is scheduled until
   * the owner edits (if needed) and clicks Confirm.
   */
  scheduleProposals: import("@/lib/agent-schedule-options").AgentScheduleProposal[];
  /**
   * Editable task cards proposed this turn. The runner streams each one as a
   * `task_proposal`; only the owner's Add to board click creates the row.
   */
  taskProposals: TaskProposal[];
  /**
   * Notes `save_memory` wrote this turn. The runner forwards each one as a
   * `memory_saved` event, so the owner sees exactly what the agent will keep.
   */
  memoryNotes: { id: number; content: string; tags: string[] }[];
  /**
   * Actions waiting for the owner's approval. The runner streams one
   * approval_request per entry; the token is the only way to run them and it
   * is consumed by the approval endpoint, never by the model.
   */
  approvals: {
    token: string;
    toolkit: string;
    name: string;
    action: string;
    actionLabel: string;
    summary: string;
    preview: { label: string; value: string }[];
  }[];
  /**
   * How app actions that change data are approved for this run, read from the
   * agent's stored preference ("ask" | "auto" | "full").
   */
  approvalMode: AgentApprovalMode;
  /**
   * The one send/post this run may execute without an approval card. Only a
   * scheduled run whose owner confirmed it on the form carries a policy; a
   * chat turn leaves this null and every mutation still asks first.
   */
  scheduledAction: ScheduleActionPolicy | null;
  /**
   * Actions this run actually sent or posted, in order. A scheduled run stores
   * them on its history row so the owner can see exactly what left.
   */
  sentActions: ScheduleSentAction[];
  /**
   * The tools a board card picked for this run. When set, skills, plugins and
   * app actions outside the list are refused even if a tool name leaks in.
   */
  cardTools: TaskToolSelection | null;
  /**
   * Notes `recall_memory` returned this turn. A scheduled run stores them on its
   * history row, so the owner can see which memories the agent leaned on.
   */
  recalledMemories: { id: number; content: string }[];
  /**
   * The model connection this turn runs on. Search uses the same workspace
   * connection instead of a separate OpenAI key, and prefers the selected
   * model when it is itself a search model.
   */
  model: AgentModelConnection | null;
  /**
   * App user who owns the run. The cloud browser needs it to reuse that
   * owner's Browserbase Context, so their logins survive between sessions.
   */
  ownerId: number | null;
  /**
   * The agent this turn belongs to. The cloud browser registers under it so the
   * chat and the config panel can show a live view of the running session.
   */
  agentId: number | null;
  /**
   * The live cloud browser, opened by the first browser tool call and closed by
   * the runner when the turn ends. Null means nothing was started.
   */
  browser: CloudBrowserSession | null;
  /**
   * The chat request's abort signal, so a tool that waits (the sign-in request)
   * stops as soon as the reader goes away.
   */
  signal?: AbortSignal;
};

export function createAgentToolRunState(
  ownerId: number | null = null,
  agentId: number | null = null,
  signal?: AbortSignal,
): AgentToolRunState {
  return {
    searches: 0,
    pages: 0,
    browserActions: 0,
    sources: [],
    browserVisits: [],
    connectionRequests: [],
    results: [],
    widgetOffers: [],
    widgetProposals: [],
    layoutProposals: [],
    widgetEdits: [],
    scheduleProposals: [],
    taskProposals: [],
    memoryNotes: [],
    approvals: [],
    approvalMode: "ask",
    scheduledAction: null,
    sentActions: [],
    cardTools: null,
    recalledMemories: [],
    model: null,
    ownerId,
    agentId,
    browser: null,
    signal,
  };
}

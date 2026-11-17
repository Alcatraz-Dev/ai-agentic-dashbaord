/**
 * The wire protocol between the agent runtime and the browser.
 *
 * No Node or OpenAI imports live here: the server generator and the chat client
 * share these types so an event can never drift between the two.
 */

import type { AgentResultCard } from "@/lib/apps/results";
import type { AgentScheduleProposal } from "@/lib/agent-schedule-options";
import type { ScheduleSentAction } from "@/lib/schedule-action";
import type { TaskProposal } from "@/lib/task-types";
import type {
  WidgetEditProposal,
  WidgetProposal,
  WidgetRecord,
} from "@/lib/widget-types";

export type AgentChatRole = "user" | "assistant";

/** One turn of the conversation, as sent to POST /api/agents/[agentId]/chat. */
export type AgentChatMessage = {
  role: AgentChatRole;
  content: string;
};

/** A page `web_search` leaned on, shown as a citation under the reply. */
export type AgentToolSource = {
  title: string;
  url: string;
};

/** Newline-delimited JSON events streamed back from the chat route. */
export type AgentStreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_started"; name: string; label: string }
  | { type: "tool_finished"; name: string; label: string }
  | { type: "sources"; sources: AgentToolSource[] }
  /** A note the agent saved this turn, so the chat can confirm it in place. */
  | { type: "memory_saved"; memory: { id: number; content: string; tags: string[] } }
  /** What is left of the per-message tool budget, sent after each tool call. */
  | { type: "budget"; searches: number; pages: number; browser: number }
  /** The turn's cloud browser is up: its session id and a live-view URL. */
  | { type: "browser"; sessionId: string | null; liveViewUrl: string | null }
  /**
   * The agent needs an external app the user hasn't connected yet. The chat
   * renders a connect card from this; `toolkit` is the Composio slug.
   */
  | { type: "connect_request"; toolkit: string; name: string; reason: string }
  /**
   * A data-changing app action awaiting the owner. The token is sealed and
   * single-use; the card posts it back to the approvals endpoint, never to the
   * model.
   */
  | {
      type: "approval_request";
      token: string;
      toolkit: string;
      name: string;
      action: string;
      actionLabel: string;
      summary: string;
      preview: { label: string; value: string }[];
    }
  /** A plain-data card built from an app action's result. */
  | { type: "app_result"; card: AgentResultCard }
  /** The agent offered to turn the result into a dashboard widget. */
  | { type: "widget_offer"; offer: { id: string; title: string; reason: string } }
  /** Two to four finished widget styles waiting for the user's pick. */
  | { type: "widget_options"; id: string; proposal: WidgetProposal }
  /** A proposed change to a stored widget, waiting for Apply. */
  | { type: "widget_edit"; proposal: WidgetEditProposal }
  /**
   * A whole starting layout the agent suggests. The chat previews the real
   * cards; only the owner's Add click creates them.
   */
  | { type: "layout_proposal"; id: string; template: string; reason: string }
  /** An editable schedule form; the owner confirms before it is created. */
  | { type: "schedule_proposal"; proposal: AgentScheduleProposal }
  /**
   * An editable task card. Accepting it calls the task action; the model never
   * writes a new card itself.
   */
  | { type: "task_proposal"; proposal: TaskProposal }
  /** A scheduled run sent or posted its confirmed action. */
  | { type: "sent"; entry: ScheduleSentAction }
  | { type: "done"; model: string | null; fallback: boolean }
  | { type: "error"; message: string };

/** Shared so the route and the client cannot disagree on the encoding. */
export const AGENT_STREAM_CONTENT_TYPE = "application/x-ndjson";

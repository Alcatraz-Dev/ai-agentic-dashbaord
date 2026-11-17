/**
 * Chat types shared by the agent page and its client components.
 *
 * Every turn is produced by the real agent runner and stored in
 * `agent_messages`; this module only holds the shape the transcript renders.
 */

export type ChatRole = "assistant" | "user";

/** One tool call shown above an assistant reply. */
export type ChatToolStep = {
  name: string;
  label: string;
  status: "running" | "done";
  /** When the call started, for the live timer in the trail. */
  startedAt?: number;
  /** How long the finished call took, in ms. */
  duration?: number;
  /** What the call worked on — a file path, a folder, a search query. */
  detail?: string;
};

/** A page the reply cited, rendered as a clickable source under the message. */
export type ChatSource = {
  title: string;
  url: string;
};

import type { AgentResultCard } from "@/lib/apps/results";
import type { AgentHandoffResult } from "@/lib/agent-team";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** Data-only result cards produced by app actions. */
  cards?: AgentResultCard[];
  /** Clock label for turns that only exist in the browser. */
  time?: string;
  /** ISO timestamp from storage; formatted in the reader's locale. */
  createdAt?: string;
  /** Tool steps that produced this reply, shown in the transcript. */
  steps?: ChatToolStep[];
  /** Sources a web search leaned on. */
  sources?: ChatSource[];
  /** Teammate answers this reply used; kept so a reload shows them. */
  handoffs?: AgentHandoffResult[];
};

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Calculator,
  CalendarClock,
  Check,
  ChevronUp,
  Clock,
  FileSearch,
  Globe,
  ListChecks,
  KeyRound,
  LayoutGrid,
  Loader2,
  Monitor,
  PencilLine,
  MousePointerClick,
  MessageSquare,
  MessageSquarePlus,
  Plug,
  Search,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  clearAgentChatAction,
  updateAgentApprovalModeAction,
  updateAgentProviderAction,
  updateAgentToolsAction,
} from "@/app/actions/agents";
import { deleteWidgetAction, refreshWidgetNowAction } from "@/app/actions/widgets";
import { AgentTrail, type TrailStep } from "@/components/aui/pro/agent-trail";
import { AppResultCard } from "@/components/agents/app-result-card";
import { ApprovalCard, type ApprovalRequest } from "@/components/agents/approval-card";
import { ConnectionCard, type ConnectionRequest } from "@/components/agents/connection-card";
import { MarkdownMessage } from "@/components/agents/markdown-message";
import { LiveBrowser } from "@/components/agents/live-browser";
import { ModelPicker } from "@/components/agents/model-picker";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentWidgetStrip } from "@/components/widgets/agent-widget-strip";
import { TemplateSuggestionStrip } from "@/components/agents/template-suggestion-strip";
import { WidgetOfferCard } from "@/components/widgets/widget-offer-card";
import { ScheduleProposalCard } from "@/components/agents/schedule-proposal-card";
import { TaskProposalCard } from "@/components/tasks/task-proposal-card";
import { LayoutProposalCard } from "@/components/agents/layout-proposal-card";
import {
  ComposerAddDialogs,
  type ComposerAddMode,
  type ComposerAddNote,
} from "@/components/agents/composer-add-dialogs";
import { extractArchify } from "@/lib/diagram-source";
import type { TaskProposal } from "@/lib/task-types";
import { browserTimeZone, type AgentScheduleProposal } from "@/lib/agent-schedule-options";
import { WidgetEditCard } from "@/components/widgets/widget-edit-card";
import {
  WidgetOptionsCard,
  type WidgetChoiceResult,
} from "@/components/widgets/widget-options-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChatComposer,
  type ChatComposerAddAction,
  type ChatComposerApp,
  type ChatComposerAttachment,
  type ChatComposerSendDetails,
} from "@/components/ui/chat-composer";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { MessageActions } from "@/components/ui/message-actions";
import {
  ThinkingState,
  type ThinkingStep,
} from "@/components/ui/thinking-state-clean";
import type { AgentResultCard } from "@/lib/apps/results";
import { findCatalogModel } from "@/lib/model-catalog";
import type { ChatMessage, ChatSource, ChatToolStep } from "@/lib/agent-demo";
import {
  MEMORY_CONTENT_MAX,
  normalizeMemoryTags,
  type AgentMemoryNote,
} from "@/lib/memory-types";
import { createMemoryAction, setAgentMemoryEnabledAction } from "@/app/actions/memory";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { attachmentContextFor } from "@/lib/chat-attachments";
import { normalizeApprovalMode, type AgentApprovalMode } from "@/lib/agent-options";
import {
  AGENT_TOOL_LIMITS,
  AGENT_TOOL_OPTIONS,
  hasBrowserTools,
  hasWebTools,
  resolveAgentToolIds,
  WEB_AGENT_TOOL_IDS,
} from "@/lib/agent-tool-options";
import {
  type AgentDetail,
  type AgentModelCatalog,
} from "@/lib/agent-options";
import type { AgentChatMessage, AgentStreamEvent } from "@/lib/agent-runtime/protocol";
import type {
  WidgetDesignOption,
  WidgetEditProposal,
  WidgetProposal,
  WidgetRecord,
} from "@/lib/widget-types";
import { startLiveBrowser, stopLiveBrowser } from "@/hooks/use-live-browser";
import { cn } from "@/lib/utils";

/** How many stored messages the page and the chat route exchange per step. */
const MESSAGE_PAGE_SIZE = 10;

/** Matches the chat route's body limit; older turns simply stay in storage. */
const MAX_CONTEXT_MESSAGES = 30;

/** Chips the composer shows for picked files; a folder counts as one. */
const MAX_ATTACHMENTS = 6;

/** Shape returned by `/api/agents/[id]/messages`. */
type StoredMessagePayload = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  steps?: ChatToolStep[];
  sources?: ChatSource[];
  cards?: AgentResultCard[];
};

function toChatMessage(message: StoredMessagePayload): ChatMessage {
  return {
    id: `msg-${message.id}`,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    steps: message.steps,
    sources: message.sources,
    cards: message.cards,
  };
}

function clockTime(message: ChatMessage) {
  const stamp = message.createdAt ? new Date(message.createdAt) : null;
  if (!stamp || Number.isNaN(stamp.getTime())) return message.time ?? "";
  return stamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Sources the reply leaned on, under the message text. */
function CitationList({ sources }: { sources: ChatSource[] }) {
  return (
    <ol className="mt-2 space-y-1 border-t border-border/60 pt-2">
      {sources.map((source, index) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.url}
            className="group flex items-center gap-1.5 text-[0.7rem] text-muted-foreground hover:text-brand-ink"
          >
            <span className="grid size-3.5 shrink-0 place-items-center rounded-full bg-muted text-[0.55rem] font-semibold tabular-nums text-foreground/70 group-hover:bg-brand-border group-hover:text-brand-ink">
              {index + 1}
            </span>
            <span className="min-w-0 truncate">{source.title}</span>
            <span className="ml-auto shrink-0 text-[0.62rem] text-muted-foreground/70">
              {domainOf(source.url)}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  web_search: Search,
  read_webpage: Globe,
  browser_open: Monitor,
  browser_act: MousePointerClick,
  browser_extract: FileSearch,
  browser_request_login: KeyRound,
  calculate: Calculator,
  current_time: Clock,
  check_app_connection: ListChecks,
  app_find_actions: Wrench,
  app_run_action: Plug,
  suggest_widget: LayoutGrid,
  propose_widget: LayoutGrid,
  list_widgets: ListChecks,
  propose_widget_edit: PencilLine,
};

/** What the agent is allowed to use right now, as compact icon badges. */
function ToolBadges({ enabled, mcpCount }: { enabled: string[] | null; mcpCount: number }) {
  const allowed = resolveAgentToolIds(enabled);
  const tools = AGENT_TOOL_OPTIONS.filter((option) => allowed.includes(option.id));

  return (
    <span
      className="flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-1"
      title={tools.length > 0 ? `Tools: ${tools.map((tool) => tool.name).join(", ")}` : "No tools"}
    >
      {tools.map((tool) => {
        const Icon = TOOL_ICONS[tool.id] ?? Wrench;
        return (
          <span
            key={tool.id}
            title={tool.name}
            aria-label={tool.name}
            className="grid size-4 place-items-center rounded bg-muted/70 text-foreground/60"
          >
            <Icon className="size-2.5" strokeWidth={2.2} />
          </span>
        );
      })}
      {mcpCount > 0 && (
        <span
          title={`${mcpCount} MCP ${mcpCount === 1 ? "server" : "servers"}`}
          className="flex items-center gap-0.5 rounded bg-violet-50 px-1 py-px text-[0.55rem] font-semibold text-violet-700 tabular-nums"
        >
          <Plug className="size-2.5" strokeWidth={2.4} />
          {mcpCount}
        </span>
      )}
      {tools.length === 0 && mcpCount === 0 && (
        <span className="px-1 text-[0.6rem] text-muted-foreground">No tools</span>
      )}
    </span>
  );
}

/** "2 of 4 searches left" for the turn that is running. */
function BudgetPill({
  icon: Icon,
  label,
  remaining,
  total,
}: {
  icon: LucideIcon;
  label: string;
  remaining: number;
  total: number;
}) {
  return (
    <span
      title={`${label}: ${remaining} of ${total} left for this message`}
      className={cn(
        "flex items-center gap-1 rounded-full px-1.5 py-1 text-[0.62rem] font-medium tabular-nums",
        remaining === 0 ? "bg-muted/70 text-muted-foreground/70" : "text-muted-foreground",
      )}
    >
      <Icon className="size-2.5" strokeWidth={2.2} />
      {remaining}/{total}
    </span>
  );
}

/** The turn's tool calls as one quiet trail, with real times. */
function ToolSteps({ steps }: { steps: ChatToolStep[] }) {
  const trail: TrailStep[] = steps.map((step, index) => {
    const Icon = TOOL_ICONS[step.name] ?? Wrench;

    return {
      id: `${step.name}-${index}`,
      title: step.label,
      state: step.status === "running" ? "running" : "done",
      duration: step.duration,
      startedAt: step.startedAt,
      tool: { name: step.name, logo: <Icon className="size-3.5" strokeWidth={2} /> },
    };
  });

  return (
    <div className="mb-1.5">
      <AgentTrail steps={trail} className="ui-atr--inline" />
    </div>
  );
}

function Message({
  message,
  agent,
  onAddTask,
  onAddSkill,
  onSaveDiagram,
}: {
  message: ChatMessage;
  agent: AgentDetail;
  /** Turns this reply into a board card (opens the confirmation dialog). */
  onAddTask?: (text: string) => void;
  /** Turns this reply into a workspace skill. */
  onAddSkill?: (text: string) => void;
  /** Saves the reply's Archify block as a workspace diagram. */
  onSaveDiagram?: (source: string) => void;
}) {
  const isUser = message.role === "user";
  const hasText = message.content.trim().length > 0;
  // Only offered when the reply really contains valid Archify JSON IR.
  const archify = isUser ? "" : extractArchify(message.content);

  return (
    <div className={cn("flex items-end gap-2", isUser && "justify-end")}>
      {!isUser && (
        <AgentAvatar
          avatar={agent.avatar}
          color={agent.color}
          className="mb-0.5 size-7"
        />
      )}
      <div className={cn("max-w-[85%] sm:max-w-[75%]", isUser && "items-end")}>
        <div
          className={cn(
            "px-3.5 py-2 text-[0.82rem] leading-relaxed",
            isUser
              ? "rounded-2xl rounded-br-md bg-foreground whitespace-pre-wrap text-background shadow-sm"
              : "rounded-2xl rounded-bl-md bg-card text-foreground ring-1 ring-border/60",
          )}
        >
          {!isUser && message.steps && message.steps.length > 0 ? (
            <ToolSteps steps={message.steps} />
          ) : null}
          {isUser ? message.content : <MarkdownMessage content={message.content} />}
          {!isUser && message.sources && message.sources.length > 0 ? (
            <CitationList sources={message.sources} />
          ) : null}
        </div>
        {!isUser && message.cards && message.cards.length > 0 ? (
          <div className="mt-1.5 space-y-1.5">
            {message.cards.map((card, index) => (
              <AppResultCard key={`${message.id}-card-${index}`} card={card} />
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <div className="mt-1 flex flex-wrap items-center gap-0.5">
            <MessageActions text={message.content} actions={["copy"]} quiet={false} />
            {hasText && onAddTask ? (
              <button
                type="button"
                onClick={() => onAddTask(message.content)}
                className="rounded-full px-1.5 py-0.5 text-[0.62rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Add as task
              </button>
            ) : null}
            {hasText && onAddSkill ? (
              <button
                type="button"
                onClick={() => onAddSkill(message.content)}
                className="rounded-full px-1.5 py-0.5 text-[0.62rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Save as skill
              </button>
            ) : null}
            {archify && onSaveDiagram ? (
              <button
                type="button"
                onClick={() => onSaveDiagram(archify)}
                className="rounded-full px-1.5 py-0.5 text-[0.62rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Save as diagram
              </button>
            ) : null}
          </div>
        ) : null}
        <p
          suppressHydrationWarning
          className={cn(
            "mt-1 text-[0.62rem] text-muted-foreground",
            isUser ? "text-right" : "text-left",
          )}
        >
          {clockTime(message)}
        </p>
      </div>
    </div>
  );
}

type ComposerNote = ComposerAddNote & { id: string };

type StreamingState = {
  content: string;
  steps: ChatToolStep[];
  sources: ChatSource[];
  cards: ChatMessage["cards"];
};

/** Real stream events → the rows the Thinking State panel reveals. */
function thinkingStepsFor(streaming: StreamingState): ThinkingStep[] {
  const steps: ThinkingStep[] = [];

  if (streaming.sources.length > 0) {
    steps.push({
      kind: "search",
      label: "Searched",
      sources: streaming.sources.map((source) => ({
        label: source.title?.trim() || domainOf(source.url),
        href: source.url,
      })),
    });
  }

  for (const step of streaming.steps) {
    steps.push({ kind: "step", label: step.label });
  }

  if (streaming.content.trim()) {
    steps.push({ kind: "step", label: "Writing the reply" });
  }

  if (steps.length === 0) {
    steps.push({ kind: "step", label: "Thinking it through" });
  }

  return steps;
}

/** The live working panel, above the answer as it streams in. */
function StreamingTurn({
  agent,
  streaming,
}: {
  agent: AgentDetail;
  streaming: StreamingState;
}) {
  const steps = thinkingStepsFor(streaming);

  return (
    <div className="flex items-start gap-2">
      <AgentAvatar
        avatar={agent.avatar}
        color={agent.color}
        className="mt-0.5 size-7"
      />
      <div className="min-w-0 max-w-[88%] sm:max-w-[80%]">
        <ThinkingState
          steps={steps}
          visibleSteps={steps.length}
          done={false}
          stepMs={900}
        />

        {streaming.content ? (
          <div className="mt-3 rounded-2xl rounded-bl-md bg-card px-3.5 py-2 text-[0.82rem] leading-relaxed ring-1 ring-border/60">
            <MarkdownMessage content={streaming.content} caret />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type WidgetOffer = {
  id: string;
  title: string;
  reason: string;
};

type PendingProposal = { id: string; proposal: WidgetProposal };

export function AgentChat({
  agent,
  catalog,
  initialMessages = [],
  messageCursor = null,
  messageHasMore = false,
  mcpServerCount = 0,
  lastScheduleRun = null,
  initialWidgets = [],
  editWidgetId = null,
  apps = [],
  memoryEnabled = true,
  memoryNotes = [],
}: {
  agent: AgentDetail;
  catalog: AgentModelCatalog;
  /** Newest page of the stored transcript, oldest first. */
  initialMessages?: ChatMessage[];
  /** Id of the oldest loaded message; `before` for the next page. */
  messageCursor?: number | null;
  /** Whether turns older than the first page exist in storage. */
  messageHasMore?: boolean;
  /** Connected MCP servers, shown as a badge in the header. */
  mcpServerCount?: number;
  /** Most recent scheduled run, shown as a strip under the header. */
  lastScheduleRun?: { title: string; at: string; status: "ok" | "error" } | null;
  /** Widgets this agent created, shown in the horizontal rail above the chat. */
  initialWidgets?: WidgetRecord[];
  /** `?editWidget=` from a dashboard action; prefills the composer once. */
  editWidgetId?: number | null;
  /** Workspace apps, shown in the composer's Apps menu. */
  apps?: ChatComposerApp[];
  /** Whether memory is on for this agent; the drawer explains the state. */
  memoryEnabled?: boolean;
  /** Notes this agent keeps, newest first, for the header's memory drawer. */
  memoryNotes?: AgentMemoryNote[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [cursor, setCursor] = useState<number | null>(messageCursor);
  const [hasMore, setHasMore] = useState(messageHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState(agent.provider);
  const [browser, setBrowser] = useState(() => hasWebTools(agent.enabledTools));
  const [approvalMode, setApprovalMode] = useState<AgentApprovalMode>(
    normalizeApprovalMode(agent.approvalMode),
  );
  const [savingApprovalMode, setSavingApprovalMode] = useState(false);
  const [savingBrowser, setSavingBrowser] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  /** Connect cards the agent asked for this session (one per app). */
  const [connectRequests, setConnectRequests] = useState<ConnectionRequest[]>([]);
  /** Mutating app actions waiting for approval, one per single-use token. */
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  /** Widget rail contents, kept in step with creates, edits and deletes. */
  const [widgets, setWidgets] = useState<WidgetRecord[]>(initialWidgets);
  /** Widget offers waiting for a yes/no; cleared when answered. */
  const [widgetOffers, setWidgetOffers] = useState<WidgetOffer[]>([]);
  /** Two-design proposals waiting for a pick. */
  const [widgetProposals, setWidgetProposals] = useState<PendingProposal[]>([]);
  const [widgetEdits, setWidgetEdits] = useState<WidgetEditProposal[]>([]);
  /** Whole-layout suggestions waiting for Add; cleared when answered. */
  const [layoutProposals, setLayoutProposals] = useState<
    { id: string; template: string; reason: string }[]
  >([]);
  /** Editable schedule forms proposed by the agent this session. */
  const [scheduleProposals, setScheduleProposals] = useState<AgentScheduleProposal[]>([]);
  /** Editable task cards the agent offered; Add to board is the only write. */
  const [taskProposals, setTaskProposals] = useState<TaskProposal[]>([]);
  /** Notes the agent saved this turn, shown so the owner sees what was kept. */
  const [memorySaves, setMemorySaves] = useState<
    { id: number; content: string; tags: string[] }[]
  >([]);
  const [input, setInput] = useState("");
  /** Which Add-menu dialog is open; its form starts from the draft below. */
  const [addMode, setAddMode] = useState<ComposerAddMode>(null);
  /** The text that dialog is about: the composer draft or a finished reply. */
  const [addDraft, setAddDraft] = useState("");
  const [attachments, setAttachments] = useState<ChatComposerAttachment[]>([]);
  /** The File objects behind those chips, so their text can ride with the turn. */
  const attachmentFilesRef = useRef(new Map<string, File[]>());
  /** Add-menu records written this session, shown as notes in the transcript. */
  const [composerNotes, setComposerNotes] = useState<ComposerNote[]>([]);
  /** One-shot context lines for the next message, from those same actions. */
  const [pendingContext, setPendingContext] = useState<string[]>([]);
  /** The Add option armed in the composer, shown as a chip beside Plan mode. */
  const [composerAction, setComposerAction] = useState<ChatComposerAddAction | null>(null);
  /** The text a record option was armed for, so its form can clear the field. */
  const actionDraftRef = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [composerApps, setComposerApps] = useState<ChatComposerApp[]>(apps);
  const [confirmNewChat, setConfirmNewChat] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [drawerNotes, setDrawerNotes] = useState<AgentMemoryNote[]>(memoryNotes);
  const [memoryOn, setMemoryOn] = useState(memoryEnabled);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryDraftTags, setMemoryDraftTags] = useState("");
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [memoryNotice, setMemoryNotice] = useState<string | null>(null);
  /** Re-seed the drawer when the server sends a different set of notes. */
  const memorySignature = memoryNotes.map((note) => note.id).join(",");
  const memorySignatureRef = useRef(memorySignature);
  if (memorySignatureRef.current !== memorySignature) {
    memorySignatureRef.current = memorySignature;
    setDrawerNotes(memoryNotes);
    setMemoryOn(memoryEnabled);
  }
  const [clearingChat, setClearingChat] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ searches: number; pages: number; browser: number }>({
    searches: AGENT_TOOL_LIMITS.searches,
    pages: AGENT_TOOL_LIMITS.pages,
    browser: AGENT_TOOL_LIMITS.browser,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Height/top captured before a page is prepended, so the view doesn't jump. */
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const lastRenderedId = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editPrefillRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Lets a card start a turn without depending on `send`'s identity. */
  const sendRef = useRef<(override?: string) => void>(() => {});
  const isSendingRef = useRef(false);
  /** Pending poll while an app connection is being finished in a popup. */
  const appPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [changingModel, setChangingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const currentModel = findCatalogModel(catalog, providerId);

  /** Switches the agent's model from the chat header picker. */
  async function changeModel(next: string) {
    if (changingModel || next === providerId) return;

    setChangingModel(true);
    setModelError(null);

    try {
      const result = await updateAgentProviderAction({ id: agent.id, provider: next });

      if (!result.ok) {
        setModelError(result.error);
        return;
      }

      setProviderId(result.agent.provider);
      router.refresh();
    } catch (changeError) {
      console.error("[agents] model change failed", changeError);
      setModelError("We couldn't change the model. Please try again.");
    } finally {
      setChangingModel(false);
    }
  }

  const isSending = streaming !== null;

  // Follow the newest turn when one arrives, but never jump when older pages
  // are prepended above the reader.
  useEffect(() => {
    const container = scrollRef.current;
    const last = messages[messages.length - 1];
    if (!container || !last) return;

    const restore = prependRef.current;
    if (restore) {
      container.scrollTop = container.scrollHeight - restore.height + restore.top;
      prependRef.current = null;
      lastRenderedId.current = last.id;
      return;
    }

    if (last.id !== lastRenderedId.current) {
      container.scrollTop = container.scrollHeight;
    }
    lastRenderedId.current = last.id;
  }, [messages]);

  // A streaming reply only drags the view along while the reader is at the
  // bottom; someone reading history keeps their place.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !streaming) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distance < 160) container.scrollTop = container.scrollHeight;
  }, [streaming]);

  useEffect(() => {
    setProviderId(agent.provider);
  }, [agent.provider]);

  // The config panel and the Browser chip write the same column, so a refresh
  // from either side resyncs this control.
  useEffect(() => {
    setBrowser(hasWebTools(agent.enabledTools));
  }, [agent.enabledTools]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  /** Fetches the page of turns just before the oldest one on screen. */
  async function loadOlder() {
    if (loadingOlder || !hasMore || cursor === null) return;

    const container = scrollRef.current;
    setLoadingOlder(true);
    setOlderError(null);

    try {
      const response = await fetch(
        `/api/agents/${agent.id}/messages?before=${cursor}&limit=${MESSAGE_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as
        | { messages?: StoredMessagePayload[]; nextCursor?: number | null; hasMore?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.messages) {
        setOlderError(data?.error ?? "We couldn't load earlier messages. Try again.");
        return;
      }

      if (data.messages.length > 0 && container) {
        prependRef.current = { height: container.scrollHeight, top: container.scrollTop };
      }

      const older = data.messages.map(toChatMessage);
      setMessages((current) => [...older, ...current]);
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (historyError) {
      console.error("[agents] earlier messages failed", historyError);
      setOlderError("We couldn't reach the chat history. Try again.");
    } finally {
      setLoadingOlder(false);
    }
  }

  /**
   * Same setting the config panel edits: the agent's web tools. Saving it here
   * keeps the panel's switches in sync through the page refresh.
   */
  /** Saves how this agent approves data-changing app actions. */
  async function changeApprovalMode(next: AgentApprovalMode) {
    if (savingApprovalMode || next === approvalMode) return;

    const previous = approvalMode;
    setApprovalMode(next);
    setSavingApprovalMode(true);
    setError(null);

    try {
      const result = await updateAgentApprovalModeAction({ id: agent.id, mode: next });

      if (!result.ok) {
        setApprovalMode(previous);
        setError(result.error);
        return;
      }

      setApprovalMode(normalizeApprovalMode(result.agent.approvalMode));
      router.refresh();
    } catch (modeError) {
      console.error("[agents] approval mode failed", modeError);
      setApprovalMode(previous);
      setError("We couldn't change how actions are approved. Please try again.");
    } finally {
      setSavingApprovalMode(false);
    }
  }

  async function toggleBrowser() {
    if (savingBrowser || isSending) return;

    const previous = browser;
    const next = !browser;
    const current = resolveAgentToolIds(agent.enabledTools);
    const requested = next
      ? [...current, ...WEB_AGENT_TOOL_IDS]
      : current.filter((id) => !WEB_AGENT_TOOL_IDS.includes(id));

    setBrowser(next);
    setSavingBrowser(true);
    setError(null);

    try {
      const result = await updateAgentToolsAction({ id: agent.id, tools: requested });

      if (!result.ok) {
        setBrowser(previous);
        setError(result.error);
        return;
      }

      setBrowser(hasWebTools(result.agent.enabledTools));
      router.refresh();
    } catch (browserError) {
      console.error("[agents] browser toggle failed", browserError);
      setBrowser(previous);
      setError("We couldn't change the browser setting. Please try again.");
    } finally {
      setSavingBrowser(false);
    }
  }

  /**
   * Starts a clean conversation: the stored transcript is deleted and every
   * in-session card tied to it is dropped. Widgets, schedules, tasks and
   * approval records are separate rows and are left alone.
   */
  async function startNewChat() {
    if (clearingChat || isSending) return;

    setClearingChat(true);
    setNewChatError(null);

    try {
      const result = await clearAgentChatAction({ id: agent.id });
      if (!result.ok) {
        setNewChatError(result.error);
        return;
      }

      setMessages([]);
      setCursor(null);
      setHasMore(false);
      setOlderError(null);
      setStreaming(null);
      stopLiveBrowser();
      setWidgetOffers([]);
      setWidgetProposals([]);
      setWidgetEdits([]);
      setLayoutProposals([]);
      setScheduleProposals([]);
      setConnectRequests([]);
      setApprovalRequests([]);
      setInput("");
      setAttachments([]);
      setError(null);
      setBudget({
        searches: AGENT_TOOL_LIMITS.searches,
        pages: AGENT_TOOL_LIMITS.pages,
        browser: AGENT_TOOL_LIMITS.browser,
      });
      lastRenderedId.current = null;
      setConfirmNewChat(false);

      requestAnimationFrame(() => {
        const container = scrollRef.current;
        if (container) container.scrollTop = 0;
        composerRef.current?.focus();
      });
    } catch (clearError) {
      console.error("[agents] new chat failed", clearError);
      setNewChatError("We couldn't clear this chat. Please try again.");
    } finally {
      setClearingChat(false);
    }
  }

  useEffect(() => {
    setComposerApps(apps);
  }, [apps]);

  useEffect(() => {
    return () => {
      if (appPollRef.current) clearTimeout(appPollRef.current);
    };
  }, []);

  /**
   * The same popup flow the Apps page uses: open the window before the
   * request, send the browser to the hosted consent screen, then poll the
   * status endpoint until Composio reports the connection active.
   */
  async function connectComposerApp(slug: string) {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;

    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug }),
      });
      const data = (await response.json().catch(() => null)) as {
        redirectUrl?: string;
        error?: string;
      } | null;

      if (!response.ok || !data?.redirectUrl) {
        tab?.close();
        setError(data?.error ?? "We couldn't start that connection. Please try again.");
        return;
      }

      if (tab) tab.location.replace(data.redirectUrl);

      const startedAt = Date.now();
      const poll = async () => {
        try {
          const statusResponse = await fetch(
            `/api/integrations/status?toolkit=${encodeURIComponent(slug)}`,
          );
          const status = (await statusResponse.json().catch(() => null)) as {
            status?: string;
          } | null;

          if (status?.status === "active") {
            setComposerApps((current) =>
              current.map((app) => (app.slug === slug ? { ...app, connected: true } : app)),
            );
            router.refresh();
            return;
          }
        } catch {
          // A transient miss shouldn't end the wait; the next tick retries.
        }

        if (Date.now() - startedAt < 5 * 60 * 1000) {
          appPollRef.current = setTimeout(() => void poll(), 3000);
        }
      };
      appPollRef.current = setTimeout(() => void poll(), 3000);
    } catch (connectError) {
      console.error("[agents] composer connect failed", connectError);
      tab?.close();
      setError("We couldn't reach the connection service. Please try again.");
    }
  }

  async function disconnectComposerApp(slug: string) {
    try {
      const response = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "We couldn't disconnect that app. Please try again.");
        return;
      }

      setComposerApps((current) =>
        current.map((app) => (app.slug === slug ? { ...app, connected: false } : app)),
      );
      router.refresh();
    } catch (disconnectError) {
      console.error("[agents] composer disconnect failed", disconnectError);
      setError("We couldn't reach the connection service. Please try again.");
    }
  }

  /**
   * Opens one "make something out of this text" dialog — the composer's draft
   * or a finished reply — so the Add menu and the reply actions share a form.
   */
  function openAdd(mode: Exclude<ComposerAddMode, null>, draft: string) {
    setAddDraft(draft);
    setAddMode(mode);
  }

  /**
   * One Add-menu action wrote a row. The chat shows it immediately, and the
   * next message carries a one-shot line so the agent knows it exists without
   * having to be told in prose.
   */
  function handleComposerCreated(note: ComposerAddNote) {
    setComposerNotes((current) => [
      ...current,
      { ...note, id: `note-${Date.now()}-${current.length}` },
    ]);
    setPendingContext((current) => [
      ...current,
      `Workspace update: I added the ${note.kind} "${note.title}" from the Add menu and it is ready now. ${note.detail}`,
    ]);

    // A record option consumed the draft it was armed for; anything else the
    // reader typed in the meantime is left alone.
    const draft = actionDraftRef.current;
    if (draft) {
      setInput((current) => (current.trim() === draft.trim() ? "" : current));
      actionDraftRef.current = "";
    }
    setComposerAction(null);
  }

  /**
   * Files and folders picked in the composer become chips above the field. A
   * folder is one chip and keeps how many files it holds; duplicates and
   * anything past the cap are dropped.
   */
  function addAttachments(list: FileList | null, kind: "file" | "folder") {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const next = [...attachments];

    if (kind === "folder") {
      const name = files[0]?.webkitRelativePath?.split("/")[0] || "Folder";
      if (next.some((item) => item.kind === "folder" && item.name === name)) return;
      if (next.length >= MAX_ATTACHMENTS) return;

      const id = `folder:${name}`;
      next.push({ id, name, kind, count: files.length });
      attachmentFilesRef.current.set(id, files);
    } else {
      for (const file of files) {
        if (next.length >= MAX_ATTACHMENTS) break;
        if (next.some((item) => item.kind === "file" && item.name === file.name)) continue;

        const id = `file:${file.name}`;
        next.push({ id, name: file.name, kind });
        attachmentFilesRef.current.set(id, [file]);
      }
    }

    setAttachments(next);
  }

  async function send(override?: string, details?: ChatComposerSendDetails) {
    const typed = (override ?? input).trim();
    const action = details?.action ?? null;

    // An armed record option turns the send into its form, exactly like Plan
    // mode turns it into a plan-first turn. Nothing reaches the model here.
    if (action === "task" || action === "skill" || action === "plugin") {
      actionDraftRef.current = typed;
      setComposerAction(null);
      openAdd(action, typed);
      return;
    }

    if (action === "diagram") setComposerAction(null);

    if (!typed || isSending) return;

    // Attachments become real text: a chip with no content behind it was only
    // a label, so the files are read here (bounded by lib/chat-attachments).
    const attachmentText = await attachmentContextFor(
      attachments.map((item) => ({
        name: item.name,
        kind: item.kind,
        files: attachmentFilesRef.current.get(item.id) ?? [],
      })),
    ).catch((readError) => {
      console.error("[agents] could not read the attachments", readError);
      return "";
    });

    // Plan mode is a real instruction, the Add menu leaves a one-shot context
    // line, and the message itself comes last.
    const content = [
      ...(details?.plan ? ["Plan the steps first, then carry them out."] : []),
      ...(action === "diagram"
        ? [
            "Draw this as an Archify diagram: answer with one fenced ```archify block holding only Archify JSON IR (a JSON object with diagram_type, meta.title, meta.output and its nodes/edges), then explain it in two sentences.",
          ]
        : []),
      ...pendingContext,
      typed,
      attachmentText,
    ]
      .filter(Boolean)
      .join("\n\n");

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage];
    // Older pages stay in storage; the model only needs the recent context and
    // the route rejects bodies above its own limit.
    const payload: AgentChatMessage[] = nextMessages
      .slice(-MAX_CONTEXT_MESSAGES)
      .map(({ role, content: text }) => ({ role, content: text }));

    setMessages(nextMessages);
    if (!override) setInput("");
    setAttachments([]);
    attachmentFilesRef.current.clear();
    setPendingContext([]);
    setError(null);
    setBudget({
      searches: AGENT_TOOL_LIMITS.searches,
      pages: AGENT_TOOL_LIMITS.pages,
      browser: AGENT_TOOL_LIMITS.browser,
    });
    setStreaming({ content: "", steps: [], sources: [], cards: [] });

    const controller = new AbortController();
    abortRef.current = controller;

    let text = "";
    let steps: ChatToolStep[] = [];
    let sources: ChatSource[] = [];
    let cards: AgentResultCard[] = [];
    let streamError: string | null = null;
    let finished = false;

    try {
      const response = await fetch(`/api/agents/${agent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "The agent couldn't respond. Please try again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: AgentStreamEvent;
          try {
            event = JSON.parse(line) as AgentStreamEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case "text":
              text += event.delta;
              setStreaming({ content: text, steps, sources, cards });
              break;
            case "tool_started":
              steps = [
                ...steps,
                { name: event.name, label: event.label, status: "running", startedAt: Date.now() },
              ];
              setStreaming({ content: text, steps, sources, cards });
              break;
            case "tool_finished":
              steps = steps.map((step) =>
                step.status === "running" && step.name === event.name
                  ? {
                      ...step,
                      status: "done" as const,
                      duration: step.startedAt ? Date.now() - step.startedAt : undefined,
                    }
                  : step,
              );
              setStreaming({ content: text, steps, sources, cards });
              break;
            case "sources":
              sources = event.sources;
              setStreaming({ content: text, steps, sources, cards });
              break;
            case "memory_saved":
              setMemorySaves((current) =>
                current.some((note) => note.id === event.memory.id)
                  ? current
                  : [...current, event.memory],
              );
              break;
            case "app_result":
              cards = [...cards, event.card];
              setStreaming({ content: text, steps, sources, cards });
              break;
            case "widget_offer":
              setWidgetOffers((current) =>
                current.some((offer) => offer.id === event.offer.id)
                  ? current
                  : [...current, event.offer],
              );
              break;
            case "widget_options":
              // The offer has been answered; the picker replaces it.
              setWidgetOffers([]);
              setWidgetProposals((current) =>
                current.some((entry) => entry.id === event.id)
                  ? current
                  : [...current, { id: event.id, proposal: event.proposal }],
              );
              break;
            case "widget_edit":
              setWidgetEdits((current) =>
                current.some((entry) => entry.id === event.proposal.id)
                  ? current
                  : [...current, event.proposal],
              );
              break;
            case "layout_proposal":
              setLayoutProposals((current) =>
                current.some((entry) => entry.id === event.id)
                  ? current
                  : [...current, { id: event.id, template: event.template, reason: event.reason }],
              );
              break;
            case "schedule_proposal":
              setScheduleProposals((current) =>
                current.some((entry) => entry.id === event.proposal.id)
                  ? current
                  : [...current, event.proposal],
              );
              break;
            case "task_proposal":
              setTaskProposals((current) =>
                current.some((entry) => entry.id === event.proposal.id)
                  ? current
                  : [...current, event.proposal],
              );
              break;
            case "budget":
              setBudget({
                searches: event.searches,
                pages: event.pages,
                browser: event.browser,
              });
              break;
            case "browser":
              // The session is released when the reply ends, so the live view
              // only exists while the turn is still running.
              startLiveBrowser(agent.id, event.liveViewUrl);
              break;
            case "approval_request":
              setApprovalRequests((current) =>
                current.some((request) => request.token === event.token)
                  ? current
                  : [
                      ...current,
                      {
                        token: event.token,
                        toolkit: event.toolkit,
                        name: event.name,
                        action: event.action,
                        actionLabel: event.actionLabel,
                        summary: event.summary,
                        preview: event.preview,
                      },
                    ],
              );
              break;
            case "connect_request":
              setConnectRequests((current) =>
                current.some((request) => request.toolkit === event.toolkit)
                  ? current
                  : [
                      ...current,
                      { toolkit: event.toolkit, name: event.name, reason: event.reason },
                    ],
              );
              break;
            case "error":
              streamError = event.message;
              break;
            case "done":
              finished = true;
              break;
          }
        }
      }

      if (text.trim()) {
        setMessages((current) => [
          ...current,
          {
            id: `msg-${Date.now()}-reply`,
            role: "assistant",
            content: text,
            createdAt: new Date().toISOString(),
            steps: steps.length > 0 ? steps : undefined,
            sources: sources.length > 0 ? sources : undefined,
            cards: cards.length > 0 ? cards : undefined,
          },
        ]);
      }

      if (streamError) {
        setError(streamError);
      } else if (!finished && !text.trim()) {
        setError("The agent's reply stopped early. Please try again.");
      }
    } catch (sendError) {
      if ((sendError as Error)?.name === "AbortError") return;
      console.error("[agents] send failed", sendError);
      setError("Your message didn't reach the agent. Please try again.");
    } finally {
      stopLiveBrowser();
      if (!controller.signal.aborted) {
        setStreaming(null);
        abortRef.current = null;
      }
    }
  }

  /**
   * A dashboard action (`?editWidget=`) opens the chat ready to edit that
   * widget. It only prefills — the user writes what should change, so a stray
   * link can't make the agent rewrite a card unprompted.
   */
  useEffect(() => {
    if (editPrefillRef.current || !editWidgetId) return;
    const target = widgets.find((widget) => widget.id === editWidgetId);
    if (!target) return;

    editPrefillRef.current = true;
    setInput((current) =>
      current.trim() ? current : `Edit the “${target.title}” widget: `,
    );
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [editWidgetId, widgets]);

  function dismissWidgetOffer(offer: WidgetOffer) {
    setWidgetOffers((current) => current.filter((entry) => entry.id !== offer.id));
  }

  function acceptWidgetOffer(offer: WidgetOffer) {
    setWidgetOffers((current) => current.filter((entry) => entry.id !== offer.id));
    void send(
      `Yes, create a widget for “${offer.title}”. Use the information from the conversation and show me two designs.`,
    );
  }

  async function chooseWidgetDesign(
    proposal: WidgetProposal,
    option: WidgetDesignOption,
  ): Promise<WidgetChoiceResult> {
    try {
      const response = await fetch("/api/widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          proposal,
          design: option,
          timezone: browserTimeZone(),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { widget?: WidgetRecord; error?: string }
        | null;

      if (!response.ok || !data?.widget) {
        return {
          ok: false,
          error: data?.error ?? "We couldn't add that widget. Please try again.",
        };
      }

      const created = data.widget;
      setWidgets((current) =>
        current.some((widget) => widget.id === created.id) ? current : [...current, created],
      );
      return { ok: true, widget: created };
    } catch (widgetError) {
      console.error("[widgets] create from chat failed", widgetError);
      return { ok: false, error: "We couldn't reach the dashboard. Please try again." };
    }
  }

  async function refreshWidget(widget: WidgetRecord): Promise<string | null> {
    const result = await refreshWidgetNowAction({ id: widget.id });
    if (!result.ok) return result.error;

    setWidgets((current) =>
      current.map((entry) => (entry.id === widget.id ? { ...entry, ...result.widget } : entry)),
    );
    // Refresh the server panel so its widget-update history includes this run.
    router.refresh();
    return null;
  }

  async function removeWidget(widget: WidgetRecord): Promise<string | null> {
    setWidgets((current) => current.filter((entry) => entry.id !== widget.id));

    const result = await deleteWidgetAction({ id: widget.id });
    if (!result.ok) {
      setWidgets((current) =>
        current.some((entry) => entry.id === widget.id)
          ? current
          : [...current, widget].sort((a, b) => a.id - b.id),
      );
      return result.error;
    }

    return null;
  }

  function editWidgetWithAgent(widget: WidgetRecord) {
    setInput(`Edit the “${widget.title}” widget: `);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      const container = scrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
  }

  // The card calls back after Composio reports the account active; keeping the
  // latest `send` in a ref lets that callback stay stable across renders.
  useEffect(() => {
    sendRef.current = send;
    isSendingRef.current = isSending;
  });

  const handleConnected = useCallback((request: ConnectionRequest) => {
    const text = `I've connected ${request.name}. Verify it with check_app_connection, then continue with my request.`;

    // If the card finished while the agent was still replying, wait for that
    // turn to end instead of dropping the continuation.
    let tries = 0;
    const fire = () => {
      if (isSendingRef.current && tries < 60) {
        tries += 1;
        setTimeout(fire, 1_000);
        return;
      }
      void sendRef.current(text);
    };

    fire();
  }, []);

  const dismissConnect = useCallback((toolkit: string) => {
    setConnectRequests((current) => current.filter((request) => request.toolkit !== toolkit));
  }, []);

  const dismissApproval = useCallback((token: string) => {
    setApprovalRequests((current) => current.filter((request) => request.token !== token));
  }, []);

  async function toggleMemory(next: boolean) {
    if (memoryBusy) return;
    setMemoryBusy(true);
    setMemoryError(null);
    setMemoryNotice(null);
    const previous = memoryOn;
    setMemoryOn(next);

    try {
      const result = await setAgentMemoryEnabledAction({ agentId: agent.id, enabled: next });
      if (!result.ok) {
        setMemoryOn(previous);
        setMemoryError(result.error);
        return;
      }
      setMemoryNotice(
        next ? "Memory is on for this agent." : "Memory is off. Its saved notes are kept.",
      );
      router.refresh();
    } catch {
      setMemoryOn(previous);
      setMemoryError("We couldn't change that setting. Please try again.");
    } finally {
      setMemoryBusy(false);
    }
  }

  /** A note drafted here is stored for this agent, never sent as a chat turn. */
  async function saveMemoryNote() {
    if (memorySaving) return;
    setMemorySaving(true);
    setMemoryError(null);
    setMemoryNotice(null);

    try {
      const result = await createMemoryAction({
        agentId: agent.id,
        content: memoryDraft,
        tags: normalizeMemoryTags(memoryDraftTags),
      });

      if (!result.ok) {
        setMemoryError(result.error);
        return;
      }

      setDrawerNotes((current) =>
        current.some((note) => note.id === result.memory.id)
          ? current
          : [result.memory, ...current],
      );
      setMemoryDraft("");
      setMemoryDraftTags("");
      setMemoryNotice("Saved. The agent can use it from its next message.");
      router.refresh();
    } catch {
      setMemoryError("We couldn't save that memory. Please try again.");
    } finally {
      setMemorySaving(false);
    }
  }

  return (
    <section className="flex h-[calc(100dvh-8.5rem)] min-h-[380px] sm:min-h-[460px] flex-col overflow-hidden premium-panel rounded-2xl lg:h-full lg:min-h-0">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 sm:px-4 py-1.5">
        <p className="min-w-0 truncate text-[0.66rem] text-muted-foreground">
          Chat history is saved for this agent.
        </p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={isSending || clearingChat}
          onClick={() => {
            setNewChatError(null);
            setConfirmNewChat(true);
          }}
          className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-[0.66rem]"
        >
          {clearingChat ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <MessageSquarePlus className="size-3" />
          )}
          New chat
        </Button>
      </div>

      <AlertDialog
        open={confirmNewChat}
        onOpenChange={(open) => {
          if (!clearingChat) setConfirmNewChat(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every saved message with {agent.name}, so the next reply
              starts with no history. Approval records, widgets, schedules and tasks stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {newChatError ? (
            <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.7rem] text-destructive">
              {newChatError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingChat}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={clearingChat}
              onClick={(event) => {
                event.preventDefault();
                void startNewChat();
              }}
            >
              {clearingChat ? <Loader2 className="size-3 animate-spin" /> : null}
              Delete messages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 px-3 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <AgentAvatar avatar={agent.avatar} color={agent.color} className="size-8 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-semibold">{agent.name}</p>
            <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isSending ? "animate-pulse bg-amber-500" : "bg-emerald-500",
                )}
              />
              {isSending ? "Thinking…" : "Ready to chat"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-full">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5">
            <ToolBadges enabled={agent.enabledTools} mcpCount={mcpServerCount} />
            <span className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card px-1 py-1 shrink-0">
              <BudgetPill
                icon={Search}
                label="Web searches"
                remaining={budget.searches}
                total={AGENT_TOOL_LIMITS.searches}
              />
              <span className="h-3 w-px bg-border" aria-hidden />
              <BudgetPill
                icon={Globe}
                label="Page reads"
                remaining={budget.pages}
                total={AGENT_TOOL_LIMITS.pages}
              />
              {hasBrowserTools(agent.enabledTools) && (
                <>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <BudgetPill
                    icon={Monitor}
                    label="Browser actions"
                    remaining={budget.browser}
                    total={AGENT_TOOL_LIMITS.browser}
                  />
                </>
              )}
            </span>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setMemoryOpen(true)}
            title="What this agent remembers about you"
            className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-[0.66rem]"
          >
            <Brain className="size-3" aria-hidden="true" />
            Memory
            {drawerNotes.length > 0 ? (
              <span className="tabular-nums opacity-60">{drawerNotes.length}</span>
            ) : null}
          </Button>
          <ModelPicker
            catalog={catalog}
            value={providerId}
            onSelect={changeModel}
            disabled={changingModel}
            align="end"
            className="w-auto shrink-0"
          />
        </div>
      </header>

      <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-[0.95rem]">
              <Brain className="size-4 text-brand-ink" aria-hidden="true" />
              What {agent.name} remembers
            </DialogTitle>
            <DialogDescription className="text-[0.7rem] leading-relaxed">
              Short notes saved in conversation (or written by you) and read back on later turns.
              Nothing here is invented.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2">
            <span className="min-w-0 flex-1 text-[0.66rem] leading-snug">
              {memoryOn
                ? "Memory is on for this agent."
                : "Memory is off — notes are kept but never sent to the model."}
            </span>
            <Switch
              checked={memoryOn}
              disabled={memoryBusy}
              aria-label={`Use memory for ${agent.name}`}
              onCheckedChange={(value: boolean) => void toggleMemory(value)}
            />
          </div>

          {memoryError ? (
            <p role="alert" className="mt-2 rounded-lg bg-destructive/5 px-2.5 py-1.5 text-[0.68rem] text-destructive">
              {memoryError}
            </p>
          ) : null}
          {memoryNotice ? (
            <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[0.68rem] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {memoryNotice}
            </p>
          ) : null}

          {drawerNotes.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center text-[0.7rem] text-muted-foreground">
              Nothing remembered yet. Say “remember this” in the chat, or write a note on the Memory
              page.
            </p>
          ) : (
            <ul className="mt-1 max-h-[38vh] space-y-1.5 overflow-y-auto pr-0.5">
              {drawerNotes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-xl border border-border/60 bg-background/60 px-2.5 py-2"
                >
                  <p className="text-[0.74rem] leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.56rem] text-muted-foreground">
                    <span className="tabular-nums">#{note.id}</span>
                    <span>{note.source === "owner" ? "written by you" : "learned in chat"}</span>
                    {note.useCount > 0 ? (
                      <span className="tabular-nums">recalled {note.useCount}×</span>
                    ) : null}
                    {note.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 rounded-xl border border-border/60 p-2">
            <p className="text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Write a note
            </p>
            <Textarea
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
              rows={2}
              maxLength={MEMORY_CONTENT_MAX}
              placeholder="Prefers short replies and metric units."
              className="mt-1 min-h-[52px] text-[0.72rem]"
              aria-label="New memory note"
            />
            <input
              value={memoryDraftTags}
              onChange={(event) => setMemoryDraftTags(event.target.value)}
              placeholder="tags: preference, writing"
              maxLength={120}
              aria-label="Tags, comma separated"
              className="mt-1.5 h-7 w-full rounded-md border border-border bg-background px-2 text-[0.7rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="xs"
              disabled={memorySaving || memoryDraft.trim().length < 4}
              onClick={() => void saveMemoryNote()}
              className="mt-1.5 h-7 w-full gap-1.5 rounded-full text-[0.66rem]"
            >
              {memorySaving ? "Saving…" : "Save to this agent's memory"}
            </Button>
          </div>

          <DialogFooter className="mt-1 flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
            <span className="text-[0.6rem] text-muted-foreground">
              {memoryOn ? "Used in every conversation with this agent." : "Currently unused."}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => router.push("/dashboard/memory")}
              className="h-7 gap-1.5 rounded-full px-2.5 text-[0.66rem]"
            >
              Open Memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modelError ? (
        <p
          role="alert"
          className="border-b border-border/60 bg-destructive/5 px-4 py-1.5 text-[0.66rem] text-destructive"
        >
          {modelError}
        </p>
      ) : null}

      {widgets.length === 0 ? <TemplateSuggestionStrip /> : null}

      <AgentWidgetStrip
        widgets={widgets}
        onDelete={removeWidget}
        onRefresh={refreshWidget}
        onApplied={(updated) => {
          setWidgets((current) =>
            current.map((widget) =>
              widget.id === updated.id ? { ...widget, ...updated } : widget,
            ),
          );
          router.refresh();
        }}
        onEdit={editWidgetWithAgent}
      />

      <LiveBrowser variant="chat" />

      {lastScheduleRun && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-muted/30 px-4 py-1.5 text-[0.66rem] text-muted-foreground">
          <CalendarClock className="size-3 shrink-0" />
          <span className="font-medium text-foreground/80">Last scheduled run</span>
          <span className="truncate">· {lastScheduleRun.title}</span>
          <span suppressHydrationWarning className="ml-auto shrink-0">
            {new Date(lastScheduleRun.at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-medium",
              lastScheduleRun.status === "ok"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700",
            )}
          >
            {lastScheduleRun.status === "ok" ? "ok" : "failed"}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        aria-live="polite"
        onScroll={(event) => {
          // Reaching the top walks one page further back, ten turns at a time.
          if (hasMore && !loadingOlder && event.currentTarget.scrollTop < 32) {
            void loadOlder();
          }
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-background px-4 py-5"
      >
        {messages.length === 0 && !streaming ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <AgentAvatar avatar={agent.avatar} color={agent.color} className="size-10" />
            <p className="mt-3 text-[0.9rem] font-semibold">Ask {agent.name} anything</p>
            <p className="mt-1 max-w-xs text-[0.76rem] leading-relaxed text-muted-foreground">
              Your agent thinks through the problem before answering. Start with a question, a
              task or a rough idea.
            </p>
            <span className="mt-3 flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[0.65rem] text-muted-foreground">
              <MessageSquare className="size-3" />
              {currentModel.name}
            </span>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
            {hasMore || olderError ? (
              <div className="flex flex-col items-center gap-1 pb-1">
                {hasMore ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                    className="gap-1.5 rounded-full bg-card text-[0.68rem] text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                  >
                    {loadingOlder ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ChevronUp className="size-3" />
                    )}
                    {loadingOlder ? "Loading earlier messages…" : "Load more messages"}
                  </Button>
                ) : null}
                {olderError ? (
                  <p role="alert" className="text-[0.66rem] text-destructive">
                    {olderError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                agent={agent}
                onAddTask={(text) => openAdd("task", text)}
                onAddSkill={(text) => openAdd("skill", text)}
                onSaveDiagram={(source) => openAdd("diagram", source)}
              />
            ))}

            {composerNotes.map((note) => (
              <div
                key={note.id}
                className="ml-9 flex max-w-[94%] items-start gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 sm:max-w-[88%]"
              >
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-[0.74rem] font-medium">
                    {
                      note.kind === "task"
                        ? "Task"
                        : note.kind === "skill"
                          ? "Skill"
                          : note.kind === "plugin"
                            ? "Plugin"
                            : "Diagram"
                    }{" "}
                    · {note.title}
                  </p>
                  <p className="mt-0.5 text-[0.66rem] leading-relaxed text-muted-foreground">
                    {note.detail}{" "}
                    <button
                      type="button"
                      onClick={() => router.push(note.href)}
                      className="font-medium text-brand-ink hover:underline"
                    >
                      Open
                    </button>
                  </p>
                </div>
              </div>
            ))}

            {widgetProposals.map((entry) => (
              <WidgetOptionsCard
                key={entry.id}
                proposal={entry.proposal}
                onChoose={(option) => chooseWidgetDesign(entry.proposal, option)}
              />
            ))}

            {widgetEdits.map((proposal) => (
              <WidgetEditCard
                key={proposal.id}
                proposal={proposal}
                className="ml-9 max-w-[94%] sm:max-w-[88%]"
                onApplied={(updated) => {
                  // Only this agent's rail changes; another agent's widget still
                  // lands in the database and shows on the dashboard.
                  if (updated.agentId === agent.id) {
                    setWidgets((current) =>
                      current.some((widget) => widget.id === updated.id)
                        ? current.map((widget) =>
                            widget.id === updated.id ? { ...widget, ...updated } : widget,
                          )
                        : [...current, updated],
                    );
                  }
                  router.refresh();
                }}
                onDismiss={() =>
                  setWidgetEdits((current) =>
                    current.filter((entry) => entry.id !== proposal.id),
                  )
                }
              />
            ))}

            {taskProposals.map((proposal) => (
              <TaskProposalCard
                key={proposal.id}
                proposal={proposal}
                agentId={agent.id}
                onAdded={() => router.refresh()}
                onDismiss={() =>
                  setTaskProposals((current) =>
                    current.filter((entry) => entry.id !== proposal.id),
                  )
                }
              />
            ))}

            {scheduleProposals.map((proposal) => (
              <ScheduleProposalCard
                key={proposal.id}
                agentId={agent.id}
                proposal={proposal}
                onCreated={() => router.refresh()}
                onDismiss={() =>
                  setScheduleProposals((current) =>
                    current.filter((entry) => entry.id !== proposal.id),
                  )
                }
              />
            ))}

            {layoutProposals.map((proposal) => (
              <LayoutProposalCard
                key={proposal.id}
                proposal={proposal}
                onDismiss={() =>
                  setLayoutProposals((current) =>
                    current.filter((entry) => entry.id !== proposal.id),
                  )
                }
              />
            ))}

            {widgetOffers.map((offer) => (
              <WidgetOfferCard
                key={offer.id}
                offer={offer}
                busy={isSending}
                onAccept={() => acceptWidgetOffer(offer)}
                onDismiss={() => dismissWidgetOffer(offer)}
              />
            ))}

            {memorySaves.length > 0 && (
              <div className="ml-9 max-w-[94%] space-y-1.5 sm:max-w-[88%]">
                {memorySaves.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-xl border border-brand-border/70 bg-brand-soft/40 px-2.5 py-2"
                  >
                    <p className="flex items-center gap-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-brand-ink">
                      <Brain className="size-3" aria-hidden="true" />
                      Saved to memory
                      <button
                        type="button"
                        onClick={() =>
                          setMemorySaves((current) =>
                            current.filter((entry) => entry.id !== note.id),
                          )
                        }
                        className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Hide this memory confirmation"
                      >
                        <X className="size-3" />
                      </button>
                    </p>
                    <p className="mt-1 text-[0.72rem] leading-relaxed">{note.content}</p>
                    {note.tags.length > 0 ? (
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[0.55rem] text-muted-foreground">
                        {note.tags.map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                        <span className="tabular-nums">#{note.id}</span>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {connectRequests.length > 0 && (
              <div className="space-y-2">
                {connectRequests.map((request) => (
                  <ConnectionCard
                    key={request.toolkit}
                    request={request}
                    onConnected={handleConnected}
                    onDismiss={dismissConnect}
                  />
                ))}
              </div>
            )}

            {approvalRequests.length > 0 && (
              <div className="space-y-2">
                {approvalRequests.map((request) => (
                  <ApprovalCard
                    key={request.token}
                    request={request}
                    agentId={agent.id}
                    onDismiss={dismissApproval}
                  />
                ))}
              </div>
            )}

            {streaming ? <StreamingTurn agent={agent} streaming={streaming} /> : null}

            {streaming && streaming.cards && streaming.cards.length > 0 ? (
              <div className="ml-9 space-y-1.5">
                {streaming.cards.map((card, index) => (
                  <AppResultCard key={`stream-card-${index}`} card={card} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card/80 p-2 sm:p-3">

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            addAttachments(event.target.files, "file");
            // Clearing the value lets the same file be picked again.
            event.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(event) => {
            addAttachments(event.target.files, "folder");
            event.target.value = "";
          }}
        />
        <ComposerAddDialogs
          mode={addMode}
          draft={addDraft}
          agent={{ id: agent.id, name: agent.name }}
          onCreated={handleComposerCreated}
          onClose={() => setAddMode(null)}
        />
        <ChatComposer
          value={input}
          onValueChange={setInput}
          onSend={(message, details) => void send(message, details)}
          busy={isSending}
          placeholder={`Message ${agent.name}…`}
          attachments={attachments}
          onRemoveAttachment={(id) => {
            attachmentFilesRef.current.delete(id);
            setAttachments((current) => current.filter((item) => item.id !== id));
          }}
          onAttach={() => fileInputRef.current?.click()}
          onAttachFolder={() => folderInputRef.current?.click()}
          addAction={composerAction}
          onAddActionChange={setComposerAction}
          error={error}
          inputRef={composerRef}
          apps={composerApps}
          approvalMode={approvalMode}
          approvalSaving={savingApprovalMode}
          onApprovalModeChange={(mode) => void changeApprovalMode(mode)}
          onConnectApp={connectComposerApp}
          onDisconnectApp={disconnectComposerApp}
          tray={messages.length === 0}
          approvals={{
            pending: approvalRequests.length,
            onReview: () =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              }),
          }}
          tools={
            <>
              <ModelPicker
                catalog={catalog}
                value={providerId}
                onSelect={changeModel}
                disabled={changingModel}
                align="end"
                className="w-auto border-0 bg-transparent px-1.5 py-0 text-[0.72rem] font-normal text-foreground shadow-none hover:bg-transparent"
              />
              <button
                type="button"
                onClick={() => void toggleBrowser()}
                disabled={isSending || savingBrowser}
                aria-pressed={browser}
                aria-label={browser ? "Turn web browsing off" : "Turn web browsing on"}
                title={
                  browser
                    ? "Web search and page reading are on for this agent"
                    : "Web search and page reading are off for this agent"
                }
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.65rem] font-medium transition disabled:opacity-60",
                  browser
                    ? "bg-brand-soft text-brand-ink ring-1 ring-brand-border hover:bg-brand-soft"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted",
                )}
              >
                {savingBrowser ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Globe className="size-3" />
                )}
                <span className="hidden min-[460px]:inline">Browser</span>
              </button>
            </>
          }
        />
      </div>
    </section>
  );
}

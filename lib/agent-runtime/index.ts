import "server-only";

import {
  Agent,
  MaxTurnsExceededError,
  MCPServerStreamableHttp,
  OpenAIProvider,
  run,
  setTracingDisabled,
  type AgentInputItem,
  type ModelSettings,
} from "@openai/agents";

import { getAgentMcpServerConfigs } from "@/lib/agent-mcp";
import { getDashboardTemplateForAgent } from "@/lib/dashboards";
import { getTemplateWorkbench, templateRunScope } from "@/lib/template-workspaces";
import { listCustomPluginsForRuntime } from "@/lib/custom-plugins";
import { listCustomSkillsForRuntime } from "@/lib/custom-skills";
import { listToolkitActions } from "@/lib/composio/client";
import { composioApiKey } from "@/lib/composio/config";
import { getComposioMcpServer } from "@/lib/composio/session";
import { INTEGRATIONS, getIntegration } from "@/lib/integrations/catalog";

import { hasBrowserTools, resolveAgentToolIds } from "@/lib/agent-tool-options";
import type { AgentDetail } from "@/lib/agent-options";
import { listAgentsForUser } from "@/lib/agents";
import { getTeamForUser } from "@/lib/teams";
import { TEAM_LIMITS, type AgentTeammate } from "@/lib/agent-team";
import { createTeammateTool } from "@/lib/agent-runtime/tools/team";
import { resolveAgentConnection, supportsReasoningEffort } from "@/lib/agent-runtime/models";
import { readRunUsage } from "@/lib/agent-runtime/usage";
import { agentRunLimitError, recordAgentUsage } from "@/lib/plan-usage";
import { buildAgentInstructions } from "@/lib/agent-runtime/prompt";
import type { ScheduleActionPolicy } from "@/lib/schedule-action";
import type { TaskToolSelection } from "@/lib/task-types";
import { cardToolScope, scopeList } from "@/lib/agent-runtime/card-tools";
import { cardBuiltinTools } from "@/lib/task-types";
import {
  AGENT_TOOL_LIMITS,
  createAgentToolRunState,
  type AgentToolRunState,
} from "@/lib/agent-runtime/tools/context";
import { browserLiveViewUrl, closeCloudBrowser } from "@/lib/browserbase/session";
import { recordBrowserSession } from "@/lib/browser-sessions";
import { listSignedInHosts } from "@/lib/browser-logins";
import type { AgentChatMessage, AgentStreamEvent } from "@/lib/agent-runtime/protocol";
import {
  getAgentToolLabel,
  getAgentTools,
  listAgentToolSummaries,
} from "@/lib/agent-runtime/tools";
import {
  createCustomPluginTools,
  listCustomPluginToolSummaries,
} from "@/lib/agent-runtime/tools/custom-plugins";
import {
  createUseSkillTool,
  listCustomSkillSummaries,
} from "@/lib/agent-runtime/tools/custom-skills";
import {
  createUseDiagramTool,
  listCustomDiagramSummaries,
} from "@/lib/agent-runtime/tools/custom-diagrams";
import { listCustomDiagramsForRuntime } from "@/lib/custom-diagrams";
import { MEMORY_TOOLS, MEMORY_TOOL_SUMMARIES } from "@/lib/agent-runtime/tools/memory";
import { memoryContextForAgent } from "@/lib/memories";

/**
 * The agent runner: one place that turns a stored agent plus its conversation
 * into a stream of events. Model-agnostic — the model, credentials and API
 * flavour come from `resolveAgentConnection`, so built-in models and models the
 * user connected themselves run through the same path. Tools come from the
 * registry.
 */

// Traces would be exported to OpenAI with our key even when the agent runs on a
// different provider. Turn that off until a tracing backend is chosen.
setTracingDisabled(true);

export type AgentRuntimeAgent = Pick<
  AgentDetail,
  | "name"
  | "provider"
  | "objective"
  | "instructions"
  | "enabledTools"
  | "mcpTools"
  | "enabledSkills"
  | "enabledPlugins"
  | "enabledDiagrams"
  | "approvalMode"
> & {
  /** Stored agent id, so a browser session can be attributed to it. */
  id: number;
  /** Needed to look up a model the agent owner connected themselves. */
  ownerId: number;
  /** The board the agent works on: its teammates are that board's agents. */
  dashboardId?: number | null;
  /** When set, the run's teammates are exactly this team's members. */
  teamId?: number | null;
};

/** Enough context to stay coherent without sending an unbounded transcript. */
const MAX_HISTORY_ITEMS = 24;

/**
 * Step budget for one turn. A normal reply needs a handful of tool steps; a
 * cloud-browser task needs more, because every click, scroll and read is its
 * own step. `AGENT_MAX_TURNS` overrides both when a deployment wants to tune it.
 */
const BASE_MAX_TURNS = 8;
const BROWSER_MAX_TURNS = 16;
/** Connected apps add a discovery step before the real call. */
const APPS_MAX_TURNS = 12;

/** Composio's own discovery tools, which never touch an app's data. */
const COMPOSIO_META_READ_TOOLS = [
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_LIST_TOOLKITS",
  "COMPOSIO_GET_CONNECTED_ACCOUNTS",
];

function resolveMaxTurns(
  enabledTools: string[] | null | undefined,
  hasConnectedApps = false,
): number {
  const override = Number(process.env.AGENT_MAX_TURNS);
  if (Number.isInteger(override) && override > 0 && override <= 40) return override;
  if (hasBrowserTools(enabledTools)) return BROWSER_MAX_TURNS;
  return hasConnectedApps ? APPS_MAX_TURNS : BASE_MAX_TURNS;
}

/**
 * The conversation as Agents SDK input items. Assistant turns are marked
 * completed so the SDK treats them as past output, not new instructions.
 */
function toInputItems(messages: AgentChatMessage[]): AgentInputItem[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_HISTORY_ITEMS)
    .map<AgentInputItem>((message) =>
      message.role === "user"
        ? { role: "user", content: [{ type: "input_text", text: message.content.trim() }] }
        : {
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: message.content.trim() }],
          },
    );
}

function reasoningEffort(): "low" | "medium" | "high" {
  const value = process.env.AGENT_REASONING_EFFORT?.trim().toLowerCase();
  return value === "low" || value === "high" ? value : "medium";
}

/**
 * User-safe failure text. The provider's own error is logged server-side and
 * never travels to the browser.
 */
function toUserSafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (/api[ _-]?key|401|unauthori[sz]ed|incorrect api key/i.test(message)) {
    return "The model rejected the API key. Check the key on this model and try again.";
  }
  if (/429|rate limit/i.test(message)) {
    return "The model is rate limited right now. Please try again in a moment.";
  }
  if (/model/i.test(message) && /not found|not exist|unsupported|invalid/i.test(message)) {
    return "That model id isn't available on its endpoint. Check the model name on this agent.";
  }
  return "The agent couldn't finish that reply. Please try again.";
}

/** True for the step-limit failure, thrown or reported on the result. */
function isMaxTurnsError(error: unknown): boolean {
  return (
    error instanceof MaxTurnsExceededError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "MaxTurnsExceededError")
  );
}

const MAX_TURNS_MESSAGE =
  "The agent hit its step limit for this message. Ask it to continue, or break the task into smaller steps.";

function toolCallName(rawItem: unknown): string | null {
  if (rawItem && typeof rawItem === "object" && "name" in rawItem) {
    const name = (rawItem as { name?: unknown }).name;
    if (typeof name === "string" && name) return name;
  }
  return null;
}

/**
 * Streams one agent turn: text deltas as they arrive, tool start/finish events
 * when the model calls a tool, then `done` (or `error`). Aborting `signal`
 * cancels the provider request and ends the generator quietly.
 */
export type AgentRunHooks = {
  /**
   * Called once the turn ends, before the browser is released, with what the
   * cloud browser actually did. A scheduled run stores this on its run row.
   */
  onBrowser?: (session: { sessionId: string | null; actions: number }) => void;
  /**
   * The one send/post a schedule's owner confirmed. Scheduled runs carry it so
   * `app_run_action` can execute exactly that action, to exactly that
   * destination, without an approval card nobody is there to click. Absent for
   * chat turns, where every mutating action still asks first.
   */
  scheduledAction?: ScheduleActionPolicy | null;
  /**
   * The tools the board card behind this run picked. When present, only those
   * skills, plugins, MCP servers and apps are attached: the card's list is the
   * ceiling, not a suggestion. Absent for chat turns.
   */
  cardTools?: TaskToolSelection | null;
  /**
   * Token usage for the turn, reported once before the run is closed. A board
   * run stores it on its own history row.
   */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  /**
   * Memories `recall_memory` actually returned in this turn. A scheduled run
   * stores them beside its reply, so history shows what the agent looked up.
   */
  onRecalled?: (memories: { id: number; content: string }[]) => void;
  /**
   * 1 for a hand-off run. A teammate answers the one brief it was given, so it
   * gets no hand-off tool of its own and the chain cannot loop.
   */
  depth?: number;
};

export async function* streamAgentReply(
  agent: AgentRuntimeAgent,
  messages: AgentChatMessage[],
  signal?: AbortSignal,
  hooks?: AgentRunHooks,
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  // Every agent run — chat or scheduled — starts here, so this is where the
  // monthly token budget is enforced. A failed plan lookup must not take chat
  // down, so it logs and lets the run proceed.
  const planError = await agentRunLimitError(agent.ownerId).catch((error) => {
    console.error("[agents] could not read plan usage", error);
    return null;
  });
  if (planError) {
    yield { type: "error", message: planError };
    return;
  }

  const startedAt = new Date();
  const connection = await resolveAgentConnection(agent.provider, agent.ownerId);

  if (!connection.apiKey) {
    yield {
      type: "error",
      message:
        "This agent has no model connection yet. Set AI_API_KEY, or connect a model with its own key from the agent's model picker.",
    };
    return;
  }

  // CloudHike model ids are prefixed with their provider; they only resolve
  // against the CloudHike AI endpoint.
  if (!connection.baseURL && connection.model?.includes("/")) {
    yield {
      type: "error",
      message:
        "This model runs through CloudHike's AI service. Set AI_BASE_URL and AI_API_KEY from the AI card in your project, then try again.",
    };
    return;
  }

  const input = toInputItems(messages);
  if (input.length === 0) {
    yield { type: "error", message: "Type a message first." };
    return;
  }

  /** Created inside the turn, closed when it ends however it ends. */
  const mcpServers: MCPServerStreamableHttp[] = [];

  /** Shared by every tool call in this turn: budgets, citations and the lazy
   * cloud-browser session (opened on first use, released in `finally`). */
  const toolState: AgentToolRunState = createAgentToolRunState(agent.ownerId, agent.id, signal);
  // Search follows the same connection the chat model uses.
  toolState.model = connection;
  // Scheduled runs execute their confirmed action instead of opening a card.
  toolState.scheduledAction = hooks?.scheduledAction ?? null;
  // The agent's saved rule for data-changing app actions.
  toolState.approvalMode = agent.approvalMode ?? "ask";

  // Workspace skills and HTTP plugins. A failed read only loses those tools;
  // it must never take the whole chat down.
  const [customSkills, customPlugins, customDiagrams] = await Promise.all([
    listCustomSkillsForRuntime(agent.ownerId).catch((error) => {
      console.error("[agents] could not list custom skills", error);
      return [];
    }),
    listCustomPluginsForRuntime(agent.ownerId).catch((error) => {
      console.error("[agents] could not list custom plugins", error);
      return [];
    }),
    listCustomDiagramsForRuntime(agent.ownerId).catch((error) => {
      console.error("[agents] could not list custom diagrams", error);
      return [];
    }),
  ]);

  // What this agent already remembers. The database is the source of truth for
  // the switch, so chat, schedules and board runs all obey it the same way.
  const memory = await memoryContextForAgent(agent.ownerId, agent.id).catch((error) => {
    console.error("[agents] could not read agent memory", error);
    return { enabled: false, memories: [] as { id: number; content: string; tags: string[] }[] };
  });

  // The board the agent belongs to scopes the run. It is read from the agent's
  // own dashboard, so a chat opened from another board still obeys this one.
  const template = await getDashboardTemplateForAgent(agent.ownerId, agent.id).catch((error) => {
    console.error("[agents] could not read the dashboard template", error);
    return null;
  });
  // The app tools read this and enforce the same ceiling the Composio session
  // applies, so a slug the model types itself cannot reach an app this board's
  // template excludes.
  toolState.template = template;
  const templateScope = templateRunScope(template ?? "");
  const templateWorkbench = getTemplateWorkbench(template ?? "");
  // A template can switch a whole library group off; null means no narrowing.
  const templateSkills = templateScope?.skills === false ? [] : null;
  const templatePlugins = templateScope?.plugins === false ? [] : null;
  const templateDiagrams = templateScope?.diagrams === false ? [] : null;

  // Teammates are the agents on this agent's own board, and only when the
  // hand-off tool is switched on. An agent with no board has no team, and a
  // hand-off run is depth 1, so two agents cannot pass one task back and forth.
  const teamEnabled = resolveAgentToolIds(agent.enabledTools).includes("ask_teammate");
  // A team is the tighter boundary: when the agent is on one, its teammates are
  // exactly that roster and the prompt names the team. Agents with no team keep
  // the board-wide list they had before.
  const teamRoster =
    (hooks?.depth ?? 0) === 0 && teamEnabled && typeof agent.teamId === "number"
      ? await getTeamForUser(agent.ownerId, agent.teamId).catch((error) => {
          console.error("[agents] could not read this agent's team", error);
          return null;
        })
      : null;

  const teammates: AgentTeammate[] = teamRoster
    ? teamRoster.members
        .filter((member) => member.id !== agent.id)
        .slice(0, TEAM_LIMITS.teammatesMax)
        .map((member) => ({
          id: member.id,
          name: member.name,
          objective: member.objective,
          avatar: member.avatar,
          color: member.color,
          provider: member.provider,
        }))
    : (hooks?.depth ?? 0) === 0 && teamEnabled && typeof agent.dashboardId === "number"
      ? await listAgentsForUser(agent.ownerId, agent.dashboardId)
          .then((list) =>
            list
              .filter((entry) => entry.id !== agent.id)
              .slice(0, TEAM_LIMITS.teammatesMax)
              .map((entry) => ({
                id: entry.id,
                name: entry.name,
                objective: entry.objective,
                avatar: entry.avatar,
                color: entry.color,
                provider: entry.provider,
              })),
          )
          .catch((error) => {
            console.error("[agents] could not read this board's teammates", error);
            return [] as AgentTeammate[];
          })
      : [];

  // A board card's own picks narrow the run. No card means no narrowing, so
  // chat turns still get the whole workspace.
  const cardPolicy = cardToolScope(hooks?.cardTools);
  // Built-ins are their own ceiling: only the ones a card named are attached.
  // An empty list keeps the agent's own switches, so picking one built-in tool
  // never silently removes every skill or plugin from the run.
  const cardBuiltin = cardBuiltinTools(hooks?.cardTools);
  // Tools check this themselves (not just by being omitted), so a name that
  // reached the model another way still cannot act outside the card.
  toolState.cardTools = cardPolicy;
  // The agent's own library switches come first: null means every workspace
  // skill / plugin (the default), [] means none, a list is exactly those.
  const agentSkills = scopeList(
    customSkills,
    Array.isArray(agent.enabledSkills) ? agent.enabledSkills : null,
    (skill) => skill.name,
  );
  const agentPlugins = scopeList(
    customPlugins,
    Array.isArray(agent.enabledPlugins) ? agent.enabledPlugins : null,
    (plugin) => plugin.slug,
  );
  const agentDiagrams = scopeList(
    customDiagrams,
    Array.isArray(agent.enabledDiagrams) ? agent.enabledDiagrams : null,
    (diagram) => diagram.name,
  );
  // A board card narrows the run further, never widens it.
  const allowedSkills = scopeList(
    scopeList(agentSkills, templateSkills, (skill) => skill.name),
    cardPolicy ? cardPolicy.skills : null,
    (skill) => skill.name,
  );
  const allowedPlugins = scopeList(
    scopeList(agentPlugins, templatePlugins, (plugin) => plugin.slug),
    cardPolicy ? cardPolicy.plugins : null,
    (plugin) => plugin.slug,
  );
  const allowedDiagrams = scopeList(
    scopeList(agentDiagrams, templateDiagrams, (diagram) => diagram.name),
    cardPolicy ? cardPolicy.diagrams : null,
    (diagram) => diagram.name,
  );

  /** Set when the turn ends in a provider/runtime failure, for the history. */
  let turnFailed = false;
  /** Kept for the usage ledger written in `finally`. */
  let runResult: unknown = null;

  try {
    const provider = new OpenAIProvider({
      apiKey: connection.apiKey,
      baseURL: connection.baseURL ?? undefined,
      useResponses: connection.useResponses,
    });
    const model = await provider.getModel(connection.model ?? undefined);

    const modelSettings: ModelSettings = {};
    if (connection.useResponses && supportsReasoningEffort(connection.model)) {
      modelSettings.reasoning = { effort: reasoningEffort(), summary: "auto" };
    }

    // MCP servers the owner connected. A server that refuses to connect is
    // logged and skipped: a broken integration must not take the chat down.
    const mcpConfigs = await getAgentMcpServerConfigs(agent.ownerId);
    // A card can name the servers it wants; the agent's own tool filter still
    // applies on top of that.
    const cardServers = scopeList(
      mcpConfigs,
      cardPolicy ? cardPolicy.mcpServers : null,
      (config) => config.id,
    );
    // `mcpTools` narrows the MCP tools per agent; null leaves every tool on.
    const scoped = Array.isArray(agent.mcpTools) ? new Set(agent.mcpTools) : null;

    const servers = cardServers.flatMap((config) => {
      const allowed = scoped
        ? config.tools.filter((tool) => scoped.has(`${config.id}:${tool}`))
        : null;

      // An explicit empty selection means no MCP tools for this agent.
      if (allowed && allowed.length === 0) return [];

      return [
        new MCPServerStreamableHttp({
          url: config.url,
          name: config.label,
          cacheToolsList: false,
          timeout: 20_000,
          requestInit: config.token
            ? { headers: { Authorization: `Bearer ${config.token}` } }
            : undefined,
          toolFilter: allowed ? { allowedToolNames: allowed } : undefined,
        }),
      ];
    });
    // Apps the owner connected through Composio: one hosted MCP endpoint,
    // scoped to those toolkits and to this user. No apps means no server.
    const composio = await getComposioMcpServer(
      agent.ownerId,
      cardPolicy ? cardPolicy.apps : null,
      // The board's own app scope is the outer ceiling; a card narrows inside it.
      templateScope?.appCategories ?? null,
    );
    const composioKey = composioApiKey();
    if (composio && composioKey) {
      // The hosted MCP server is only allowed to run actions that cannot
      // change data. Mutations go through `app_run_action`, which seals them
      // into an approval token; without this filter the model could bypass the
      // approval card by calling the raw Composio tool.
      const readOnlyNames = new Set<string>(COMPOSIO_META_READ_TOOLS);
      const perToolkit = await Promise.all(
        composio.slugs.map(async (slug) => ({ slug, actions: await listToolkitActions(slug) })),
      );
      for (const entry of perToolkit) {
        for (const action of entry.actions) {
          if (action.readOnly) readOnlyNames.add(action.slug);
        }
      }

      servers.push(
        new MCPServerStreamableHttp({
          url: composio.url,
          name: "Composio apps",
          cacheToolsList: false,
          timeout: 30_000,
          requestInit: { headers: { "x-api-key": composioKey } },
          toolFilter: { allowedToolNames: [...readOnlyNames] },
        }),
      );
    }

    mcpServers.push(...servers);

    // Only servers that actually connected are attached: a half-open server
    // would make the SDK fail while listing its tools.
    const readyMcp: MCPServerStreamableHttp[] = [];
    await Promise.all(
      servers.map(async (server) => {
        try {
          await server.connect();
          readyMcp.push(server);
        } catch (error) {
          console.error(`[agents] MCP server "${server.name}" did not connect`, error);
        }
      }),
    );

    // What the owner's browser profile already holds, so the agent can open a
    // saved site instead of interrupting them for a sign-in. A failed read
    // only costs that hint, never the reply.
    const signedInSites = await listSignedInHosts(agent.ownerId).catch((error) => {
      console.error("[agents] could not list saved browser logins", error);
      return [];
    });

    const customTools = [
      ...(allowedSkills.length > 0 ? [createUseSkillTool(allowedSkills)] : []),
      ...(allowedDiagrams.length > 0 ? [createUseDiagramTool(allowedDiagrams)] : []),
      ...createCustomPluginTools(allowedPlugins),
      ...(teammates.length > 0 ? [createTeammateTool(teammates, teamRoster?.name ?? null)] : []),
      ...(memory.enabled ? MEMORY_TOOLS : []),
    ];
    const toolSummaries = [
      ...listAgentToolSummaries(agent.enabledTools, cardBuiltin),
      ...(allowedSkills.length > 0
        ? [
            {
              name: "use_skill",
              summary:
                "Load the full instructions for one of the owner's saved skills by its exact name.",
            },
          ]
        : []),
      ...(allowedDiagrams.length > 0
        ? [
            {
              name: "use_diagram",
              summary:
                "Load the Archify JSON IR for one of the owner's saved diagrams by its exact name.",
            },
          ]
        : []),
      ...listCustomPluginToolSummaries(allowedPlugins),
      ...(teammates.length > 0
        ? [
            {
              name: "ask_teammate",
              summary:
                "Hand one self-contained subtask to a teammate agent and get their answer back.",
            },
          ]
        : []),
      ...(memory.enabled ? MEMORY_TOOL_SUMMARIES : []),
    ];

    const agentInstance = new Agent<ReturnType<typeof createAgentToolRunState>>({
      name: agent.name,
      instructions: buildAgentInstructions({
        name: agent.name,
        objective: agent.objective,
        instructions: agent.instructions,
        tools: toolSummaries,
        skills: listCustomSkillSummaries(allowedSkills),
        diagrams: listCustomDiagramSummaries(allowedDiagrams),
        mcpServers: readyMcp.map((server) => server.name),
        connectedApps: composio?.toolkits ?? [],
        availableApps: INTEGRATIONS.map((integration) => integration.name),
        signedInSites,
        memories: memory.memories,
        teammates,
        team: teamRoster ? { name: teamRoster.name, objective: teamRoster.objective } : null,
        handoffLimit: TEAM_LIMITS.handoffsPerReply,
        scheduledAction: hooks?.scheduledAction ?? null,
        template:
          templateScope && templateWorkbench
            ? { label: templateWorkbench.label, guidance: templateScope.guidance }
            : null,
        appScope: templateScope?.appCategories ?? null,
      }),
      tools: [...getAgentTools(agent.enabledTools), ...customTools],
      mcpServers: readyMcp,
      model,
      modelSettings,
    });

    const result = await run(agentInstance, input, {
      stream: true,
      signal,
      maxTurns: resolveMaxTurns(agent.enabledTools, Boolean(composio)),
      context: toolState,
    });
    runResult = result;

    let emittedText = false;
    let activeTool: { name: string; label: string; detail?: string } | null = null;

    /**
     * What a tool call is working on, read from its own arguments, so the chat's
     * step list can say `/lib/tasks.ts` instead of only "Reading a project file".
     */
    const detailOf = (name: string, rawItem: unknown): string | undefined => {
      const args = (rawItem as { arguments?: unknown } | null)?.arguments;
      if (typeof args !== "string") return undefined;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args) as Record<string, unknown>;
      } catch {
        return undefined;
      }

      const text = (key: string) => {
        const value = parsed[key];
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
      };

      if (name === "read_project_file" || name === "propose_project_patch") return text("path");
      if (name === "list_project_files") return text("path") ?? "root";
      if (name === "search_project") {
        const query = text("query");
        return query ? `"${query}"` : undefined;
      }
      if (name === "web_search") return text("query");
      if (name === "ask_teammate") return text("teammate");

      return undefined;
    };
    let announcedBrowser = false;
    /** Connect cards already sent this turn; one per app. */
    const announcedConnections = new Set<string>();
    /** Result cards already forwarded, so a later tool call doesn't repeat one. */
    let emittedResults = 0;
    /** Actions a scheduled run actually sent, forwarded for its history row. */
    let emittedSent = 0;
    /** Approval cards already sent this turn; keyed by the single-use token. */
    const announcedApprovals = new Set<string>();
    /** Widget cards already sent this turn. */
    const announcedWidgetOffers = new Set<string>();
    const announcedWidgetProposals = new Set<string>();
    const announcedWidgetEdits = new Set<string>();
    const announcedLayoutProposals = new Set<string>();
    /** Schedule confirmation cards already sent this turn. */
    const announcedScheduleProposals = new Set<string>();
    /** Task cards already sent this turn; each proposal has its own id. */
    const announcedTaskProposals = new Set<string>();
    /** Project patch reviews already sent this turn. */
    const announcedProjectPatches = new Set<string>();
    /** Memories already confirmed in the chat, so one save is one card. */
    const announcedMemories = new Set<number>();
    /** Hand-offs already shown, so one teammate answer is one card. */
    const announcedHandoffs = new Set<string>();

    for await (const event of result) {
      if (signal?.aborted) return;

      if (event.type === "raw_model_stream_event") {
        if (event.data.type === "output_text_delta" && event.data.delta) {
          emittedText = true;
          yield { type: "text", delta: event.data.delta };
        }
        continue;
      }

      if (event.type !== "run_item_stream_event") continue;

      if (event.name === "tool_called" && event.item.type === "tool_call_item") {
        const name = toolCallName(event.item.rawItem) ?? "tool";
        activeTool = {
          name,
          label: getAgentToolLabel(name),
          detail: detailOf(name, event.item.rawItem),
        };
        yield { type: "tool_started", ...activeTool };
      } else if (event.name === "tool_output" && event.item.type === "tool_call_output_item") {
        if (activeTool) {
          yield { type: "tool_finished", ...activeTool };
          activeTool = null;
        }

        // The first browser call opened a session: hand the user a link to
        // watch it, once. The link stops working when the turn ends.
        if (toolState.browser && !announcedBrowser) {
          announcedBrowser = true;
          yield {
            type: "browser",
            sessionId: toolState.browser.sessionId,
            liveViewUrl: await browserLiveViewUrl(toolState.browser),
          };
        }

        // Counters live in the run state, so this is what the turn actually
        // spent, not what the registry allows.
        yield {
          type: "budget",
          searches: Math.max(0, AGENT_TOOL_LIMITS.searches - toolState.searches),
          pages: Math.max(0, AGENT_TOOL_LIMITS.pages - toolState.pages),
          browser: Math.max(0, AGENT_TOOL_LIMITS.browser - toolState.browserActions),
        };

        // An app the agent asked for: the chat turns each new request into a
        // connect card. The tool only records the intent; the card does the
        // actual link creation when the user clicks.
        for (const request of toolState.connectionRequests) {
          if (announcedConnections.has(request.toolkit)) continue;
          announcedConnections.add(request.toolkit);

          const definition = getIntegration(request.toolkit);
          if (!definition) continue;

          yield {
            type: "connect_request",
            toolkit: definition.slug,
            name: definition.name,
            reason: request.reason,
          };
        }

        // Read-only app actions already ran; their cards are plain data.
        while (emittedResults < toolState.results.length) {
          yield { type: "app_result", card: toolState.results[emittedResults] };
          emittedResults += 1;
        }

        // A scheduled run may send its one confirmed action; the run row keeps
        // exactly what left so History can show it.
        while (emittedSent < toolState.sentActions.length) {
          yield { type: "sent", entry: toolState.sentActions[emittedSent] };
          emittedSent += 1;
        }

        // Mutating actions are waiting for the owner. The model cannot run
        // them; only the approval endpoint can, with this token.
        for (const approval of toolState.approvals) {
          if (announcedApprovals.has(approval.token)) continue;
          announcedApprovals.add(approval.token);

          yield {
            type: "approval_request",
            token: approval.token,
            toolkit: approval.toolkit,
            name: approval.name,
            action: approval.action,
            actionLabel: approval.actionLabel,
            summary: approval.summary,
            preview: approval.preview,
          };
        }

        // Widget offers, style proposals and edit reviews become UI cards.
        for (const offer of toolState.widgetOffers) {
          if (announcedWidgetOffers.has(offer.id)) continue;
          announcedWidgetOffers.add(offer.id);
          yield { type: "widget_offer", offer };
        }

        for (const entry of toolState.widgetProposals) {
          if (announcedWidgetProposals.has(entry.id)) continue;
          announcedWidgetProposals.add(entry.id);
          yield { type: "widget_options", id: entry.id, proposal: entry.proposal };
        }

        // Proposed edits are review cards, not writes. Each proposal has its
        // own id, so re-proposing the same widget is a separate card.
        for (const proposal of toolState.widgetEdits) {
          if (announcedWidgetEdits.has(proposal.id)) continue;
          announcedWidgetEdits.add(proposal.id);
          yield { type: "widget_edit", proposal };
        }

        // A whole-layout suggestion previews the real cards; the owner's click
        // is what adds them.
        for (const proposal of toolState.layoutProposals) {
          if (announcedLayoutProposals.has(proposal.id)) continue;
          announcedLayoutProposals.add(proposal.id);
          yield {
            type: "layout_proposal",
            id: proposal.id,
            template: proposal.template,
            reason: proposal.reason,
          };
        }

        // A schedule proposal is only a form. The owner must confirm it before
        // the server creates a row or a CloudHike Jobs schedule.
        for (const proposal of toolState.scheduleProposals) {
          if (announcedScheduleProposals.has(proposal.id)) continue;
          announcedScheduleProposals.add(proposal.id);
          yield { type: "schedule_proposal", proposal };
        }

        // A task card is a proposal too: the owner's click is the only write.
        for (const proposal of toolState.taskProposals) {
          if (announcedTaskProposals.has(proposal.id)) continue;
          announcedTaskProposals.add(proposal.id);
          yield { type: "task_proposal", proposal };
        }

        // A file patch is reviewed before it exists: the card's Apply writes it.
        for (const proposal of toolState.projectPatches) {
          if (announcedProjectPatches.has(proposal.id)) continue;
          announcedProjectPatches.add(proposal.id);
          yield { type: "project_patch", proposal };
        }

        // A saved memory is durable, so the chat says what was kept instead of
        // leaving the owner with only the model's own claim.
        for (const memory of toolState.memoryNotes) {
          if (announcedMemories.has(memory.id)) continue;
          announcedMemories.add(memory.id);
          yield { type: "memory_saved", memory };
        }

        // A teammate answered: the card carries what they were asked and the
        // real reply, so the lead's summary can be checked against it.
        for (const handoff of toolState.handoffs) {
          if (announcedHandoffs.has(handoff.id)) continue;
          announcedHandoffs.add(handoff.id);
          yield { type: "handoff", handoff };
        }
      }
    }

    if (signal?.aborted) return;

    if (result.error) {
      if (isMaxTurnsError(result.error)) {
        yield { type: "error", message: MAX_TURNS_MESSAGE };
        return;
      }

      console.error("[agents] stream finished with an error", result.error);
      yield { type: "error", message: toUserSafeError(result.error) };
      return;
    }

    // Providers that don't stream text still produce a final answer.
    if (!emittedText) {
      const finalText = typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
      if (!finalText) {
        yield { type: "error", message: "The model returned an empty reply. Please try again." };
        return;
      }
      yield { type: "text", delta: finalText };
    }

    if (toolState.sources.length > 0) {
      yield { type: "sources", sources: toolState.sources };
    }

    yield {
      type: "done",
      model: connection.model,
      fallback: connection.isFallback,
    };
  } catch (error) {
    if (signal?.aborted) return;

    // Hitting the step limit is not a provider failure: say what happened.
    if (isMaxTurnsError(error)) {
      yield { type: "error", message: MAX_TURNS_MESSAGE };
      return;
    }

    turnFailed = true;
    console.error("[agents] stream failed", error);
    yield { type: "error", message: toUserSafeError(error) };
  } finally {
    // The cloud browser never outlives the turn that opened it.
    const browser = toolState.browser;
    if (browser) {
      hooks?.onBrowser?.({ sessionId: browser.sessionId, actions: toolState.browserActions });
    }
    await closeCloudBrowser(browser);

    // Keep the session id so the panel can offer its replay afterwards.
    if (browser?.sessionId) {
      await recordBrowserSession({
        ownerId: agent.ownerId,
        agentId: agent.id,
        sessionId: browser.sessionId,
        contextId: browser.contextId,
        actions: toolState.browserActions,
        status: turnFailed ? "failed" : "closed",
        startedAt: new Date(browser.startedAt),
      }).catch((error) => console.error("[agents] could not save the browser session", error));
    }

    await Promise.allSettled(mcpServers.map((server) => server.close()));

    // What this turn actually looked up in memory, reported before the run is
    // closed so a scheduled run can keep it with its reply.
    if (toolState.recalledMemories.length > 0) {
      hooks?.onRecalled?.(toolState.recalledMemories);
    }

    // One ledger row per turn, whether it succeeded, failed or was aborted.
    // The plan guard sums these rows for the current UTC month.
    const usage = readRunUsage(runResult);
    hooks?.onUsage?.({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
    await recordAgentUsage({
      ownerId: agent.ownerId,
      model: connection.model ?? null,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      startedAt,
      endedAt: new Date(),
    }).catch((error) => console.error("[agents] could not record token usage", error));
  }
}

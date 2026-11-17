"use server";

import {
  AGENT_INSTRUCTIONS_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
  DEFAULT_AGENT_COLOR,
  isAgentColor,
  isAgentProvider,
  normalizeAgentAvatar,
  normalizeApprovalMode,
  type AgentDetail,
  type AgentSummary,
} from "@/lib/agent-options";
import {
  createAgentModelForUser,
  deleteAgentModelForUser,
  getAgentModelForUser,
} from "@/lib/agent-models";

import { clearAgentMessagesForAgent } from "@/lib/agent-messages";
import {
  createAgentForUser,
  deleteAgentForUser,
  getAgentForUser,
  setAgentApprovalModeForUser,
  setAgentMcpToolsForUser,
  setAgentProviderForUser,
  attachAgentLibraryItemForUser,
  setAgentLibraryForUser,
  setAgentToolsForUser,
  updateAgentForUser,
} from "@/lib/agents";
import { isAgentToolId, normalizeAgentToolIds } from "@/lib/agent-tool-options";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  MCP_LABEL_MAX_LENGTH,
  beginMcpOAuth,
  createAgentMcpServerForUser,
  deleteAgentMcpServerForUser,
  discoverMcpTools,
  normalizeMcpUrl,
  refreshAgentMcpServerForUser,
} from "@/lib/agent-mcp";
import type { AgentMcpServerSummary } from "@/lib/agent-mcp-types";
import { defaultAgentModelKey } from "@/lib/agent-runtime/models";
import { getBuiltinModelList } from "@/lib/agent-model-catalog";
import { resetBrowserContext } from "@/lib/browserbase/session";
import {
  discoverModelEndpointModels,
  normalizeModelBaseUrl,
  type CustomModelOption,
} from "@/lib/agent-model-discovery";
import { agentLimitError } from "@/lib/plan-usage";
import { encryptSecret } from "@/lib/secrets";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Whether a stored `provider` value may be assigned by this user: legacy ids
 * (rows created before model keys) or any built-in model the workspace offers.
 */
async function canUseProvider(profileId: number, provider: string): Promise<boolean> {
  if (isAgentProvider(provider)) return true;

  // A saved model is usable only by the owner who created it.
  if (provider.startsWith("custom:")) {
    const modelId = Number(provider.slice("custom:".length));
    return (
      Number.isInteger(modelId) &&
      modelId > 0 &&
      Boolean(await getAgentModelForUser(profileId, modelId))
    );
  }

  if (!provider.startsWith("ai:")) return false;

  const id = provider.slice(3).trim();
  if (!id) return false;

  const models = await getBuiltinModelList();
  return models.some((model) => model.id === id);
}

export type CreateAgentInput = {
  name: string;
  avatar: string;
  color: string;
  provider: string;
  instructions?: string | null;
};

export type CreateAgentResult =
  | { ok: true; agent: AgentSummary }
  | { ok: false; error: string };

/**
 * Creates an agent for the signed-in user and returns the row so the client can
 * insert it into the sidebar without a reload.
 */
export async function createAgentAction(input: CreateAgentInput): Promise<CreateAgentResult> {
  const user = await requireUser();

  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { ok: false, error: "Give your agent a name." };
  if (name.length > AGENT_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${AGENT_NAME_MAX_LENGTH} characters.` };
  }

  const instructions = (input.instructions ?? "").trim();
  if (instructions.length > AGENT_INSTRUCTIONS_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep instructions under ${AGENT_INSTRUCTIONS_MAX_LENGTH} characters.`,
    };
  }

  const avatar = String(input.avatar ?? "");
  const color = String(input.color ?? "");
  const requestedProvider = String(input.provider ?? "");

  try {
    const profile = await ensureUserRecord(user);

    const limitError = await agentLimitError(profile.id);
    if (limitError) return { ok: false, error: limitError };

    const provider = (await canUseProvider(profile.id, requestedProvider))
      ? requestedProvider
      : defaultAgentModelKey();

    const agent = await createAgentForUser(profile.id, {
      name,
      avatar: normalizeAgentAvatar(avatar),
      color: isAgentColor(color) ? color : DEFAULT_AGENT_COLOR,
      provider,
      instructions: instructions || null,
    });

    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] create failed", error);
    return { ok: false, error: "We couldn't create your agent. Please try again." };
  }
}

export type UpdateAgentInput = {
  id: number;
  name: string;
  avatar: string;
  color: string;
  instructions?: string | null;
};

export type UpdateAgentResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

/**
 * Saves inline edits to an agent. The update is owner-scoped in the query, so a
 * signed-in user can never touch another user's agent.
 */
export async function updateAgentAction(input: UpdateAgentInput): Promise<UpdateAgentResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { ok: false, error: "Give your agent a name." };
  if (name.length > AGENT_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${AGENT_NAME_MAX_LENGTH} characters.` };
  }

  const instructions = (input.instructions ?? "").trim();
  if (instructions.length > AGENT_INSTRUCTIONS_MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep instructions under ${AGENT_INSTRUCTIONS_MAX_LENGTH} characters.`,
    };
  }

  const avatar = String(input.avatar ?? "");
  const color = String(input.color ?? "");

  try {
    const profile = await ensureUserRecord(user);
    const agent = await updateAgentForUser(profile.id, agentId, {
      name,
      avatar: normalizeAgentAvatar(avatar),
      color: isAgentColor(color) ? color : DEFAULT_AGENT_COLOR,
      instructions: instructions || null,
    });

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] update failed", error);
    return { ok: false, error: "We couldn't save your changes. Please try again." };
  }
}

export type DeleteAgentResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes one agent, owner-scoped in the query. Its transcript and schedules
 * cascade with the row, so there is nothing else to clean up.
 */
export async function deleteAgentAction(input: { id: number }): Promise<DeleteAgentResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteAgentForUser(profile.id, agentId);

    if (!deleted) return { ok: false, error: "That agent could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[agents] delete failed", error);
    return { ok: false, error: "We couldn't delete that agent. Please try again." };
  }
}

export type ClearAgentChatResult =
  | { ok: true; cleared: number }
  | { ok: false; error: string };

/**
 * Starts a fresh chat by deleting this agent's stored transcript. Approval
 * records, widgets, schedules and tasks live in their own tables and stay; the
 * next reply simply has no history to replay.
 */
export async function clearAgentChatAction(input: {
  id: number;
}): Promise<ClearAgentChatResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const agent = await getAgentForUser(profile.id, agentId);
    if (!agent) return { ok: false, error: "That agent could not be found." };

    const cleared = await clearAgentMessagesForAgent(agentId);
    return { ok: true, cleared };
  } catch (error) {
    console.error("[agents] chat clear failed", error);
    return { ok: false, error: "We couldn't clear this chat. Please try again." };
  }
}

export type UpdateAgentProviderInput = {
  id: number;
  provider: string;
};

export type UpdateAgentProviderResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

/** Switches an agent's model provider, owner-scoped in the query. */
export async function updateAgentProviderAction(
  input: UpdateAgentProviderInput,
): Promise<UpdateAgentProviderResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const provider = String(input.provider ?? "");

  try {
    const profile = await ensureUserRecord(user);
    if (!(await canUseProvider(profile.id, provider))) {
      return { ok: false, error: "Pick a model from the list." };
    }

    const agent = await setAgentProviderForUser(profile.id, agentId, provider);

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] provider update failed", error);
    return { ok: false, error: "We couldn't change the model. Please try again." };
  }
}

export type UpdateAgentApprovalModeResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

/**
 * Sets how this agent approves data-changing app actions. The mode is stored on
 * the agent, so scheduled runs and later chats follow the same rule.
 */
export async function updateAgentApprovalModeAction(input: {
  id: number;
  mode: string;
}): Promise<UpdateAgentApprovalModeResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const agent = await setAgentApprovalModeForUser(
      profile.id,
      agentId,
      normalizeApprovalMode(input.mode),
    );

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] approval mode update failed", error);
    return { ok: false, error: "We couldn't change how actions are approved." };
  }
}

export type UpdateAgentToolsInput = {
  id: number;
  tools: string[];
};

export type UpdateAgentToolsResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

/**
 * Turns individual tools on or off for one agent. Unknown ids are rejected
 * rather than dropped, so a stale client can't quietly change the list.
 */
export async function updateAgentToolsAction(
  input: UpdateAgentToolsInput,
): Promise<UpdateAgentToolsResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const requested = Array.isArray(input.tools) ? input.tools.map((tool) => String(tool)) : [];
  if (requested.some((tool) => !isAgentToolId(tool))) {
    return { ok: false, error: "That tool isn't available." };
  }

  const tools = normalizeAgentToolIds(requested);

  try {
    const profile = await ensureUserRecord(user);
    const agent = await setAgentToolsForUser(profile.id, agentId, tools);

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] tool update failed", error);
    return { ok: false, error: "We couldn't save the tools. Please try again." };
  }
}

export type UpdateAgentLibraryInput = {
  id: number;
  /** Workspace skill names; omitted leaves the stored list alone. */
  skills?: string[];
  /** Custom plugin slugs; omitted leaves the stored list alone. */
  plugins?: string[];
  /** Workspace diagram names; omitted leaves the stored list alone. */
  diagrams?: string[];
};

export type UpdateAgentLibraryResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

/** Names and slugs are trimmed, deduped and capped before they reach the row. */
function cleanLibraryNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const name = entry.trim().slice(0, 120);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= 60) break;
  }

  return result;
}

/**
 * Attaches or detaches workspace skills / HTTP plugins on one agent. This is
 * the only per-agent switch: a skill or plugin is created once for the
 * workspace, then each agent opts in or out.
 */
export async function updateAgentLibraryAction(
  input: UpdateAgentLibraryInput,
): Promise<UpdateAgentLibraryResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const hasSkills = Array.isArray(input.skills);
  const hasPlugins = Array.isArray(input.plugins);
  const hasDiagrams = Array.isArray(input.diagrams);
  if (!hasSkills && !hasPlugins && !hasDiagrams) {
    return { ok: false, error: "Nothing to change." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const agent = await setAgentLibraryForUser(profile.id, agentId, {
      ...(hasSkills ? { skills: cleanLibraryNames(input.skills) } : {}),
      ...(hasPlugins ? { plugins: cleanLibraryNames(input.plugins) } : {}),
      ...(hasDiagrams ? { diagrams: cleanLibraryNames(input.diagrams) } : {}),
    });

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] library update failed", error);
    return { ok: false, error: "We couldn't save that. Please try again." };
  }
}

/**
 * Switches one workspace skill / plugin on for an agent. Used by the chat's
 * "Schedule a run" step, so a schedule it creates can really use the item.
 */
export async function attachAgentLibraryItemAction(input: {
  id: number;
  kind: "skill" | "plugin" | "diagram";
  name: string;
}): Promise<UpdateAgentLibraryResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const kind =
    input.kind === "plugin"
      ? "plugin"
      : input.kind === "skill"
        ? "skill"
        : input.kind === "diagram"
          ? "diagram"
          : null;
  if (!kind) return { ok: false, error: "That library item could not be found." };

  const name = String(input.name ?? "")
    .trim()
    .slice(0, 120);
  if (!name) return { ok: false, error: "That library item could not be found." };

  try {
    const profile = await ensureUserRecord(user);
    const agent = await attachAgentLibraryItemForUser(profile.id, agentId, kind, name);
    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] library attach failed", error);
    return { ok: false, error: "We couldn't attach that to the agent. Please try again." };
  }
}

export type CreateAgentMcpServerInput = {
  label: string;
  url: string;
  apiKey?: string;
};

export type CreateAgentMcpServerResult =
  | { ok: true; server: AgentMcpServerSummary }
  | { ok: false; error: string };

/**
 * Connects an MCP server: the URL is fetched once so a typo or a dead server
 * fails here instead of on every chat turn. The token is encrypted on save.
 */
export async function createAgentMcpServerAction(
  input: CreateAgentMcpServerInput,
): Promise<CreateAgentMcpServerResult> {
  const user = await requireUser();

  const label = String(input.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return { ok: false, error: "Give this server a name." };
  if (label.length > MCP_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${MCP_LABEL_MAX_LENGTH} characters.` };
  }

  const url = normalizeMcpUrl(String(input.url ?? ""));
  if (!url) {
    return {
      ok: false,
      error: "Enter an HTTPS MCP endpoint (http://localhost is allowed for local servers).",
    };
  }

  const apiKey = String(input.apiKey ?? "").trim();
  if (apiKey.length > 500) return { ok: false, error: "That token looks too long." };

  let tools: string[];
  try {
    tools = await discoverMcpTools(url, apiKey || null);
  } catch (error) {
    console.error("[agents] MCP probe failed", error);
    return {
      ok: false,
      error: "Couldn't reach that MCP server. Check the URL and token, then try again.",
    };
  }

  if (tools.length === 0) {
    return { ok: false, error: "That server answered but exposes no tools." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const server = await createAgentMcpServerForUser(profile.id, {
      label,
      url,
      apiKey: apiKey || null,
      tools,
      oauth: null,
    });

    return { ok: true, server };
  } catch (error) {
    console.error("[agents] MCP save failed", error);
    return { ok: false, error: "We couldn't save that server. Please try again." };
  }
}

export type RefreshAgentMcpServerResult =
  | { ok: true; server: AgentMcpServerSummary }
  | { ok: false; error: string };

/** Re-lists a server's tools, so a new version's tools show up. */
export async function refreshAgentMcpServerAction(input: {
  id: number;
}): Promise<RefreshAgentMcpServerResult> {
  const user = await requireUser();

  const serverId = Number(input.id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return { ok: false, error: "That server could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const server = await refreshAgentMcpServerForUser(profile.id, serverId);

    if (!server) {
      return { ok: false, error: "We couldn't reach that server. Check it and try again." };
    }

    return { ok: true, server };
  } catch (error) {
    console.error("[agents] MCP refresh failed", error);
    return { ok: false, error: "We couldn't re-read that server's tools. Please try again." };
  }
}

export type DeleteAgentMcpServerResult = { ok: true } | { ok: false; error: string };

/** Disconnects a server; its tools disappear on the next chat turn. */
export async function deleteAgentMcpServerAction(input: {
  id: number;
}): Promise<DeleteAgentMcpServerResult> {
  const user = await requireUser();

  const serverId = Number(input.id);
  if (!Number.isInteger(serverId) || serverId <= 0) {
    return { ok: false, error: "That server could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteAgentMcpServerForUser(profile.id, serverId);

    if (!deleted) return { ok: false, error: "That server could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[agents] MCP delete failed", error);
    return { ok: false, error: "We couldn't remove that server. Please try again." };
  }
}

export type CreateAgentModelInput = {
  label: string;
  model: string;
  baseUrl: string;
  api: string;
  apiKey: string;
};

export type CreateAgentModelResult =
  | { ok: true; model: { id: number; label: string; model: string } }
  | { ok: false; error: string };

/**
 * Creates a saved OpenAI-compatible model for the user. The key is sealed
 * before it touches Postgres, and only the row id and name ever return to the
 * browser.
 */
export async function createAgentModelAction(
  input: CreateAgentModelInput,
): Promise<CreateAgentModelResult> {
  const user = await requireUser();

  const label = String(input.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return { ok: false, error: "Give this model a name." };
  if (label.length > 100) return { ok: false, error: "Model name must be under 100 characters." };

  const model = String(input.model ?? "").trim();
  if (!model) return { ok: false, error: "Model id is required." };
  if (model.length > 200) return { ok: false, error: "That model id looks too long." };

  const endpoint = normalizeModelBaseUrl(String(input.baseUrl ?? ""));
  if (!endpoint.ok) return endpoint;
  const baseUrl = endpoint.url;

  const api = String(input.api ?? "chat_completions").trim() === "responses"
    ? "responses"
    : "chat_completions";
  const apiKey = String(input.apiKey ?? "").trim();
  if (!apiKey) return { ok: false, error: "API key is required." };
  if (apiKey.length > 500) return { ok: false, error: "That API key looks too long." };

  let sealedApiKey: string;
  try {
    sealedApiKey = encryptSecret(apiKey);
  } catch (error) {
    console.error("[agents] model key encryption failed", error);
    return { ok: false, error: "Model keys can't be stored right now. Check the server secret and try again." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const modelRow = await createAgentModelForUser(
      profile.id,
      label,
      model,
      baseUrl,
      api,
      sealedApiKey,
    );

    return {
      ok: true,
      model: { id: modelRow.id, label: modelRow.label, model: modelRow.model },
    };
  } catch (error) {
    console.error("[agents] create model failed", error);
    return { ok: false, error: "We couldn't save that model. Please try again." };
  }
}

export type ListCustomModelsInput = {
  baseUrl: string;
  apiKey: string;
};

export type ListCustomModelsResult =
  | { ok: true; models: CustomModelOption[] }
  | { ok: false; error: string };

/**
 * Lists the models an OpenAI-compatible endpoint exposes so the Add model
 * dialog can offer a picker instead of asking for an id from memory. The key is
 * used for this request only; nothing is stored.
 */
export async function listCustomModelsAction(
  input: ListCustomModelsInput,
): Promise<ListCustomModelsResult> {
  await requireUser();

  const baseUrl = String(input.baseUrl ?? "").trim();
  const apiKey = String(input.apiKey ?? "").trim();

  if (!baseUrl) return { ok: false, error: "Enter the provider's base URL first." };
  if (!apiKey) return { ok: false, error: "Enter the API key to list its models." };
  if (apiKey.length > 500) return { ok: false, error: "That API key looks too long." };

  return discoverModelEndpointModels({ baseUrl, apiKey });
}

export type DeleteAgentModelInput = {
  id: number;
};

export type DeleteAgentModelResult = { ok: true } | { ok: false; error: string };

/** Deletes a saved model. Any agent using it resets to the built-in default. */
export async function deleteAgentModelAction(input: DeleteAgentModelInput): Promise<DeleteAgentModelResult> {
  const user = await requireUser();

  const modelId = Number(input.id);
  if (!Number.isInteger(modelId) || modelId <= 0) {
    return { ok: false, error: "That model could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    await deleteAgentModelForUser(profile.id, modelId);
    return { ok: true };
  } catch (error) {
    console.error("[agents] delete model failed", error);
    return { ok: false, error: "We couldn't remove that model. Please try again." };
  }
}

export type UpdateAgentMcpToolsResult =
  | { ok: true; agent: AgentDetail }
  | { ok: false; error: string };

const MCP_TOOL_KEY = /^\d{1,9}:.+$/;

/**
 * Narrows which MCP tools one agent may call. Keys are `serverId:toolName`; an
 * empty array means none, and `null` (all tools) is only the untouched default.
 */
export async function updateAgentMcpToolsAction(input: {
  id: number;
  tools: string[];
}): Promise<UpdateAgentMcpToolsResult> {
  const user = await requireUser();

  const agentId = Number(input.id);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "That agent could not be found." };
  }

  const requested = Array.isArray(input.tools) ? input.tools.map((key) => String(key)) : [];
  if (requested.some((key) => !MCP_TOOL_KEY.test(key) || key.length > 200)) {
    return { ok: false, error: "That MCP tool isn't available." };
  }

  const tools = [...new Set(requested)];

  try {
    const profile = await ensureUserRecord(user);
    const agent = await setAgentMcpToolsForUser(profile.id, agentId, tools);

    if (!agent) return { ok: false, error: "That agent could not be found." };
    return { ok: true, agent };
  } catch (error) {
    console.error("[agents] MCP tool scope update failed", error);
    return { ok: false, error: "We couldn't save the MCP tools. Please try again." };
  }
}

export type StartMcpOAuthResult = { ok: false; error: string };

const OAUTH_PENDING_COOKIE = "mcp_oauth_pending";
const OAUTH_RETURN_COOKIE = "mcp_oauth_return";

/**
 * Sends the browser to the MCP server's own sign-in page. The pending flow
 * (PKCE verifier, state, client id) waits in an encrypted cookie; the callback
 * route finishes the exchange and saves the server.
 */
export async function startMcpOAuthAction(input: {
  label: string;
  url: string;
  returnTo?: string;
}): Promise<StartMcpOAuthResult> {
  await requireUser();

  const label = String(input.label ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return { ok: false, error: "Give this server a name." };
  if (label.length > MCP_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${MCP_LABEL_MAX_LENGTH} characters.` };
  }

  const url = normalizeMcpUrl(String(input.url ?? ""));
  if (!url) {
    return {
      ok: false,
      error: "Enter an HTTPS MCP endpoint (http://localhost is allowed for local servers).",
    };
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto =
    requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const redirectUri = `${origin}/api/mcp/oauth/callback`;

  const returnTo =
    typeof input.returnTo === "string" && input.returnTo.startsWith("/")
      ? input.returnTo
      : "/dashboard";

  let authorizationUrl: string;
  let pendingCookie: string;

  try {
    const started = await beginMcpOAuth({ label, url, redirectUri });
    authorizationUrl = started.authorizationUrl;
    pendingCookie = started.pendingCookie;
  } catch (error) {
    console.error("[agents] MCP OAuth start failed", error);
    return {
      ok: false,
      error:
        "That server doesn't offer automatic sign-in. Connect it with a token instead, or check the URL.",
    };
  }

  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";

  jar.set(OAUTH_PENDING_COOKIE, pendingCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/mcp/oauth",
    maxAge: 600,
  });
  jar.set(OAUTH_RETURN_COOKIE, returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/api/mcp/oauth",
    maxAge: 600,
  });

  redirect(authorizationUrl);
}

export type ResetBrowserProfileResult =
  | { ok: true; hadProfile: boolean }
  | { ok: false; error: string };

/**
 * Drops the workspace's shared cloud-browser profile. Every agent of this owner
 * uses the same Browserbase Context, so this signs all of them out of every
 * site at once; the next browser task starts a fresh, empty profile.
 */
export async function resetBrowserProfileAction(): Promise<ResetBrowserProfileResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const hadProfile = await resetBrowserContext(profile.id);
    return { ok: true, hadProfile };
  } catch (error) {
    console.error("[agents] cloud browser profile reset failed", error);
    return { ok: false, error: "We couldn't reset the browser profile. Please try again." };
  }
}

import "server-only";

import { DEFAULT_AGENT_MODEL } from "@/lib/agent-options";
import { getAgentModelForUser } from "@/lib/agent-models";
import { decryptSecret } from "@/lib/secrets";

/**
 * Resolves an agent's stored `provider` value into a model connection.
 *
 * Everything goes through an OpenAI-compatible client, which is what the Agents
 * SDK speaks natively. Two kinds of model exist:
 *
 *   ai:<model-id>     the built-in connection — AI_API_KEY / AI_BASE_URL,
 *                     with AI_MODEL naming the default model
 *   custom:<row-id>   a model the user saved in `agent_models` with its own
 *                     key, base URL and API flavour
 *
 * Older provider ids ("alcatraz", "claude", …) still resolve so agents created
 * before model keys keep answering.
 */

export type AgentModelConnection = {
  provider: string;
  apiKey: string | null;
  baseURL: string | null;
  model: string | null;
  useResponses: boolean;
  isFallback: boolean;
};

/** Providers that historically ran on the workspace OpenAI key. */
const OPENAI_PROVIDERS = new Set(["alcatraz", "chatgpt", "codex"]);

function readEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function envPrefix(provider: string): string {
  return `AGENT_${provider.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

/** The default built-in model id, configurable through AI_MODEL. */
export function defaultBuiltinModel(): string {
  return readEnv(process.env.AI_MODEL) ?? readEnv(process.env.AGENT_MODEL) ?? DEFAULT_AGENT_MODEL;
}

/**
 * Built-in models offered in the picker: AI_MODEL first, then anything listed
 * in AI_MODELS (comma separated), de-duplicated.
 */
export function listBuiltinModelIds(): string[] {
  const configured = readEnv(process.env.AI_MODELS);
  const extra = configured
    ? configured
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  return Array.from(new Set([defaultBuiltinModel(), ...extra]));
}

/** Key preselected for a brand-new agent. */
export function defaultAgentModelKey(): string {
  return `ai:${DEFAULT_AGENT_MODEL}`;
}

function builtinConnection(provider: string, model: string): AgentModelConnection {
  const baseURL = readEnv(process.env.AI_BASE_URL) ?? readEnv(process.env.OPENAI_BASE_URL);
  const api = process.env.AI_API?.trim().toLowerCase() ?? process.env.OPENAI_API?.trim().toLowerCase();

  return {
    provider,
    apiKey: readEnv(process.env.AI_API_KEY) ?? readEnv(process.env.OPENAI_API_KEY),
    baseURL,
    model,
    // A custom gateway is usually chat-completions; direct OpenAI defaults to
    // the Responses API. AI_API overrides both.
    useResponses: baseURL ? api === "responses" : api !== "chat_completions",
    isFallback: false,
  };
}

function legacyConnection(provider: string): AgentModelConnection {
  if (OPENAI_PROVIDERS.has(provider)) {
    return builtinConnection(provider, defaultBuiltinModel());
  }

  const prefix = envPrefix(provider);
  const apiKey = readEnv(process.env[`${prefix}_API_KEY`]);
  const baseURL = readEnv(process.env[`${prefix}_BASE_URL`]);

  if (!apiKey && !baseURL) {
    // Not connected — keep answering on the built-in model, flagged as a fallback.
    return { ...builtinConnection(provider, defaultBuiltinModel()), isFallback: true };
  }

  return {
    provider,
    apiKey: apiKey ?? "not-needed",
    baseURL,
    model: readEnv(process.env[`${prefix}_MODEL`]) ?? defaultBuiltinModel(),
    useResponses: baseURL ? process.env[`${prefix}_API`] === "responses" : true,
    isFallback: false,
  };
}

/**
 * `ownerId` is required for custom models (they belong to one user); built-in
 * and legacy providers don't need it.
 */
export async function resolveAgentConnection(
  provider: string,
  ownerId: number | null,
): Promise<AgentModelConnection> {
  const trimmed = provider.trim();

  // `ai:<model-id>` names one built-in model, so switching the picker really
  // changes which model answers.
  if (trimmed.startsWith("ai:")) {
    const id = trimmed.slice(3).trim();
    return builtinConnection(trimmed, id || defaultBuiltinModel());
  }

  // A saved model: decrypt its key and use its own endpoint, model and API
  // flavour. A missing row (deleted model) or an unreadable key falls back to
  // the built-in connection instead of failing the turn.
  if (trimmed.startsWith("custom:")) {
    const modelId = Number(trimmed.slice("custom:".length));
    if (!ownerId || !Number.isInteger(modelId) || modelId <= 0) {
      return { ...builtinConnection(trimmed, defaultBuiltinModel()), isFallback: true };
    }

    const saved = await getAgentModelForUser(ownerId, modelId);
    if (!saved) {
      return { ...builtinConnection(trimmed, defaultBuiltinModel()), isFallback: true };
    }

    try {
      return {
        provider: trimmed,
        apiKey: decryptSecret(saved.apiKey),
        baseURL: saved.baseUrl,
        model: saved.model,
        useResponses: saved.api === "responses",
        isFallback: false,
      };
    } catch (error) {
      console.warn("[models] saved model key could not be opened", error);
      return { ...builtinConnection(trimmed, defaultBuiltinModel()), isFallback: true };
    }
  }

  return legacyConnection(trimmed);
}

/** Reasoning models accept an effort setting; chat models reject it. */
export function supportsReasoningEffort(model: string | null): boolean {
  if (!model) return true; // SDK default model is an OpenAI reasoning model
  return /^(gpt-5|o[1-9])/i.test(model);
}

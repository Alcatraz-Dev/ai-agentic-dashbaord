import "server-only";

import type { AgentModelCatalog } from "@/lib/agent-options";
import { listAgentModelsForUser } from "@/lib/agent-models";
import {
  defaultAgentModelKey,
  defaultBuiltinModel,
  listBuiltinModelIds,
} from "@/lib/agent-runtime/models";
import {
  CURATED_MODELS,
  modelInfoForId,
  providerRank,
  type AgentModelInfo,
} from "@/lib/model-catalog";

/**
 * Builds the model catalog for the pickers.
 *
 * Built-in models come from the connection itself when possible: an
 * OpenAI-compatible endpoint answers `GET /models`, so the list reflects what
 * `AI_API_KEY` can actually run. Without a key (or when the call fails) the
 * curated list in `lib/model-catalog.ts` is used, and `AI_MODEL` / `AI_MODELS`
 * always contribute. Results are memoised for a few minutes.
 */

const DISCOVERY_TTL = 5 * 60 * 1000;
const DISCOVERY_TIMEOUT = 4000;

let cached: { at: number; models: AgentModelInfo[] } | null = null;

/**
 * Only CloudHike's AI service (or a gateway set in AI_BASE_URL) is queried. We
 * deliberately do not default to OpenAI: that made the picker show OpenAI's
 * handful of models instead of the gateway's catalog.
 */
function endpointBaseUrl(): string | null {
  const base =
    process.env.AI_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "";
  return base ? base.replace(/\/+$/, "") : null;
}

type EndpointEntry = {
  id?: unknown;
  name?: unknown;
  owned_by?: unknown;
  context_length?: unknown;
  pricing?: unknown;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Maps one `GET /models` row onto the picker's model shape. */
function toModelInfo(entry: EndpointEntry): AgentModelInfo | null {
  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!id || id.endsWith(":free")) return null;

  const base = modelInfoForId(id);
  let name = base.name;

  if (typeof entry.name === "string" && entry.name.trim()) {
    const reported = entry.name.trim();
    // "Anthropic: Claude Sonnet 4.5" → "Claude Sonnet 4.5"
    name = reported.includes(": ")
      ? reported.slice(reported.indexOf(": ") + 2).trim() || base.name
      : reported;
  }

  const pricing = (entry.pricing ?? {}) as {
    input_per_million_usd?: unknown;
    output_per_million_usd?: unknown;
  };

  return {
    ...base,
    name,
    contextLength: asNumber(entry.context_length),
    inputPrice: asNumber(pricing.input_per_million_usd),
    outputPrice: asNumber(pricing.output_per_million_usd),
  };
}

async function fetchEndpointModelIds(): Promise<AgentModelInfo[] | null> {
  const apiKey = process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const baseUrl = endpointBaseUrl();
  if (!apiKey || !baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) return null;

    const models = payload.data
      .map((entry) => (entry && typeof entry === "object" ? toModelInfo(entry as EndpointEntry) : null))
      .filter((model): model is AgentModelInfo => model !== null);

    const unique = Array.from(new Map(models.map((model) => [model.id, model])).values());
    if (unique.length === 0) return null;

    console.info(`[models] discovered ${unique.length} models from ${baseUrl}`);
    return unique;
  } catch (error) {
    console.warn("[models] could not list models from the endpoint", error);
    return null;
  }
}

function buildModelList(discovered: AgentModelInfo[] | null): AgentModelInfo[] {
  const byId = new Map<string, AgentModelInfo>();
  for (const model of discovered ?? CURATED_MODELS) byId.set(model.id, model);

  // AI_MODEL / AI_MODELS always contribute, even if the endpoint omitted them.
  const defaultId = defaultBuiltinModel();
  for (const id of listBuiltinModelIds()) {
    if (!byId.has(id)) byId.set(id, modelInfoForId(id));
  }
  if (!byId.has(defaultId)) byId.set(defaultId, modelInfoForId(defaultId));

  return Array.from(byId.values()).sort((a, b) => {
    if (a.id === defaultId) return -1;
    if (b.id === defaultId) return 1;

    const rank = providerRank(a.provider) - providerRank(b.provider);
    if (rank !== 0) return rank;

    const provider = a.provider.localeCompare(b.provider);
    return provider !== 0 ? provider : a.name.localeCompare(b.name);
  });
}

/** Built-in models offered on the workspace connection. */
export async function getBuiltinModelList(): Promise<AgentModelInfo[]> {
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.models;

  const models = buildModelList(await fetchEndpointModelIds());
  cached = { at: Date.now(), models };

  return models;
}

/** Built-in models plus the workspace's saved OpenAI-compatible models. */
export async function getAgentModelCatalog(profileId: number): Promise<AgentModelCatalog> {
  const [builtin, saved] = await Promise.all([
    getBuiltinModelList(),
    listAgentModelsForUser(profileId),
  ]);

  const custom: AgentModelInfo[] = saved.map((row) => ({
    id: `custom:${row.id}`,
    modelId: row.model,
    name: row.label,
    provider: "Your models",
    logo: "generic",
  }));

  return { builtin, custom, defaultKey: defaultAgentModelKey() };
}

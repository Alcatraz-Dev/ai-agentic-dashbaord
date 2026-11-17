/**
 * Client-safe model metadata: display names, provider groups and logo keys.
 *
 * CloudHike's AI service names models `<provider>/<model>` (`openai/gpt-5.4`,
 * `anthropic/claude-sonnet-4.5`, …) and answers `GET AI_BASE_URL/models` with
 * the full list. This catalog supplies pretty names and logos for those ids and
 * a curated fallback for when the endpoint can't be queried.
 */

export type AgentModelLogo =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "meta"
  | "mistral"
  | "xai"
  | "moonshot"
  | "qwen"
  | "zai"
  | "minimax"
  | "perplexity"
  | "nvidia"
  | "cohere"
  | "microsoft"
  | "bytedance"
  | "openrouter"
  | "generic";

export type AgentModelInfo = {
  /** Model id sent to the endpoint, e.g. "openai/gpt-5.4". */
  id: string;
  /** Display name. */
  name: string;
  /** Display group in the pickers. */
  provider: string;
  logo: AgentModelLogo;
  /** Endpoint model id for a saved model; `id` is then its provider key. */
  modelId?: string;
  /** Reported by the endpoint when it knows them. */
  contextLength?: number;
  inputPrice?: number;
  outputPrice?: number;
};

/** "1.1M ctx" / "128K ctx" */
export function formatContextLength(tokens: number | undefined): string | null {
  if (!tokens || !Number.isFinite(tokens)) return null;
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M ctx`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K ctx`;
  return `${tokens} ctx`;
}

type ProviderMeta = { provider: string; logo: AgentModelLogo };

/** Provider prefixes used by the CloudHike model ids. */
const PROVIDERS: Record<string, ProviderMeta> = {
  openai: { provider: "OpenAI", logo: "openai" },
  anthropic: { provider: "Anthropic", logo: "anthropic" },
  google: { provider: "Google", logo: "google" },
  "x-ai": { provider: "xAI", logo: "xai" },
  deepseek: { provider: "DeepSeek", logo: "deepseek" },
  qwen: { provider: "Qwen", logo: "qwen" },
  "meta-llama": { provider: "Meta", logo: "meta" },
  meta: { provider: "Meta", logo: "meta" },
  mistralai: { provider: "Mistral", logo: "mistral" },
  moonshotai: { provider: "Moonshot", logo: "moonshot" },
  "z-ai": { provider: "Z.ai", logo: "zai" },
  amazon: { provider: "Amazon", logo: "generic" },
  cohere: { provider: "Cohere", logo: "cohere" },
  microsoft: { provider: "Microsoft", logo: "microsoft" },
  nvidia: { provider: "NVIDIA", logo: "nvidia" },
  minimax: { provider: "MiniMax", logo: "minimax" },
  perplexity: { provider: "Perplexity", logo: "perplexity" },
  openrouter: { provider: "OpenRouter", logo: "openrouter" },
  "bytedance-seed": { provider: "ByteDance", logo: "bytedance" },
  bytedance: { provider: "ByteDance", logo: "bytedance" },
  stepfun: { provider: "StepFun", logo: "generic" },
  upstage: { provider: "Upstage", logo: "generic" },
  xiaomi: { provider: "Xiaomi", logo: "generic" },
  tencent: { provider: "Tencent", logo: "generic" },
  inclusionai: { provider: "InclusionAI", logo: "generic" },
  "thinkingmachines": { provider: "Thinking Machines", logo: "generic" },
};

/** Group order for the pickers; unknown providers sort last. */
const PROVIDER_ORDER = [
  "OpenAI",
  "Anthropic",
  "Google",
  "xAI",
  "DeepSeek",
  "Qwen",
  "Meta",
  "Mistral",
  "Moonshot",
  "Z.ai",
];

/** Popular models shown when the endpoint can't be queried. */
export const CURATED_MODELS: AgentModelInfo[] = [
  { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "OpenAI", logo: "openai" },
  { id: "openai/gpt-5.4-mini", name: "GPT-5.4 mini", provider: "OpenAI", logo: "openai" },
  { id: "openai/gpt-5.1", name: "GPT-5.1", provider: "OpenAI", logo: "openai" },
  { id: "openai/o3", name: "o3", provider: "OpenAI", logo: "openai" },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", provider: "Anthropic", logo: "anthropic" },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", provider: "Anthropic", logo: "anthropic" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "Anthropic", logo: "anthropic" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", logo: "google" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", logo: "google" },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "Google", logo: "google" },
  { id: "x-ai/grok-4.5", name: "Grok 4.5", provider: "xAI", logo: "xai" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", logo: "deepseek" },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", logo: "deepseek" },
  { id: "qwen/qwen3-coder", name: "Qwen3 Coder", provider: "Qwen", logo: "qwen" },
  { id: "qwen/qwen3.5-plus", name: "Qwen3.5 Plus", provider: "Qwen", logo: "qwen" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", provider: "Meta", logo: "meta" },
  { id: "mistralai/mistral-large", name: "Mistral Large", provider: "Mistral", logo: "mistral" },
  { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", provider: "Moonshot", logo: "moonshot" },
  { id: "z-ai/glm-5", name: "GLM 5", provider: "Z.ai", logo: "zai" },
];

const CURATED_BY_ID = new Map(CURATED_MODELS.map((model) => [model.id, model]));

const LOGO_CHIPS: Record<AgentModelLogo, string> = {
  openai: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  anthropic: "bg-orange-50 text-orange-700 ring-orange-100",
  google: "bg-blue-50 text-blue-600 ring-blue-100",
  deepseek: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  meta: "bg-sky-50 text-sky-600 ring-sky-100",
  mistral: "bg-amber-50 text-amber-700 ring-amber-100",
  xai: "bg-slate-100 text-slate-700 ring-slate-200",
  moonshot: "bg-sky-50 text-sky-600 ring-sky-100",
  qwen: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  zai: "bg-blue-50 text-blue-700 ring-blue-100",
  minimax: "bg-rose-50 text-rose-600 ring-rose-100",
  perplexity: "bg-teal-50 text-teal-700 ring-teal-100",
  nvidia: "bg-lime-50 text-lime-700 ring-lime-100",
  cohere: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  microsoft: "bg-sky-50 text-sky-700 ring-sky-100",
  bytedance: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  openrouter: "bg-violet-50 text-violet-600 ring-violet-100",
  generic: "bg-violet-50 text-violet-600 ring-violet-100",
};

export function modelLogoChip(logo: AgentModelLogo): string {
  return LOGO_CHIPS[logo];
}

/** Group rank so the pickers always show the big providers first. */
export function providerRank(provider: string): number {
  const index = PROVIDER_ORDER.indexOf(provider);
  return index === -1 ? PROVIDER_ORDER.length : index;
}

const ACRONYMS = new Set(["gpt", "glm", "ai", "vl", "oss", "lfm", "r1", "moe", "tts"]);

function titleCaseToken(token: string, index: number): string {
  const lower = token.toLowerCase();

  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^o\d/.test(lower)) return lower;
  if (index === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);

  return lower;
}

/** "aion-labs" → "Aion Labs"; unknown provider prefixes keep a readable label. */
export function prettifyProvider(prefix: string): string {
  return prefix
    .split(/[-_]/)
    .filter(Boolean)
    .map((token) =>
      ACRONYMS.has(token.toLowerCase())
        ? token.toUpperCase()
        : token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join(" ");
}

/** "gpt-5.4-mini" → "GPT 5.4 Mini"; falls back to the slug for odd ids. */
export function prettifyModelName(slug: string): string {
  if (!slug) return "Model";

  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

/**
 * Metadata for any model id: curated entry first, otherwise derived from the
 * id's provider prefix (`anthropic/claude-…`).
 */
export function modelInfoForId(rawId: string): AgentModelInfo {
  const id = rawId.trim();
  const curated = CURATED_BY_ID.get(id);
  if (curated) return curated;

  const clean = id.replace(/^~/, "");
  const [prefix, ...rest] = clean.split("/");
  const slug = rest.length > 0 ? rest.join("/") : prefix;
  const known = PROVIDERS[prefix.toLowerCase()];

  return {
    id,
    name: prettifyModelName(slug),
    provider: known?.provider ?? (rest.length > 0 ? prettifyProvider(prefix) : "Endpoint"),
    logo: known?.logo ?? "generic",
  };
}

/** `ai:openai/gpt-5.4` and `openai/gpt-5.4` name the same built-in model. */
/**
 * True for ids a chat completion can actually run.
 *
 * The gateway lists embeddings, image and audio models, moderation models and
 * `:batch` variants beside the chat models. Offering those in a picker is what
 * made a chosen "Edit with AI" model fail the run it was picked for.
 */
export function isChatModelId(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.includes(":batch") || lower.includes(":free")) return false;

  return !/(embed|rerank|moderation|whisper|tts|transcri|audio|speech|dall-e|gpt-image|image-gen|stable-diffusion|flux|recraft|\bocr\b|upscal)/.test(
    lower,
  );
}

export function modelIdFromKey(key: string): string {
  const trimmed = key.trim();
  return trimmed.startsWith("ai:") ? trimmed.slice(3) : trimmed;
}

/** The stored `provider` value for a built-in model. */
export function modelKeyForId(id: string): string {
  return `ai:${id.trim()}`;
}

/**
 * Metadata for a stored provider key: the catalog's discovered entry first (so
 * names, context and prices match the endpoint), then the curated/derived one.
 */
export function findCatalogModel(
  catalog: { builtin: readonly AgentModelInfo[]; custom: readonly AgentModelInfo[] },
  key: string,
): AgentModelInfo {
  const id = modelIdFromKey(key);
  return (
    catalog.builtin.find((model) => model.id === id) ??
    catalog.custom.find((model) => model.id === id) ??
    modelInfoForId(id)
  );
}

/** Provider groups in catalog order, used by both pickers. */
export function groupModels(models: AgentModelInfo[]): { provider: string; models: AgentModelInfo[] }[] {
  const groups = new Map<string, AgentModelInfo[]>();

  for (const model of models) {
    const list = groups.get(model.provider);
    if (list) list.push(model);
    else groups.set(model.provider, [model]);
  }

  return Array.from(groups, ([provider, list]) => ({ provider, models: list }));
}

export function matchesModelQuery(model: AgentModelInfo, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    model.name.toLowerCase().includes(needle) ||
    model.id.toLowerCase().includes(needle) ||
    (model.modelId?.toLowerCase().includes(needle) ?? false) ||
    model.provider.toLowerCase().includes(needle)
  );
}

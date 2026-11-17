import "server-only";

import { tool, type RunContext, type Tool } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";

import {
  AGENT_TOOL_LIMITS,
  createAgentToolRunState,
  type AgentToolRunState,
} from "@/lib/agent-runtime/tools/context";
import type { AgentToolSource } from "@/lib/agent-runtime/protocol";
import type { AgentModelConnection } from "@/lib/agent-runtime/models";

/**
 * `web_search` runs on the same AI connection as the selected chat model.
 *
 * Most chat models can't search by themselves, so the tool asks a search-capable
 * model on that connection for a grounded answer. The default is Perplexity
 * Sonar on the workspace AI gateway (`AI_BASE_URL` / `AI_API_KEY`), which needs
 * no separate OpenAI key. If the agent itself selected a Sonar model, that exact
 * model is used. Only a connection with no search route falls back to OpenAI's
 * hosted search, and then only with that connection's own key.
 */

const SEARCH_TIMEOUT_MS = 30_000;
const DEFAULT_SEARCH_MODEL = "perplexity/sonar";
const MAX_ANSWER_TOKENS = 700;

type Source = AgentToolSource;

const clients = new Map<string, OpenAI>();

function clientFor(apiKey: string, baseURL: string | null): OpenAI {
  const key = `${baseURL ?? "default"}:${apiKey}`;
  const cached = clients.get(key);
  if (cached) return cached;

  const client = new OpenAI({
    apiKey,
    baseURL: baseURL ?? undefined,
    timeout: SEARCH_TIMEOUT_MS,
    maxRetries: 0,
  });
  clients.set(key, client);
  return client;
}

function readEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isSearchModel(model: string | null | undefined): boolean {
  return typeof model === "string" && /perplexity|sonar/i.test(model);
}

function searchModelName(): string {
  return readEnv(process.env.AI_SEARCH_MODEL) ?? readEnv(process.env.OPENAI_SEARCH_MODEL) ?? DEFAULT_SEARCH_MODEL;
}

type SearchPlan =
  | { kind: "chat"; client: OpenAI; model: string }
  | { kind: "responses"; client: OpenAI; model: string | null }
  | { kind: "unavailable"; message: string };

function planSearch(connection: AgentModelConnection | null): SearchPlan {
  // The agent selected a search model: use that model and connection directly.
  if (connection && isSearchModel(connection.model)) {
    if (!connection.apiKey) {
      return {
        kind: "unavailable",
        message: "Web search is unavailable: the selected search model has no key.",
      };
    }
    return {
      kind: "chat",
      client: clientFor(connection.apiKey, connection.baseURL),
      model: connection.model!,
    };
  }

  // The workspace gateway hosts search models; it is the normal route.
  const gatewayKey = readEnv(process.env.AI_API_KEY);
  const gatewayBase = readEnv(process.env.AI_BASE_URL);
  if (gatewayKey && gatewayBase) {
    return {
      kind: "chat",
      client: clientFor(gatewayKey, gatewayBase),
      model: searchModelName(),
    };
  }

  // A user-connected OpenAI-compatible endpoint may also host the search model.
  if (connection?.apiKey && connection.baseURL && !/openai\.com/i.test(connection.baseURL)) {
    return {
      kind: "chat",
      client: clientFor(connection.apiKey, connection.baseURL),
      model: searchModelName(),
    };
  }

  // Direct OpenAI: hosted search runs on the same selected key, so no separate
  // OPENAI_API_KEY is introduced.
  if (connection?.apiKey && connection.useResponses) {
    return {
      kind: "responses",
      client: clientFor(connection.apiKey, connection.baseURL),
      model: connection.model,
    };
  }

  return {
    kind: "unavailable",
    message:
      "Web search is unavailable: this model connection has no search route. Set AI_SEARCH_MODEL to a search-capable model on the workspace AI connection.",
  };
}

function collectSources(input: unknown): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, title: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    sources.push({ title: typeof title === "string" && title.trim() ? title.trim() : url, url });
  };

  const visitAnnotation = (annotation: unknown) => {
    if (!annotation || typeof annotation !== "object") return;
    const entry = annotation as {
      type?: string;
      url?: string;
      title?: string;
      url_citation?: { url?: string; title?: string };
    };
    if (entry.type !== "url_citation") return;
    add(entry.url_citation?.url ?? entry.url, entry.url_citation?.title ?? entry.title);
  };

  const output = Array.isArray(input) ? input : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;

    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const annotations = (part as { annotations?: unknown }).annotations;
        if (Array.isArray(annotations)) annotations.forEach(visitAnnotation);
      }
    }

    const annotations = (item as { annotations?: unknown }).annotations;
    if (Array.isArray(annotations)) annotations.forEach(visitAnnotation);
  }

  return sources;
}

function collectChatSources(message: unknown): Source[] {
  if (!message || typeof message !== "object") return [];
  const annotations = (message as { annotations?: unknown }).annotations;
  return Array.isArray(annotations) ? collectSources([{ annotations }]) : [];
}

function friendlyError(error: unknown): string {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Web search is unavailable:")) return message;

  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return "Web search is unavailable: the AI connection rejected the key. Check AI_API_KEY on the server.";
  }
  if (status === 429 || /quota|billing|not active/i.test(message)) {
    return "Web search is unavailable: the AI connection has no active billing or has hit its quota.";
  }
  if (/model|not found|unsupported/i.test(message) && !/web_search|tool/i.test(message)) {
    return "Web search is unavailable: the configured search model isn't available on this connection. Set AI_SEARCH_MODEL to a search-capable model.";
  }
  if (/web_search|tool/i.test(message) && /not supported|unsupported|unknown/i.test(message)) {
    return "Web search is unavailable: this model doesn't support hosted search. Set AI_SEARCH_MODEL to a search-capable model.";
  }
  return "The web search request failed. Try again in a moment.";
}

function promptFor(query: string): string {
  return `Search the web and answer this in at most 150 words. Prefer primary sources and include the facts the user asked for: ${query}`;
}

export async function runWebSearch(
  query: string,
  connection: AgentModelConnection | null,
): Promise<{ answer: string; sources: Source[] }> {
  const plan = planSearch(connection);
  if (plan.kind === "unavailable") throw new Error(plan.message);

  if (plan.kind === "chat") {
    const completion = await plan.client.chat.completions.create({
      model: plan.model,
      messages: [{ role: "user", content: promptFor(query) }],
      max_tokens: MAX_ANSWER_TOKENS,
    });

    const message = completion.choices[0]?.message as
      | { content?: string | null; annotations?: unknown }
      | undefined;

    return {
      answer: message?.content?.trim() ?? "",
      sources: collectChatSources(message).slice(0, 6),
    };
  }

  const response = await plan.client.responses.create({
    model: plan.model ?? undefined,
    input: promptFor(query),
    tools: [{ type: "web_search" }],
    store: false,
    max_output_tokens: MAX_ANSWER_TOKENS,
  });

  return {
    answer: response.output_text?.trim() ?? "",
    sources: collectSources(response.output).slice(0, 6),
  };
}

export const webSearch: Tool<AgentToolRunState> = tool<
  ReturnType<typeof webSearchParameters>,
  AgentToolRunState
>({
  name: "web_search",
  description:
    "Search the live web through the workspace AI connection (the selected model when it is a search model, otherwise the configured search model) and get a grounded answer with sources. Use it for current events, recent releases and anything you can't answer confidently from what you know.",
  parameters: webSearchParameters(),
  execute: async ({ query }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context ?? createAgentToolRunState();

    if (state.searches >= AGENT_TOOL_LIMITS.searches) {
      return `Search limit reached for this reply (${AGENT_TOOL_LIMITS.searches}). Answer with what you have and say what is still unverified.`;
    }

    state.searches += 1;

    try {
      const { answer, sources } = await runWebSearch(query, state.model);

      for (const source of sources) {
        if (!state.sources.some((known) => known.url === source.url)) {
          state.sources.push(source);
        }
      }

      if (!answer && sources.length === 0) {
        return `No results for "${query}".`;
      }

      const sourceList = sources
        .map((source, index) => `${index + 1}. ${source.title} — ${source.url}`)
        .join("\n");

      return [
        answer || "Here are the sources I found.",
        sources.length > 0 ? `\nSources:\n${sourceList}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      console.error("[agents] web_search failed", error);
      return friendlyError(error);
    }
  },
});

function webSearchParameters() {
  return z.object({
    query: z.string().describe("What to search for, as a short natural-language query."),
  });
}

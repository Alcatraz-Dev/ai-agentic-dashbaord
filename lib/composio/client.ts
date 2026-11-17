import "server-only";

import {
  COMPOSIO_API_BASE,
  ComposioError,
  composioApiKey,
} from "@/lib/composio/config";


/**
 * Thin REST client for Composio v3.1.
 *
 * Everything the app needs is four calls: list a user's connected accounts,
 * find the managed auth config for a toolkit, create a Connect Link, and open
 * a tool-router session whose hosted MCP URL the agent can use. No SDK
 * dependency, so the bundle stays put and the failure modes are explicit.
 */

const REQUEST_TIMEOUT_MS = 15_000;

type CacheEntry<T> = { value: T; expires: number };

/**
 * Survives per-route module instances, like the live-browser registry: the
 * apps page and a chat turn may be compiled into different chunks.
 */
const globalCache = globalThis as typeof globalThis & {
  __alcatrazComposioCache?: Map<string, CacheEntry<unknown>>;
  __alcatrazComposioConnectSessions?: Map<string, { id: string; expires: number }>;
};

const cache: Map<string, CacheEntry<unknown>> =
  (globalCache.__alcatrazComposioCache ??= new Map());

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expires > Date.now()) return hit.value;

  const value = await load();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** Drops a cache entry after a write (connect, disconnect, new session). */
export function forgetComposioCache(key: string) {
  cache.delete(key);
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

async function composioRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiKey = composioApiKey();
  if (!apiKey) throw new ComposioError("Composio is not configured.", 0, "missing key");

  const url = new URL(`${COMPOSIO_API_BASE}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => url.searchParams.append(key, entry));
    else url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "x-api-key": apiKey,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network error";
    console.error(`[composio] ${options.method ?? "GET"} ${path} failed: ${detail}`);
    throw new ComposioError("Composio request failed.", 0, detail);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    // Status and the API's own message are useful in the server log; neither is
    // forwarded to the browser verbatim.
    console.error(
      `[composio] ${options.method ?? "GET"} ${path} → ${response.status}`,
      text.slice(0, 500),
    );
    throw new ComposioError(`Composio returned ${response.status}.`, response.status, text.slice(0, 500));
  }

  return parsed as T;
}

/* ------------------------------------------------------------------ */
/* Connected accounts                                                  */
/* ------------------------------------------------------------------ */

export type ComposioAccount = {
  id: string;
  toolkit: string;
  status: string;
  alias: string | null;
  createdAt: string | null;
  statusReason: string | null;
};

function readAccount(raw: unknown): ComposioAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as {
    id?: unknown;
    status?: unknown;
    alias?: unknown;
    created_at?: unknown;
    status_reason?: unknown;
    toolkit?: { slug?: unknown };
  };

  const id = typeof entry.id === "string" ? entry.id : null;
  const toolkit = typeof entry.toolkit?.slug === "string" ? entry.toolkit.slug : null;
  if (!id || !toolkit) return null;

  return {
    id,
    toolkit,
    status: typeof entry.status === "string" ? entry.status.toUpperCase() : "UNKNOWN",
    alias: typeof entry.alias === "string" && entry.alias ? entry.alias : null,
    createdAt: typeof entry.created_at === "string" ? entry.created_at : null,
    statusReason: typeof entry.status_reason === "string" ? entry.status_reason : null,
  };
}

/**
 * The user's connected accounts, newest first. `user_ids` is required: the
 * v3.1 list response no longer echoes the user id, so filtering has to happen
 * upstream.
 */
export async function listConnectedAccounts(
  userId: string,
  toolkitSlug?: string,
): Promise<ComposioAccount[]> {
  const data = await composioRequest<{ items?: unknown[] }>("/connected_accounts", {
    query: {
      user_ids: [userId],
      ...(toolkitSlug ? { toolkit_slugs: [toolkitSlug] } : {}),
      limit: "100",
      order_by: "updated_at",
      order_direction: "desc",
    },
  });

  return (data.items ?? [])
    .map(readAccount)
    .filter((account): account is ComposioAccount => account !== null);
}

/* ------------------------------------------------------------------ */
/* Connect links                                                       */
/* ------------------------------------------------------------------ */

export type ConnectLink = {
  redirectUrl: string;
  connectedAccountId: string;
};

/**
 * Sessions used only to mint Connect Links. They cover the whole catalog so a
 * link can be created for an app the user hasn't connected yet; they are never
 * attached to an agent.
 */
const connectSessions: Map<string, { id: string; expires: number }> =
  (globalCache.__alcatrazComposioConnectSessions ??= new Map());

async function connectSessionId(
  userId: string,
  toolkitSlug: string,
  callbackUrl: string,
): Promise<string> {
  // A session can mint links for any toolkit it enables. Keying by toolkit
  // keeps the session small now that the catalog is the full 1,700+ apps,
  // instead of trying to enable every toolkit up front.
  const key = `${userId}:${toolkitSlug}`;
  const hit = connectSessions.get(key);
  if (hit && hit.expires > Date.now()) return hit.id;

  const session = await createToolSession({
    userId,
    toolkits: [toolkitSlug],
    callbackUrl,
  });

  connectSessions.set(key, { id: session.sessionId, expires: Date.now() + 10 * 60 * 1000 });
  return session.sessionId;
}

/**
 * A hosted Connect Link for one toolkit.
 *
 * Composio creates the managed auth config on demand through the session, so
 * the app never has to pre-create one per toolkit. The user signs in on
 * Composio's page; nothing becomes usable until the account reports ACTIVE.
 */
export async function createConnectLink(input: {
  userId: string;
  toolkitSlug: string;
  callbackUrl: string;
}): Promise<ConnectLink> {
  const request = async (sessionId: string) =>
    composioRequest<{ redirect_url?: unknown; connected_account_id?: unknown }>(
      `/tool_router/session/${encodeURIComponent(sessionId)}/link`,
      {
        method: "POST",
        body: { toolkit: input.toolkitSlug, callback_url: input.callbackUrl },
      },
    );

  let data: { redirect_url?: unknown; connected_account_id?: unknown };

  try {
    data = await request(
      await connectSessionId(input.userId, input.toolkitSlug, input.callbackUrl),
    );
  } catch (error) {
    // An expired session reports 404 (and a session for a different key, 403):
    // drop the cache and retry once with a fresh session.
    const status = error instanceof ComposioError ? error.status : 0;
    if (status !== 404 && status !== 403) throw error;
    connectSessions.delete(`${input.userId}:${input.toolkitSlug}`);
    data = await request(
      await connectSessionId(input.userId, input.toolkitSlug, input.callbackUrl),
    );
  }

  if (typeof data.redirect_url !== "string" || typeof data.connected_account_id !== "string") {
    throw new ComposioError("Composio returned an unusable connect link.", 0, "missing redirect_url");
  }

  return {
    redirectUrl: data.redirect_url,
    connectedAccountId: data.connected_account_id,
  };
}

export async function deleteConnectedAccount(connectedAccountId: string): Promise<void> {
  await composioRequest<void>(`/connected_accounts/${encodeURIComponent(connectedAccountId)}`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------------ */
/* Tool-router sessions (hosted MCP)                                   */
/* ------------------------------------------------------------------ */

export type ComposioSession = {
  sessionId: string;
  mcpUrl: string;
};

/**
 * Opens a session scoped to the user and to the toolkits they connected, and
 * returns its hosted MCP endpoint. The endpoint is authenticated with the same
 * project key; we pass the header ourselves so it never depends on SDK
 * behaviour.
 */
export async function createToolSession(input: {
  userId: string;
  toolkits: string[];
  callbackUrl: string;
  /**
   * Leave the connection meta tool out: this app shows its own connect card,
   * so the model should ask through `connect_service` instead of pasting a
   * link into the chat.
   */
  manageConnections?: boolean;
}): Promise<ComposioSession> {
  const data = await composioRequest<{
    session_id?: unknown;
    mcp?: { url?: unknown };
  }>("/tool_router/session", {
    method: "POST",
    body: {
      user_id: input.userId,
      toolkits: { enable: input.toolkits },
      manage_connections: {
        enable: input.manageConnections ?? false,
        callback_url: input.callbackUrl,
      },
    },
  });

  const mcpUrl = typeof data.mcp?.url === "string" ? data.mcp.url : null;
  if (typeof data.session_id !== "string" || !mcpUrl) {
    throw new ComposioError("Composio didn't return an MCP endpoint.", 0, "missing mcp.url");
  }

  return { sessionId: data.session_id, mcpUrl };
}

/* ------------------------------------------------------------------ */
/* Toolkit metadata                                                    */
/* ------------------------------------------------------------------ */

export type ComposioToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  toolsCount: number;
};

function readToolkit(raw: unknown): ComposioToolkit | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as {
    slug?: unknown;
    name?: unknown;
    app?: unknown;
    meta?: {
      description?: unknown;
      logo?: unknown;
      tools_count?: unknown;
      categories?: unknown;
    };
  };
  if (typeof entry.slug !== "string" || !entry.slug) return null;

  const name =
    typeof entry.name === "string" && entry.name
      ? entry.name
      : typeof entry.app === "string" && entry.app
        ? entry.app
        : entry.slug;
  const description =
    typeof entry.meta?.description === "string" ? entry.meta.description.trim() : "";
  const logo = typeof entry.meta?.logo === "string" ? entry.meta.logo.trim() : "";

  const categories = Array.isArray(entry.meta?.categories)
    ? entry.meta.categories
        .map((category) => {
          if (typeof category === "string") return category;
          if (category && typeof category === "object") {
            const value = (category as { name?: unknown }).name;
            return typeof value === "string" ? value : null;
          }
          return null;
        })
        .filter((value): value is string => Boolean(value))
    : [];

  const count = entry.meta?.tools_count;

  return {
    slug: entry.slug.toLowerCase(),
    name,
    description,
    logo,
    categories,
    toolsCount: typeof count === "number" && Number.isFinite(count) ? count : 0,
  };
}

/**
 * The full Composio toolkit catalog, paginated. v3.1 caps a page at 1,000 and
 * returns a cursor for the rest, so two calls cover today's 1,700+ apps.
 */
export async function listToolkits(): Promise<ComposioToolkit[]> {
  return cached("toolkits", 10 * 60 * 1000, async () => {
    const items: ComposioToolkit[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 6; page += 1) {
      const data: { items?: unknown[]; next_cursor?: unknown } = await composioRequest(
        "/toolkits",
        {
          query: { limit: "1000", ...(cursor ? { cursor } : {}) },
        },
      );

      for (const raw of data.items ?? []) {
        const toolkit = readToolkit(raw);
        if (toolkit) items.push(toolkit);
      }

      const next: string | null =
        typeof data.next_cursor === "string" ? data.next_cursor : null;
      if (!next || next === cursor) break;
      cursor = next;
    }

    return items;
  });
}

/** Tool counts per toolkit, for the Apps page. Cosmetic, so failures are soft. */
export async function listToolkitToolCounts(): Promise<Record<string, number>> {
  try {
    const toolkits = await listToolkits();
    return Object.fromEntries(toolkits.map((toolkit) => [toolkit.slug, toolkit.toolsCount]));
  } catch (error) {
    console.error("[composio] tool counts unavailable", error);
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* Actions (tools) for the agent                                       */
/* ------------------------------------------------------------------ */

export type ComposioAction = {
  /** Action slug, e.g. GMAIL_FETCH_EMAILS. */
  slug: string;
  name: string;
  description: string;
  /** JSON schema for the action's arguments, when Composio reports one. */
  parameters: Record<string, unknown> | null;
  /** True only when the action cannot change data in the app. */
  readOnly: boolean;
};

const READ_VERBS = new Set([
  "get",
  "list",
  "search",
  "fetch",
  "read",
  "retrieve",
  "find",
  "check",
  "describe",
  "lookup",
  "query",
  "preview",
  "download",
  "export",
  "count",
  "resolve",
  "load",
]);

/** The first verb wins, so any later word is an object, never an instruction. */
const WRITE_VERBS = new Set([
  "send",
  "post",
  "publish",
  "create",
  "add",
  "update",
  "edit",
  "set",
  "delete",
  "remove",
  "archive",
  "move",
  "upload",
  "invite",
  "schedule",
  "cancel",
  "revoke",
  "share",
  "follow",
  "unfollow",
  "like",
  "comment",
  "reply",
  "submit",
  "vote",
  "dm",
  "message",
]);

/**
 * `*_DETAILS` reads one record (post details, page details) and is safe only
 * when the slug does not start with a write verb; `DELETE_POST_DETAILS` is a
 * write that happens to end in a read-sounding word.
 */
function isDetailsSlug(slug: string): boolean {
  return /_DETAILS$/i.test(slug);
}

function classifyReadOnly(slug: string, raw: Record<string, unknown>): boolean {
  const annotations = raw.annotations;
  if (annotations && typeof annotations === "object") {
    const hint = (annotations as { readOnlyHint?: unknown }).readOnlyHint;
    if (typeof hint === "boolean") return hint;
  }

  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter((tag): tag is string => typeof tag === "string");
    if (tags.some((tag) => /read.?only/i.test(tag))) return true;
  }

  // Composio slug prefixes are the reliable fallback (GMAIL_SEND_EMAIL vs
  // GMAIL_FETCH_EMAILS). Only the FIRST verb counts: in `LINKEDIN_GET_POST`
  // and `REDDIT_LIST_POSTS` the word "post" is a noun (the thing being read),
  // so a read verb in front keeps the action read-only. A leading write verb
  // always needs approval, even when the slug ends in `_DETAILS`. Anything
  // unrecognised needs approval too: a wrong "safe" is a data change run
  // without consent.
  const verb = slug.toLowerCase().split("_").find(Boolean);
  if (verb && READ_VERBS.has(verb)) return true;
  if (verb && WRITE_VERBS.has(verb)) return false;
  return isDetailsSlug(slug);
}

function readAction(raw: unknown): ComposioAction | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const slug = typeof entry.slug === "string" ? entry.slug : null;
  if (!slug) return null;

  const name = typeof entry.name === "string" && entry.name ? entry.name : slug;
  const description = typeof entry.description === "string" ? entry.description : "";
  const parameters =
    entry.input_parameters && typeof entry.input_parameters === "object"
      ? (entry.input_parameters as Record<string, unknown>)
      : null;

  return {
    slug,
    name,
    description,
    parameters,
    readOnly: classifyReadOnly(slug, entry),
  };
}

/**
 * The actions one toolkit offers, optionally filtered by a search string.
 * Cached briefly: the catalog is stable and the agent often asks twice in a
 * turn. Failures surface as empty lists, never as a broken chat.
 */
export async function listToolkitActions(
  toolkitSlug: string,
  search?: string,
): Promise<ComposioAction[]> {
  const key = `actions:${toolkitSlug}:${search?.trim().toLowerCase() ?? ""}`;

  return cached(key, 5 * 60 * 1000, async () => {
    try {
      const data = await composioRequest<{ items?: unknown[] }>("/tools", {
        query: {
          toolkit_slug: toolkitSlug,
          ...(search?.trim() ? { search: search.trim() } : {}),
          limit: "100",
          toolkit_versions: "latest",
        },
      });

      return (data.items ?? [])
        .map(readAction)
        .filter((action): action is ComposioAction => action !== null);
    } catch (error) {
      console.error(`[composio] could not list actions for ${toolkitSlug}`, error);
      return [];
    }
  });
}

export type ComposioActionResult = {
  data: unknown;
  /** Composio's own error string, already safe to log but not to display. */
  error: string | null;
};

/**
 * Runs one action as the owner. This is the only place a third-party app is
 * written to, and it is only reached from a read-only tool call or from the
 * approval endpoint after a user clicked Approve.
 */
export async function executeToolkitAction(input: {
  action: string;
  userId: string;
  args: Record<string, unknown>;
}): Promise<ComposioActionResult> {
  const response = await composioRequest<{
    data?: unknown;
    error?: unknown;
    successful?: unknown;
  }>(`/tools/execute/${encodeURIComponent(input.action)}`, {
    method: "POST",
    body: {
      user_id: input.userId,
      arguments: input.args,
    },
  });

  const error =
    typeof response?.error === "string" && response.error
      ? response.error
      : response?.successful === false
        ? "Composio reported the action failed."
        : null;

  if (error) {
    console.error(`[composio] action ${input.action} failed: ${error.slice(0, 300)}`);
  }

  return { data: response?.data ?? null, error };
}

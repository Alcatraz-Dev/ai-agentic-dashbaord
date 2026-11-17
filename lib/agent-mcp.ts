import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { MCPServerStreamableHttp } from "@openai/agents";
import { and, asc, eq } from "drizzle-orm";

import { agentMcpServers, db } from "@/db";
import type { AgentMcpServerSummary } from "@/lib/agent-mcp-types";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

/**
 * MCP servers a user connected themselves (streamable HTTP). They belong to the
 * user, so every agent of theirs can call their tools; an agent narrows that
 * down with `agents.mcp_tools`.
 *
 * Two ways to authenticate:
 *  - a static bearer token, entered in the dialog,
 *  - OAuth 2.1 with dynamic client registration and PKCE. The grant, including
 *    refresh tokens, is encrypted at rest and renewed in the runtime when it
 *    ages out.
 */

export const MCP_LABEL_MAX_LENGTH = 40;
export const MCP_TOOL_LIMIT = 60;
/** How long we wait for a server to answer before calling it unreachable. */
const PROBE_TIMEOUT_MS = 12_000;
const HTTP_TIMEOUT_MS = 10_000;
/** Refresh an OAuth token this long before it actually expires. */
const TOKEN_SKEW_MS = 60_000;

export type McpOAuthGrant = {
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms; absent when the server issues tokens without an expiry. */
  expiresAt?: number;
  tokenEndpoint: string;
  authorizationServer?: string;
  scope?: string;
};

export type AgentMcpServerConfig = {
  id: number;
  label: string;
  url: string;
  /** Bearer token for this run (static key or a fresh OAuth access token). */
  token: string | null;
  /** Tool names discovered when the server was connected. */
  tools: string[];
};

type PendingOAuth = {
  label: string;
  url: string;
  redirectUri: string;
  clientId: string;
  tokenEndpoint: string;
  authorizationServer: string;
  scope?: string;
  verifier: string;
  state: string;
};

const summaryColumns = {
  id: agentMcpServers.id,
  label: agentMcpServers.label,
  url: agentMcpServers.url,
  tools: agentMcpServers.tools,
  apiKey: agentMcpServers.apiKey,
  oauth: agentMcpServers.oauth,
};

function summarize(row: {
  id: number;
  label: string;
  url: string;
  tools: string[];
  apiKey: string | null;
  oauth: string | null;
}): AgentMcpServerSummary {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    tools: Array.isArray(row.tools) ? row.tools : [],
    hasKey: Boolean(row.apiKey),
    auth: row.oauth ? "oauth" : row.apiKey ? "token" : "none",
  };
}

/**
 * Only public HTTPS endpoints, plus plain HTTP on localhost so a server running
 * on the developer's machine can be connected during development.
 */
export function normalizeMcpUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) return null;
  if (url.username || url.password) return null;

  return url.toString().replace(/\/$/, "");
}

/**
 * Connects once to prove the server is reachable and returns its tool names.
 * Throws when the handshake fails, so a typo never lands in Postgres.
 */
export async function discoverMcpTools(url: string, token: string | null): Promise<string[]> {
  const server = new MCPServerStreamableHttp({
    url,
    name: "probe",
    cacheToolsList: false,
    timeout: PROBE_TIMEOUT_MS,
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

  const probe = (async () => {
    await server.connect();
    const tools = await server.listTools();
    return tools.map((tool) => tool.name).slice(0, MCP_TOOL_LIMIT);
  })();

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("MCP server did not answer in time.")),
      PROBE_TIMEOUT_MS,
    );
    timer.unref?.();
  });

  try {
    return await Promise.race([probe, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    await server.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ OAuth */

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown> | null> {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type AuthorizationServer = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scope?: string;
};

/**
 * RFC 9728 protected-resource metadata, then RFC 8414 authorization-server
 * metadata. Falls back to the resource origin when the server publishes none.
 */
async function discoverAuthorizationServer(resourceUrl: string): Promise<AuthorizationServer> {
  const resource = new URL(resourceUrl);
  const path = resource.pathname === "/" ? "" : resource.pathname;
  const metadataCandidates = [
    `${resource.origin}/.well-known/oauth-protected-resource${path}`,
    `${resource.origin}/.well-known/oauth-protected-resource`,
  ];

  let issuer: string | null = null;
  let resourceScope: string | undefined;

  for (const candidate of metadataCandidates) {
    const metadata = await fetchJson(candidate);
    const servers = metadata?.authorization_servers;
    if (Array.isArray(servers) && typeof servers[0] === "string") {
      issuer = servers[0];
      if (Array.isArray(metadata?.scopes_supported)) {
        const scopes = metadata.scopes_supported.filter((scope) => typeof scope === "string");
        if (scopes.length > 0) resourceScope = scopes.join(" ");
      }
      break;
    }
  }

  const base = (issuer ?? resource.origin).replace(/\/$/, "");
  const serverCandidates = [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];

  for (const candidate of serverCandidates) {
    const metadata = await fetchJson(candidate);
    if (typeof metadata?.authorization_endpoint === "string" && typeof metadata?.token_endpoint === "string") {
      const scopes = Array.isArray(metadata.scopes_supported)
        ? metadata.scopes_supported.filter((scope) => typeof scope === "string")
        : [];

      return {
        issuer: base,
        authorizationEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        registrationEndpoint:
          typeof metadata.registration_endpoint === "string"
            ? metadata.registration_endpoint
            : undefined,
        scope: resourceScope ?? (scopes.length > 0 ? scopes.join(" ") : undefined),
      };
    }
  }

  throw new Error("That server does not publish OAuth metadata.");
}

export type McpOAuthStart = {
  authorizationUrl: string;
  /** Encrypted pending-flow payload to park in an http-only cookie. */
  pendingCookie: string;
};

/** Starts the browser OAuth flow: register a client, build the authorize URL. */
export async function beginMcpOAuth(input: {
  label: string;
  url: string;
  redirectUri: string;
}): Promise<McpOAuthStart> {
  const server = await discoverAuthorizationServer(input.url);
  if (!server.registrationEndpoint) {
    throw new Error("That server does not support automatic client registration.");
  }

  const registration = await postJson(server.registrationEndpoint, {
    client_name: "Alcatraz agents",
    redirect_uris: [input.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: server.scope,
  });

  const clientId = typeof registration?.client_id === "string" ? registration.client_id : "";
  if (!clientId) throw new Error("The server did not return a client id.");

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const authorize = new URL(server.authorizationEndpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", input.redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  // RFC 8707: some servers only mint tokens for the resource they protect.
  authorize.searchParams.set("resource", input.url);
  if (server.scope) authorize.searchParams.set("scope", server.scope);

  const pending: PendingOAuth = {
    label: input.label,
    url: input.url,
    redirectUri: input.redirectUri,
    clientId,
    tokenEndpoint: server.tokenEndpoint,
    authorizationServer: server.issuer,
    scope: server.scope,
    verifier,
    state,
  };

  return {
    authorizationUrl: authorize.toString(),
    pendingCookie: encryptSecret(JSON.stringify(pending)),
  };
}

async function exchangeCode(
  pending: PendingOAuth,
  code: string,
): Promise<McpOAuthGrant> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
    resource: pending.url,
  });

  const response = await fetch(pending.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Token endpoint returned ${response.status}.`);

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("The token endpoint returned no access token.");

  const expiresIn = Number(payload.expires_in);

  return {
    clientId: pending.clientId,
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    tokenEndpoint: pending.tokenEndpoint,
    authorizationServer: pending.authorizationServer,
    scope: typeof payload.scope === "string" ? payload.scope : pending.scope,
  };
}

/** Finishes the flow: exchange the code, check the server, save it. */
export async function finishMcpOAuth(input: {
  pendingCookie: string;
  state: string;
  code: string;
  profileId: number;
}): Promise<AgentMcpServerSummary> {
  let pending: PendingOAuth;
  try {
    pending = JSON.parse(decryptSecret(input.pendingCookie)) as PendingOAuth;
  } catch {
    throw new Error("That sign-in link expired. Start the connection again.");
  }

  if (pending.state !== input.state) throw new Error("That sign-in link does not match.");

  const grant = await exchangeCode(pending, input.code);
  const tools = await discoverMcpTools(pending.url, grant.accessToken);

  return createAgentMcpServerForUser(input.profileId, {
    label: pending.label,
    url: pending.url,
    apiKey: null,
    tools,
    oauth: grant,
  });
}

/** Renews an aged-out access token. Returns null when it cannot be renewed. */
async function refreshGrant(grant: McpOAuthGrant): Promise<McpOAuthGrant | null> {
  if (!grant.refreshToken) return null;

  try {
    const response = await fetch(grant.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: grant.refreshToken,
        client_id: grant.clientId,
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
    if (!accessToken) return null;

    const expiresIn = Number(payload.expires_in);

    return {
      ...grant,
      accessToken,
      refreshToken:
        typeof payload.refresh_token === "string" ? payload.refresh_token : grant.refreshToken,
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : grant.expiresAt,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- CRUD */

export async function listAgentMcpServers(profileId: number): Promise<AgentMcpServerSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(agentMcpServers)
    .where(eq(agentMcpServers.ownerId, profileId))
    .orderBy(asc(agentMcpServers.createdAt), asc(agentMcpServers.id));

  return rows.map(summarize);
}

export async function createAgentMcpServerForUser(
  profileId: number,
  input: {
    label: string;
    url: string;
    apiKey: string | null;
    tools: string[];
    oauth?: McpOAuthGrant | null;
  },
): Promise<AgentMcpServerSummary> {
  const [row] = await db
    .insert(agentMcpServers)
    .values({
      ownerId: profileId,
      label: input.label,
      url: input.url,
      apiKey: input.apiKey ? encryptSecret(input.apiKey) : null,
      oauth: input.oauth ? encryptSecret(JSON.stringify(input.oauth)) : null,
      tools: input.tools,
    })
    .returning(summaryColumns);

  if (!row) throw new Error("The MCP server insert returned no row.");
  return summarize(row);
}

export async function deleteAgentMcpServerForUser(
  profileId: number,
  serverId: number,
): Promise<boolean> {
  if (!Number.isInteger(serverId) || serverId <= 0) return false;

  const [deleted] = await db
    .delete(agentMcpServers)
    .where(and(eq(agentMcpServers.id, serverId), eq(agentMcpServers.ownerId, profileId)))
    .returning({ id: agentMcpServers.id });

  return Boolean(deleted);
}

/**
 * Re-lists a server's tools (they change when the remote server ships a new
 * version) and stores the new names. Returns null when the server is not the
 * caller's or cannot be reached.
 */
export async function refreshAgentMcpServerForUser(
  profileId: number,
  serverId: number,
): Promise<AgentMcpServerSummary | null> {
  if (!Number.isInteger(serverId) || serverId <= 0) return null;

  const [row] = await db
    .select(summaryColumns)
    .from(agentMcpServers)
    .where(and(eq(agentMcpServers.id, serverId), eq(agentMcpServers.ownerId, profileId)))
    .limit(1);

  if (!row) return null;

  const token = await tokenForStoredServer(row.id, row.apiKey, row.oauth);
  if (token === undefined) return null;

  const tools = await discoverMcpTools(row.url, token);

  const [updated] = await db
    .update(agentMcpServers)
    .set({ tools, updatedAt: new Date() })
    .where(eq(agentMcpServers.id, row.id))
    .returning(summaryColumns);

  return updated ? summarize(updated) : null;
}

/**
 * Opens whichever credential a stored server has, renewing an OAuth grant when
 * it is about to expire. `undefined` means "do not use this server".
 */
async function tokenForStoredServer(
  serverId: number,
  apiKey: string | null,
  oauth: string | null,
): Promise<string | null | undefined> {
  if (oauth) {
    try {
      let grant = JSON.parse(decryptSecret(oauth)) as McpOAuthGrant;

      if (grant.expiresAt && grant.expiresAt - TOKEN_SKEW_MS < Date.now()) {
        const renewed = await refreshGrant(grant);
        if (renewed) {
          grant = renewed;
          await db
            .update(agentMcpServers)
            .set({ oauth: encryptSecret(JSON.stringify(renewed)), updatedAt: new Date() })
            .where(eq(agentMcpServers.id, serverId));
        }
      }

      return grant.accessToken;
    } catch (error) {
      console.error(`[agents] MCP OAuth grant on server ${serverId} is unreadable`, error);
      return undefined;
    }
  }

  if (apiKey) {
    try {
      return decryptSecret(apiKey);
    } catch (error) {
      console.error(`[agents] MCP key on server ${serverId} is unreadable`, error);
      return undefined;
    }
  }

  return null;
}

/**
 * Servers for a run, with a usable token. A grant that cannot be opened or
 * renewed is dropped rather than failing the whole chat turn.
 */
export async function getAgentMcpServerConfigs(profileId: number): Promise<AgentMcpServerConfig[]> {
  const rows = await db
    .select({
      id: agentMcpServers.id,
      label: agentMcpServers.label,
      url: agentMcpServers.url,
      apiKey: agentMcpServers.apiKey,
      oauth: agentMcpServers.oauth,
      tools: agentMcpServers.tools,
    })
    .from(agentMcpServers)
    .where(eq(agentMcpServers.ownerId, profileId))
    .orderBy(asc(agentMcpServers.createdAt), asc(agentMcpServers.id));

  const configs: AgentMcpServerConfig[] = [];

  for (const row of rows) {
    const token = await tokenForStoredServer(row.id, row.apiKey, row.oauth);
    if (token === undefined) continue;

    configs.push({
      id: row.id,
      label: row.label,
      url: row.url,
      token,
      tools: Array.isArray(row.tools) ? row.tools : [],
    });
  }

  return configs;
}

/**
 * Client-safe shapes for connected MCP servers. Tokens never appear here.
 */

export type AgentMcpServerSummary = {
  id: number;
  label: string;
  url: string;
  /** Tool names discovered when the server was connected. */
  tools: string[];
  /** True when a bearer token is stored for this server. */
  hasKey: boolean;
  /** "token" | "oauth" | "none" — how the connection authenticates. */
  auth: "token" | "oauth" | "none";
};

/** Agent-level MCP permission keys are `${serverId}:${toolName}`. */
export function mcpToolKey(serverId: number, toolName: string): string {
  return `${serverId}:${toolName}`;
}

export function mcpServerIdFromKey(key: string): number | null {
  const id = Number(key.slice(0, key.indexOf(":")));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function mcpToolNameFromKey(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

/** True when `key` belongs to a server that is still connected. */
export function isKnownMcpToolKey(key: string, servers: AgentMcpServerSummary[]): boolean {
  const serverId = mcpServerIdFromKey(key);
  if (serverId === null) return false;
  const server = servers.find((entry) => entry.id === serverId);
  return Boolean(server?.tools.includes(mcpToolNameFromKey(key)));
}

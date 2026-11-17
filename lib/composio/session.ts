import "server-only";

import { createToolSession } from "@/lib/composio/client";
import { composioCallbackUrl, composioUserId, isComposioConfigured } from "@/lib/composio/config";
import { getConnectedToolkits } from "@/lib/composio/connections";
import { getIntegration } from "@/lib/integrations/catalog";

/**
 * The hosted MCP endpoint for one owner's connected apps.
 *
 * A session is scoped to the user and to the toolkits they have actually
 * connected, so the agent can never reach an app the user hasn't authorised.
 * One session per agent run: it is opened when the run starts and never reused
 * by a later run, so a connection revoked between turns cannot be reached
 * through an old upstream session.
 */

export type ComposioMcpServer = {
  url: string;
  /** Labels for the prompt, e.g. ["Gmail", "Slack"]. */
  toolkits: string[];
  /** Catalog slugs, e.g. ["gmail", "slack"], for filtering read-only tools. */
  slugs: string[];
  sessionId: string;
};

/**
 * Null is a normal answer: no key, no connected apps, or Composio is down. The
 * chat must keep working in all three cases, so failures are logged and treated
 * as "no external tools" rather than thrown.
 */
/**
 * `onlyToolkits` narrows the session to the apps a board card picked: the
 * session still cannot reach anything the owner has not connected, and an
 * empty pick means no apps at all.
 */
export async function getComposioMcpServer(
  ownerId: number,
  onlyToolkits?: string[] | null,
): Promise<ComposioMcpServer | null> {
  if (!isComposioConfigured()) return null;

  try {
    const connected = await getConnectedToolkits(ownerId);
    const toolkits =
      onlyToolkits === undefined || onlyToolkits === null
        ? connected
        : connected.filter((slug) => onlyToolkits.includes(slug));

    if (toolkits.length === 0) return null;

    const session = await createToolSession({
      userId: composioUserId(ownerId),
      toolkits,
      callbackUrl: composioCallbackUrl(),
    });

    return {
      url: session.mcpUrl,
      toolkits: toolkits.map(labelFor),
      slugs: toolkits,
      sessionId: session.sessionId,
    };
  } catch (error) {
    console.error("[composio] could not open a tool session", error);
    return null;
  }
}

/** Retained for the disconnect route; sessions are no longer cached. */
export function forgetComposioSession(_ownerId: number) {
  // Nothing to drop: every run opens its own session.
}

function labelFor(slug: string): string {
  return getIntegration(slug)?.name ?? slug;
}

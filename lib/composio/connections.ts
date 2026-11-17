import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { appConnections, db } from "@/db";
import {
  COMPOSIO_NOT_CONFIGURED,
  ComposioError,
  composioCallbackUrl,
  composioUserId,
  isComposioConfigured,
} from "@/lib/composio/config";
import {
  createConnectLink,
  deleteConnectedAccount,
  listConnectedAccounts,
  type ComposioAccount,
} from "@/lib/composio/client";
import { getToolkitCatalog } from "@/lib/composio/toolkits";
import { fallbackIntegration, getIntegration } from "@/lib/integrations/catalog";
import type {
  IntegrationApp,
  IntegrationConnectionState,
  IntegrationsOverview,
} from "@/lib/integrations/types";

/**
 * The app's own view of what a user has connected.
 *
 * Composio holds the credentials and refreshes them; this module mirrors just
 * enough state for a fast page render and for deciding which toolkits an agent
 * session should enable. Every read that matters can be reconciled with
 * `syncConnections`, which is one Composio call for the whole workspace.
 */

export type StoredConnection = {
  toolkit: string;
  connectedAccountId: string | null;
  status: IntegrationConnectionState;
  accountLabel: string | null;
  connectedAt: string | null;
};

/** Composio's connection states → the four the UI understands. */
export function mapAccountStatus(account: ComposioAccount | undefined | null): IntegrationConnectionState {
  if (!account) return "disconnected";
  switch (account.status) {
    case "ACTIVE":
      return "active";
    case "INITIALIZING":
    case "INITIATED":
      return "pending";
    case "FAILED":
    case "EXPIRED":
    case "REVOKED":
    case "INACTIVE":
      return "error";
    default:
      return "pending";
  }
}

/** The most useful account per toolkit: an active one wins over a pending one. */
function bestAccounts(accounts: ComposioAccount[]): Map<string, ComposioAccount> {
  const best = new Map<string, ComposioAccount>();
  const rank: Record<IntegrationConnectionState, number> = {
    active: 3,
    pending: 2,
    error: 1,
    disconnected: 0,
  };

  for (const account of accounts) {
    const current = best.get(account.toolkit);
    if (!current || rank[mapAccountStatus(account)] > rank[mapAccountStatus(current)]) {
      best.set(account.toolkit, account);
    }
  }

  return best;
}

function toState(status: string | null | undefined): IntegrationConnectionState {
  return status === "active" || status === "pending" || status === "error" ? status : "disconnected";
}

export async function listStoredConnections(ownerId: number): Promise<Map<string, StoredConnection>> {
  const rows = await db
    .select({
      toolkit: appConnections.toolkit,
      connectedAccountId: appConnections.connectedAccountId,
      status: appConnections.status,
      accountLabel: appConnections.accountLabel,
      connectedAt: appConnections.connectedAt,
    })
    .from(appConnections)
    .where(eq(appConnections.ownerId, ownerId));

  return new Map(
    rows.map((row) => [
      row.toolkit,
      {
        toolkit: row.toolkit,
        connectedAccountId: row.connectedAccountId,
        status: toState(row.status),
        accountLabel: row.accountLabel,
        connectedAt: row.connectedAt ? row.connectedAt.toISOString() : null,
      },
    ]),
  );
}

async function upsertConnection(
  ownerId: number,
  account: { toolkit: string; connectedAccountId: string | null; status: IntegrationConnectionState; accountLabel: string | null; connectedAt: Date | null },
) {
  await db
    .insert(appConnections)
    .values({
      ownerId,
      toolkit: account.toolkit,
      connectedAccountId: account.connectedAccountId,
      status: account.status,
      accountLabel: account.accountLabel,
      connectedAt: account.connectedAt,
      lastCheckedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [appConnections.ownerId, appConnections.toolkit],
      set: {
        connectedAccountId: account.connectedAccountId,
        status: account.status,
        accountLabel: account.accountLabel,
        connectedAt: account.connectedAt,
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}

/**
 * Reconciles the mirror with Composio: one list call, then upserts. A toolkit
 * that no longer has any account is marked disconnected instead of deleted, so
 * the row keeps its history. Failures are logged and swallowed — a Composio
 * outage must not break the dashboard.
 */
export async function syncConnections(ownerId: number): Promise<boolean> {
  if (!isComposioConfigured()) return false;

  let accounts: ComposioAccount[];
  try {
    accounts = await listConnectedAccounts(composioUserId(ownerId));
  } catch (error) {
    console.error("[composio] could not sync connections", error);
    return false;
  }

  const best = bestAccounts(accounts);

  for (const account of best.values()) {
    await upsertConnection(ownerId, {
      toolkit: account.toolkit,
      connectedAccountId: account.id,
      status: mapAccountStatus(account),
      accountLabel: account.alias,
      connectedAt: account.createdAt ? new Date(account.createdAt) : null,
    }).catch((error) => console.error("[composio] could not store a connection", error));
  }

  const seen = new Set(best.keys());
  const gone = [...(await listStoredConnections(ownerId)).keys()].filter((slug) => !seen.has(slug));

  if (gone.length > 0) {
    await db
      .update(appConnections)
      .set({ status: "disconnected", lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(appConnections.ownerId, ownerId), inArray(appConnections.toolkit, gone)))
      .catch((error) => console.error("[composio] could not mark connections gone", error));
  }

  return true;
}

/** Toolkits an agent session may use: stored and active. Any Composio slug. */
export async function getConnectedToolkits(ownerId: number): Promise<string[]> {
  if (!isComposioConfigured()) return [];

  const rows = await db
    .select({ toolkit: appConnections.toolkit })
    .from(appConnections)
    .where(and(eq(appConnections.ownerId, ownerId), eq(appConnections.status, "active")));

  return [...new Set(rows.map((row) => row.toolkit))].sort();
}

/**
 * The active account behind each connected toolkit, for surfaces that want to
 * say *which* account a row is using. Reads the local mirror only — the Apps
 * page owns the Composio sync — so the dashboard stays a cheap render.
 */
export async function getAppAccountLabels(
  ownerId: number,
): Promise<Record<string, { accountLabel: string | null; lastCheckedAt: string | null }>> {
  if (!isComposioConfigured()) return {};

  const rows = await db
    .select({
      toolkit: appConnections.toolkit,
      accountLabel: appConnections.accountLabel,
      lastCheckedAt: appConnections.lastCheckedAt,
    })
    .from(appConnections)
    .where(and(eq(appConnections.ownerId, ownerId), eq(appConnections.status, "active")));

  const accounts: Record<string, { accountLabel: string | null; lastCheckedAt: string | null }> = {};

  for (const row of rows) {
    accounts[row.toolkit] = {
      accountLabel: row.accountLabel,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    };
  }

  return accounts;
}

/** Everything the Apps page needs, in one round trip. */
export async function getIntegrationsOverview(ownerId: number): Promise<IntegrationsOverview> {
  const configured = isComposioConfigured();

  if (configured) await syncConnections(ownerId);

  const [stored, catalog] = await Promise.all([
    listStoredConnections(ownerId),
    getToolkitCatalog(),
  ]);

  const apps: IntegrationApp[] = catalog.apps.map((definition) => {
    const connection = stored.get(definition.slug);
    return {
      ...definition,
      status: connection?.status ?? "disconnected",
      accountLabel: connection?.accountLabel ?? null,
      connectedAt: connection?.connectedAt ?? null,
      toolCount: catalog.toolCounts[definition.slug] ?? null,
    };
  });

  // A connection whose toolkit has since left Composio should still appear, so
  // the owner can see and revoke it instead of it silently vanishing.
  const listed = new Set(apps.map((app) => app.slug));
  for (const connection of stored.values()) {
    if (listed.has(connection.toolkit)) continue;
    const definition = fallbackIntegration(connection.toolkit);
    if (!definition) continue;
    apps.push({
      ...definition,
      status: connection.status,
      accountLabel: connection.accountLabel,
      connectedAt: connection.connectedAt,
      toolCount: null,
    });
  }

  return {
    configured,
    apps,
    connectedCount: apps.filter((app) => app.status === "active").length,
  };
}

/**
 * Creates (or reuses) a Connect Link for one toolkit. Nothing is stored as
 * active here: the account only becomes usable once the user finishes the
 * hosted flow, which `verifyIntegration` checks.
 */
export async function connectIntegration(
  ownerId: number,
  toolkitSlug: string,
): Promise<{ redirectUrl: string }> {
  if (!isComposioConfigured()) throw new ComposioError(COMPOSIO_NOT_CONFIGURED, 0, "missing key");

  const definition = getIntegration(toolkitSlug);
  if (!definition) throw new ComposioError("Unknown app.", 404, toolkitSlug);

  // Composio creates the managed auth config on demand, so no per-toolkit
  // setup step exists in this app.
  const link = await createConnectLink({
    userId: composioUserId(ownerId),
    toolkitSlug: definition.slug,
    callbackUrl: composioCallbackUrl(),
  });

  await upsertConnection(ownerId, {
    toolkit: definition.slug,
    connectedAccountId: link.connectedAccountId,
    status: "pending",
    accountLabel: null,
    connectedAt: null,
  }).catch((error) => console.error("[composio] could not store the pending connection", error));

  return { redirectUrl: link.redirectUrl };
}

/**
 * Asks Composio about one toolkit and returns its real state. This is what the
 * chat's connect card polls until the account is ACTIVE, and what "verify"
 * means for the agent.
 */
export async function verifyIntegration(
  ownerId: number,
  toolkitSlug: string,
): Promise<{ status: IntegrationConnectionState; accountLabel: string | null }> {
  if (!isComposioConfigured()) throw new ComposioError(COMPOSIO_NOT_CONFIGURED, 0, "missing key");

  const definition = getIntegration(toolkitSlug);
  if (!definition) throw new ComposioError("Unknown app.", 404, toolkitSlug);

  const accounts = await listConnectedAccounts(composioUserId(ownerId), definition.slug);
  const account = bestAccounts(accounts).get(definition.slug) ?? null;
  const status = mapAccountStatus(account);

  await upsertConnection(ownerId, {
    toolkit: definition.slug,
    connectedAccountId: account?.id ?? null,
    status,
    accountLabel: account?.alias ?? null,
    connectedAt:
      status === "active" && account?.createdAt ? new Date(account.createdAt) : null,
  }).catch((error) => console.error("[composio] could not update the connection", error));

  return { status, accountLabel: account?.alias ?? null };
}

/** Revokes the account at Composio (best effort) and forgets it locally. */
export async function disconnectIntegration(ownerId: number, toolkitSlug: string): Promise<void> {
  const definition = getIntegration(toolkitSlug);
  if (!definition) throw new ComposioError("Unknown app.", 404, toolkitSlug);

  const rows = await db
    .select({ connectedAccountId: appConnections.connectedAccountId })
    .from(appConnections)
    .where(and(eq(appConnections.ownerId, ownerId), eq(appConnections.toolkit, definition.slug)));

  for (const row of rows) {
    if (!row.connectedAccountId) continue;
    try {
      await deleteConnectedAccount(row.connectedAccountId);
    } catch (error) {
      // A 404 means Composio already forgot it; anything else is logged so a
      // stuck account can be cleaned up in the Composio dashboard.
      const status = error instanceof ComposioError ? error.status : 0;
      if (status !== 404) {
        console.error("[composio] could not delete the connected account", error);
        throw new ComposioError("Composio couldn't revoke that connection. Please try again.", status);
      }
    }
  }

  await db
    .delete(appConnections)
    .where(and(eq(appConnections.ownerId, ownerId), eq(appConnections.toolkit, definition.slug)));
}


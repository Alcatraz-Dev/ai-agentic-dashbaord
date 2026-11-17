import type { IntegrationDefinition } from "@/lib/integrations/catalog";

/**
 * Client-safe shapes for the Apps page and the chat's connect card. No
 * Composio or database imports here: the browser only ever sees a status and a
 * label, never a credential or an account id.
 */

/** `pending` means a connect link was opened but the account isn't usable yet. */
export type IntegrationConnectionState = "active" | "pending" | "error" | "disconnected";

export type IntegrationApp = IntegrationDefinition & {
  status: IntegrationConnectionState;
  /** Which account is linked, when Composio reports one. */
  accountLabel: string | null;
  /** ISO timestamp of the connection, for the card's meta line. */
  connectedAt: string | null;
  /** Tools Composio exposes for this toolkit, when the catalog was reachable. */
  toolCount: number | null;
};

export type IntegrationsOverview = {
  /** False when COMPOSIO_API_KEY is missing: the page explains how to fix it. */
  configured: boolean;
  apps: IntegrationApp[];
  connectedCount: number;
};

/**
 * The same-origin channel the connect callback screen uses to tell the tab that
 * opened it that the hosted flow finished — the popup has no opener reference
 * (we null it), so a broadcast is the only channel that works.
 */
export const CONNECT_CHANNEL = "alcatraz:connections";

/**
 * Which account is behind a connected toolkit, so a widget row can name it.
 * Built server-side from `app_connections`; no credentials ever reach it.
 */
export type AppAccountSummary = {
  accountLabel: string | null;
  /** ISO timestamp of the last status check, for "connected 2h ago" copy. */
  lastCheckedAt: string | null;
};

export type ConnectMessage = {
  type: "alcatraz:connected";
  /** Toolkit reported by Composio, when the redirect forwards one. */
  toolkit: string | null;
  status: "success" | "error";
};

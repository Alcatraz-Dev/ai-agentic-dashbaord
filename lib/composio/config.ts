import "server-only";

/**
 * Composio connection details.
 *
 * One project API key drives everything: connect links, the connected-account
 * list and the per-user MCP session. It is server-only — never imported by a
 * client component, never prefixed with NEXT_PUBLIC_.
 */

export const COMPOSIO_API_BASE = "https://backend.composio.dev/api/v3.1";

/**
 * Where the hosted connect flow sends the popup when it finishes.
 *
 * A dedicated callback screen, not `/dashboard/apps`: the popup must not load
 * the whole app inside a small window. That screen tells the tab that opened it
 * and closes itself, so the user lands back on the page they started from.
 */
export function composioCallbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
  return `${base}/connect/callback`;
}


export function composioApiKey(): string | null {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  return key ? key : null;
}

export function isComposioConfigured(): boolean {
  return composioApiKey() !== null;
}

/**
 * The stable Composio user id for one app user. Composio scopes every
 * connected account to this string, so it must never change: the local
 * `users.id` is the database primary key and survives renames.
 */
export function composioUserId(ownerId: number): string {
  return `alcatraz_${ownerId}`;
}

/** Shown wherever Composio is unavailable, with the fix. */
export const COMPOSIO_NOT_CONFIGURED =
  "External apps are not configured yet. Add COMPOSIO_API_KEY to the environment and reload.";

/**
 * A Composio request that failed. `status` is the upstream status (0 for a
 * network failure) and `detail` is safe to log, never to show verbatim.
 */
export class ComposioError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status = 0, detail = "") {
    super(message);
    this.name = "ComposioError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Turns an upstream failure into a sentence a person can act on. The raw body
 * is logged server-side by the caller; it is deliberately not echoed here.
 */
export function composioErrorMessage(error: unknown): string {
  if (error instanceof ComposioError) {
    if (error.status === 401 || error.status === 403) {
      return "Composio rejected the API key. Check COMPOSIO_API_KEY in the environment.";
    }
    if (error.status === 404) {
      return "Composio couldn't find that app. Try another one from the Apps page.";
    }
    if (error.status === 429) {
      return "Composio is rate limiting requests right now. Try again in a moment.";
    }
    if (error.status === 0) {
      return "Composio didn't respond in time. Check the connection and try again.";
    }
    return "Composio couldn't complete that request. Please try again.";
  }

  return "Something went wrong while talking to Composio. Please try again.";
}

/** The status our own API returns for a Composio failure. */
export function composioErrorStatus(error: unknown): number {
  if (!(error instanceof ComposioError)) return 500;
  if (error.status === 401 || error.status === 403) return 503;
  if (error.status === 404) return 404;
  if (error.status === 429) return 429;
  if (error.status >= 400 && error.status < 500) return 400;
  return 502;
}

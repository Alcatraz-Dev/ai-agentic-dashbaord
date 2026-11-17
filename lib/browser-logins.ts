import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { browserLogins, db } from "@/db";
import { normalizeSiteHost } from "@/lib/browser-login-policy";

/**
 * The sites the owner's cloud-browser profile is signed in to.
 *
 * Browserbase's Context holds the real cookies and localStorage; this table is
 * the app's own record of where the login happened, so the prompt can tell the
 * agent what it can open without asking, and `browser_request_login` can refuse
 * a saved site that this run hasn't seen signed out.
 */

export type SavedBrowserLogin = {
  host: string;
  url: string;
  label: string | null;
  lastSeenAt: Date;
};

/** Newest first. Missing table or a failed query must not take a chat down. */
export async function listBrowserLogins(ownerId: number): Promise<SavedBrowserLogin[]> {
  const rows = await db
    .select({
      host: browserLogins.host,
      url: browserLogins.url,
      label: browserLogins.label,
      lastSeenAt: browserLogins.lastSeenAt,
    })
    .from(browserLogins)
    .where(eq(browserLogins.ownerId, ownerId))
    .orderBy(desc(browserLogins.lastSeenAt));

  return rows;
}

/** Just the hostnames, for the system prompt. */
export async function listSignedInHosts(ownerId: number): Promise<string[]> {
  const rows = await listBrowserLogins(ownerId);
  return rows.map((row) => row.host);
}

/**
 * Records (or refreshes) a site the profile is signed in to. The host is
 * normalized, and an unusable value is ignored rather than stored.
 */
export async function saveBrowserLogin(
  ownerId: number,
  input: { url: string; host?: string; label?: string | null },
): Promise<void> {
  const host = normalizeSiteHost(input.host ?? input.url);
  if (!host) return;

  const url = input.url.trim() || `https://${host}`;
  const label = input.label?.trim().slice(0, 120) || host;
  const now = new Date();

  await db
    .insert(browserLogins)
    .values({ ownerId, host, url, label, lastSeenAt: now })
    .onConflictDoUpdate({
      target: [browserLogins.ownerId, browserLogins.host],
      set: { url, label, lastSeenAt: now },
    });
}

/**
 * Drops a saved login when a page says it is gone (an expired session, a
 * sign-out). A stale entry would make the prompt claim a sign-in the browser no
 * longer has.
 */
export async function forgetBrowserLogin(ownerId: number, host: string): Promise<void> {
  const normalized = normalizeSiteHost(host);
  if (!normalized) return;

  await db
    .delete(browserLogins)
    .where(and(eq(browserLogins.ownerId, ownerId), eq(browserLogins.host, normalized)));
}

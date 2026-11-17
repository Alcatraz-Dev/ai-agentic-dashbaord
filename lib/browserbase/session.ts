import "server-only";

import { eq } from "drizzle-orm";

import { db, users } from "@/db";
import { registerLiveBrowser, unregisterLiveBrowser } from "@/lib/browserbase/live";

/**
 * The cloud browser the agent drives with Stagehand.
 *
 * Lifecycle, in order:
 *  1. A browser tool asks for a session — nothing is started before that, so a
 *     chat that never browses costs nothing.
 *  2. The owner's Browserbase **Context** is reused (created once and stored on
 *     `users.browser_context_id`), so cookies, localStorage and logged-in
 *     sessions survive between runs.
 *  3. The runner closes the session when the turn ends, however it ends
 *     (`closeCloudBrowser` calls Stagehand's close then releases the Browserbase
 *     session).
 *
 * Stagehand and the Browserbase SDK are imported lazily: a chat that never
 * browses should not load a browser automation stack.
 */

export type CloudBrowserConfig = { apiKey: string; projectId?: string };

export const CLOUD_BROWSER_NOT_CONFIGURED =
  "The cloud browser isn't configured. Add BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID to the environment, then try again.";

/** Null when the environment has no Browserbase credentials. */
export function cloudBrowserConfig(): CloudBrowserConfig | null {
  const apiKey = process.env.BROWSERBASE_API_KEY?.trim();
  if (!apiKey) return null;

  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
  return projectId ? { apiKey, projectId } : { apiKey };
}

/** Models Stagehand can address, as its own type expects them. */
type StagehandModelName =
  | `openai/${string}`
  | `anthropic/${string}`
  | `google/${string}`
  | `groq/${string}`
  | `cerebras/${string}`;

/** Stagehand needs its own model for `act`/`extract`; Browserbase's Model
 * Gateway bills it to the project, so no extra provider key is required. */
function stagehandModel(): StagehandModelName {
  const configured = process.env.BROWSERBASE_MODEL?.trim();
  return (configured as StagehandModelName | undefined) ?? "google/gemini-2.5-flash";
}

export type CloudBrowserSession = {
  stagehand: import("@browserbasehq/stagehand").Stagehand;
  browser: import("@browserbasehq/stagehand").StagehandBrowser;
  sessionId: string | null;
  contextId: string;
  /** The agent driving this session, for the live view and its history row. */
  agentId: number | null;
  startedAt: number;
  closed: boolean;
  /** Gives this owner's browser slot back when the session closes. */
  releaseSlot: (() => void) | null;
};

/** Thrown when another run held the browser for longer than the wait budget. */
export const BROWSER_BUSY_MESSAGE =
  "The cloud browser is busy with another run. Give it a moment and try again.";

/**
 * One browser session per owner at a time.
 *
 * Every session shares the same Browserbase Context, so two at once can fight
 * over the same cookies. A run that finds the browser busy waits for it
 * (default two minutes, `BROWSER_WAIT_TIMEOUT_MS`) instead of failing, which is
 * what makes a scheduled run and a chat turn safe to start together.
 */
const browserSlots = new Map<number, Promise<void>>();

function browserWaitMs(): number {
  const value = Number(process.env.BROWSER_WAIT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 0 ? value : 120_000;
}

export async function acquireBrowserSlot(
  ownerId: number,
  waitMs = browserWaitMs(),
): Promise<{ release: () => void } | null> {
  const previous = browserSlots.get(ownerId) ?? Promise.resolve();
  let releaseHeld!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  const mine = previous.then(() => held);
  browserSlots.set(ownerId, mine);

  const release = () => {
    releaseHeld();
    if (browserSlots.get(ownerId) === mine) browserSlots.delete(ownerId);
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = Symbol("timeout");
  const ready = await Promise.race([
    previous.then(() => true as const),
    new Promise<typeof timedOut>((resolve) => {
      timer = setTimeout(() => resolve(timedOut), waitMs);
    }),
  ]);

  if (timer) clearTimeout(timer);
  if (ready === timedOut) {
    release();
    console.error(`[agents] the cloud browser stayed busy for ${waitMs}ms (owner ${ownerId})`);
    return null;
  }

  return { release };
}

/** False while a run currently holds this owner's browser. */
export function browserIsBusy(ownerId: number): boolean {
  return browserSlots.has(ownerId);
}

/**
 * The Context this owner's sessions attach to. Created on first use and kept
 * in Postgres, so every later session — and every agent they own — starts with
 * the same signed-in profile.
 */
async function ensureBrowserContext(ownerId: number): Promise<string> {
  const [row] = await db
    .select({ id: users.browserContextId })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  if (row?.id) return row.id;

  const config = cloudBrowserConfig();
  if (!config) throw new Error("BROWSERBASE_API_KEY is missing.");

  const { Browserbase } = await import("@browserbasehq/sdk");
  const browserbaseClient = new Browserbase({ apiKey: config.apiKey });
  const context = await browserbaseClient.contexts.create(
    config.projectId ? { projectId: config.projectId } : undefined,
  );

  await db
    .update(users)
    .set({ browserContextId: context.id, updatedAt: new Date() })
    .where(eq(users.id, ownerId));

  return context.id;
}

/** True once this owner has a browser profile saved (a Context id). */
export async function hasBrowserProfile(ownerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: users.browserContextId })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  return Boolean(row?.id);
}

/**
 * Forgets this owner's browser profile: the Browserbase Context is deleted and
 * the stored id cleared, so the next session starts signed out of everything.
 * Returns false when there was no profile to drop.
 *
 * The delete is best effort — a Context that cannot be removed (one still in
 * use, say) must not leave the column pointing at it, so the row is cleared
 * either way and the orphan is logged.
 */
export async function resetBrowserContext(ownerId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: users.browserContextId })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  const contextId = row?.id;
  if (!contextId) return false;

  const config = cloudBrowserConfig();
  if (config) {
    try {
      const { Browserbase } = await import("@browserbasehq/sdk");
      const browserbaseClient = new Browserbase({ apiKey: config.apiKey });
      await browserbaseClient.contexts.delete(contextId);
    } catch (error) {
      console.error("[agents] could not delete the browser context", contextId, error);
    }
  }

  await db
    .update(users)
    .set({ browserContextId: null, updatedAt: new Date() })
    .where(eq(users.id, ownerId));

  return true;
}

/** Starts a Browserbase session attached to the owner's persistent context. */
export async function openCloudBrowser(
  ownerId: number,
  agentId: number | null = null,
): Promise<CloudBrowserSession> {
  const config = cloudBrowserConfig();
  if (!config) throw new Error(CLOUD_BROWSER_NOT_CONFIGURED);

  const contextId = await ensureBrowserContext(ownerId);
  const slot = await acquireBrowserSlot(ownerId);
  if (!slot) throw new Error(BROWSER_BUSY_MESSAGE);

  const { browserbase, Stagehand } = await import("@browserbasehq/stagehand");

  const browser = await browserbase.launch({
    apiKey: config.apiKey,
    ...(config.projectId ? { projectId: config.projectId } : {}),
    // The session must not outlive the turn: it is released on close.
    keepAlive: false,
    browserSettings: {
      context: { id: contextId, persist: true },
      blockAds: true,
      // No proxy on purpose. Country-level proxies moved the city, ISP and
      // timezone on every session, which trips the site's own session checks
      // and looks exactly like an account takeover. A stable Browserbase IP is
      // the better price for a profile that stays signed in.
    },
  });

  try {
    const stagehand = await Stagehand.create({
      apiKey: config.apiKey,
      browser,
      model: { modelName: stagehandModel() },
      // Re-try selectors the model got slightly wrong instead of failing.
      selfHeal: true,
    });

    const session: CloudBrowserSession = {
      stagehand,
      browser,
      sessionId: browser.sessionId ?? null,
      contextId,
      agentId,
      startedAt: Date.now(),
      closed: false,
      releaseSlot: slot.release,
    };

    // The chat and the panel poll this for a live frame while the turn runs.
    if (agentId !== null) registerLiveBrowser(agentId, ownerId, session);

    return session;
  } catch (error) {
    // A session that cannot be driven would keep billing: release it.
    await browser.close().catch(() => undefined);
    slot.release();
    throw error;
  }
}

/**
 * A URL that shows the running session live (Browserbase's devtools viewer), so
 * the user can watch the agent work. Only valid while the session is open — the
 * link dies with it, which is why the chat drops it when the turn ends.
 */
export async function browserLiveViewUrl(
  session: CloudBrowserSession | null | undefined,
): Promise<string | null> {
  if (!session || session.closed || !session.sessionId) return null;

  const config = cloudBrowserConfig();
  if (!config) return null;

  try {
    const { Browserbase } = await import("@browserbasehq/sdk");
    const browserbaseClient = new Browserbase({ apiKey: config.apiKey });
    const urls = await browserbaseClient.sessions.debug(session.sessionId);
    return urls.debuggerFullscreenUrl || urls.debuggerUrl || null;
  } catch (error) {
    // A missing live view is cosmetic: the browser still works.
    console.error("[agents] could not build the cloud browser live view link", error);
    return null;
  }
}

/** The page the last action landed on (a click may have opened a new tab). */
export async function activePage(
  session: CloudBrowserSession,
): Promise<import("@browserbasehq/stagehand").Page> {
  const context = session.browser.context;
  const pages = await context.pages();
  return pages.at(-1) ?? (await context.newPage());
}

/**
 * Ends the session. Stagehand's close only drops its own connection, so the
 * browser handle is closed too — that is what releases the Browserbase session
 * (and stops the billing). Safe to call twice, and safe on a half-open session.
 */
export async function closeCloudBrowser(
  session: CloudBrowserSession | null | undefined,
): Promise<void> {
  if (!session || session.closed) return;

  session.closed = true;
  unregisterLiveBrowser(session.agentId);
  session.releaseSlot?.();
  session.releaseSlot = null;

  await session.stagehand.close().catch((error) => {
    console.error("[agents] closing Stagehand failed", error);
  });

  await session.browser.close().catch((error) => {
    console.error("[agents] releasing the browser session failed", error);
  });
}


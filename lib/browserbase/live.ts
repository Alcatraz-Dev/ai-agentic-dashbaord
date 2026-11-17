import "server-only";

import type { CloudBrowserSession } from "@/lib/browserbase/session";

/**
 * The live view of a running cloud browser.
 *
 * A session exists only for the turn that opened it, inside the Node process
 * that is streaming that turn. This module keeps a small in-process registry so
 * another request from the same page — the live preview in the chat and in the
 * config panel — can ask for a frame of what the agent is looking at right now.
 *
 * It deliberately holds no credentials and no history: the entry disappears the
 * moment the session closes, and the session id itself is only used to reach
 * the page over the connection Stagehand already owns.
 */

export type LiveBrowserFrame = {
  /** JPEG as a data URL, ready for an <img>. */
  image: string;
  url: string;
  title: string;
  /** ISO string of when this frame was taken. */
  capturedAt: string;
};

type LiveEntry = {
  ownerId: number;
  session: CloudBrowserSession;
};

/**
 * Kept on `globalThis` on purpose: the bundler can instantiate a module once per
 * route entry, and the session is opened by the chat route while the frame is
 * requested by the live route. A plain module-level Map would give each entry
 * its own empty registry.
 */
type Registry = {
  /** Keyed by agent id: one browser per turn, and one turn per agent page. */
  live: Map<number, LiveEntry>;
  /** A capture already running for an agent, so overlapping polls share it. */
  capturing: Map<number, Promise<LiveBrowserFrame | null>>;
};

const globalForLive = globalThis as typeof globalThis & {
  __alcatrazLiveBrowser?: Registry;
};

const registry: Registry = (globalForLive.__alcatrazLiveBrowser ??= {
  live: new Map(),
  capturing: new Map(),
});

const { live, capturing } = registry;

/** Small enough to poll over a LAN, sharp enough to read a page at card size. */
const FRAME_QUALITY = 45;

/** Called by `openCloudBrowser` as soon as the session exists. */
export function registerLiveBrowser(
  agentId: number,
  ownerId: number,
  session: CloudBrowserSession,
): void {
  live.set(agentId, { ownerId, session });
}

/** Called by `closeCloudBrowser`; also drops any in-flight capture. */
export function unregisterLiveBrowser(agentId: number | null | undefined): void {
  if (agentId === null || agentId === undefined) return;
  live.delete(agentId);
  capturing.delete(agentId);
}

/** True while this owner's agent has a browser open in this process. */
export function hasLiveBrowser(agentId: number, ownerId: number): boolean {
  const entry = live.get(agentId);
  return Boolean(entry && entry.ownerId === ownerId && !entry.session.closed);
}

/**
 * One frame of the page the agent is on, or null when there is nothing live.
 * Screenshots go through the session's own CDP connection, so this works while
 * Stagehand is mid-action; a failed capture is reported as "nothing to show"
 * rather than an error, because the next poll will try again.
 */
export async function captureLiveFrame(
  agentId: number,
  ownerId: number,
): Promise<LiveBrowserFrame | null> {
  const entry = live.get(agentId);
  if (!entry || entry.ownerId !== ownerId || entry.session.closed) return null;

  const running = capturing.get(agentId);
  if (running) return running;

  const capture = (async (): Promise<LiveBrowserFrame | null> => {
    try {
      const context = entry.session.browser.context;
      const pages = await context.pages();
      const page = pages.at(-1) ?? (await context.newPage());

      const [buffer, url, title] = await Promise.all([
        page.screenshot({ type: "jpeg", quality: FRAME_QUALITY }),
        page.url().catch(() => ""),
        page.title().catch(() => ""),
      ]);

      return {
        image: `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`,
        url,
        title,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      // A page mid-navigation can refuse a screenshot; that is not a failure.
      console.error("[agents] could not capture a live browser frame", error);
      return null;
    } finally {
      capturing.delete(agentId);
    }
  })();

  capturing.set(agentId, capture);
  return capture;
}

import "server-only";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import { AGENT_TOOL_LIMITS } from "@/lib/agent-tool-options";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import {
  evaluateBrowserLoginRequest,
  normalizeSiteHost,
} from "@/lib/browser-login-policy";
import { forgetBrowserLogin, listBrowserLogins, saveBrowserLogin } from "@/lib/browser-logins";
import {
  browserLoginTimeoutMs,
  pageSignInState,
  waitForSignIn,
} from "@/lib/browserbase/sign-in";
import {
  BROWSER_BUSY_MESSAGE,
  CLOUD_BROWSER_NOT_CONFIGURED,
  activePage,
  cloudBrowserConfig,
  openCloudBrowser,
  type CloudBrowserSession,
} from "@/lib/browserbase/session";

/**
 * The cloud-browser tools (Browserbase + Stagehand).
 *
 * These are for work a plain page read can't do: signing in, clicking through
 * a flow, filling a form, paginating, scrolling an infinite list. The session
 * is opened by the first call in a turn and closed by the runner when the turn
 * ends, and it always attaches to the owner's persistent Browserbase Context,
 * so a login from an earlier session is still there.
 */

const PAGE_TEXT_LIMIT = 6_000;
const NAVIGATION_TIMEOUT_MS = 30_000;

const NO_OWNER =
  "The cloud browser needs a signed-in owner before it can start. Ask the user to send the message again.";

function actionsLeft(state: AgentToolRunState): number {
  return Math.max(0, AGENT_TOOL_LIMITS.browser - state.browserActions);
}

/** Opens (or reuses) this turn's session and spends one browser action. */
async function takeBrowser(
  state: AgentToolRunState,
): Promise<{ ok: true; session: CloudBrowserSession } | { ok: false; error: string }> {
  if (!cloudBrowserConfig()) return { ok: false, error: CLOUD_BROWSER_NOT_CONFIGURED };
  if (!state.ownerId) return { ok: false, error: NO_OWNER };
  if (state.browserActions >= AGENT_TOOL_LIMITS.browser) {
    return {
      ok: false,
      error: `The cloud browser has used its ${AGENT_TOOL_LIMITS.browser} actions for this reply. Answer with what you already have, or tell the user what is still open.`,
    };
  }

  state.browserActions += 1;

  try {
    if (!state.browser) state.browser = await openCloudBrowser(state.ownerId, state.agentId);
    return { ok: true, session: state.browser };
  } catch (error) {
    // Another run held the shared profile until the wait ran out. That is a
    // temporary state, not a configuration problem: say so plainly.
    if (error instanceof Error && error.message === BROWSER_BUSY_MESSAGE) {
      return { ok: false, error: BROWSER_BUSY_MESSAGE };
    }

    console.error("[agents] cloud browser could not start", error);
    return {
      ok: false,
      error:
        "The cloud browser couldn't start. Check the Browserbase API key and project id, then try again.",
    };
  }
}

/** Where the browser currently is, for the end of every tool result. */
async function pageSummary(session: CloudBrowserSession): Promise<string> {
  try {
    const page = await activePage(session);
    const [url, title] = await Promise.all([page.url(), page.title()]);
    return `${title ? `${title} — ` : ""}${url}`;
  } catch {
    return "the page state is unavailable";
  }
}

/**
 * Remembers a page this run inspected, and forgets a saved sign-in the page
 * says is gone. Called after every open and action, so a site the owner signed
 * out of stops being advertised as saved.
 */
async function noteBrowserPage(
  state: AgentToolRunState,
  page: Parameters<typeof pageSignInState>[0],
  url: string,
): Promise<void> {
  const host = normalizeSiteHost(url);
  if (!host) return;

  const signedOut = (await pageSignInState(page)) === "signed-out";
  state.browserVisits.push({ host, signedOut });

  if (signedOut && state.ownerId) {
    await forgetBrowserLogin(state.ownerId, host).catch((error) =>
      console.error("[agents] could not forget a stale browser login", error),
    );
  }
}

function withProtocol(rawUrl: string): string {
  const value = rawUrl.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) return `https://${value}`;
  return value;
}

const openParameters = z.object({
  url: z
    .string()
    .describe(
      "Absolute http(s) URL to open. A search engine URL works too, e.g. https://duckduckgo.com/?q=pricing+for+notion or https://www.google.com/search?q=...",
    ),
});

export const browserOpen: Tool<AgentToolRunState> = tool<typeof openParameters, AgentToolRunState>({
  name: "browser_open",
  description:
    "Open a URL in a real cloud browser (Browserbase) and return the page's visible text. Use it for pages that need JavaScript, a sign-in, or that a plain page read can't see. Pass a search-engine URL to search interactively.",
  parameters: openParameters,
  execute: async ({ url }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context;
    if (!state) return "The cloud browser is unavailable in this run.";

    const target = withProtocol(url);
    if (!/^https?:\/\//i.test(target)) {
      return `That isn't a URL I can open: ${url}`;
    }

    const granted = await takeBrowser(state);
    if (!granted.ok) return granted.error;

    try {
      const page = await activePage(granted.session);
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      // SPAs often paint after `domcontentloaded`; a short settle avoids
      // extracting an empty shell without waiting on slow third-party calls.
      await page.waitForLoadState("networkidle", 5_000).catch(() => undefined);

      const [current, title, text] = await Promise.all([
        page.url().catch(() => target),
        page.title().catch(() => ""),
        page
          .evaluate(() =>
            typeof document === "undefined"
              ? ""
              : ((document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n") as string),
          )
          .catch(() => ""),
      ]);

      await noteBrowserPage(state, page, current);

      const readable = String(text).trim();
      const body = readable
        ? readable.length > PAGE_TEXT_LIMIT
          ? `${readable.slice(0, PAGE_TEXT_LIMIT)}\n\n[page text truncated]`
          : readable
        : "(the page shows no readable text yet — try browser_act or browser_extract)";

      return `Opened ${current}${title ? ` — ${title}` : ""}\n\n${body}\n\n(cloud browser actions left: ${actionsLeft(state)})`;
    } catch (error) {
      console.error("[agents] browser_open failed", error);
      return `That page wouldn't open in the cloud browser (${await pageSummary(granted.session)}). It may be slow, blocked, or behind a login. (cloud browser actions left: ${actionsLeft(state)})`;
    }
  },
});

const actParameters = z.object({
  instruction: z
    .string()
    .describe(
      'One clear browser action, for example "click the Sign in button", "type hello@acme.com into the Email field", "fill the shipping form and submit", "scroll down twice", "open the Pricing page".',
    ),
});

export const browserAct: Tool<AgentToolRunState> = tool<typeof actParameters, AgentToolRunState>({
  name: "browser_act",
  description:
    "Perform one action in the live cloud browser: click, type, fill a form, press a key, scroll. Use it when the task needs a real interaction instead of just reading a page.",
  parameters: actParameters,
  execute: async ({ instruction }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context;
    if (!state) return "The cloud browser is unavailable in this run.";

    const trimmed = instruction.trim();
    if (!trimmed) return "Describe the action to take in the browser.";

    const granted = await takeBrowser(state);
    if (!granted.ok) return granted.error;

    try {
      const { data } = await granted.session.stagehand.act(trimmed);
      const page = await activePage(granted.session);
      const currentUrl = await page.url().catch(() => "");
      await noteBrowserPage(state, page, currentUrl);
      const summary = await pageSummary(granted.session);

      return `${data.success ? "Done" : "That action could not be completed"}: ${data.message || trimmed}\nNow on: ${summary}\n\n(cloud browser actions left: ${actionsLeft(state)})`;
    } catch (error) {
      console.error("[agents] browser_act failed", error);
      return `The browser couldn't do that: ${trimmed}. Check the page state, then try a simpler step. (cloud browser actions left: ${actionsLeft(state)})`;
    }
  },
});

const loginParameters = z.object({
  site: z
    .string()
    .describe(
      'The site that needs a sign-in, as a hostname or URL (for example "github.com"). It must be the page already open in the cloud browser.',
    ),
});

/**
 * The sign-in request.
 *
 * It is not a form of typing a password — it hands the live browser to the
 * owner, waits for the page to stop asking them to sign in, then records the
 * site so later runs can open it directly. The refusal rules live in
 * `evaluateBrowserLoginRequest`: a saved site that this run has not opened and
 * found signed out is never worth interrupting the owner for.
 */
export const browserRequestLogin: Tool<AgentToolRunState> = tool<
  typeof loginParameters,
  AgentToolRunState
>({
  name: "browser_request_login",
  description:
    "Ask the owner to sign in to the site already open in the live cloud browser, and wait while they do it there. Use it only after a page you opened in this run is actually signed out; never for a saved site you have not opened.",
  parameters: loginParameters,
  execute: async ({ site }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context;
    if (!state) return "The cloud browser is unavailable in this run.";
    if (!state.ownerId) return NO_OWNER;

    if (!state.browser) {
      return `Open ${site} in the cloud browser with browser_open first, then request a sign-in if that page shows you signed out.`;
    }

    const page = await activePage(state.browser).catch(() => null);
    if (!page) {
      return `The cloud browser has no open page right now. Open ${site} with browser_open first.`;
    }

    const currentUrl = await page.url().catch(() => "");
    const liveState = await pageSignInState(page);
    if (liveState === "unknown") {
      return `The ${site} page couldn't be inspected (it may still be loading). Open it again with browser_open, then request a sign-in only if it shows a signed-out page.`;
    }

    const saved = await listBrowserLogins(state.ownerId).catch((error) => {
      console.error("[agents] could not list saved browser logins", error);
      return [];
    });

    const decision = evaluateBrowserLoginRequest({
      site,
      currentHost: normalizeSiteHost(currentUrl),
      savedHosts: saved.map((entry) => entry.host),
      visits: state.browserVisits,
      pageSignedOut: liveState === "signed-out",
    });

    if (!decision.allowed) {
      // The page became signed in between opening it and asking: keep that.
      if (decision.reason === "signed-in-now") {
        const title = await page.title().catch(() => "");
        await saveBrowserLogin(state.ownerId, {
          url: currentUrl,
          host: normalizeSiteHost(currentUrl),
          label: title,
        }).catch((error) => console.error("[agents] could not save a browser login", error));
      }

      return decision.message;
    }

    const granted = await takeBrowser(state);
    if (!granted.ok) return granted.error;

    const timeoutMs = browserLoginTimeoutMs();
    const outcome = await waitForSignIn(
      () => activePage(granted.session),
      timeoutMs,
      state.signal,
    );

    if (outcome === "signed-in") {
      const finalPage = await activePage(granted.session).catch(() => null);
      const finalUrl = finalPage ? await finalPage.url().catch(() => currentUrl) : currentUrl;
      const title = finalPage ? await finalPage.title().catch(() => "") : "";

      await saveBrowserLogin(state.ownerId, {
        url: finalUrl || `https://${decision.host}`,
        host: decision.host,
        label: title || decision.host,
      }).catch((error) => console.error("[agents] could not save a browser login", error));

      state.browserVisits.push({ host: decision.host, signedOut: false });

      return `The owner signed in to ${decision.host}, and the cloud browser saved it for later runs. Continue with the task. (cloud browser actions left: ${actionsLeft(state)})`;
    }

    if (outcome === "aborted") {
      return "The sign-in wait stopped before the owner finished. Nothing was saved.";
    }

    return `The owner hasn't signed in to ${decision.host} yet (waited ${Math.round(
      timeoutMs / 1000,
    )}s). The live view is still open: ask them to finish the sign-in there, then call browser_request_login again — or stop if they aren't available. (cloud browser actions left: ${actionsLeft(state)})`;
  },
});

const extractParameters = z.object({
  instruction: z
    .string()
    .describe(
      'What to pull out of the open page, for example "the three pricing plans with their monthly price" or "the confirmation number".',
    ),
});

export const browserExtract: Tool<AgentToolRunState> = tool<
  typeof extractParameters,
  AgentToolRunState
>({
  name: "browser_extract",
  description:
    "Read structured details from the page currently open in the cloud browser (prices, names, table rows, a confirmation code) without dumping the whole page.",
  parameters: extractParameters,
  execute: async ({ instruction }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context;
    if (!state) return "The cloud browser is unavailable in this run.";

    const trimmed = instruction.trim();
    if (!trimmed) return "Say what to extract from the page.";

    const granted = await takeBrowser(state);
    if (!granted.ok) return granted.error;

    try {
      const { data } = await granted.session.stagehand.extract(trimmed);
      const page = await activePage(granted.session);
      const currentUrl = await page.url().catch(() => "");
      await noteBrowserPage(state, page, currentUrl);
      const summary = await pageSummary(granted.session);

      return `${data.extraction || "(nothing found on the page)"}\n\nFrom: ${summary}\n\n(cloud browser actions left: ${actionsLeft(state)})`;
    } catch (error) {
      console.error("[agents] browser_extract failed", error);
      return `Couldn't read that from the page. Try browser_open on the final URL first. (cloud browser actions left: ${actionsLeft(state)})`;
    }
  },
});

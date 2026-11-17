import "server-only";

import type { Page } from "@browserbasehq/stagehand";

/**
 * Whether the page in the live browser is showing a sign-in form.
 *
 * There is no universal signed-in API, so this looks for the two things almost
 * every signed-out page has: a visible password field, or a visible button /
 * link whose whole label is "Sign in" or "Log in". A page without either is
 * treated as signed in. That is deliberately conservative: a false "signed in"
 * makes the agent continue instead of asking the owner for a login it doesn't
 * need, and `browser_request_login` refuses rather than nags.
 */

export type PageSignInState = "signed-in" | "signed-out" | "unknown";

export async function pageSignInState(page: Page): Promise<PageSignInState> {
  try {
    const state = await page.evaluate(() => {
      const visible = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 1 &&
          rect.height > 1 &&
          style.visibility !== "hidden" &&
          style.display !== "none"
        );
      };

      const passwords = Array.from(document.querySelectorAll('input[type="password"]'));
      if (passwords.some(visible)) return "signed-out";

      const controls = Array.from(
        document.querySelectorAll(
          'a, button, [role="button"], input[type="submit"], input[type="button"]',
        ),
      );

      const signInControl = controls.some((element) => {
        if (!visible(element)) return false;
        const label =
          (element as HTMLInputElement).value || element.textContent || "";
        return /^(sign\s?in|log\s?in|signin|login)$/i.test(label.trim());
      });

      return signInControl ? "signed-out" : "signed-in";
    });

    return state === "signed-out" || state === "signed-in" ? state : "unknown";
  } catch {
    // A navigation in progress can reject the evaluate; the next poll retries.
    return "unknown";
  }
}

/** How long `browser_request_login` waits for the owner, in milliseconds. */
export function browserLoginTimeoutMs(): number {
  const configured = Number(process.env.BROWSER_LOGIN_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(300_000, Math.max(15_000, configured));
  }
  return 120_000;
}

export type SignInWaitResult = "signed-in" | "timeout" | "aborted";

const POLL_MS = 2_500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for the page to stop showing a sign-in form, re-reading the active page
 * each poll because a successful login usually means a redirect or a new tab.
 * The owner signs in themselves in the live view; nothing here touches their
 * credentials.
 */
export async function waitForSignIn(
  getPage: () => Promise<Page>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<SignInWaitResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) return "aborted";

    const page = await getPage().catch(() => null);
    if (page) {
      const state = await pageSignInState(page);
      if (state === "signed-in") return "signed-in";
    }

    await sleep(POLL_MS);
  }

  return signal?.aborted ? "aborted" : "timeout";
}

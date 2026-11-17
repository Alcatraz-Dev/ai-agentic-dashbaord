/**
 * The rule behind `browser_request_login`, kept as pure functions so the
 * decision can be read (and checked) without a browser or a database.
 *
 * A saved sign-in is not proof that the page in front of the agent is usable:
 * sessions expire, sites sign you out, and a saved site can still show a
 * sign-in form. So a request is only allowed when this run has actually opened
 * the site and seen it signed out. Anything else is refused with a message the
 * model can act on, which stops it from nagging the owner about a site the
 * browser is already signed in to.
 */

export type BrowserLoginVisit = {
  /** Hostname the page was on when it was inspected. */
  host: string;
  /** True when that page showed a sign-in form. */
  signedOut: boolean;
};

export type BrowserLoginRefusalReason =
  | "invalid-site"
  | "wrong-page"
  | "not-opened"
  | "not-signed-out"
  | "already-signed-in"
  /** The page is signed in now, though it was signed out when it opened. */
  | "signed-in-now";

export type BrowserLoginDecision =
  | { allowed: true; host: string }
  | { allowed: false; reason: BrowserLoginRefusalReason; message: string };

/**
 * `https://www.Example.com/path` / `example.com` → `example.com`.
 * Returns "" when the value has no usable hostname.
 */
export function normalizeSiteHost(input: string): string {
  const value = input.trim();
  if (!value) return "";

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return "";
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return "";

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) return "";

  return host.replace(/^www\./, "");
}

/** True for the same host, or a subdomain of it (`mail.google.com` ~ `google.com`). */
export function hostMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/** The most recent visit to this site in the run, if any. */
function latestVisit(visits: BrowserLoginVisit[], host: string): BrowserLoginVisit | undefined {
  for (let index = visits.length - 1; index >= 0; index -= 1) {
    if (hostMatches(visits[index].host, host)) return visits[index];
  }
  return undefined;
}

export function evaluateBrowserLoginRequest({
  site,
  currentHost,
  savedHosts,
  visits,
  pageSignedOut,
}: {
  /** Raw site the model passed (hostname or URL). */
  site: string;
  /** Hostname of the page open in the browser right now. */
  currentHost: string;
  /** Hosts the workspace profile is saved as signed in to. */
  savedHosts: string[];
  /** Pages this run has inspected, in order. */
  visits: BrowserLoginVisit[];
  /** Whether the live page looks signed out right now. */
  pageSignedOut: boolean;
}): BrowserLoginDecision {
  const host = normalizeSiteHost(site);

  if (!host) {
    return {
      allowed: false,
      reason: "invalid-site",
      message: `"${site}" isn't a site address I can use. Pass the hostname of the page, for example "github.com".`,
    };
  }

  if (!currentHost || !hostMatches(currentHost, host)) {
    return {
      allowed: false,
      reason: "wrong-page",
      message: `The cloud browser is on ${currentHost || "another page"}, not ${host}. Open ${host} with browser_open first, then request the sign-in.`,
    };
  }

  const saved = savedHosts.some((savedHost) => hostMatches(savedHost, host));
  const visit = latestVisit(visits, host);

  if (!visit) {
    return {
      allowed: false,
      reason: "not-opened",
      message: `You haven't opened ${host} in this run. Open it with browser_open, look at what it shows, and request a sign-in only if that page is actually signed out.`,
    };
  }

  // The visit said signed out, but the page is signed in now: the owner may
  // have just finished. There is nothing to wait for, and the login is worth
  // keeping.
  if (visit.signedOut && !pageSignedOut) {
    return {
      allowed: false,
      reason: "signed-in-now",
      message: `${host} looks signed in now, so there is nothing to wait for. The browser profile still has it. Continue with the task.`,
    };
  }

  if (!visit.signedOut) {
    if (saved) {
      return {
        allowed: false,
        reason: "already-signed-in",
        message: `This workspace is already signed in to ${host}. Don't ask for a sign-in: open the page and continue, or use browser_act. Only ask again if that page actually shows a signed-out state.`,
      };
    }

    return {
      allowed: false,
      reason: "not-signed-out",
      message: `The ${host} page you opened doesn't look signed out, so there is no sign-in to ask for. If it is signed in, continue; otherwise open the site's sign-in page first.`,
    };
  }

  return { allowed: true, host };
}

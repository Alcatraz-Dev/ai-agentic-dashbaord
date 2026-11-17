import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

import { isPrivateAddress } from "@/lib/private-address";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { Agent as UndiciAgent, request as undiciRequest } from "undici";
import { z } from "zod";

import {
  AGENT_TOOL_LIMITS,
  createAgentToolRunState,
  type AgentToolRunState,
} from "@/lib/agent-runtime/tools/context";

/**
 * `read_webpage`: GET a public page and return its text.
 *
 * Hardening, in order:
 *  - only http(s), standard ports (80/443), no credentials in the URL
 *  - private/loopback/link-local hosts refused before every request
 *  - redirects followed manually, each hop re-validated
 *  - DNS is resolved by undici's connector and every answer is checked at
 *    connection time, so a name that resolves to 127.0.0.1 after the first
 *    lookup (DNS rebinding) still can't connect
 *  - 12s budget and a 600 KB download cap
 */

const MAX_BYTES = 600_000;
const MAX_CHARS = 6_000;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 12_000;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/** Returns an error message when the URL must not be fetched. */
export function validateTargetUrl(url: URL): string | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Only http and https URLs can be read.";
  }
  if (url.username || url.password) {
    return "URLs with embedded credentials can't be read.";
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    return "Only the standard web ports (80 and 443) are allowed.";
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost")) return "That host is private.";
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) {
    return "That host is private.";
  }
  // Literal IPs never hit the DNS lookup, so check them here too.
  if (isPrivateAddress(host)) return "That address is private.";

  return null;
}

/**
 * Node's `lookup` wrapped so every resolved address is validated at connect
 * time. Used by the undici connector below.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    type Callback = (...args: unknown[]) => void;
    const done = callback as unknown as Callback;

    if (error) {
      done(error);
      return;
    }

    const list = (addresses as LookupAddress[] | LookupAddress[] | undefined) ?? [];
    const resolved = Array.isArray(list) ? list : [list];
    const blocked = resolved.find((entry) => isPrivateAddress(entry.address));

    if (blocked) {
      const blockedError: NodeJS.ErrnoException = new Error(
        `Refusing to connect to the private address ${blocked.address}.`,
      );
      blockedError.code = "EACCES";
      done(blockedError);
      return;
    }

    if (resolved.length === 0) {
      done(new Error("The host did not resolve."));
      return;
    }

    if (options.all) {
      (callback as unknown as (err: null, list: LookupAddress[]) => void)(null, resolved);
    } else {
      (callback as unknown as (err: null, address: string, family: number) => void)(
        null,
        resolved[0]!.address,
        resolved[0]!.family,
      );
    }
  });
};

const dispatcher = new UndiciAgent({
  connect: { lookup: safeLookup, timeout: 10_000 },
  connectTimeout: 10_000,
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

/** Crude but effective: drop non-content elements, keep block breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|head|nav|footer|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .replace(/ *\n */g, "\n"),
  ).trim();
}

type PageResult =
  | { ok: true; url: string; text: string }
  | { ok: false; error: string };

async function readBody(
  body: AsyncIterable<Uint8Array> & { destroy?: () => void },
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;

  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) {
      truncated = true;
      body.destroy?.();
      break;
    }
    chunks.push(chunk);
  }

  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

/** Fetches a public page with redirect re-validation and connection-time checks. */
export async function fetchPublicPage(rawUrl: string): Promise<PageResult> {
  let current: URL;

  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, error: `That isn't a valid URL: ${rawUrl}` };
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const invalid = validateTargetUrl(current);
    if (invalid) return { ok: false, error: invalid };

    let response;
    try {
      response = await undiciRequest(current, {
        method: "GET",
        dispatcher,
        signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; AlcatrazAgent/1.0; +https://alcatraz.dev)",
          accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.5",
          "accept-language": "en",
        },
      });
    } catch (error) {
      console.error("[agents] read_webpage request failed", error);
      return {
        ok: false,
        error: "That page couldn't be read. It may be down, or it may block automated requests.",
      };
    }

    const { statusCode, headers } = response;

    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const location = headers.location;
      response.body.destroy();

      if (!location) return { ok: false, error: "The page redirected without a location." };

      try {
        current = new URL(Array.isArray(location) ? location[0]! : location, current);
      } catch {
        return { ok: false, error: "The page redirected to an invalid URL." };
      }

      // Loop re-validates the hop before requesting it.
      continue;
    }

    if (statusCode < 200 || statusCode >= 300) {
      response.body.destroy();
      return { ok: false, error: `The page answered ${statusCode}.` };
    }

    const type = String(headers["content-type"] ?? "");
    if (type && !/text\/|json|xml/i.test(type)) {
      response.body.destroy();
      return { ok: false, error: `That URL isn't a readable page (${type.split(";")[0]}).` };
    }

    const { text, truncated } = await readBody(response.body as never);
    const readable = /html/i.test(type) ? htmlToText(text) : text.trim();

    if (!readable) return { ok: false, error: "The page had no readable text." };

    const clipped =
      readable.length > MAX_CHARS
        ? `${readable.slice(0, MAX_CHARS)}\n\n[truncated${truncated ? " — page capped at 600 KB" : ""}]`
        : readable;

    return { ok: true, url: current.href, text: clipped };
  }

  return { ok: false, error: "Too many redirects." };
}

export const readWebPage: Tool<AgentToolRunState> = tool<
  ReturnType<typeof readPageParameters>,
  AgentToolRunState
>({
  name: "read_webpage",
  description:
    "Fetch a public web page (http or https, standard ports) and return its readable text. Use it on a search result or a link the user shared.",
  parameters: readPageParameters(),
  execute: async ({ url }, runContext?: RunContext<AgentToolRunState>) => {
    const state = runContext?.context ?? createAgentToolRunState();

    if (state.pages >= AGENT_TOOL_LIMITS.pages) {
      return `Page limit reached for this reply (${AGENT_TOOL_LIMITS.pages}). Answer with what you already have, or tell the user what still needs reading.`;
    }

    state.pages += 1;
    const result = await fetchPublicPage(url);

    return result.ok
      ? `Source: ${result.url}\n\n${result.text}`
      : `Couldn't read that page: ${result.error}`;
  },
});

function readPageParameters() {
  return z.object({
    url: z.string().describe("Absolute http(s) URL of the page to read."),
  });
}

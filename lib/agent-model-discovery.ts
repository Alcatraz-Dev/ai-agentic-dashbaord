import "server-only";

import { lookup } from "node:dns/promises";

import { isPrivateAddress } from "@/lib/private-address";

/**
 * Discovery for a saved custom model: validate the endpoint, then list the
 * models it exposes at `GET <base>/models` with the owner's key.
 *
 * The URL never comes from the app itself, so it is treated as untrusted:
 * https only (http on localhost), no embedded credentials, no redirects, and
 * public hostnames are resolved and refused if they point at a private
 * address. The key stays on the server and is never logged.
 */

const TIMEOUT_MS = 10_000;
const MAX_MODELS = 500;
const MAX_RESPONSE_CHARS = 2_000_000;

export type CustomModelOption = {
  id: string;
  name: string;
  ownedBy?: string;
};

export type ModelDiscoveryResult =
  | { ok: true; models: CustomModelOption[] }
  | { ok: false; error: string };

export type NormalizedModelBaseUrl =
  | { ok: true; url: string; parsed: URL }
  | { ok: false; error: string };

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

/**
 * Shared by create and discovery so both accept exactly the same endpoints and
 * give the same message when they don't.
 */
export function normalizeModelBaseUrl(raw: string): NormalizedModelBaseUrl {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Base URL is required." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid base URL, e.g. https://api.provider.com/v1." };
  }

  const host = bareHost(parsed.hostname);
  if (parsed.protocol !== "https:" && !(isLocalHost(host) && parsed.protocol === "http:")) {
    return {
      ok: false,
      error: "Use an HTTPS base URL (http://localhost is allowed for local servers).",
    };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: "Remove the credentials from the URL and put the key in the API key field.",
    };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, error: "Enter only the API base URL, without a query string or fragment." };
  }

  return {
    ok: true,
    url: parsed.toString().replace(/\/+$/, ""),
    parsed,
  };
}

/** Refuses a hostname whose DNS answers include a private address. */
async function hostError(host: string): Promise<string | null> {
  if (isLocalHost(host)) return null;
  if (isPrivateAddress(host)) return "That address is private.";

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return "That host did not resolve.";
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      return "That host resolves to a private address.";
    }
  } catch {
    return "That host could not be resolved.";
  }

  return null;
}

type EndpointEntry = {
  id?: unknown;
  name?: unknown;
  owned_by?: unknown;
};

/** Calls the endpoint's `/models` and returns a bounded, de-duplicated list. */
export async function discoverModelEndpointModels({
  baseUrl,
  apiKey,
}: {
  baseUrl: string;
  apiKey: string;
}): Promise<ModelDiscoveryResult> {
  const normalized = normalizeModelBaseUrl(baseUrl);
  if (!normalized.ok) return normalized;

  const host = bareHost(normalized.parsed.hostname);
  const addressError = await hostError(host);
  if (addressError) return { ok: false, error: addressError };

  let endpoint: URL;
  try {
    endpoint = new URL(`${normalized.url}/models`);
  } catch {
    return { ok: false, error: "That endpoint can't be turned into a models URL." };
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
      // Redirects could point at a private host after validation.
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "The endpoint rejected that API key. Check it and try again." };
      }
      if (response.status === 404) {
        return {
          ok: false,
          error: "That endpoint doesn't expose /models. Enter the model id manually instead.",
        };
      }
      return {
        ok: false,
        error: `That endpoint answered ${response.status}. Check the URL and key, then try again.`,
      };
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARS) {
      return { ok: false, error: "That endpoint returned too much data to list." };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false, error: "That endpoint didn't return an OpenAI-compatible model list." };
    }

    const list = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : null;

    if (!list) {
      return { ok: false, error: "That endpoint didn't return an OpenAI-compatible model list." };
    }

    const byId = new Map<string, CustomModelOption>();

    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;

      const row = entry as EndpointEntry;
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id || id.length > 200) continue;

      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim().slice(0, 120)
          : id.slice(0, 120);
      const ownedBy =
        typeof row.owned_by === "string" && row.owned_by.trim()
          ? row.owned_by.trim().slice(0, 80)
          : undefined;

      if (!byId.has(id)) byId.set(id, { id, name, ...(ownedBy ? { ownedBy } : {}) });
      if (byId.size >= MAX_MODELS) break;
    }

    const models = Array.from(byId.values());
    if (models.length === 0) {
      return { ok: false, error: "That endpoint answered but listed no models." };
    }

    return { ok: true, models };
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.warn(
      "[agents] custom model discovery failed",
      timedOut ? "timeout" : error instanceof Error ? error.message : "request failed",
    );

    if (timedOut) {
      return { ok: false, error: "That endpoint took too long to answer. Try again." };
    }
    return {
      ok: false,
      error: "Couldn't reach that endpoint. Check the URL and key, or enter the model id manually.",
    };
  }
}

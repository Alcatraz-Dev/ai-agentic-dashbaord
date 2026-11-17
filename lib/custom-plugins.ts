import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { customPlugins, db } from "@/db";
import type {
  CustomPluginMethod,
  CustomPluginSummary,
} from "@/lib/custom-plugin-types";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type NewCustomPluginInput = {
  name: string;
  slug: string;
  description: string;
  url: string;
  method: CustomPluginMethod;
  authorization: string | null;
  inputHint: string | null;
};

export type CustomPluginRuntimeConfig = {
  id: number;
  name: string;
  slug: string;
  description: string;
  url: string;
  method: CustomPluginMethod;
  authorization: string | null;
  inputHint: string | null;
};

const columns = {
  id: customPlugins.id,
  name: customPlugins.name,
  slug: customPlugins.slug,
  description: customPlugins.description,
  url: customPlugins.url,
  method: customPlugins.method,
  authorization: customPlugins.authorization,
  inputHint: customPlugins.inputHint,
  createdAt: customPlugins.createdAt,
};

function isMethod(value: string): value is CustomPluginMethod {
  return value === "GET" || value === "POST";
}

function toSummary(row: {
  id: number;
  name: string;
  slug: string;
  description: string;
  url: string;
  method: string;
  authorization: string | null;
  inputHint: string | null;
  createdAt: Date;
}): CustomPluginSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    url: row.url,
    method: isMethod(row.method) ? row.method : "POST",
    hasAuthorization: Boolean(row.authorization),
    inputHint: row.inputHint,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The custom tools shown on the Plugins page, oldest first. */
export async function listCustomPluginsForUser(
  profileId: number,
): Promise<CustomPluginSummary[]> {
  const rows = await db
    .select(columns)
    .from(customPlugins)
    .where(eq(customPlugins.ownerId, profileId))
    .orderBy(asc(customPlugins.createdAt), asc(customPlugins.id));

  return rows.map(toSummary);
}

/** Runtime configs, with the auth header decrypted only here. */
export async function listCustomPluginsForRuntime(
  profileId: number,
): Promise<CustomPluginRuntimeConfig[]> {
  const rows = await db
    .select(columns)
    .from(customPlugins)
    .where(eq(customPlugins.ownerId, profileId))
    .orderBy(asc(customPlugins.createdAt), asc(customPlugins.id));

  return rows.map((row) => {
    let authorization: string | null = null;

    if (row.authorization) {
      try {
        authorization = decryptSecret(row.authorization);
      } catch (error) {
        // A rotated key should disable that header, not break every chat turn.
        console.error(`[plugins] could not decrypt auth for plugin ${row.id}`, error);
      }
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      url: row.url,
      method: isMethod(row.method) ? row.method : "POST",
      authorization,
      inputHint: row.inputHint,
    };
  });
}

export async function countCustomPluginsForUser(profileId: number): Promise<number> {
  const rows = await db
    .select({ id: customPlugins.id })
    .from(customPlugins)
    .where(eq(customPlugins.ownerId, profileId));

  return rows.length;
}

export async function customPluginSlugExists(
  profileId: number,
  slug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: customPlugins.id })
    .from(customPlugins)
    .where(and(eq(customPlugins.ownerId, profileId), eq(customPlugins.slug, slug)))
    .limit(1);

  return Boolean(row);
}

export async function createCustomPluginForUser(
  profileId: number,
  input: NewCustomPluginInput,
): Promise<CustomPluginSummary> {
  const [row] = await db
    .insert(customPlugins)
    .values({
      ownerId: profileId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      url: input.url,
      method: input.method,
      authorization: input.authorization ? encryptSecret(input.authorization) : null,
      inputHint: input.inputHint,
    })
    .returning(columns);

  if (!row) throw new Error("The custom plugin insert returned no row.");
  return toSummary(row);
}

/** Owner-scoped, so another user's id deletes nothing. */
export async function deleteCustomPluginForUser(
  profileId: number,
  pluginId: number,
): Promise<boolean> {
  if (!Number.isInteger(pluginId) || pluginId <= 0) return false;

  const rows = await db
    .delete(customPlugins)
    .where(and(eq(customPlugins.ownerId, profileId), eq(customPlugins.id, pluginId)))
    .returning({ id: customPlugins.id });

  return rows.length > 0;
}

/** Lowercase tool-safe suffix: `Invoice lookup` → `invoice_lookup`. */
export function customPluginSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "tool"
  );
}

/**
 * Only public HTTPS endpoints, plus plain HTTP on localhost for development.
 * Credentials in the URL are refused because they would be stored and shown.
 */
export function normalizeCustomPluginUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) return null;
  if (url.username || url.password) return null;

  return url.toString();
}

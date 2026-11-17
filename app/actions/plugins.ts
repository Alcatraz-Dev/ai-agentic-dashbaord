"use server";

import {
  CUSTOM_PLUGIN_AUTHORIZATION_MAX,
  CUSTOM_PLUGIN_DESCRIPTION_MAX,
  CUSTOM_PLUGIN_INPUT_HINT_MAX,
  CUSTOM_PLUGIN_NAME_MAX,
  CUSTOM_PLUGIN_URL_MAX,
  CUSTOM_PLUGINS_MAX,
  type CustomPluginMethod,
  type CustomPluginSummary,
} from "@/lib/custom-plugin-types";
import {
  countCustomPluginsForUser,
  createCustomPluginForUser,
  customPluginSlug,
  customPluginSlugExists,
  deleteCustomPluginForUser,
  normalizeCustomPluginUrl,
} from "@/lib/custom-plugins";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export type CreateCustomPluginResult =
  | { ok: true; plugin: CustomPluginSummary }
  | { ok: false; error: string };

export type DeleteCustomPluginResult = { ok: true } | { ok: false; error: string };

export type CreateCustomPluginInput = {
  name: string;
  description: string;
  url: string;
  method: string;
  authorization?: string | null;
  inputHint?: string | null;
};

/**
 * Saves an HTTPS endpoint as a tool every agent can call. The endpoint gets
 * `{ input }` as JSON (or `?input=` for GET) and its response is returned to
 * the model as text.
 */
export async function createCustomPluginAction(
  input: CreateCustomPluginInput,
): Promise<CreateCustomPluginResult> {
  const user = await requireUser();

  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_PLUGIN_NAME_MAX);
  if (name.length < 2) {
    return { ok: false, error: "Give the plugin a name (at least 2 characters)." };
  }

  const description = String(input.description ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_PLUGIN_DESCRIPTION_MAX);
  if (description.length < 5) {
    return { ok: false, error: "Describe what this plugin does." };
  }

  const rawUrl = String(input.url ?? "").trim();
  if (rawUrl.length > CUSTOM_PLUGIN_URL_MAX) {
    return { ok: false, error: "That URL is too long." };
  }
  const url = normalizeCustomPluginUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      error: "Use a public https:// URL (http:// is only allowed on localhost).",
    };
  }

  const method = String(input.method ?? "POST").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return { ok: false, error: "Choose GET or POST." };
  }

  const authorization = String(input.authorization ?? "").trim();
  if (authorization.length > CUSTOM_PLUGIN_AUTHORIZATION_MAX) {
    return { ok: false, error: "That authorization header is too long." };
  }

  const inputHint =
    String(input.inputHint ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CUSTOM_PLUGIN_INPUT_HINT_MAX) || null;

  const slug = customPluginSlug(name);

  try {
    const profile = await ensureUserRecord(user);

    if ((await countCustomPluginsForUser(profile.id)) >= CUSTOM_PLUGINS_MAX) {
      return {
        ok: false,
        error: `This workspace already has ${CUSTOM_PLUGINS_MAX} custom plugins. Remove one first.`,
      };
    }
    if (await customPluginSlugExists(profile.id, slug)) {
      return {
        ok: false,
        error: `A plugin with a similar name already exists (tool name "plugin_${slug}").`,
      };
    }

    const plugin = await createCustomPluginForUser(profile.id, {
      name,
      slug,
      description,
      url,
      method: method as CustomPluginMethod,
      authorization: authorization || null,
      inputHint,
    });

    return { ok: true, plugin };
  } catch (error) {
    console.error("[plugins] create failed", error);
    return { ok: false, error: "We couldn't save that plugin. Please try again." };
  }
}

export async function deleteCustomPluginAction(input: {
  id: number;
}): Promise<DeleteCustomPluginResult> {
  const user = await requireUser();

  const pluginId = Number(input.id);
  if (!Number.isInteger(pluginId) || pluginId <= 0) {
    return { ok: false, error: "That plugin could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteCustomPluginForUser(profile.id, pluginId);
    if (!deleted) return { ok: false, error: "That plugin could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[plugins] delete failed", error);
    return { ok: false, error: "We couldn't remove that plugin. Please try again." };
  }
}

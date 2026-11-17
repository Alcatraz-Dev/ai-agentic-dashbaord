/** Client-safe shapes for custom HTTP plugins; the auth header never appears. */

export type CustomPluginSummary = {
  id: number;
  name: string;
  slug: string;
  description: string;
  url: string;
  method: "GET" | "POST";
  /** True when an Authorization header is stored (encrypted). */
  hasAuthorization: boolean;
  inputHint: string | null;
  createdAt: string;
};

export type CustomPluginMethod = "GET" | "POST";

export const CUSTOM_PLUGIN_NAME_MAX = 60;
export const CUSTOM_PLUGIN_DESCRIPTION_MAX = 280;
export const CUSTOM_PLUGIN_URL_MAX = 2_000;
export const CUSTOM_PLUGIN_INPUT_HINT_MAX = 280;
export const CUSTOM_PLUGIN_AUTHORIZATION_MAX = 4_000;
export const CUSTOM_PLUGINS_MAX = 30;

/** Tool suffix rules: lowercase letters, digits and underscores. */
export function customPluginToolName(slug: string): string {
  return `plugin_${slug}`;
}

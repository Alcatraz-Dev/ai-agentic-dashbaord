import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import { cardToolAllows, cardToolRefusal } from "@/lib/agent-runtime/card-tools";
import { customPluginToolName } from "@/lib/custom-plugin-types";
import type { CustomPluginRuntimeConfig } from "@/lib/custom-plugins";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";

const parameters = z.object({
  input: z
    .string()
    .min(1)
    .max(8_000)
    .describe("The text or JSON value the endpoint expects."),
});

const TIMEOUT_MS = 20_000;
const RESPONSE_MAX = 12_000;

async function readLimited(response: Response): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, RESPONSE_MAX);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (text.length < RESPONSE_MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return text.slice(0, RESPONSE_MAX);
}

function authorizationValue(raw: string): string {
  const value = raw.trim();
  // A bare token is almost always meant as a bearer token.
  return /^[A-Za-z]+\s/.test(value) ? value : `Bearer ${value}`;
}

/**
 * Creates one tool per saved plugin. The endpoint contract is intentionally
 * small: POST `{ input }` or GET `?input=…`, with an optional Authorization
 * header. Redirects are refused so a public URL cannot bounce into the private
 * network.
 */
export function createCustomPluginTools(
  plugins: CustomPluginRuntimeConfig[],
): Tool<AgentToolRunState>[] {
  return plugins.map((plugin) =>
    tool<typeof parameters, AgentToolRunState>({
      name: customPluginToolName(plugin.slug),
      description: `${plugin.description}${
        plugin.inputHint ? ` Input: ${plugin.inputHint}.` : ""
      }`,
      parameters,
      execute: async ({ input }, context) => {
        // The card's pick is enforced here too, not only by omitting the tool.
        if (!cardToolAllows(context?.context?.cardTools ?? null, "plugin", plugin.slug)) {
          return cardToolRefusal("plugin", plugin.slug);
        }

        const headers: Record<string, string> = { Accept: "application/json, text/plain" };
        if (plugin.authorization) {
          headers.Authorization = authorizationValue(plugin.authorization);
        }

        let target = plugin.url;
        let body: string | undefined;

        if (plugin.method === "GET") {
          const url = new URL(plugin.url);
          url.searchParams.set("input", input);
          target = url.toString();
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify({ input });
        }

        try {
          const response = await fetch(target, {
            method: plugin.method,
            headers,
            body,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          const text = await readLimited(response);

          if (!response.ok) {
            return `Plugin "${plugin.name}" returned HTTP ${response.status}: ${
              text.slice(0, 800) || "no response body"
            }`;
          }

          return text.trim() || `Plugin "${plugin.name}" returned an empty response.`;
        } catch (error) {
          console.error(`[plugins] ${plugin.slug} request failed`, error);
          return `Plugin "${plugin.name}" could not be reached. Check the endpoint URL and try again.`;
        }
      },
    }),
  );
}

/** Prompt entries for custom plugin tools. */
export function listCustomPluginToolSummaries(
  plugins: CustomPluginRuntimeConfig[],
): { name: string; summary: string }[] {
  return plugins.map((plugin) => ({
    name: customPluginToolName(plugin.slug),
    summary: `${plugin.description}${
      plugin.inputHint ? ` Input: ${plugin.inputHint}.` : ""
    }`,
  }));
}

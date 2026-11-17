import "server-only";

import { listToolkits } from "@/lib/composio/client";
import {
  INTEGRATIONS,
  fallbackIntegration,
  toIntegrationCategory,
  type IntegrationDefinition,
} from "@/lib/integrations/catalog";

/**
 * The Apps catalog, built from Composio's live toolkit list.
 *
 * The curated definitions in `lib/apps/catalog.ts` keep their hand-written
 * names, icons and descriptions; every other toolkit gets a generic tile with
 * Composio's own name, description and mapped category. A Composio outage
 * degrades to the curated twenty instead of breaking the Apps page.
 */

export type ToolkitCatalog = {
  apps: IntegrationDefinition[];
  toolCounts: Record<string, number>;
};

const FEATURED = new Set(INTEGRATIONS.map((app) => app.slug));

function cleanDescription(value: string, name: string): string {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (text || `Connect ${name} through Composio so your agents can use it.`).slice(0, 240);
}

export async function getToolkitCatalog(): Promise<ToolkitCatalog> {
  let toolkits;
  try {
    toolkits = await listToolkits();
  } catch (error) {
    console.error("[composio] toolkit catalog unavailable", error);
    return {
      apps: INTEGRATIONS,
      toolCounts: {},
    };
  }

  const curated = new Map(INTEGRATIONS.map((app) => [app.slug, app]));
  const apps: IntegrationDefinition[] = [];
  const toolCounts: Record<string, number> = {};

  for (const toolkit of toolkits) {
    const known = curated.get(toolkit.slug);
    toolCounts[toolkit.slug] = toolkit.toolsCount;

    if (known) {
      apps.push({
        ...known,
        name: toolkit.name || known.name,
        logo: toolkit.logo || known.logo,
      });
      continue;
    }

    const fallback = fallbackIntegration(toolkit.slug, toolkit.name);
    if (!fallback) continue;

    apps.push({
      ...fallback,
      category: toIntegrationCategory(toolkit.categories),
      description: cleanDescription(toolkit.description, toolkit.name || fallback.name),
      logo: toolkit.logo || null,
    });
  }

  // The familiar twenty lead, then everything else alphabetically.
  apps.sort((a, b) => {
    const featuredA = FEATURED.has(a.slug) ? 0 : 1;
    const featuredB = FEATURED.has(b.slug) ? 0 : 1;
    return featuredA - featuredB || a.name.localeCompare(b.name);
  });

  return { apps, toolCounts };
}

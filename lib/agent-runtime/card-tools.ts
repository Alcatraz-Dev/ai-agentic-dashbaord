import type { TaskToolSelection } from "@/lib/task-types";

/**
 * Card-scoped tools.
 *
 * A board card can name the skills, plugins, MCP servers and apps its run may
 * use. This is the one place that turns that selection into a filter, so the
 * runtime, the plugin list and the MCP servers all agree on what "only these"
 * means: a group that is present but empty means *none* of that kind.
 */

/** The groups a card can narrow, or null when the card didn't narrow anything. */
export function cardToolScope(
  tools: TaskToolSelection | null | undefined,
): TaskToolSelection | null {
  if (!tools) return null;

  const total =
    tools.skills.length +
    tools.diagrams.length +
    tools.plugins.length +
    tools.mcpServers.length +
    tools.apps.length;

  return total > 0 ? tools : null;
}

/**
 * Keeps the items whose key is in `allowed`. `null` leaves the list untouched
 * (no narrowing); an empty list removes everything of that kind.
 */
export function scopeList<T>(
  items: T[],
  allowed: (string | number)[] | null,
  keyOf: (item: T) => string | number,
): T[] {
  if (allowed === null) return items;

  const keep = new Set(allowed);
  return items.filter((item) => keep.has(keyOf(item)));
}

export type CardToolKind = "skill" | "diagram" | "plugin" | "app" | "mcp";

/**
 * The runtime guard: true when the card allows this tool, or when the run has
 * no card at all. Checked inside the tool itself, so a tool name that reached
 * the model by any route still cannot act outside the card's list.
 */
export function cardToolAllows(
  policy: TaskToolSelection | null,
  kind: CardToolKind,
  value: string | number,
): boolean {
  if (!policy) return true;

  if (kind === "skill") return policy.skills.includes(String(value));
  if (kind === "diagram") return policy.diagrams.includes(String(value));
  if (kind === "plugin") return policy.plugins.includes(String(value));
  if (kind === "app") return policy.apps.includes(String(value));
  return policy.mcpServers.includes(Number(value));
}

/** The refusal a guarded tool returns, so the model reports it instead of retrying. */
export function cardToolRefusal(kind: CardToolKind, value: string | number): string {
  const label =
    kind === "skill"
      ? "skill"
      : kind === "diagram"
        ? "diagram"
        : kind === "plugin"
          ? "plugin"
          : kind === "app"
            ? "app"
            : "MCP server";

  return `This card did not pick the ${label} “${value}”, so it can't be used on this run. Use only the tools the card lists, or ask the owner to add it.`;
}

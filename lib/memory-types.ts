/**
 * Client-safe memory shapes, limits and small helpers.
 *
 * An agent memory is one short, durable note about its owner — a preference, a
 * recurring detail, a decision — kept between conversations. The database reads
 * live in `lib/memories.ts`; this module is imported by the page, the graph, the
 * manager and the runtime's prompt builder, so it must stay server-free.
 */

export const MEMORY_CONTENT_MAX = 600;
export const MEMORY_CONTENT_MIN = 4;
export const MEMORY_TAG_MAX = 24;
export const MEMORY_TAGS_MAX = 5;
/** Kept per agent; the oldest unpinned note is replaced when the cap is reached. */
export const MEMORIES_PER_AGENT_MAX = 80;
/** Notes listed in the system prompt on every run. */
export const MEMORY_PROMPT_MAX = 12;
export const MEMORY_PROMPT_CHARS_MAX = 2_400;
/** Notes `recall_memory` may return in one call. */
export const MEMORY_RECALL_LIMIT = 6;
/** Node cap for the visual graph, so a large workspace still draws fast. */
export const MEMORY_GRAPH_MAX_MEMORIES = 120;

/** Who wrote the note: the agent through `save_memory`, or the owner by hand. */
export type MemorySource = "agent" | "owner";

export type MemoryRecord = {
  id: number;
  agentId: number;
  agentName: string;
  agentAvatar: string;
  agentColor: string;
  content: string;
  tags: string[];
  source: MemorySource;
  /** How many times `recall_memory` returned it. */
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
};

/** One note as an agent's config rail lists it. */
export type AgentMemoryNote = {
  id: number;
  content: string;
  tags: string[];
  source: MemorySource;
  useCount: number;
  createdAt: string;
};

/** One agent row on the Memory page, with its switch and note count. */
export type MemoryAgent = {
  id: number;
  name: string;
  avatar: string;
  color: string;
  /** False when memory is switched off for this agent. */
  enabled: boolean;
  count: number;
};

/** A note as the prompt and the recall tool see it. */
export type MemoryEntry = {
  id: number;
  content: string;
  tags: string[];
};

/**
 * Fixed hues for the graph's communities. These are data-viz colours on the
 * graph's own dark plate, not theme tokens — the picture must stay comparable
 * in every palette and in both appearances.
 */
export const MEMORY_GRAPH_PALETTE = [
  "#5b8def",
  "#f0a13b",
  "#ef5f5f",
  "#5fc9b4",
  "#6bbf4b",
  "#e8c547",
  "#a678c9",
  "#f08fa8",
  "#a98467",
  "#9aa4b8",
];

/** One cluster of the graph: the notes that share a subject. */
export type MemoryCommunity = {
  id: number;
  /** `#tag`, or the agent's name for notes written without a tag. */
  label: string;
  color: string;
  count: number;
};

export type MemoryGraphNode = {
  /** `memory:<id>`, `agent:<id>` or `tag:<name>`. */
  id: string;
  kind: "memory" | "agent" | "tag";
  label: string;
  memoryId?: number;
  agentId?: number;
  /** Index into `MemoryGraph.communities`; -1 for an agent hub. */
  community: number;
  /** Bigger means more used (memory) or more shared (tag). */
  weight: number;
};

export type MemoryGraphEdge = { from: string; to: string };

export type MemoryGraph = {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  /** Memories the graph had to leave out because of the node cap. */
  hidden: number;
  /** The clusters the dots are coloured by, most populated first. */
  communities: MemoryCommunity[];
};

/**
 * Turns notes + agents into the graph the Memory page draws. Pure and
 * client-safe, so adding or deleting a note reshapes the graph immediately
 * without another round trip.
 */
export function buildMemoryGraph(
  memories: MemoryRecord[],
  agents: MemoryAgent[],
): MemoryGraph {
  const shown = memories.slice(0, MEMORY_GRAPH_MAX_MEMORIES);
  const nodes: MemoryGraphNode[] = [];
  const edges: MemoryGraphEdge[] = [];
  const tagWeights = new Map<string, number>();
  const usedAgents = new Set<number>();

  // A note belongs to the community of its first tag — the subject it was filed
  // under. A note with no tag falls back to the agent that keeps it, so every
  // dot still has an honest home.
  const grouped = new Map<
    string,
    { label: string; memories: MemoryRecord[] }
  >();

  for (const memory of shown) {
    const key = memory.tags[0] ? `tag:${memory.tags[0]}` : `agent:${memory.agentId}`;
    const label = memory.tags[0] ? `#${memory.tags[0]}` : memory.agentName;
    const group = grouped.get(key) ?? { label, memories: [] };
    group.memories.push(memory);
    grouped.set(key, group);
  }

  const ordered = [...grouped.values()].sort(
    (a, b) => b.memories.length - a.memories.length || a.label.localeCompare(b.label),
  );

  const communities: MemoryCommunity[] = ordered.map((group, index) => ({
    id: index,
    label: group.label,
    color: MEMORY_GRAPH_PALETTE[index % MEMORY_GRAPH_PALETTE.length],
    count: group.memories.length,
  }));

  const communityOf = new Map<number, number>();
  ordered.forEach((group, index) => {
    for (const memory of group.memories) communityOf.set(memory.id, index);
  });

  // A tag hub takes the community most of its notes come from, so a shared tag
  // reads as the colour of the cluster it holds together.
  const tagCommunities = new Map<string, Map<number, number>>();

  for (const memory of shown) {
    const community = communityOf.get(memory.id) ?? 0;

    nodes.push({
      id: `memory:${memory.id}`,
      kind: "memory",
      label: memoryExcerpt(memory.content, 48),
      memoryId: memory.id,
      agentId: memory.agentId,
      community,
      weight: memory.useCount + 1,
    });

    usedAgents.add(memory.agentId);

    for (const tag of memory.tags) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + 1);
      const counts = tagCommunities.get(tag) ?? new Map<number, number>();
      counts.set(community, (counts.get(community) ?? 0) + 1);
      tagCommunities.set(tag, counts);
      edges.push({ from: `memory:${memory.id}`, to: `tag:${tag}` });
    }
  }

  for (const agent of agents) {
    if (!usedAgents.has(agent.id)) continue;
    nodes.push({
      id: `agent:${agent.id}`,
      kind: "agent",
      label: agent.name,
      agentId: agent.id,
      community: -1,
      weight: agent.count,
    });
  }

  for (const memory of shown) {
    edges.push({ from: `memory:${memory.id}`, to: `agent:${memory.agentId}` });
  }

  const tags = [...tagWeights.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [tag, weight] of tags) {
    const counts = tagCommunities.get(tag);
    const community = counts
      ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
      : 0;

    nodes.push({
      id: `tag:${tag}`,
      kind: "tag",
      label: tag,
      community,
      weight,
    });
  }

  return {
    nodes,
    edges,
    hidden: Math.max(0, memories.length - shown.length),
    communities,
  };
}

export const MEMORY_TAG_SUGGESTIONS = [
  "preference",
  "person",
  "project",
  "routine",
  "decision",
  "account",
];

/**
 * Cleans a tag list: lowercase, `#` stripped, spaces to dashes, deduped and
 * capped. Accepts either an array or a comma-separated string.
 */
export function normalizeMemoryTags(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const entry of list) {
    if (typeof entry !== "string") continue;

    const tag = entry
      .trim()
      .toLowerCase()
      .replace(/^#/, "")
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .replace(/\s+/g, "-")
      .slice(0, MEMORY_TAG_MAX);

    if (!tag || seen.has(tag)) continue;

    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MEMORY_TAGS_MAX) break;
  }

  return tags;
}

/** Collapses whitespace and enforces the stored length. */
export function memoryText(value: string): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MEMORY_CONTENT_MAX);
}

/** Words used to match a recall question against stored notes. */
export function memoryQueryTokens(query: string): string[] {
  return [
    ...new Set(
      String(query ?? "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length > 2),
    ),
  ].slice(0, 8);
}

/** One-line preview for a node label or a list row. */
export function memoryExcerpt(content: string, max = 64): string {
  const line = String(content ?? "").replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, Math.max(1, max - 1))}…`;
}

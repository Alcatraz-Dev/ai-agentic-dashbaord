import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import { createMemoryForUser, deleteMemoryForUser, recallMemories } from "@/lib/memories";
import {
  MEMORIES_PER_AGENT_MAX,
  MEMORY_CONTENT_MAX,
  MEMORY_RECALL_LIMIT,
  MEMORY_TAGS_MAX,
  MEMORY_TAG_MAX,
  memoryText,
  normalizeMemoryTags,
} from "@/lib/memory-types";

/**
 * Memory tools. Attached only when the owner has memory on for this agent —
 * `memoryContextForAgent` is the single source of truth for that switch, so a
 * chat turn, a scheduled run and a board run all behave the same.
 *
 * Nothing here invents a note: the model writes one because the owner said
 * "remember this" or shared a durable preference, and the owner can remove any
 * note from the Memory page.
 */

const saveParameters = z.object({
  content: z
    .string()
    .min(4)
    .max(MEMORY_CONTENT_MAX)
    .describe("One short, self-contained note in plain language, e.g. 'Prefers short replies and metric units.'"),
  tags: z
    .array(z.string().min(1).max(MEMORY_TAG_MAX))
    .max(MEMORY_TAGS_MAX)
    .optional()
    .describe("Two or three lowercase keywords, e.g. ['preference', 'writing']."),
});

const recallParameters = z.object({
  query: z
    .string()
    .max(200)
    .optional()
    .describe("What to look for. Empty returns the most recent notes."),
});

const forgetParameters = z.object({
  id: z.number().int().positive().describe("The numeric id shown next to the memory."),
});

const saveMemory = tool<typeof saveParameters, AgentToolRunState>({
  name: "save_memory",
  description:
    "Store one durable fact about the owner so a later conversation can use it. Call it when they say remember this, or share a lasting preference, person, project or decision. Never store passwords, keys, card numbers, one-off task details or anything they did not ask you to keep.",
  parameters: saveParameters,
  execute: async ({ content, tags }, context) => {
    const ownerId = context?.context?.ownerId ?? null;
    const agentId = context?.context?.agentId ?? null;
    if (!ownerId || !agentId) return "Memory is not available in this run.";

    const result = await createMemoryForUser(ownerId, {
      agentId,
      content: memoryText(content),
      tags,
      source: "agent",
    });

    if (!result.ok) return result.error;

    // The runner streams this as a `memory_saved` event, so the chat can show
    // the note instead of asking the owner to trust a sentence.
    context?.context?.memoryNotes.push({
      id: result.memory.id,
      content: result.memory.content,
      tags: result.memory.tags,
    });

    return [
      `Saved as memory #${result.memory.id}.`,
      result.memory.tags.length ? `Tags: ${result.memory.tags.join(", ")}.` : "",
      `This agent keeps at most ${MEMORIES_PER_AGENT_MAX} notes; the least used ones make room for new ones.`,
    ]
      .filter(Boolean)
      .join(" ");
  },
});

const recallMemory = tool<typeof recallParameters, AgentToolRunState>({
  name: "recall_memory",
  description:
    "Search this agent's saved memories about the owner. Call it before answering a question about something they told you earlier, or when they ask what you remember.",
  parameters: recallParameters,
  execute: async ({ query }, context) => {
    const ownerId = context?.context?.ownerId ?? null;
    const agentId = context?.context?.agentId ?? null;
    if (!ownerId || !agentId) return "Memory is not available in this run.";

    const hits = await recallMemories(ownerId, agentId, query ?? "", MEMORY_RECALL_LIMIT);

    // Recorded on the run, so a scheduled run's history can show what it used.
    for (const hit of hits) {
      const state = context?.context;
      if (!state) break;
      if (state.recalledMemories.some((entry) => entry.id === hit.id)) continue;
      state.recalledMemories.push({ id: hit.id, content: hit.content });
    }

    if (hits.length === 0) {
      return "No saved memory matches that. Say so plainly instead of guessing; if the owner wants it remembered, save it with save_memory.";
    }

    return [
      "Saved memories (id — note [tags]):",
      ...hits.map(
        (hit) =>
          `- ${hit.id} — ${hit.content}${hit.tags.length ? ` [${hit.tags.join(", ")}]` : ""}`,
      ),
      "Use only what is relevant. If the owner corrects one, save the corrected version.",
    ].join("\n");
  },
});

const forgetMemory = tool<typeof forgetParameters, AgentToolRunState>({
  name: "forget_memory",
  description:
    "Delete one saved memory by its id. Use it only when the owner asks you to forget something; never to tidy up on your own.",
  parameters: forgetParameters,
  execute: async ({ id }, context) => {
    const ownerId = context?.context?.ownerId ?? null;
    if (!ownerId) return "Memory is not available in this run.";

    const removed = await deleteMemoryForUser(ownerId, id);
    return removed
      ? `Memory #${id} deleted. It will not be used again.`
      : `No memory #${id} in this workspace. Call recall_memory to see the real ids.`;
  },
});

export const MEMORY_TOOLS: Tool<AgentToolRunState>[] = [saveMemory, recallMemory, forgetMemory];

export const MEMORY_TOOL_LABELS: Record<string, string> = {
  save_memory: "Saving to memory",
  recall_memory: "Checking memory",
  forget_memory: "Forgetting a memory",
};

export const MEMORY_TOOL_SUMMARIES: { name: string; summary: string }[] = [
  {
    name: "save_memory",
    summary:
      "Store one durable fact or preference the owner asked you to remember, with two or three tags.",
  },
  {
    name: "recall_memory",
    summary:
      "Search the notes this agent saved about the owner before answering a question about what they said earlier.",
  },
  {
    name: "forget_memory",
    summary: "Delete one saved memory by id, only when the owner asks you to forget it.",
  },
];

/** Tags normalizer re-exported for callers that only need the tool contract. */
export { normalizeMemoryTags };

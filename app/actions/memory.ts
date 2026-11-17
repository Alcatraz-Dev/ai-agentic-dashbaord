"use server";

import {
  createMemoryForUser,
  deleteMemoriesForUser,
  deleteMemoryForUser,
  setAgentMemoryEnabledForUser,
  updateMemoryForUser,
} from "@/lib/memories";
import type { MemoryRecord } from "@/lib/memory-types";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export type CreateMemoryActionResult =
  | { ok: true; memory: MemoryRecord }
  | { ok: false; error: string };

export type MemoryActionResult = { ok: true } | { ok: false; error: string };

/** Owner writes a note by hand from the Memory page. */
export async function createMemoryAction(input: {
  agentId: number;
  content: string;
  tags?: string[];
}): Promise<CreateMemoryActionResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    return await createMemoryForUser(profile.id, {
      agentId: Number(input.agentId),
      content: input.content,
      tags: input.tags ?? [],
      source: "owner",
    });
  } catch (error) {
    console.error("[memory] create failed", error);
    return { ok: false, error: "We couldn't save that memory. Please try again." };
  }
}

/** The owner rewrites a note's wording or tags in place. */
export async function updateMemoryAction(input: {
  id: number;
  content: string;
  tags?: string[];
}): Promise<CreateMemoryActionResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    return await updateMemoryForUser(profile.id, Number(input.id), {
      content: input.content,
      tags: input.tags ?? [],
    });
  } catch (error) {
    console.error("[memory] update failed", error);
    return { ok: false, error: "We couldn't update that memory. Please try again." };
  }
}

/** Removes every selected note in one owner-scoped statement. */
export async function deleteMemoriesAction(input: { ids: number[] }): Promise<
  { ok: true; removed: number } | { ok: false; error: string }
> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const removed = await deleteMemoriesForUser(profile.id, input.ids);
    if (removed === 0) return { ok: false, error: "Those memories could not be found." };
    return { ok: true, removed };
  } catch (error) {
    console.error("[memory] bulk delete failed", error);
    return { ok: false, error: "We couldn't remove those memories. Please try again." };
  }
}

export async function deleteMemoryAction(input: { id: number }): Promise<MemoryActionResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const removed = await deleteMemoryForUser(profile.id, Number(input.id));
    if (!removed) return { ok: false, error: "That memory could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[memory] delete failed", error);
    return { ok: false, error: "We couldn't remove that memory. Please try again." };
  }
}

/**
 * Turns memory on or off for one agent. Off attaches no memory tools and puts no
 * stored note in the prompt; the notes stay so switching it back is lossless.
 */
export async function setAgentMemoryEnabledAction(input: {
  agentId: number;
  enabled: boolean;
}): Promise<MemoryActionResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const updated = await setAgentMemoryEnabledForUser(
      profile.id,
      Number(input.agentId),
      Boolean(input.enabled),
    );
    if (!updated) return { ok: false, error: "That agent could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[memory] toggle failed", error);
    return { ok: false, error: "We couldn't change that setting. Please try again." };
  }
}

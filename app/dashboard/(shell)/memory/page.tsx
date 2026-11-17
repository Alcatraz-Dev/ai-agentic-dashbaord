import type { Metadata } from "next";
import { Brain } from "lucide-react";

import { MemoryManager } from "@/components/memory/memory-manager";
import { listMemoryAgents, listMemoriesForUser } from "@/lib/memories";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Memory" };

/**
 * The workspace's agent memory: what the agents were told to remember, which
 * agent holds each note, a graph of how notes and tags connect, and the switch
 * that stops an agent using memory at all.
 */
export default async function MemoryPage() {
  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  const [memories, agents] = await Promise.all([
    listMemoriesForUser(profile.id),
    listMemoryAgents(profile.id),
  ]);

  const enabledAgents = agents.filter((agent) => agent.enabled).length;
  const recallable = memories.filter((memory) => memory.useCount > 0).length;

  return (
    <div className="aui-page max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Remembered between conversations</p>
          <h1 className="aui-title mt-2">Memory</h1>
          <p className="aui-subtitle mt-2">
            Tell an agent “remember this” in chat and it keeps a short note here. Memory can be
            switched off per agent — its notes stay, they just stop reaching the model.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="aui-chip text-[0.72rem]">
            <Brain className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground tabular-nums">{memories.length}</span>{" "}
            {memories.length === 1 ? "memory" : "memories"}
          </span>
          <span className="aui-chip text-[0.72rem]">
            <span className="font-semibold text-foreground tabular-nums">
              {enabledAgents}/{agents.length}
            </span>{" "}
            agents using it
          </span>
          <span className="aui-chip text-[0.72rem]">
            <span className="font-semibold text-foreground tabular-nums">{recallable}</span>{" "}
            recalled at least once
          </span>
        </div>
      </div>

      <MemoryManager memories={memories} agents={agents} />
    </div>
  );
}

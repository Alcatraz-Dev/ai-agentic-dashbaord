"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Brain } from "lucide-react";

import { setAgentMemoryEnabledAction } from "@/app/actions/memory";
import { MemoryGraphView } from "@/components/memory/memory-graph";
import { Switch } from "@/components/ui/switch";
import {
  buildMemoryGraph,
  memoryExcerpt,
  type AgentMemoryNote,
  type MemoryRecord,
} from "@/lib/memory-types";
import { cn } from "@/lib/utils";

/**
 * Memory in the agent's config rail: the switch the runtime actually reads, the
 * notes this agent keeps, and the way to the Memory page for the rest. Turning
 * it off keeps the notes — it only stops them reaching the model.
 */
export function AgentMemorySection({
  agentId,
  agentName,
  agentColor,
  enabled: initialEnabled,
  notes,
}: {
  agentId: number;
  /** Name shown on the agent node of the little graph. */
  agentName: string;
  /** Colour id from `AGENT_COLORS`, kept for the notes' record shape. */
  agentColor: string;
  enabled: boolean;
  notes: AgentMemoryNote[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The rail draws the same picture as the Memory page, from the notes it
  // already has — no extra query, and adding a note reshapes it instantly.
  const graph = useMemo(() => {
    const records: MemoryRecord[] = notes.map((note) => ({
      id: note.id,
      agentId,
      agentName,
      agentAvatar: "",
      agentColor,
      content: note.content,
      tags: note.tags,
      source: note.source,
      useCount: note.useCount,
      lastUsedAt: null,
      createdAt: note.createdAt,
    }));

    return buildMemoryGraph(records, [
      {
        id: agentId,
        name: agentName,
        avatar: "",
        color: agentColor,
        enabled,
        count: notes.length,
      },
    ]);
  }, [agentColor, agentId, agentName, enabled, notes]);

  async function toggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);

    try {
      const result = await setAgentMemoryEnabledAction({ agentId, enabled: next });
      if (!result.ok) {
        setEnabled(previous);
        setError(result.error);
      }
    } catch {
      setEnabled(previous);
      setError("We couldn't change that setting. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="aui-eyebrow flex items-center gap-1">
          <Brain className="size-3" aria-hidden="true" />
          Memory
        </p>
        <span className="flex items-center gap-1.5">
          {saving ? (
            <span className="text-[0.6rem] text-muted-foreground">Saving…</span>
          ) : (
            <span
              className={cn(
                "text-[0.6rem]",
                enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {enabled ? "On" : "Off"}
            </span>
          )}
          <Switch
            checked={enabled}
            disabled={saving}
            aria-label={`Use memory for ${agentId}`}
            onCheckedChange={(value: boolean) => void toggle(value)}
          />
        </span>
      </div>

      <p className="mt-1 text-[0.64rem] leading-relaxed text-muted-foreground">
        {enabled
          ? "This agent can save notes you ask it to remember, and reads them in later conversations."
          : "Off: no memory tools and no saved note reaches the model. The notes are kept."}
      </p>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.64rem] text-destructive">
          {error}
        </p>
      ) : null}

      {notes.length > 0 ? (
        <div className={cn("mt-2", !enabled && "opacity-60")}>
          <MemoryGraphView graph={graph} compact />
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-lg border border-border/70 bg-muted/20 px-2 py-1.5"
            >
              <p
                className={cn(
                  "text-[0.66rem] leading-relaxed",
                  enabled ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {memoryExcerpt(note.content, 96)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.55rem] text-muted-foreground">
                <span className="tabular-nums">#{note.id}</span>
                <span>{note.source === "owner" ? "yours" : "learned"}</span>
                {note.useCount > 0 ? (
                  <span className="tabular-nums">recalled {note.useCount}×</span>
                ) : null}
                {note.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-border px-2 py-1.5 text-[0.63rem] text-muted-foreground">
          Nothing remembered yet. Say “remember this” in chat.
        </p>
      )}

      <Link
        href="/dashboard/memory"
        className="mt-2 inline-flex items-center gap-1 text-[0.64rem] font-medium text-brand-ink hover:underline"
      >
        Open Memory
        <ArrowUpRight className="size-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

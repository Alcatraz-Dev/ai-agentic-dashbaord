"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateAgentToolsAction } from "@/app/actions/agents";
import { Switch } from "@/components/ui/switch";
import {
  AGENT_TOOL_OPTIONS,
  resolveAgentToolIds,
  type AgentToolId,
} from "@/lib/agent-tool-options";

/**
 * The built-in tools the agent may call, one switch per tool.
 *
 * `agents.enabled_tools` stores the ids; `null` (older rows) means all of them,
 * so the section resolves the stored value first and always writes the full
 * list back. The chat composer's Browser chip edits the same column, and both
 * surfaces re-read it through `router.refresh()`.
 */
export function AgentToolsSection({
  agentId,
  enabledTools,
}: {
  agentId: number;
  enabledTools: string[] | null;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<AgentToolId[]>(() => resolveAgentToolIds(enabledTools));
  const [saving, setSaving] = useState<AgentToolId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The chat's Browser chip edits the same column; a server refresh hands us a
  // new array, so follow it instead of trusting local state alone.
  useEffect(() => {
    setEnabled(resolveAgentToolIds(enabledTools));
  }, [enabledTools]);

  async function toggle(id: AgentToolId) {
    if (saving) return;

    const previous = enabled;
    const next = previous.includes(id)
      ? previous.filter((tool) => tool !== id)
      : [...previous, id];

    setEnabled(next);
    setSaving(id);
    setError(null);

    try {
      const result = await updateAgentToolsAction({ id: agentId, tools: next });

      if (!result.ok) {
        setEnabled(previous);
        setError(result.error);
        return;
      }

      setEnabled(resolveAgentToolIds(result.agent.enabledTools));
      router.refresh();
    } catch (toggleError) {
      console.error("[agents] tool toggle failed", toggleError);
      setEnabled(previous);
      setError("We couldn't save that setting. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Tools
        </p>
        <span className="text-[0.66rem] text-muted-foreground tabular-nums">
          {enabled.length}/{AGENT_TOOL_OPTIONS.length} on
        </span>
      </div>

      <div className="mt-1.5 divide-y divide-border/50">
        {AGENT_TOOL_OPTIONS.map((option) => {
          const on = enabled.includes(option.id);

          return (
            <div
              key={option.id}
              className="flex items-start justify-between gap-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-[0.74rem] font-medium">{option.name}</p>
                <p className="mt-0.5 text-[0.66rem] leading-snug text-muted-foreground">
                  {option.description}
                </p>
              </div>
              <Switch
                size="sm"
                className="mt-0.5 shrink-0"
                checked={on}
                disabled={saving !== null}
                onCheckedChange={() => toggle(option.id)}
                aria-label={`${on ? "Turn off" : "Turn on"} ${option.name}`}
              />
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.7rem] text-destructive">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[0.66rem] leading-snug text-muted-foreground">
          Turning a tool off removes it from this agent&apos;s prompt and loop. Chat still works
          without any.
        </p>
      )}
    </div>
  );
}

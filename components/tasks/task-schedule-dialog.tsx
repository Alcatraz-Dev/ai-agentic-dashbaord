"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";

import { createAgentScheduleAction } from "@/app/actions/schedules";
import { linkTaskScheduleAction, setTaskToolsAction } from "@/app/actions/tasks";
import { AGENT_TOOL_OPTIONS } from "@/lib/agent-tool-options";
import { ScheduleRuleFields } from "@/components/agents/schedule-rule-fields";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import type { TaskLibrary } from "@/components/tasks/task-board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  browserTimeZone,
  normalizeScheduleRule,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE } from "@/lib/schedule-rule";
import {
  taskRunPrompt,
  taskToolCount,
  type TaskAgentRef,
  type TaskRoleRecord,
  type TaskSummary,
} from "@/lib/task-types";
import { cn } from "@/lib/utils";

/**
 * Turns one board card into an agent schedule.
 *
 * The card stays the board's row: this dialog creates a normal agent schedule
 * (same rule fields, same CloudHike Jobs mirror) whose prompt is the card, its
 * open steps, the tools picked for it and the chosen role's brief, then records
 * the schedule on the card so the board can show it is running. Nothing is
 * scheduled until Run schedule.
 */
export function TaskScheduleDialog({
  task,
  agents,
  roles,
  library,
  open,
  onOpenChange,
  onScheduled,
}: {
  task: TaskSummary | null;
  agents: TaskAgentRef[];
  roles: TaskRoleRecord[];
  library: TaskLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The refreshed board, after the schedule was linked. */
  onScheduled: (tasks: TaskSummary[]) => void;
}) {
  const [agentId, setAgentId] = useState("");
  const [roleKey, setRoleKey] = useState("");
  /** Saved onto the card, so every scheduled run of it gets the same picks. */
  const [builtin, setBuiltin] = useState<string[]>([]);
  const [rule, setRule] = useState<ScheduleRule>(() =>
    normalizeScheduleRule(
      { frequency: "daily", times: [{ hour: 9, minute: 0 }], timezone: browserTimeZone() },
      DEFAULT_WIDGET_SCHEDULE_RULE,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each card opens on its own staffing: the first assigned role and its agent.
  useEffect(() => {
    if (!task) return;

    const first = task.assignees.find((entry) => entry.agent);
    setAgentId(String(first?.agent?.id ?? agents[0]?.id ?? ""));
    setRoleKey(first?.role.key ?? task.assignees[0]?.role.key ?? roles[0]?.key ?? "");
    setBuiltin(task.tools.builtin ?? []);
    setError(null);
  }, [task, agents, roles]);

  const agent = agents.find((entry) => entry.id === Number(agentId)) ?? null;
  const chosen = useMemo(
    () => roles.find((role) => role.key === roleKey) ?? null,
    [roles, roleKey],
  );

  const mcpLabels = useMemo(
    () => Object.fromEntries(library.mcpServers.map((server) => [server.id, server.label])),
    [library.mcpServers],
  );

  async function submit() {
    if (!task || saving) return;

    const target = Number(agentId);
    if (!agent || !Number.isInteger(target) || target <= 0) {
      setError("Pick the agent that should run this card.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // The card owns the picks: save them first so the schedule's brief (and
      // every later run) reads the same list the owner just chose here.
      const changed =
        builtin.length !== task.tools.builtin.length ||
        builtin.some((id) => !task.tools.builtin.includes(id));

      if (changed) {
        const saved = await setTaskToolsAction({
          id: task.id,
          builtin,
          skills: task.tools.skills,
          diagrams: task.tools.diagrams,
          plugins: task.tools.plugins,
          mcpServers: task.tools.mcpServers,
          apps: task.tools.apps,
        });

        if (!saved.ok) {
          setError(saved.error);
          return;
        }
      }

      const created = await createAgentScheduleAction({
        agentId: target,
        title: task.title,
        prompt: taskRunPrompt(
          { ...task, tools: { ...task.tools, builtin } },
          chosen
            ? { key: chosen.key, label: chosen.label, prompt: chosen.prompt }
            : { key: "lead", label: "Lead", prompt: "" },
          mcpLabels,
        ),
        rule,
      });

      if (!created.ok) {
        setError(created.error);
        return;
      }

      const linked = await linkTaskScheduleAction({ id: task.id, scheduleId: created.schedule.id });
      if (!linked.ok) {
        setError(
          "The schedule was created, but the card could not be linked to it. Open the agent's Scheduling tab to check it.",
        );
        return;
      }

      onScheduled(linked.tasks);
    } catch (scheduleError) {
      console.error("[tasks] schedule failed", scheduleError);
      setError("We couldn't schedule that card. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            Schedule this card
          </DialogTitle>
        </DialogHeader>

        {task ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                #{task.id} · {task.title}
              </p>
              {task.notes ? (
                <p className="mt-1 line-clamp-2 text-[0.72rem] leading-relaxed text-muted-foreground">
                  {task.notes}
                </p>
              ) : null}
              <p className="mt-1 text-[0.64rem] text-muted-foreground tabular-nums">
                {task.steps.filter((step) => step.done).length}/{task.steps.length} steps done ·{" "}
                {taskToolCount({ ...task.tools, builtin })} tools picked
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Agent
                </span>
                <select
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Pick an agent…</option>
                  {agents.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Role
                </span>
                <select
                  value={roleKey}
                  onChange={(event) => setRoleKey(event.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {roles.length === 0 && <option value="">No roles</option>}
                  {roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {agent ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
                <AgentAvatar avatar={agent.avatar} color={agent.color} className="mt-0.5 size-6" />
                <div className="min-w-0">
                  <p className="truncate text-[0.72rem] font-medium">
                    {agent.name} · {chosen?.label ?? "Lead"}
                  </p>
                  <p className="line-clamp-3 text-[0.64rem] leading-relaxed text-muted-foreground">
                    {chosen?.prompt || chosen?.hint || "The card's own notes are the brief."}
                  </p>
                </div>
                {chosen ? (
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold ring-1",
                      chosen.tone,
                    )}
                  >
                    {chosen.label}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-border bg-card px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.62rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  Built-in tools for this card
                </span>
                <span className="text-[0.6rem] text-muted-foreground tabular-nums">
                  {builtin.length > 0 ? `${builtin.length} picked` : "agent's own"}
                </span>
              </div>
              <p className="mt-0.5 text-[0.62rem] leading-relaxed text-muted-foreground">
                Saved on the card, so every scheduled run uses them. With nothing picked the
                agent&apos;s own switches stay in charge.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {AGENT_TOOL_OPTIONS.map((option) => {
                  const active = builtin.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      disabled={saving}
                      onClick={() =>
                        setBuiltin((current) =>
                          current.includes(option.id)
                            ? current.filter((id) => id !== option.id)
                            : [...current, option.id],
                        )
                      }
                      className={cn(
                        "max-w-full truncate rounded-full px-2 py-0.5 text-[0.64rem] font-medium ring-1 transition-colors",
                        active
                          ? "bg-brand-soft text-brand-ink ring-brand-border"
                          : "bg-card text-muted-foreground ring-border hover:text-foreground",
                      )}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

            {error ? (
              <p className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 px-2.5 text-[0.74rem]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !task || !agent}
            className="h-8 gap-1.5 px-3 text-[0.74rem]"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? "Scheduling…" : "Run schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

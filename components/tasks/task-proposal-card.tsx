"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ListChecks,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

import { createTaskAction } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_ASSIGNEES_MAX,
  TASK_NOTES_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_ROLE_OPTIONS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TITLE_MAX,
  dueLabel,
  getTaskRole,
  type TaskPriority,
  type TaskProposal,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/task-types";
import { cn } from "@/lib/utils";

/**
 * The agent's task card, as a form rather than a sentence.
 *
 * The same shape as the schedule proposal: everything is editable, nothing is
 * written until the owner clicks Add to board, and that click calls the exact
 * server action the board's own composer uses. So a chat card and a manual card
 * are the same row with the same validation — and a card accepted here records
 * which agent's chat proposed it, plus the roles the work needs.
 */
export function TaskProposalCard({
  proposal,
  agentId,
  onAdded,
  onDismiss,
}: {
  proposal: TaskProposal;
  /** The chat agent; the created card keeps a link back to this conversation. */
  agentId?: number;
  onAdded?: (task: TaskSummary | null) => void;
  onDismiss?: () => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [notes, setNotes] = useState(proposal.notes ?? "");
  const [status, setStatus] = useState<TaskStatus>(proposal.status);
  const [priority, setPriority] = useState<TaskPriority>(proposal.priority);
  const [dueDate, setDueDate] = useState(proposal.dueDate ?? "");
  const [roles, setRoles] = useState<string[]>(proposal.roles);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<TaskSummary | null>(null);
  const [addedTitle, setAddedTitle] = useState("");

  function toggleRole(role: string) {
    setRoles((current) => {
      if (current.includes(role)) return current.filter((entry) => entry !== role);
      if (current.length >= TASK_ASSIGNEES_MAX) return current;
      return [...current, role];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || added) return;

    setSaving(true);
    setError(null);

    try {
      const result = await createTaskAction({
        title,
        notes,
        status,
        priority,
        dueDate: dueDate || null,
        sourceAgentId: agentId ?? null,
        roles,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAddedTitle(title.trim());
      setAdded(result.task ?? null);
      onAdded?.(result.task ?? null);
    } catch (submitError) {
      console.error("[tasks] card confirmation failed", submitError);
      setError("We couldn't add that card. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (added || addedTitle) {
    return (
      <div className="ml-6 max-w-[96%] overflow-hidden rounded-2xl border border-bg-card bg-card/60 text-foreground shadow-sm sm:max-w-[90%] md:max-w-[720px]"
>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-600/25">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.82rem] font-semibold">“{addedTitle}” is on the board.</p>
            <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
              {TASK_STATUS_LABELS[status]}
              {added?.dueDate ? ` · due ${dueLabel(added.dueDate)?.toLowerCase()}` : ""}
              {roles.length > 0 ? ` · ${roles.map((role) => getTaskRole(role).label).join(", ")}` : ""}
              {added ? ` · card #${added.id}` : ""}
            </p>
            <Link
              href="/dashboard/tasks"
              className="mt-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-emerald-700 underline-offset-4 hover:underline"
            >
              Open the board
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="premium-panel ml-6 w-full max-w-[96%] overflow-hidden rounded-2xl border border-card shadow-sm sm:max-w-[90%] md:max-w-[720px]"
    >
      <div className="flex items-start gap-3 border-b border-border/60 bg-card px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm">
          <ListChecks className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.82rem] font-semibold">
            Add this to the task board?
            <Sparkles className="size-3 text-brand-ink" />
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            {proposal.summary}
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <label className="block">
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Title
          </span>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TASK_TITLE_MAX}
            autoComplete="off"
            placeholder="What needs doing?"
            className="mt-1 h-9 text-[0.82rem]"
          />
        </label>

        <label className="block">
          <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Notes <span className="font-medium normal-case tracking-normal">(optional)</span>
          </span>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={TASK_NOTES_MAX}
            rows={2}
            placeholder="Context, links, what done looks like…"
            className="mt-1 text-[0.8rem]"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Step
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TASK_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {TASK_STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Priority
            </span>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TASK_PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {TASK_PRIORITY_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Due date
            </span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Roles this card needs
            </span>
            <span className="text-[0.62rem] text-muted-foreground tabular-nums">
              {roles.length}/{TASK_ASSIGNEES_MAX}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {TASK_ROLE_OPTIONS.map((option) => {
              const active = roles.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  title={option.hint}
                  onClick={() => toggleRole(option.id)}
                  className={cn(
                    "rounded-full px-2 py-1 text-[0.66rem] font-medium ring-1 transition",
                    active
                      ? option.tone
                      : "bg-card text-muted-foreground ring-border hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[0.62rem] leading-relaxed text-muted-foreground">
            They start on this agent. On the board you can put a different agent on each role and
            schedule any of them to run the card.
          </p>
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border/50 bg-background/60 px-4 py-2.5">
        <Button
          type="submit"
          size="sm"
          disabled={saving || !title.trim()}
          className="h-8 gap-2 rounded-xl px-4 text-[0.75rem] font-semibold"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {saving ? "Adding…" : "Add to board"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={onDismiss}
          className="h-8 gap-1 rounded-xl px-3 text-[0.75rem] font-medium text-muted-foreground"
        >
          <X className="size-3.5" />
          Not now
        </Button>
        <span className="ml-auto hidden text-[0.64rem] font-medium tracking-tight text-muted-foreground/70 uppercase sm:block">
          Nothing saved yet
        </span>
      </div>
    </form>
  );
}

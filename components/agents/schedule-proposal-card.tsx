"use client";

import { useState, type FormEvent } from "react";
import { CalendarClock, Check, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { createAgentScheduleAction } from "@/app/actions/schedules";
import { ScheduleRuleFields } from "@/components/agents/schedule-rule-fields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { describeScheduleAction } from "@/lib/schedule-action";
import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_TITLE_MAX_LENGTH,
  describeSchedule,
  type AgentScheduleProposal,
  type AgentScheduleSummary,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";

function formatNext(iso: string | null, timezone: string): string {
  if (!iso) return "Not scheduled";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  try {
    return date.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return date.toLocaleString();
  }
}

/**
 * The agent's schedule proposal as a form, not a sentence.
 *
 * Everything the owner may want to change is editable before anything is
 * created. Confirm is the only path that writes, and the server creates the
 * CloudHike Jobs schedule; the model never creates one directly.
 */
export function ScheduleProposalCard({
  agentId,
  proposal,
  onCreated,
  onDismiss,
}: {
  agentId: number;
  proposal: AgentScheduleProposal;
  onCreated?: (schedule: AgentScheduleSummary) => void;
  onDismiss?: () => void;
}) {
  const [title, setTitle] = useState(proposal.title);
  const [prompt, setPrompt] = useState(proposal.prompt);
  const [rule, setRule] = useState<ScheduleRule>(proposal.rule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<AgentScheduleSummary | null>(null);
  /** The agent may propose a send; the owner can still decline it here. */
  const [allowAction, setAllowAction] = useState(Boolean(proposal.action));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || created) return;

    setSaving(true);
    setError(null);

    try {
      const result = await createAgentScheduleAction({
        agentId,
        title,
        prompt,
        rule,
        linkedWidgetId: proposal.linkedWidgetId,
        action: allowAction ? proposal.action : null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCreated(result.schedule);
      onCreated?.(result.schedule);
    } catch (submitError) {
      console.error("[agents] schedule confirmation failed", submitError);
      setError("We couldn't create that schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="ml-6 max-w-[96%] overflow-hidden rounded-2xl border border-card bg-card/60 text-foreground shadow-sm sm:max-w-[90%] md:max-w-[720px]"
>
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-600/25">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.82rem] font-semibold">“{created.title}” is scheduled.</p>
            <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
              {describeSchedule({ rule: created.rule })} · Next run{" "}
              {formatNext(created.nextRunAt, created.rule.timezone)}.
            </p>
            {created.action ? (
              <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
                Every run may send: <strong>{describeScheduleAction(created.action)}</strong> —
                nothing else changes data.
              </p>
            ) : null}
            <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
              {created.jobsScheduleId
                ? "CloudHike Jobs will start it on time. Results land in the chat and in Scheduling → History."
                : created.jobsError
                  ? `${created.jobsError} The app's fallback timer will run it until the public URL is set.`
                  : "Saving its CloudHike Jobs schedule…"}
            </p>
            <p className="mt-1.5 text-[0.66rem] font-medium text-emerald-700">
              Pause, edit or run it from Scheduling → Regular Scheduling.
            </p>
          </div>
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
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.82rem] font-semibold">
            Confirm this schedule
            <Sparkles className="size-3 text-brand-ink" />
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            {proposal.summary} Check the name, prompt, date/time and frequency, then confirm.
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <TextField
          id={`schedule-title-${proposal.id}`}
          label="Name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={SCHEDULE_TITLE_MAX_LENGTH}
          counter
          autoComplete="off"
          size="sm"
        />

        <TextArea
          id={`schedule-prompt-${proposal.id}`}
          label="What the agent should do"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={SCHEDULE_PROMPT_MAX_LENGTH}
          counter
          minRows={3}
          maxRows={8}
        />

        {proposal.action ? (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5">
            <p className="text-[0.64rem] font-semibold tracking-wide text-amber-800 uppercase">
              This schedule will send
            </p>
            <p className="mt-1 text-[0.76rem] font-medium text-foreground">
              {describeScheduleAction(proposal.action)}
            </p>
            <p className="mt-0.5 text-[0.66rem] leading-relaxed text-muted-foreground">
              One action only, at most {proposal.action.maxPerRun} send
              {proposal.action.maxPerRun === 1 ? "" : "s"} per run. The app forces this
              destination and refuses any other recipient or data change.
            </p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <span className="text-[0.68rem] leading-relaxed text-muted-foreground">
                Allow this send on each run. Turn it off to keep the schedule read-only and
                approve every send by hand.
              </span>
              <Switch
                size="sm"
                checked={allowAction}
                onCheckedChange={setAllowAction}
                aria-label="Allow this send on each run"
                className="mt-0.5 shrink-0"
              />
            </div>
          </div>
        ) : null}

        <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

        {error && (
          <p role="alert" className="text-[0.72rem] text-destructive">
            <TriangleAlert className="mr-1 inline size-3" />
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border/60 bg-card px-3 py-2">
        <Button
          type="submit"
          size="sm"
          disabled={saving || !title.trim() || !prompt.trim()}
          className="brand-gradient h-7 gap-1.5 rounded-lg px-2.5 text-[0.7rem] font-medium text-brand-on shadow-sm shadow-black/10 hover:opacity-90"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          {saving ? "Scheduling…" : "Confirm schedule"}
        </Button>
        {onDismiss && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={onDismiss}
            className="h-7 rounded-lg px-2 text-[0.7rem] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </Button>
        )}
        <span className="ml-auto hidden text-[0.6rem] text-muted-foreground sm:block">
          Nothing runs until you confirm
        </span>
      </div>
    </form>
  );
}

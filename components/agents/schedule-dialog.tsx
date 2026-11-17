"use client";

import { useState, type FormEvent } from "react";
import { CalendarClock, Check, Loader2 } from "lucide-react";

import {
  createAgentScheduleAction,
  updateAgentScheduleAction,
} from "@/app/actions/schedules";
import { ScheduleRuleFields } from "@/components/agents/schedule-rule-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { Label } from "@/components/ui/label";
import {
  SCHEDULE_PROMPT_MAX_LENGTH,
  SCHEDULE_TITLE_MAX_LENGTH,
  browserTimeZone,
  describeSchedule,
  type AgentScheduleSummary,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE } from "@/lib/schedule-rule";
import { describeScheduleAction } from "@/lib/schedule-action";
import type { WidgetRecord } from "@/lib/widget-types";

const FIELD_LABEL = "text-[0.72rem]";

function defaultRule(): ScheduleRule {
  return {
    ...DEFAULT_WIDGET_SCHEDULE_RULE,
    times: [{ hour: 9, minute: 0 }],
    timezone: browserTimeZone(),
  };
}

export function ScheduleDialog({
  open,
  onOpenChange,
  agentId,
  schedule,
  widgets,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number;
  schedule: AgentScheduleSummary | null;
  widgets: WidgetRecord[];
  onSaved: (schedule: AgentScheduleSummary) => void;
}) {
  const [title, setTitle] = useState(schedule?.title ?? "");
  const [prompt, setPrompt] = useState(schedule?.prompt ?? "");
  const [rule, setRule] = useState<ScheduleRule>(schedule?.rule ?? defaultRule());
  const [linkedWidgetId, setLinkedWidgetId] = useState<number | null>(
    schedule?.linkedWidgetId ?? null,
  );
  /** Editing keeps the confirmed send unless the owner removes it. */
  const [keepAction, setKeepAction] = useState(Boolean(schedule?.action));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(schedule);

  function reset() {
    setTitle(schedule?.title ?? "");
    setPrompt(schedule?.prompt ?? "");
    setRule(schedule?.rule ?? defaultRule());
    setLinkedWidgetId(schedule?.linkedWidgetId ?? null);
    setKeepAction(Boolean(schedule?.action));
    setError(null);
    setSaving(false);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError(null);
    setSaving(true);

    try {
      const result = schedule
        ? await updateAgentScheduleAction({
            id: schedule.id,
            title,
            prompt,
            rule,
            linkedWidgetId,
            action: keepAction ? schedule.action : null,
          })
        : await createAgentScheduleAction({
            agentId,
            title,
            prompt,
            rule,
            linkedWidgetId,
          });

      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onSaved(result.schedule);
      reset();
    } catch (submitError) {
      console.error("[agents] schedule save request failed", submitError);
      setError("We couldn't save that schedule. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="flex items-start gap-3 pr-8">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="font-heading text-base font-semibold">
                  {isEdit ? "Edit task" : "New scheduled task"}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                  The agent runs this prompt on the rule you pick. CloudHike Jobs owns the clock.
                </DialogDescription>
              </div>
            </div>

            <TextField
              id="schedule-title"
              label="Name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={SCHEDULE_TITLE_MAX_LENGTH}
              placeholder="e.g. Morning source sweep"
              autoComplete="off"
            />

            <TextArea
              id="schedule-prompt"
              label="Prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              maxLength={SCHEDULE_PROMPT_MAX_LENGTH}
              minRows={3}
              maxRows={8}
              counter
              placeholder="Summarise the news about our competitors and list anything urgent."
            />

            <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

            {schedule?.action ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2.5">
                <p className="text-[0.62rem] font-semibold tracking-wide text-amber-800 uppercase">
                  Confirmed send
                </p>
                <p className="mt-1 text-[0.76rem] font-medium text-foreground">
                  {describeScheduleAction(schedule.action)}
                </p>
                <p className="mt-0.5 text-[0.66rem] leading-relaxed text-muted-foreground">
                  Only this action runs without asking; the destination is forced and no other
                  recipient or data change is allowed.
                </p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <span className="text-[0.68rem] leading-relaxed">
                    Keep this send on each run. Turn it off to make the task read-only and approve
                    every send by hand.
                  </span>
                  <Switch
                    size="sm"
                    checked={keepAction}
                    onCheckedChange={setKeepAction}
                    aria-label="Keep this send on each run"
                    className="mt-0.5 shrink-0"
                  />
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[0.64rem] leading-relaxed text-muted-foreground">
                This task can only read. To let it send or post on its own, ask the agent in chat —
                it lists the exact action and destination on the confirmation form.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className={FIELD_LABEL}>Refresh a widget after each run</Label>
              <Select
                options={[
                  { value: "", label: "Nothing linked" },
                  ...widgets.map((widget) => ({ value: String(widget.id), label: widget.title })),
                ]}
                value={linkedWidgetId === null ? "" : String(linkedWidgetId)}
                onChange={(value) => setLinkedWidgetId(value ? Number(value) : null)}
                placeholder="Nothing linked"
                aria-label="Widget to refresh after each run"
                className="w-full"
              />
              <p className="text-[0.62rem] leading-relaxed text-muted-foreground">
                The linked widget gets fresh data right after a successful run, on top of its own
                update schedule.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-[0.72rem] text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 flex-col gap-2 rounded-none border-t border-border/60 bg-muted/40 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end">
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full text-[0.78rem] sm:w-auto"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !title.trim() || !prompt.trim()}
              className="h-9 w-full gap-1.5 px-4 text-[0.78rem] sm:w-auto"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Schedule task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

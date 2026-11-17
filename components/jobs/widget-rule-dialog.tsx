"use client";

import { useState, type FormEvent } from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";

import { updateWidgetScheduleAction } from "@/app/actions/widgets";
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
import { browserTimeZone, type ScheduleRule } from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE } from "@/lib/schedule-rule";

function defaultRule(): ScheduleRule {
  return {
    ...DEFAULT_WIDGET_SCHEDULE_RULE,
    times: [{ hour: 9, minute: 0 }],
    timezone: browserTimeZone(),
  };
}

/**
 * Edit a widget's refresh rule. Widgets have no prompt or confirmed send, so
 * this is the same rule editor the agent panel uses, minus the agent-only
 * fields.
 */
export function WidgetRuleDialog({
  open,
  onOpenChange,
  widget,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widget: { id: number; title: string; scheduleRule: ScheduleRule } | null;
  onSaved: () => void;
}) {
  const [rule, setRule] = useState<ScheduleRule>(widget?.scheduleRule ?? defaultRule());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!widget || saving) return;

    setError(null);
    setSaving(true);

    try {
      const result = await updateWidgetScheduleAction({ id: widget.id, rule });
      if (!result.ok) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onSaved();
    } catch (submitError) {
      console.error("[jobs] widget schedule save request failed", submitError);
      setError("We couldn't save that schedule. Please try again.");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="flex items-start gap-3 pr-8">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
                <RefreshCw className="size-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="font-heading text-base font-semibold">
                  Edit update schedule
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                  {widget?.title} refreshes itself on the rule you pick. CloudHike Jobs owns the
                  clock.
                </DialogDescription>
              </div>
            </div>

            <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

            {error && (
              <p role="alert" className="text-[0.72rem] text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-end gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2.5">
            <DialogClose
              render={
                <Button type="button" variant="ghost" size="sm" className="h-8 text-[0.74rem]" />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="h-8 gap-1.5 rounded-lg px-3 text-[0.74rem]"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

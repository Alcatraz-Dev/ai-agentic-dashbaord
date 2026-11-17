"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2 } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
  browserTimeZone,
  describeScheduleRule,
  nextRunForRule,
  type ScheduleRule,
} from "@/lib/schedule-rule";
import type { WidgetRecord } from "@/lib/widget-types";

/**
 * "Update schedule" for one widget.
 *
 * The same rule form the chat's schedule card uses, so a widget and an agent
 * task mean the same thing by "daily at 08:00 and 18:00". Saving writes the
 * row and re-syncs its CloudHike Jobs cron; the dashboard and the panel both
 * open this dialog.
 */
export function WidgetScheduleDialog({
  widget,
  open,
  onOpenChange,
  onSaved,
}: {
  widget: WidgetRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (widget: WidgetRecord) => void;
}) {
  const router = useRouter();
  const base = widget?.scheduleRule ?? null;
  const [rule, setRule] = useState<ScheduleRule>(
    base ?? {
      frequency: "daily",
      timezone: browserTimeZone(),
      times: [
        { hour: 8, minute: 0 },
        { hour: 18, minute: 0 },
      ],
      weekday: 1,
      monthDay: 1,
      date: null,
      intervalMinutes: 720,
    },
  );
  const [enabled, setEnabled] = useState(widget?.refreshEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!widget) return null;

  const next = nextRunForRule(rule);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const result = await updateWidgetScheduleAction({ id: widget!.id, rule, enabled });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.add({
        title: `${widget!.title} · schedule updated`,
        description: enabled
          ? describeScheduleRule(result.widget.scheduleRule)
          : "Automatic updates are paused.",
        type: "success",
      });
      onSaved?.(result.widget);
      onOpenChange(false);
      router.refresh();
    } catch (saveError) {
      console.error("[widgets] schedule dialog save failed", saveError);
      setError("We couldn't save that schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-lg mx-auto rounded-2xl border bg-card/90 backdrop-blur-sm shadow-xl"
      >
        <div className="p-5 space-y-4">
          {/* Header with calendar icon and trimmed title */}
          <div className="flex items-start gap-3">
            <span
              className="bg-brand-soft grid size-9 shrink-0 place-items-center rounded-lg text-brand-ink ring-1 ring-brand-border"
            >
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-lg font-medium">
                Update schedule for “{widget.title}”
              </DialogTitle>
              <DialogDescription className="mt-1 text-[0.74rem] leading-relaxed text-muted-foreground">
                “{widget.title}” re-reads what it tracks on this schedule and replaces only its
                data.
              </DialogDescription>
            </div>
          </div>

          {/* Rule fields */}
          <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

          {/* Automatic updates toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
            <div>
              <Label className="text-[0.72rem]">Automatic updates</Label>
              <p className="text-[0.62rem] text-muted-foreground">
                {enabled ? "On — pause it any time." : "Paused — the data stays as it is."}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Automatic widget updates"
            />
          </div>

          {/* Schedule details with responsive ellipsis */}
          <div className="bg-brand-soft rounded-lg border border-brand-border px-3 py-2">
            <p className="text-[0.62rem] font-semibold tracking-wide text-brand-ink uppercase">
              Schedule details
            </p>
            <p className="mt-1 text-[0.7rem] text-muted-foreground line-clamp-2">
              {describeScheduleRule(rule)}
            </p>
            <p className="text-[0.58rem] text-muted-foreground">
              {enabled && next
                ? `Next update ${next.toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: rule.timezone,
                  })}`
                : enabled
                  ? "No future run — pick a later date."
                  : "Saved paused; resume whenever you like."}
            </p>
          </div>

          {widget.jobsError ? (
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[0.66rem] leading-relaxed text-amber-800">
              {widget.jobsError}
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-[0.7rem] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter
          className="flex-row items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-3 py-2"
        >
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[0.7rem]"
              >
                Cancel
              </Button>
            }
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
            className="h-7 rounded-lg px-3 text-[0.7rem]"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
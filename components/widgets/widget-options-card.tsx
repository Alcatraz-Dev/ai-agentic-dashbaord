"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, LayoutGrid, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/widgets/widget-card";
import { WidgetScheduleDialog } from "@/components/widgets/widget-schedule-dialog";
import { describeScheduleRule } from "@/lib/schedule-rule";
import {
  getWidgetDesign,
  getWidgetForm,
  type WidgetDesignOption,
  type WidgetProposal,
  type WidgetRecord,
} from "@/lib/widget-types";
import { cn } from "@/lib/utils";

export type WidgetChoiceResult =
  | { ok: true; widget: WidgetRecord }
  | { ok: false; error: string };

/**
 * The style picker.
 *
 * Renders every offered style with the real widget component, so the choice is what
 * the dashboard will actually show. The chosen design is sent to the server;
 * the widget is created at medium size and the app, not the model, confirms it.
 *
 * Colours follow the active palette so the picker matches the user's theme.
 */
export function WidgetOptionsCard({
  proposal,
  onChoose,
}: {
  proposal: WidgetProposal;
  onChoose: (option: WidgetDesignOption) => Promise<WidgetChoiceResult>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<WidgetRecord | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(option: WidgetDesignOption) {
    if (pending || added) return;
    setPending(`${option.form}:${option.design}`);
    setError(null);

    try {
      const result = await onChoose(option);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded(result.widget);
    } catch {
      setError("The widget couldn't be added. Please try again.");
    } finally {
      setPending(null);
    }
  }

  if (added) {
    return (
      <>
      <div className="ml-9 max-w-[88%] overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background via-card/90 to-background/90 text-foreground shadow-[0_30px_80px_-40px_rgba(0,0,0,0.12)] ring-1 ring-border/50 sm:max-w-[75%] backdrop-blur-sm">
        <div className="flex items-start gap-2.5 px-5 py-4">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-from text-white brand-shadow-sm">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.85rem] font-semibold tracking-tight text-foreground">
              “{added.title}” is on your dashboard.
            </p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
              Added at medium size, with all three sizes ready.
            </p>

            {/* The schedule card: every new widget starts twice a day, and the
                owner can change it here before leaving the chat. */}
            <div className="mt-3 rounded-2xl border border-border/40 bg-background/80 backdrop-blur-sm px-3 py-2.5">
              <p className="flex items-center gap-1 text-[0.65rem] font-semibold tracking-wide text-brand-ink uppercase">
                <CalendarClock className="size-2.5" />
                Update schedule
              </p>
              <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                {describeScheduleRule(added.scheduleRule)}
              </p>
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground/80">
                {added.nextRefreshAt
                  ? `First update ${new Date(added.nextRefreshAt).toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: added.scheduleRule.timezone,
                    })}`
                  : "Paused until you resume it."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSchedule(true)}
                  className="rounded-lg border border-border/60 bg-background px-2.5 py-1 text-[0.68rem] font-medium text-brand-ink transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Change schedule
                </button>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-brand-ink hover:underline"
                >
                  Open dashboard
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WidgetScheduleDialog
        key={`widget-schedule-${added.id}-${editingSchedule ? "open" : "closed"}`}
        widget={added}
        open={editingSchedule}
        onOpenChange={setEditingSchedule}
        onSaved={(saved) => setAdded(saved)}
      />
      </>
    );
  }

  return (
    <div className="ml-9 w-full max-w-[94%] overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background via-card/90 to-background/90 text-foreground shadow-[0_30px_80px_-40px_rgba(0,0,0,0.12)] ring-1 ring-border/50 sm:max-w-[88%] backdrop-blur-sm">
      <div className="flex items-start gap-2.5 border-b border-border/40 bg-background/80 backdrop-blur-sm px-5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl brand-gradient text-brand-on brand-shadow-sm">
          <LayoutGrid className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.85rem] font-semibold tracking-tight text-foreground">
            {proposal.options.length} designs for “{proposal.title}”
            <Sparkles className="size-3.5 text-brand-ink" />
          </p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
            Pick one and I’ll add it to your dashboard at medium size. Every option is a different
            layout and style, chosen from what the data can support. It will refresh twice a day at
            8 AM and 6 PM in your time zone, and you can change or pause that in the Scheduling tab.
          </p>
        </div>
      </div>

      <div className="grid gap-2.5 p-3 sm:grid-cols-2">
        {proposal.options.map((option) => {
          const design = getWidgetDesign(option.design);
          const form = getWidgetForm(option.form);
          const combo = `${option.form}:${option.design}`;
          const isPending = pending === combo;
          const disabled = pending !== null || added !== null;

          return (
            <div
              key={combo}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-sm p-1.5 transition-all hover:border-brand-border/50 hover:shadow-sm hover:-translate-y-0.5",
                isPending && "border-brand-border ring-1 ring-brand-from/20 bg-brand-soft/40",
              )}
            >
              <WidgetCard
                widget={{
                  title: proposal.title,
                  icon: proposal.icon,
                  illustration: proposal.illustration,
                  design: option.design,
                  form: option.form,
                  data: proposal.data,
                  updatedAt: null,
                }}
                size="medium"
                variant="preview"
              />

              <div className="flex items-center gap-1.5 px-1">
                <div className="min-w-0">
                  <p className="truncate text-[0.7rem] font-semibold tracking-tight text-foreground">
                    {form.name} · {design.name}
                  </p>
                  <p className="truncate text-[0.62rem] text-muted-foreground">{design.description}</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.58rem] font-medium text-accent-foreground ring-1 ring-border/50">
                  {form.name}
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => void choose(option)}
                className="h-8 w-full gap-1.5 rounded-xl brand-gradient text-brand-on text-[0.7rem] font-semibold brand-shadow-sm transition-all hover:brand-shadow hover:-translate-y-0.5 disabled:opacity-60 disabled:shadow-none"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    Use this design
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="border-t border-border/40 px-5 py-2.5 text-[0.72rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

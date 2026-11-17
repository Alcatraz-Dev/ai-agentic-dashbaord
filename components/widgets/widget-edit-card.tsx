"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { applyWidgetEditAction } from "@/app/actions/widgets";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/widgets/widget-card";
import {
  describeWidgetRefresh,
  getWidgetDesign,
  getWidgetForm,
  WIDGET_ILLUSTRATION_LABELS,
  type WidgetEditProposal,
  type WidgetRecord,
} from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * The review card for `propose_widget_edit`.
 *
 * A proposal is inert: it shows exactly what would change and renders the
 * proposed card. Only "Apply changes" calls the server action that writes the
 * widget; "Discard" leaves the stored row untouched.
 */

function dataSummary(data: WidgetRecord["data"]): string {
  const parts = [
    `${data.metrics.length} ${data.metrics.length === 1 ? "metric" : "metrics"}`,
    `${data.series.length} ${data.series.length === 1 ? "point" : "points"}`,
    `${data.items.length} ${data.items.length === 1 ? "row" : "rows"}`,
  ];
  return parts.join(" · ");
}

function ChangeRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 text-[0.7rem]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">
        <span className="text-muted-foreground line-through decoration-border">{before}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-medium text-foreground">{after}</span>
      </span>
    </div>
  );
}

export function WidgetEditCard({
  proposal,
  onApplied,
  onDismiss,
  className,
}: {
  proposal: WidgetEditProposal;
  onApplied?: (widget: WidgetRecord) => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const { widget, edit } = proposal;
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<WidgetRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next: WidgetRecord = {
    ...widget,
    title: edit.title ?? widget.title,
    icon: edit.icon ?? widget.icon,
    illustration: edit.illustration ?? widget.illustration,
    design: edit.design ?? widget.design,
    form: edit.form ?? widget.form,
    data: edit.data ?? widget.data,
    sourcePrompt: edit.sourcePrompt !== undefined ? edit.sourcePrompt : widget.sourcePrompt,
    refreshMinutes: edit.refreshMinutes ?? widget.refreshMinutes,
    nextRefreshAt:
      edit.refreshMinutes !== undefined
        ? new Date(Date.now() + edit.refreshMinutes * 60_000).toISOString()
        : widget.nextRefreshAt,
  };

  async function apply() {
    if (applying || applied) return;
    setApplying(true);
    setError(null);

    try {
      const result = await applyWidgetEditAction({ widgetId: widget.id, edit });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApplied(result.widget);
      onApplied?.(result.widget);
    } catch {
      setError("We couldn't apply that change. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  const changes: { label: string; before: string; after: string }[] = [];
  if (edit.title !== undefined) {
    changes.push({ label: "Title", before: widget.title, after: edit.title });
  }
  if (edit.design !== undefined) {
    changes.push({
      label: "Style",
      before: getWidgetDesign(widget.design).name,
      after: getWidgetDesign(edit.design).name,
    });
  }
  if (edit.illustration !== undefined) {
    changes.push({
      label: "Illustration",
      before: WIDGET_ILLUSTRATION_LABELS[widget.illustration],
      after: WIDGET_ILLUSTRATION_LABELS[edit.illustration],
    });
  }
  if (edit.form !== undefined) {
    changes.push({
      label: "Form",
      before: getWidgetForm(widget.form).name,
      after: getWidgetForm(edit.form).name,
    });
  }
  if (edit.data !== undefined) {
    changes.push({
      label: "Data",
      before: dataSummary(widget.data),
      after: dataSummary(edit.data),
    });
  }
  if (edit.sourcePrompt !== undefined) {
    changes.push({
      label: "Tracks",
      before: widget.sourcePrompt ?? "Not set",
      after: edit.sourcePrompt ?? "Not set",
    });
  }
  if (edit.refreshMinutes !== undefined) {
    changes.push({
      label: "Schedule",
      before: describeWidgetRefresh(widget.refreshMinutes),
      after: describeWidgetRefresh(edit.refreshMinutes),
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-brand-border bg-card text-card-foreground shadow-[0_24px_60px_-40px_rgba(15,23,42,0.5)] ring-1 ring-border",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 border-b border-border/60 bg-brand-soft px-4 py-3">
        <span className="brand-gradient grid size-8 shrink-0 place-items-center rounded-xl text-brand-on shadow-sm shadow-black/10">
          {applied ? <Check className="size-4" strokeWidth={3} /> : <Sparkles className="size-3.5" />}
        </span>
        <div className="min-w-0">
          <p className="text-[0.8rem] font-semibold text-card-foreground">
            {applied ? "Changes applied" : "Review this widget change"}
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            {applied
              ? `“${applied.title}” is updated on your dashboard and in this chat.`
              : edit.summary}
          </p>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_13.5rem]">
        <div className="min-w-0 space-y-1.5">
          {changes.length === 0 ? (
            <p className="text-[0.7rem] text-muted-foreground">No visible fields changed.</p>
          ) : (
            changes.map((change) => (
              <ChangeRow
                key={change.label}
                label={change.label}
                before={change.before}
                after={change.after}
              />
            ))
          )}
          <p className="pt-1 text-[0.62rem] text-muted-foreground">
            Nothing changes until you click Apply.
          </p>
        </div>

        <div className="mx-auto w-full max-w-[13.5rem]">
          <WidgetCard
            widget={{
              title: next.title,
              icon: next.icon,
              illustration: next.illustration,
              design: next.design,
              form: next.form,
              data: next.data,
              updatedAt: next.updatedAt,
            }}
            size="medium"
            variant="preview"
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[0.7rem] text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2">
        {applied ? (
          <>
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-emerald-700">
              <Check className="size-3.5" />
              Applied
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              className="ml-auto h-7 rounded-lg px-2.5 text-[0.7rem]"
            >
              Close
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              disabled={applying}
              onClick={() => void apply()}
              className="brand-gradient h-7 gap-1.5 rounded-lg px-2.5 text-[0.7rem] text-brand-on shadow-sm shadow-black/10"
            >
              {applying ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Applying…
                </>
              ) : (
                "Apply changes"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={applying}
              onClick={onDismiss}
              className="h-7 gap-1 rounded-lg px-2 text-[0.7rem] text-muted-foreground"
            >
              <X className="size-3" />
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

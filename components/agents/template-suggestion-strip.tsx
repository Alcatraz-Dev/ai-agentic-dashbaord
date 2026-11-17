"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, LayoutTemplate, Plus } from "lucide-react";

import { applyDashboardTemplateAction } from "@/app/actions/dashboards";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import { Button } from "@/components/ui/button";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";
import { getDashboardTemplate } from "@/lib/dashboard-options";

/**
 * The starting cards of the dashboard's own template, offered inside a chat that
 * has not added a widget yet.
 *
 * This is not a template picker: the dashboard already has a template, so the
 * strip shows that template's cards and only the ones the board is missing.
 * A blank dashboard, or one that already has every card, renders nothing — an
 * agent chat should not ask the owner to pick a template they already chose.
 * Apply calls the same owner-scoped action Dashboard settings uses, which skips
 * titles already on the board, so a card is never doubled.
 */

export function TemplateSuggestionStrip({
  template,
  existingTitles = [],
}: {
  /** The active dashboard's template key; blank (or unknown) hides the strip. */
  template?: string | null;
  /** Titles already on the dashboard, so their cards are not offered again. */
  existingTitles?: string[];
}) {
  const router = useRouter();
  const [applying, setApplying] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blueprint = template ? getTemplateBlueprint(template) : null;
  const present = new Set(
    existingTitles.filter((title) => title?.trim()).map((title) => title.trim().toLowerCase()),
  );
  const missing = (blueprint?.widgets ?? []).filter(
    (widget) => !present.has(widget.title.trim().toLowerCase()),
  );

  if (!blueprint || missing.length === 0) return null;

  const templateName = getDashboardTemplate(template ?? "").name;

  async function apply() {
    if (applying || !template) return;

    setApplying(true);
    setError(null);

    try {
      const result = await applyDashboardTemplateAction(template, { dress: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded(result.added);
      router.refresh();
    } catch {
      setError("We couldn't add those cards. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section
      data-shot="template-strip"
      className="rounded-2xl border border-border bg-card/60 px-3 py-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
          <LayoutTemplate className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.76rem] font-semibold">
            {missing.length === blueprint.widgets.length
              ? `${templateName} starting cards`
              : `${missing.length} ${templateName} card${missing.length === 1 ? "" : "s"} left`}
          </p>
          <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
            From this dashboard&apos;s template: {missing.map((widget) => widget.title).join(", ")}.
            Real setup steps, apps to connect and briefs worth asking for — nothing is measured until
            you connect the apps.
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
        <div className="flex w-[9.5rem] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
          <TemplatePreview template={template!} className="rounded-none" />
          <div className="flex flex-1 items-center gap-1.5 border-t border-border/70 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[0.66rem] font-medium">{templateName}</span>
            {added !== null ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.58rem] font-medium text-emerald-600 dark:text-emerald-300">
                <Check className="size-2.5" strokeWidth={3} />
                {added > 0 ? `${added} added` : "Added"}
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void apply()}
                disabled={applying}
                aria-label={`Add the ${missing.length} missing ${templateName} cards`}
                className="h-5 gap-0.5 rounded-md px-1 text-[0.58rem]"
              >
                {applying ? <Loader2 className="size-2.5 animate-spin" /> : <Plus className="size-2.5" />}
                Add {missing.length}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.66rem] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

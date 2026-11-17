"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, LayoutTemplate, Plus } from "lucide-react";

import { applyDashboardTemplateAction } from "@/app/actions/dashboards";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import { Button } from "@/components/ui/button";
import { DASHBOARD_TEMPLATES } from "@/lib/dashboard-options";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";
import { cn } from "@/lib/utils";

/**
 * The template picks, offered inside the chat that has not added a widget yet.
 *
 * Each card is the template's real starting layout (the same records the server
 * seeds), and Apply calls the same owner-scoped action Dashboard settings uses.
 * Duplicates are skipped server-side, so this never doubles a card that is
 * already on the dashboard.
 */

const OFFERED = DASHBOARD_TEMPLATES.filter((template) => getTemplateBlueprint(template.id)?.widgets.length);

export function TemplateSuggestionStrip() {
  const router = useRouter();
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  async function apply(template: string) {
    if (applying) return;

    setApplying(template);
    setError(null);

    try {
      const result = await applyDashboardTemplateAction(template, { dress: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setApplied((current) => ({ ...current, [template]: result.added }));
      router.refresh();
    } catch {
      setError("We couldn't add those cards. Please try again.");
    } finally {
      setApplying(null);
    }
  }

  if (OFFERED.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card/60 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
          <LayoutTemplate className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.76rem] font-semibold">Start from a template</p>
          <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
            Adds real setup steps, the apps to connect and the briefs worth asking for to your active
            dashboard, and dresses it in the template's portrait and colour. Nothing is measured until
            you connect the apps.
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
        {OFFERED.map((template) => {
          const added = applied[template.id];
          const busy = applying === template.id;

          return (
            <div
              key={template.id}
              className={cn(
                "flex w-[9.5rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-background",
                added !== undefined ? "border-emerald-500/40" : "border-border",
              )}
            >
              <TemplatePreview template={template.id} className="rounded-none" />
              <div className="flex flex-1 items-center gap-1.5 border-t border-border/70 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[0.66rem] font-medium">
                  {template.name}
                </span>
                {added !== undefined ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.58rem] font-medium text-emerald-600 dark:text-emerald-300">
                    <Check className="size-2.5" strokeWidth={3} />
                    {added > 0 ? `${added} added` : "Added"}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void apply(template.id)}
                    disabled={applying !== null}
                    aria-label={`Add the ${template.name} template cards`}
                    className="h-5 gap-0.5 rounded-md px-1 text-[0.58rem]"
                  >
                    {busy ? (
                      <Loader2 className="size-2.5 animate-spin" />
                    ) : (
                      <Plus className="size-2.5" />
                    )}
                    Add
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-1.5 text-[0.66rem] text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

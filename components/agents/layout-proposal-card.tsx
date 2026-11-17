"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LayoutTemplate, Loader2, X } from "lucide-react";

import { applyDashboardTemplateAction } from "@/app/actions/dashboards";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import { Button } from "@/components/ui/button";
import { getDashboardTemplate } from "@/lib/dashboard-options";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";

/**
 * A whole starting layout the agent suggested, previewed with its real cards.
 *
 * Nothing is stored when the model proposes it: Add calls the same owner-scoped
 * action Dashboard settings uses (which skips titles already on the board), and
 * the card dresses the dashboard in the template's clay portrait and colour
 * because a one-click start should look like the layout it just showed.
 */
export function LayoutProposalCard({
  proposal,
  onDismiss,
}: {
  proposal: { id: string; template: string; reason: string };
  onDismiss: () => void;
}) {
  const router = useRouter();
  const blueprint = getTemplateBlueprint(proposal.template);
  const meta = getDashboardTemplate(proposal.template);
  const [state, setState] = useState<"idle" | "applying" | "done">("idle");
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const starterCount = blueprint?.widgets.length ?? 0;

  async function add() {
    if (state !== "idle") return;

    setState("applying");
    setError(null);

    try {
      const result = await applyDashboardTemplateAction(proposal.template, { dress: true });
      if (!result.ok) {
        setError(result.error);
        setState("idle");
        return;
      }

      setAdded(result.added);
      setState("done");
      router.refresh();
    } catch {
      setError("We couldn't add those cards. Please try again.");
      setState("idle");
    }
  }

  return (
    <div className="ml-9 max-w-[94%] overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:max-w-[88%]">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
          <LayoutTemplate className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.78rem] font-semibold">Suggested layout · {meta.name}</p>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-muted-foreground">
            {proposal.reason}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this layout suggestion"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="px-3">
        <TemplatePreview template={proposal.template} className="rounded-xl ring-1 ring-border/70" />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {state === "done" ? (
          <>
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-emerald-600 dark:text-emerald-300">
              <Check className="size-3" strokeWidth={3} />
              {added > 0 ? `${added} cards added` : "Those cards are already on your dashboard"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              nativeButton={false}
              render={<Link href="/dashboard" />}
              className="ml-auto h-6 gap-1 rounded-md px-2 text-[0.62rem]"
            >
              View dashboard
              <ArrowRight className="size-3" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-[0.62rem] text-muted-foreground tabular-nums">
              {starterCount} cards · keeps the ones you already have
            </span>
            <Button
              type="button"
              size="xs"
              onClick={() => void add()}
              disabled={state === "applying"}
              className="ml-auto h-6 gap-1 rounded-md px-2 text-[0.62rem]"
            >
              {state === "applying" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <LayoutTemplate className="size-3" />
              )}
              {state === "applying" ? "Adding…" : "Add cards"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onDismiss}
              disabled={state === "applying"}
              className="h-6 rounded-md px-2 text-[0.62rem]"
            >
              Not now
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="px-3 pb-2.5 text-[0.66rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

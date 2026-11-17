"use client";

import { ArrowRight, LayoutGrid, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The agent's widget offer, as a generative-UI card rather than prose. Accepting
 * sends the yes-message back into the same chat, so the agent can propose the
 * two designs with full context.
 *
 * Colours now follow the active palette (`--brand-*` tokens remapped by
 * globals.css), so the card matches whatever theme the user picked instead of
 * always reading blue.
 */
export function WidgetOfferCard({
  offer,
  onAccept,
  onDismiss,
  busy = false,
}: {
  offer: { id: string; title: string; reason: string };
  onAccept: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <div className="ml-9 max-w-[88%] overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background via-card/90 to-background/90 text-foreground shadow-[0_30px_80px_-40px_rgba(0,0,0,0.12)] ring-1 ring-border/50 sm:max-w-[75%] backdrop-blur-sm">
      <div className="flex items-start gap-3 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl brand-gradient text-brand-on brand-shadow-sm">
          <LayoutGrid className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[0.85rem] font-semibold tracking-tight text-foreground">
            Do you want to add a widget for this?
          </p>
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted-foreground">
            I can create a widget and add it to your dashboard. It will refresh itself twice a day
            at 8 AM and 6 PM in your time zone, and you can change that later.
          </p>
          <p className="mt-2 text-[0.72rem] leading-relaxed text-muted-foreground/90">
            <span className="font-medium text-brand-ink">{offer.title}</span>
            {offer.reason ? ` — ${offer.reason}` : ""}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 border-t border-border/40 px-4 py-3 bg-background/60 backdrop-blur-sm"
      >
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={onAccept}
          className="h-8 gap-2 rounded-xl px-4 text-[0.75rem] font-semibold text-brand-on brand-shadow-sm brand-gradient transition-all hover:brand-shadow hover:-translate-y-0.5"
          style={{ backgroundImage: "linear-gradient(to bottom right, var(--brand-from), var(--brand-to))" }}
        >
          Create widget
          <ArrowRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDismiss}
          className="h-8 gap-1 rounded-xl px-3 text-[0.75rem] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X className="size-3.5" />
          Not now
        </Button>
        <span className="ml-auto hidden text-[0.65rem] text-muted-foreground/70 sm:block font-medium tracking-tight uppercase">
          Two designs · you pick
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LayoutGrid, Loader2, Plus, SlidersHorizontal } from "lucide-react";

import { switchDashboardAction } from "@/app/actions/dashboards";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDashboardPortrait, getDashboardTemplate } from "@/lib/dashboard-options";
import { cn } from "@/lib/utils";

export type SwitcherDashboard = {
  id: number;
  name: string;
  icon: string;
  color: string;
  template: string;
};

/**
 * "Your dashboards" — the picker behind the sidebar's dashboard button.
 *
 * It is a dialog rather than a dropdown so each row can state what the
 * dashboard actually is (its template and how many agents belong to it), which
 * is the same information the other workspace dialogs show. Switching happens
 * here, and the dashboard page is refreshed afterwards so its widgets and agent
 * list belong to the new board.
 */
export function DashboardSwitcherDialog({
  open,
  onOpenChange,
  dashboards,
  activeId,
  agentCounts = {},
  widgetCounts = {},
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboards: SwitcherDashboard[];
  activeId: number;
  /** Agents per dashboard id, so a row says whose team it holds. */
  agentCounts?: Record<number, number>;
  /** Widgets per dashboard id, shown beside the agent count. */
  widgetCounts?: Record<number, number>;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(next: SwitcherDashboard) {
    if (switching !== null) return;

    if (next.id === activeId) {
      onOpenChange(false);
      return;
    }

    setSwitching(next.id);
    setError(null);

    try {
      const result = await switchDashboardAction(next.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't switch dashboards. Please try again.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5">
            <span className="brand-gradient grid size-8 place-items-center rounded-xl text-brand-on shadow-sm shadow-black/10">
              <LayoutGrid className="size-4" />
            </span>
            Your dashboards
          </DialogTitle>
          <DialogDescription>
            Each dashboard keeps its own widgets, layout and agents. Switching takes you to that
            board.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[55vh] overflow-y-auto p-2">
          {dashboards.map((option) => {
            const active = option.id === activeId;
            const agents = agentCounts[option.id] ?? 0;
            const widgetCount = widgetCounts[option.id] ?? 0;
            const template = getDashboardTemplate(option.template);

            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => void pick(option)}
                  aria-current={active ? "true" : undefined}
                  disabled={switching !== null}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
                    active
                      ? "border-brand-border bg-brand-soft/60 ring-1 ring-brand-border"
                      : "border-transparent hover:border-border hover:bg-muted/50",
                  )}
                >
                  <AgentAvatar
                    avatar={getDashboardPortrait(option.icon)}
                    color={option.color}
                    className="size-9 shrink-0 rounded-lg"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.82rem] font-semibold">{option.name}</span>
                    <span className="mt-0.5 block truncate text-[0.66rem] text-muted-foreground">
                      {template.name} template · {agents} {agents === 1 ? "agent" : "agents"} ·{" "}
                      {widgetCount} {widgetCount === 1 ? "widget" : "widgets"}
                    </span>
                  </span>

                  {switching === option.id ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : active ? (
                    <span className="brand-gradient grid size-5 shrink-0 place-items-center rounded-full text-brand-on">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="shrink-0 text-[0.62rem] font-medium text-muted-foreground">
                      Open
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p role="alert" className="px-5 pb-2 text-[0.72rem] text-destructive">
            {error}
          </p>
        ) : null}

        {/* A plain row: DialogFooter's negative margins assume a padded
            dialog, and this content sets p-0 so the list can scroll full width. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard/new" />}
              className="h-8 gap-1.5 rounded-lg px-2.5 text-[0.72rem]"
            >
              <Plus className="size-3.5" />
              New dashboard
            </Button>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard/dashboards" />}
              className="h-8 gap-1.5 rounded-lg px-2.5 text-[0.72rem] text-muted-foreground"
            >
              <SlidersHorizontal className="size-3.5" />
              Settings
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-lg px-2.5 text-[0.72rem]"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

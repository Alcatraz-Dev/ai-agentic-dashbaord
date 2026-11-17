"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { ModelPicker } from "@/components/agents/model-picker";
import { requestWidgetEditAction } from "@/app/actions/widgets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/text-area";
import { WidgetEditCard } from "@/components/widgets/widget-edit-card";
import type { AgentModelCatalog } from "@/lib/agent-options";
import type { WidgetEditProposal, WidgetRecord } from "@/lib/widget-types";

const SUGGESTIONS = [
  "Make it more visual and easier to scan",
  "Retitle it so it says what it actually tracks",
  "Switch to the neon style",
  "Refresh it every 6 hours instead",
];

/**
 * "Edit with AI" from a widget menu. The agent produces the same review card
 * the chat uses; the widget is untouched until Apply.
 */
export function WidgetEditDialog({
  widget,
  catalog,
  open,
  onOpenChange,
  onApplied,
}: {
  widget: WidgetRecord;
  /** Models offered for this edit; omitted where no picker is available. */
  catalog?: AgentModelCatalog;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (widget: WidgetRecord) => void;
}) {
  const defaultModel = widget.editModel ?? widget.agentProvider ?? catalog?.defaultKey ?? "";
  const [request, setRequest] = useState("");
  const [modelKey, setModelKey] = useState(defaultModel);
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState<WidgetEditProposal | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRequest("");
    setModelKey(defaultModel);
    setAsking(false);
    setProposal(null);
    setError(null);
  }

  async function ask() {
    if (asking || !request.trim()) return;
    setAsking(true);
    setError(null);

    try {
      const result = await requestWidgetEditAction({
        id: widget.id,
        request,
        modelKey: modelKey || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProposal(result.proposal);
    } catch {
      setError("We couldn't prepare that change. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="brand-gradient grid size-7 place-items-center rounded-lg text-brand-on">
              <Sparkles className="size-3.5" />
            </span>
            Edit “{widget.title}” with AI
          </DialogTitle>
          <DialogDescription>
            Describe the change. You’ll see a review card with the old and new values, and nothing
            is saved until you click Apply.
          </DialogDescription>
        </DialogHeader>

        {proposal ? (
          <div className="space-y-3">
            <WidgetEditCard
              proposal={proposal}
              onApplied={(updated) => onApplied(updated)}
              onDismiss={() => onOpenChange(false)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setProposal(null);
                setRequest("");
              }}
              className="text-[0.72rem]"
            >
              Ask for a different change
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-muted/25 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-medium">Run with</p>
                <p className="truncate text-[0.6rem] text-muted-foreground">
                  {catalog
                    ? `${widget.agentName}'s model · this dashboard`
                    : `${widget.agentName}'s model · set it in the agent panel`}
                </p>
              </div>
              {catalog ? (
                <div className="min-w-0 flex-[1_1_11rem] sm:max-w-56">
                  <ModelPicker
                    catalog={catalog}
                    value={modelKey}
                    onSelect={setModelKey}
                    align="end"
                    matchTriggerWidth
                    className="justify-between"
                  />
                </div>
              ) : null}
            </div>
            <TextArea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="e.g. Make the numbers easier to scan, rename it to “Weekly revenue”, and refresh every 6 hours."
              minRows={3}
              maxRows={6}
              maxLength={800}
              counter
              disabled={asking}
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={asking}
                  onClick={() => setRequest(suggestion)}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[0.66rem] text-muted-foreground transition hover:border-brand-border hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.72rem] text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={asking}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={asking || !request.trim()}
                onClick={() => void ask()}
                className="brand-gradient gap-1.5 text-brand-on"
              >
                {asking ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Prepare change
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Check, FileCode2, Loader2, X } from "lucide-react";

import { applyProjectPatchAction } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import { buildLineDiff, type ProjectPatchProposal } from "@/lib/project-patch";
import { cn } from "@/lib/utils";

/**
 * The review card for `propose_project_patch`.
 *
 * A proposal is inert: it renders the real line diff and says how many lines it
 * adds and removes. Only "Apply patch" calls the server action, which re-hashes
 * the file and refuses when it changed since the proposal was made.
 */

export function ProjectPatchCard({
  proposal,
  onApplied,
  onDismiss,
  className,
}: {
  proposal: ProjectPatchProposal;
  onApplied?: (path: string) => void;
  onDismiss?: () => void;
  className?: string;
}) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ path: string; lines: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { lines, truncated } = buildLineDiff(proposal.before, proposal.after);

  async function apply() {
    if (applying || applied) return;
    setApplying(true);
    setError(null);

    try {
      const result = await applyProjectPatchAction({
        projectId: proposal.projectId,
        path: proposal.path,
        content: proposal.after,
        beforeHash: proposal.beforeHash,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setApplied({ path: result.path, lines: result.lines });
      onApplied?.(result.path);
    } catch {
      setError("We couldn't write that file. Please try again.");
    } finally {
      setApplying(false);
    }
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
          {applied ? <Check className="size-4" strokeWidth={3} /> : <FileCode2 className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold text-card-foreground">
            {applied ? "Patch applied" : proposal.newFile ? "New file waiting for review" : "Review this file change"}
          </p>
          <p className="mt-0.5 truncate font-mono text-[0.68rem] text-muted-foreground">
            {proposal.projectName}/{proposal.path}
          </p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-muted-foreground">
            {applied
              ? `${applied.path} now has ${applied.lines} lines on disk.`
              : proposal.summary}
          </p>
        </div>
        <span className="shrink-0 space-x-1.5 text-[0.6rem] font-medium tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{proposal.additions}</span>
          <span className="text-rose-600 dark:text-rose-400">−{proposal.removals}</span>
        </span>
      </div>

      <div className="max-h-[20rem] overflow-auto bg-[#0b0f14] py-1.5 font-mono text-[0.66rem] leading-[1.55] text-[#d7e0ea]">
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              "flex gap-2 px-3",
              line.type === "add" && "bg-emerald-400/10",
              line.type === "remove" && "bg-rose-400/10",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "w-2 shrink-0 select-none text-center",
                line.type === "add"
                  ? "text-emerald-300"
                  : line.type === "remove"
                    ? "text-rose-300"
                    : "text-white/25",
              )}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
            </span>
            <span className="whitespace-pre-wrap break-words">
              {line.text.length > 0 ? line.text : " "}
            </span>
          </div>
        ))}
        {truncated ? (
          <p className="px-3 pt-1.5 text-[0.62rem] text-white/40">Diff shortened — the file is long.</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[0.7rem] text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2">
        {applied ? (
          <>
            <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" />
              Written to disk
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
                "Apply patch"
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
            <span className="ml-auto text-[0.62rem] text-muted-foreground">
              Nothing is written until Apply.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

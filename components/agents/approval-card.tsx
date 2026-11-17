"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";

import { AppResultCard } from "@/components/agents/app-result-card";
import { AppIcon } from "@/components/integrations/app-icon";
import { Button } from "@/components/ui/button";
import type { AgentResultCard as ResultCard } from "@/lib/apps/results";
import { getIntegration } from "@/lib/apps/catalog";
import { cn } from "@/lib/utils";

/**
 * The approval card for an action that changes data.
 *
 * The model never runs these actions. The card posts its single-use token to
 * the approvals endpoint; the server checks the token was issued to this owner
 * and agent, consumes it, and runs the exact action and arguments shown here.
 * Approving once is enough — the model is not asked again.
 */

export type ApprovalRequest = {
  token: string;
  toolkit: string;
  name: string;
  action: string;
  actionLabel: string;
  summary: string;
  preview: { label: string; value: string }[];
};

type CardState = "open" | "approving" | "denying" | "approved" | "denied" | "error";

export function ApprovalCard({
  request,
  agentId,
  onDismiss,
}: {
  request: ApprovalRequest;
  agentId: number;
  onDismiss: (token: string) => void;
}) {
  const integration = getIntegration(request.toolkit);
  const app = integration ?? {
    slug: request.toolkit,
    name: request.name,
    icon: "notion" as const,
    color: "#2563EB",
    description: "",
    capabilities: [],
    category: "Files" as const,
  };

  const [state, setState] = useState<CardState>("open");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultCard | null>(null);

  const busy = state === "approving" || state === "denying";
  const resolved = state === "approved" || state === "denied";

  async function decide(decision: "approve" | "deny") {
    if (busy || resolved) return;

    setState(decision === "approve" ? "approving" : "denying");
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: request.token, decision }),
      });
      const data = (await response.json().catch(() => null)) as {
        card?: ResultCard;
        error?: string;
      } | null;

      if (!response.ok) {
        setState("error");
        setError(data?.error ?? "That approval couldn't be completed.");
        return;
      }

      if (decision === "deny") {
        setState("denied");
        return;
      }

      if (data?.card) setResult(data.card);
      setState("approved");
    } catch {
      setState("error");
      setError("We couldn't reach the approval service. Please try again.");
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3.5 ring-1 transition-colors",
        resolved && state === "approved"
          ? "border-emerald-200/80 ring-emerald-100/70"
          : resolved
            ? "border-border ring-border/40"
            : "border-amber-200/80 ring-amber-100/70",
      )}
    >
      <div className="flex items-start gap-3">
        <AppIcon app={app} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[0.84rem] font-semibold">
              {resolved
                ? state === "approved"
                  ? `${request.actionLabel} completed`
                  : "Action cancelled"
                : request.actionLabel}
            </p>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold tracking-wide uppercase",
                resolved && state === "approved"
                  ? "bg-emerald-50 text-emerald-700"
                  : resolved
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-50 text-amber-700",
              )}
            >
              {resolved ? (state === "approved" ? "Done" : "Cancelled") : "Needs your approval"}
            </span>
          </div>

          <p className="mt-0.5 text-[0.74rem] leading-relaxed text-muted-foreground">
            {resolved
              ? state === "approved"
                ? `Ran once on ${app.name}. This approval can't be used again.`
                : `Nothing changed in ${app.name}.`
              : request.summary}
          </p>

          {!resolved && request.preview.length > 0 ? (
            <dl className="mt-2 space-y-1 rounded-lg bg-muted/50 px-2 py-1.5">
              {request.preview.map((field, index) => (
                <div key={`${field.label}-${index}`} className="flex gap-2 text-[0.7rem]">
                  <dt className="w-24 shrink-0 text-muted-foreground">{field.label}</dt>
                  <dd className="min-w-0 flex-1 truncate text-foreground/90" title={field.value}>
                    {field.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {state === "approving" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-brand-ink">
              <Loader2 className="size-3 animate-spin" />
              Running {request.actionLabel}…
            </p>
          ) : null}

          {state === "denied" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
              <X className="size-3" />
              Cancelled — the agent was not asked again.
            </p>
          ) : null}

          {state === "approved" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-emerald-700">
              <Check className="size-3" strokeWidth={3} />
              Approved once and ran without re-asking the model.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[0.7rem] text-rose-700">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="mt-2.5">
          <AppResultCard card={result} />
        </div>
      ) : null}

      {!resolved ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void decide("approve")}
            className="h-7 gap-1.5 bg-foreground px-2.5 text-[0.75rem] font-medium text-background shadow-sm hover:bg-foreground/90"
          >
            {state === "approving" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" strokeWidth={2.6} />
            )}
            {state === "approving" ? "Running…" : "Approve and run"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void decide("deny")}
            className="h-7 text-[0.75rem] text-muted-foreground"
          >
            {state === "denying" ? <Loader2 className="size-3 animate-spin" /> : null}
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDismiss(request.token)}
            className="ml-auto h-7 text-[0.7rem] text-muted-foreground"
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {!resolved ? (
        <p className="mt-2 flex items-center gap-1.5 text-[0.64rem] text-muted-foreground">
          <ShieldCheck className="size-3 shrink-0" />
          Runs once, only for this agent. The token is encrypted and single-use.
        </p>
      ) : null}
    </div>
  );
}

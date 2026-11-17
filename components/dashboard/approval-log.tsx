import { Check, Hand, ShieldAlert } from "lucide-react";
import Link from "next/link";

import type { ApprovalLogEntry } from "@/lib/agents/approvals";

const MODE_LOOK = {
  approved: {
    label: "Approved",
    icon: Hand,
    chip: "bg-muted text-muted-foreground",
  },
  remembered: {
    label: "Remembered",
    icon: Check,
    chip: "bg-brand-soft text-brand-ink",
  },
  "full access": {
    label: "Full access",
    icon: ShieldAlert,
    chip: "bg-rose-50 text-rose-700",
  },
} as const;

function when(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function humanize(slug: string) {
  return slug
    .toLowerCase()
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every app action an agent was allowed to take, including the ones it ran
 * without a card under "Approve for me" or "Full access". Read-only actions
 * never reach this log because they never need approval.
 */
export function ApprovalLog({ entries }: { entries: ApprovalLogEntry[] }) {
  return (
    <section className="premium-panel mt-4 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-5 py-4">
        <div>
          <p className="aui-eyebrow">Approval log</p>
          <h2 className="mt-1 text-[0.95rem] font-semibold">App actions this workspace allowed</h2>
          <p className="mt-1 text-[0.7rem] text-muted-foreground">
            Newest first. Automatic runs are logged here too, with the rule that allowed them.
          </p>
        </div>
        <span className="aui-chip text-[0.66rem]">
          <span className="font-semibold text-foreground tabular-nums">{entries.length}</span>{" "}
          recorded
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <ShieldAlert className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-[0.78rem] font-medium">Nothing approved yet</p>
          <p className="mx-auto mt-0.5 max-w-sm text-[0.7rem] leading-relaxed text-muted-foreground">
            When an agent asks to send, create or update something, the approval appears here —
            whether you approved it by hand or an agent mode covered it.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {entries.map((entry) => {
            const look = MODE_LOOK[entry.mode];
            const Icon = look.icon;

            return (
              <li key={entry.jti} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.76rem] font-medium">
                    {humanize(entry.toolkit)} · {humanize(entry.action)}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                    {entry.summary}
                  </p>
                  <p className="mt-1 text-[0.62rem] text-muted-foreground/80">
                    {entry.agentName} · {when(entry.at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold ${look.chip}`}
                >
                  {look.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-border/60 px-5 py-2.5">
        <Link
          href="/dashboard/apps"
          className="text-[0.68rem] font-medium text-brand-ink hover:underline"
        >
          Manage connected apps
        </Link>
      </div>
    </section>
  );
}

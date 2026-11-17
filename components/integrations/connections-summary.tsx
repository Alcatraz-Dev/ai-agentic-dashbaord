import Link from "next/link";
import { ArrowUpRight, Check, Loader2, Plug, ShieldCheck, TriangleAlert } from "lucide-react";

import { AppIcon } from "@/components/integrations/app-icon";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { IntegrationGrid } from "@/components/aui/illustrations/integration-grid";
import type { IntegrationApp, IntegrationsOverview } from "@/lib/integrations/types";

/**
 * Settings' read-only view of the Composio connections.
 *
 * Connecting and disconnecting stay on the Apps page; this is the "what can my
 * agents reach right now" line, so a workspace owner doesn't have to open the
 * grid to check. Everything is passed in from the server — no client state.
 */

const STATE_COPY: Record<
  IntegrationApp["status"],
  { label: string; className: string; icon: typeof Check } | null
> = {
  active: {
    label: "Connected",
    className: "bg-emerald-50 text-emerald-700",
    icon: Check,
  },
  pending: {
    label: "Finish setup",
    className: "bg-amber-50 text-amber-700",
    icon: Loader2,
  },
  error: {
    label: "Needs attention",
    className: "bg-rose-50 text-rose-700",
    icon: TriangleAlert,
  },
  disconnected: null,
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `since ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

export function ConnectionsSummary({ overview }: { overview: IntegrationsOverview }) {
  const connected = [...overview.apps]
    .filter((app) => app.status !== "disconnected")
    .sort((a, b) => {
      const rank = { active: 0, pending: 1, error: 2, disconnected: 3 };
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name);
    });

  return (
    <section className="premium-panel mt-6 rounded-2xl px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[0.9rem] font-semibold">Connected apps</h2>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            {connected.length > 0
              ? `${connected.length} of ${overview.apps.length} apps are available to your agents, through Composio.`
              : "No apps are connected yet. Connect one and every agent can ask to use it."}
          </p>
        </div>
        <Link
          href="/dashboard/apps"
          className="inline-flex shrink-0 items-center gap-1 text-[0.7rem] font-medium text-brand-ink underline-offset-2 hover:underline"
        >
          Manage
          <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {!overview.configured && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50/80 px-2.5 py-2 text-[0.7rem] leading-relaxed text-amber-900 ring-1 ring-amber-100">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" />
          Connections are not configured: add <code className="font-mono">COMPOSIO_API_KEY</code> to
          the environment.
        </p>
      )}

      {connected.length > 0 ? (
        <ul className="mt-3 divide-y divide-border/60">
          {connected.map((app) => {
            const state = STATE_COPY[app.status];
            const StateIcon = state?.icon;
            const when = formatWhen(app.connectedAt);

            return (
              <li key={app.slug} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <AppIcon app={app} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-[0.8rem] font-medium">{app.name}</p>
                    {state && StateIcon && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold ${state.className}`}
                      >
                        <StateIcon
                          className={`size-2.5 ${app.status === "pending" ? "animate-spin" : ""}`}
                          strokeWidth={app.status === "active" ? 3 : 2}
                        />
                        {state.label}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[0.68rem] text-muted-foreground">
                    {[app.accountLabel, when].filter(Boolean).join(" · ") || app.category}
                  </p>
                </div>
                <span className="shrink-0 text-[0.64rem] text-muted-foreground">
                  {app.toolCount ? `${app.toolCount} tools` : app.category}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-3">
          <IllustratedEmpty
            art={<IntegrationGrid columns={5} />}
            artClassName="w-56"
            className="px-4 py-5"
            title={`Gmail, Slack, Notion and ${Math.max(overview.apps.length - 3, 0)} more`}
            text="Your agent asks before it uses an app, and you approve the sign-in."
            action={
              <Button
                nativeButton={false}
                render={<Link href="/dashboard/apps" />}
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5 px-2.5 text-[0.72rem]"
              >
                Browse apps
                <ArrowUpRight className="size-3" />
              </Button>
            }
          />
        </div>
      )}

      {connected.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.64rem] text-muted-foreground">
          <ShieldCheck className="size-3 shrink-0" />
          Sign-ins are held by Composio. Disconnecting revokes access immediately.
        </p>
      )}
    </section>
  );
}

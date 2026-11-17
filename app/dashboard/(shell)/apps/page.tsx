import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plug } from "lucide-react";

import { AppIcon } from "@/components/integrations/app-icon";
import { AppsBrowser } from "@/components/integrations/apps-browser";
import { getIntegrationsOverview } from "@/lib/composio/connections";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Apps" };

/**
 * The Apps page: every external tool the workspace offers, whether it is
 * connected, and what an agent can do with it once it is.
 */
export default async function AppsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const overview = await getIntegrationsOverview(profile.id);
  const connectedApps = overview.apps.filter((app) => app.status === "active");

  return (
    <div className="aui-page max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            External tools
          </p>
          <h1 className="aui-title mt-2">Apps</h1>
          <p className="aui-subtitle mt-2">
            Every app in the Composio catalog — {overview.apps.length.toLocaleString()} of them —
            ready to connect. When an agent needs one it isn&apos;t connected to, it asks in the
            chat and shows a connect card.
          </p>
        </div>
        <span className="aui-chip gap-2 py-1 pr-3 text-[0.72rem]">
          {connectedApps.length > 0 ? (
            <span className="flex -space-x-1.5">
              {connectedApps.slice(0, 4).map((app) => (
                <AppIcon
                  key={app.slug}
                  app={app}
                  size="sm"
                  className="shadow-none ring-2 ring-card"
                />
              ))}
              {connectedApps.length > 4 && (
                <span className="grid size-8 place-items-center rounded-[0.6rem] bg-muted text-[0.62rem] font-semibold text-muted-foreground ring-2 ring-card">
                  +{connectedApps.length - 4}
                </span>
              )}
            </span>
          ) : (
            <span className="grid size-8 place-items-center rounded-[0.6rem] bg-muted text-foreground ring-1 ring-border">
              <Plug className="size-4" />
            </span>
          )}
          <span className="font-medium text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">
              {overview.connectedCount}
            </span>{" "}
            of {overview.apps.length.toLocaleString()} connected
          </span>
        </span>
      </div>

      <div className="mt-5">
        <AppsBrowser overview={overview} />
      </div>
    </div>
  );
}

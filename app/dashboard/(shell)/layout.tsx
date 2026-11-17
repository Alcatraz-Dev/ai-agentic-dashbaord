import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getConnectedToolkits } from "@/lib/composio/connections";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { listRecentScheduleFailures } from "@/lib/agent-schedules";
import { listAgentsForUser } from "@/lib/agents";
import { getAgentModelCatalog } from "@/lib/agent-model-catalog";
import { getDashboardForUser, listDashboardsForUser } from "@/lib/dashboards";
import { normalizePlan } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const dashboards = await listDashboardsForUser(user.id);

  const profile = await ensureUserRecord(user);

  const [agents, models, cookieStore, alerts, connectedApps] = await Promise.all([
    listAgentsForUser(profile.id),
    getAgentModelCatalog(profile.id),
    cookies(),
    listRecentScheduleFailures(profile.id),
    // A local query, not a Composio call: the sidebar count must stay cheap.
    getConnectedToolkits(profile.id),
  ]);

  return (
    <DashboardShell
      defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      user={{
        name: profile.name ?? user.name ?? "",
        email: profile.email,
        imageUrl: profile.imageUrl ?? user.image ?? user.avatarUrl ?? user.picture ?? null,
      }}
      dashboard={dashboard}
      dashboards={dashboards}
      agents={agents}
      models={models}
      alerts={alerts}
      connectedApps={connectedApps.length}
      plan={normalizePlan(profile.plan)}
    >
      {children}
    </DashboardShell>
  );
}

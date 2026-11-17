import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getConnectedToolkits } from "@/lib/composio/connections";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { listRecentScheduleFailures } from "@/lib/agent-schedules";
import { listAgentsForUser } from "@/lib/agents";
import { getAgentModelCatalog } from "@/lib/agent-model-catalog";
import { getDashboardForUser, listDashboardsForUser } from "@/lib/dashboards";
import { normalizePlan } from "@/lib/plans";
import { countWidgetsByDashboardForUser } from "@/lib/widgets";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const dashboards = await listDashboardsForUser(user.id);

  const profile = await ensureUserRecord(user);

  const [agents, allAgents, models, cookieStore, alerts, connectedApps, widgetCounts] =
    await Promise.all([
    // Per dashboard: the sidebar shows only this dashboard's agents.
    listAgentsForUser(profile.id, dashboard.id),
    // Workspace-wide, read only for the dashboard picker's per-board counts.
    listAgentsForUser(profile.id),
    getAgentModelCatalog(profile.id),
    cookies(),
    listRecentScheduleFailures(profile.id),
    // A local query, not a Composio call: the sidebar count must stay cheap.
    getConnectedToolkits(profile.id),
    // One grouped count, for the dashboard picker's per-board widget totals.
    countWidgetsByDashboardForUser(profile.id),
  ]);

  // Agents belong to a dashboard, so the picker can say whose team each board holds.
  const agentCounts = allAgents.reduce<Record<number, number>>((counts, agent) => {
    if (agent.dashboardId === null) return counts;
    counts[agent.dashboardId] = (counts[agent.dashboardId] ?? 0) + 1;
    return counts;
  }, {});

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
      agentCounts={agentCounts}
      widgetCounts={widgetCounts}
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

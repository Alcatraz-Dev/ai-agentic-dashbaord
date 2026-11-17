import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { McpServersSection } from "@/components/agents/mcp-servers";
import { ApprovalLog } from "@/components/dashboard/approval-log";
import { CloudBrowserCard } from "@/components/dashboard/cloud-browser-card";
import { TaskActivityFeed } from "@/components/dashboard/task-activity-feed";
import { ConnectionsSummary } from "@/components/integrations/connections-summary";
import { PlanPricing } from "@/components/dashboard/plan-pricing";
import { RecentRuns } from "@/components/dashboard/recent-runs";
import { SchedulePreferences } from "@/components/dashboard/schedule-preferences";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listApprovalLog } from "@/lib/agents/approvals";
import { listTaskActivityForUser } from "@/lib/tasks";
import { listAgentMcpServers } from "@/lib/agent-mcp";
import { getScheduleAlertSettings, listRecentScheduleRuns } from "@/lib/agent-schedules";
import { browserUsageByAgent, listOwnerBrowserSessions } from "@/lib/browser-sessions";
import { hasBrowserProfile } from "@/lib/browserbase/session";
import { getIntegrationsOverview } from "@/lib/composio/connections";
import { scheduleAlertsConfigured } from "@/lib/schedule-alerts";
import { getDashboardColor, getDashboardTemplate } from "@/lib/dashboard-options";
import { getDashboardForUser } from "@/lib/dashboards";
import { getPlanUsage } from "@/lib/plan-usage";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import AiUsageSection from "./ai-usage-section";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const template = getDashboardTemplate(dashboard.template);
  const accent = getDashboardColor(dashboard.color);

  const profile = await ensureUserRecord(user);
  const [runs, mcpServers, scheduleSettings, browserUsage, browserSessions, browserProfile, connections, planUsage, approvals, taskActivity] = await Promise.all([
    listRecentScheduleRuns(profile.id, 200),
    listAgentMcpServers(profile.id),
    getScheduleAlertSettings(profile.id),
    browserUsageByAgent(profile.id),
    listOwnerBrowserSessions(profile.id, 8),
    hasBrowserProfile(profile.id),
    // Same sync the Apps page runs, so a connection made elsewhere shows here.
    getIntegrationsOverview(profile.id),
    getPlanUsage(profile.id),
    listApprovalLog(profile.id),
    listTaskActivityForUser(profile.id, 20),
  ]);

  return (
    <div className="aui-page max-w-3xl">
      <p className="aui-eyebrow">
        Settings
      </p>
      <h1 className="aui-title mt-2">Workspace settings</h1>
      <p className="aui-subtitle mt-2">
        The essentials for this workspace. Profile and members arrive in a later step.
      </p>

      <section className="premium-panel mt-6 overflow-hidden rounded-2xl">
        <dl className="divide-y divide-border/60">
          <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <dt className="text-[0.82rem] text-muted-foreground">Dashboard</dt>
            <dd className="truncate text-[0.82rem] font-medium">{dashboard.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <dt className="text-[0.82rem] text-muted-foreground">Template</dt>
            <dd className="text-[0.82rem] font-medium">{template.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <dt className="text-[0.82rem] text-muted-foreground">Accent</dt>
            <dd className="flex items-center gap-2 text-[0.82rem] font-medium">
              <span className={`size-2.5 rounded-full ${accent.dot}`} /> {accent.label}
            </dd>
          </div>
        </dl>
      </section>

      <PlanPricing usage={planUsage} />

      <SchedulePreferences
        paused={scheduleSettings.paused}
        emailAlerts={scheduleSettings.emailAlerts}
        digest={scheduleSettings.digest}
        emailConfigured={scheduleAlertsConfigured()}
      />

      <RecentRuns
        runs={runs}
        initialAgentId="all"
        initialDate=""
      />

      <ApprovalLog entries={approvals} />

      <TaskActivityFeed entries={taskActivity} />

      <CloudBrowserCard
        usage={browserUsage}
        sessions={browserSessions}
        profileActive={browserProfile}
      />

      <ConnectionsSummary overview={connections} />

      {/* AI usage reads the real token ledger; the range picker is client-side. */}
      <AiUsageSection />
    </div>
  );
}
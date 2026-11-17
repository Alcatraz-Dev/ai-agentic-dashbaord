import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentChat } from "@/components/agents/agent-chat";
import { AgentSidePanel } from "@/components/agents/agent-side-panel";
import { AgentWorkspace } from "@/components/agents/agent-workspace";
import { listAgentMcpServers } from "@/lib/agent-mcp";
import {
  listAgentScheduleRuns,
  listAgentSchedules,
} from "@/lib/agent-schedules";
import { listAgentMessagePage } from "@/lib/agent-messages";
import { listBrowserSessions } from "@/lib/browser-sessions";
import { hasBrowserProfile } from "@/lib/browserbase/session";
import { getAgentForUser } from "@/lib/agents";
import { listCustomDiagramsForUser } from "@/lib/custom-diagrams";
import { listCustomPluginsForUser } from "@/lib/custom-plugins";
import { listCustomSkillsForUser } from "@/lib/custom-skills";
import { memoryPanelForAgent } from "@/lib/memories";
import { getAgentModelCatalog } from "@/lib/agent-model-catalog";
import { getIntegrationsOverview } from "@/lib/composio/connections";
import type { ChatMessage } from "@/lib/agent-demo";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetRefreshRuns, listWidgetsForAgent } from "@/lib/widgets";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mcp?: string; editWidget?: string }>;
}) {
  const { id } = await params;
  const { mcp, editWidget } = await searchParams;
  const editWidgetId = Number(editWidget);
  const initialEditWidgetId =
    Number.isInteger(editWidgetId) && editWidgetId > 0 ? editWidgetId : null;
  const mcpNotice = mcp === "connected" ? "connected" : mcp === "error" ? "error" : null;
  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  const agent = await getAgentForUser(profile.id, Number(id));
  if (!agent) notFound();

  const [
    catalog,
    mcpServers,
    schedules,
    scheduleRuns,
    browserSessions,
    browserProfile,
    messagePage,
    widgets,
    widgetRuns,
    customSkills,
    customPlugins,
    customDiagrams,
    memoryPanel,
  ] = await Promise.all([
      getAgentModelCatalog(profile.id),
      listAgentMcpServers(profile.id),
      listAgentSchedules(profile.id, agent.id),
      listAgentScheduleRuns(profile.id, agent.id),
      listBrowserSessions(profile.id, agent.id),
      hasBrowserProfile(profile.id),
      listAgentMessagePage(agent.id),
      listWidgetsForAgent(profile.id, agent.id),
      listWidgetRefreshRuns(profile.id, agent.id),
      listCustomSkillsForUser(profile.id),
      listCustomPluginsForUser(profile.id),
      listCustomDiagramsForUser(profile.id),
      // One read serves both the rail (newest 6) and the chat's memory drawer.
      memoryPanelForAgent(profile.id, agent.id, 40),
    ]);

  const initialMessages: ChatMessage[] = messagePage.messages.map((message) => ({
    id: `msg-${message.id}`,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    steps: message.steps,
    sources: message.sources,
    cards: message.cards,
  }));

  const overview = await getIntegrationsOverview(profile.id);

  const mostRecentRun = schedules
    .filter((schedule) => schedule.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt!).getTime() - new Date(a.lastRunAt!).getTime())[0];

  const lastScheduleRun = mostRecentRun
    ? {
        title: mostRecentRun.title,
        at: mostRecentRun.lastRunAt!,
        status: mostRecentRun.lastStatus === "error" ? ("error" as const) : ("ok" as const),
      }
    : null;

  return (
    <AgentWorkspace
      chat={
        <AgentChat
          agent={agent}
          catalog={catalog}
          initialMessages={initialMessages}
          messageCursor={messagePage.nextCursor}
          messageHasMore={messagePage.hasMore}
          mcpServerCount={mcpServers.length}
          lastScheduleRun={lastScheduleRun}
          initialWidgets={widgets}
          editWidgetId={initialEditWidgetId}
          memoryEnabled={memoryPanel.enabled}
          memoryNotes={memoryPanel.notes}
          apps={overview.apps.map((app) => ({
            slug: app.slug,
            name: app.name,
            connected: app.status === "active",
          }))}
        />
      }
      panel={
        <AgentSidePanel
          agent={agent}
          catalog={catalog}
          mcpServers={mcpServers}
          mcpNotice={mcpNotice}
          schedules={schedules}
          scheduleRuns={scheduleRuns}
          widgetRuns={widgetRuns}
          widgets={widgets}
          browserSessions={browserSessions}
          browserProfile={browserProfile}
          skills={customSkills}
          plugins={customPlugins}
          diagrams={customDiagrams}
          memoryEnabled={memoryPanel.enabled}
          memoryNotes={memoryPanel.notes.slice(0, 6)}
        />
      }
    />
  );
}

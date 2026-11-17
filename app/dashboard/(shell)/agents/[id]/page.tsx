import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AgentChat } from "@/components/agents/agent-chat";
import { AgentSidePanel } from "@/components/agents/agent-side-panel";
import { AgentWorkspace } from "@/components/agents/agent-workspace";
import { TemplateWorkbench, type WorkbenchData } from "@/components/workspace/template-workbench";
import { listAgentMcpServers } from "@/lib/agent-mcp";
import { listBrowserLogins } from "@/lib/browser-logins";
import { listProjectsForUser } from "@/lib/projects";
import { getActiveDashboardForProfile } from "@/lib/dashboards";
import { listTasksForUser } from "@/lib/tasks";
import { getTemplateWorkbench } from "@/lib/template-workspaces";
import {
  listAgentScheduleRuns,
  listAgentSchedules,
} from "@/lib/agent-schedules";
import { listAgentMessagePage } from "@/lib/agent-messages";
import { listBrowserSessions } from "@/lib/browser-sessions";
import { hasBrowserProfile } from "@/lib/browserbase/session";
import { getAgentForUser, listAgentsForUser } from "@/lib/agents";
import { listTeamsForUser } from "@/lib/teams";
import { listCustomDiagramsForUser } from "@/lib/custom-diagrams";
import { listCustomPluginsForUser } from "@/lib/custom-plugins";
import { listCustomSkillsForUser } from "@/lib/custom-skills";
import { memoryPanelForAgent } from "@/lib/memories";
import { getAgentModelCatalog } from "@/lib/agent-model-catalog";
import { getIntegrationsOverview } from "@/lib/composio/connections";
import type { ChatMessage } from "@/lib/agent-demo";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetRefreshRuns, listWidgetsForAgent, listWidgetsForUser } from "@/lib/widgets";

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
    handoffs: message.handoffs,
  }));

  const overview = await getIntegrationsOverview(profile.id);

  // The dashboard's template decides which extra pane the agent page carries.
  const activeDashboard = await getActiveDashboardForProfile(profile.id);
  const template = activeDashboard?.template ?? "blank";
  const workbench = getTemplateWorkbench(template);

  // Titles already on the board: the chat offers only this template's missing cards.
  const dashboardWidgetTitles = activeDashboard
    ? (await listWidgetsForUser(profile.id, activeDashboard.id)).map((widget) => widget.title)
    : [];

  const [boardTasks, boardWidgets, savedLogins] = workbench
    ? await Promise.all([
        workbench.id === "creator" || workbench.id === "daily"
          ? listTasksForUser(profile.id)
          : Promise.resolve<Awaited<ReturnType<typeof listTasksForUser>>>([]),
        workbench.id === "business"
          ? listWidgetsForUser(profile.id, activeDashboard?.id ?? null)
          : Promise.resolve<Awaited<ReturnType<typeof listWidgetsForUser>>>([]),
        workbench.id === "research"
          ? listBrowserLogins(profile.id)
          : Promise.resolve<Awaited<ReturnType<typeof listBrowserLogins>>>([]),
      ])
    : [
        [] as Awaited<ReturnType<typeof listTasksForUser>>,
        [] as Awaited<ReturnType<typeof listWidgetsForUser>>,
        [] as Awaited<ReturnType<typeof listBrowserLogins>>,
      ];

  const projectList = workbench?.id === "developer" ? await listProjectsForUser(profile.id) : [];
  // The developer pane's Team tab creates teams on this board, so it needs the
  // same two lists the Teams page uses — and only that template asks for them.
  const developerTeams =
    workbench?.id === "developer" && activeDashboard
      ? await listTeamsForUser(profile.id, activeDashboard.id)
      : [];
  const developerAgents =
    workbench?.id === "developer" && activeDashboard
      ? await listAgentsForUser(profile.id, activeDashboard.id)
      : [];

  const workbenchData: WorkbenchData | null = workbench
    ? {
        tasks: boardTasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
        })),
        schedules: schedules.map((schedule) => ({
          id: schedule.id,
          title: schedule.title,
          nextRunAt: schedule.nextRunAt,
          lastRunAt: schedule.lastRunAt,
          enabled: schedule.enabled,
          lastStatus: schedule.lastStatus,
        })),
        skills: customSkills.map((skill) => ({
          name: skill.name,
          description: skill.description,
        })),
        diagrams: customDiagrams.map((diagram) => ({
          name: diagram.name,
          description: diagram.description,
        })),
        logins: savedLogins.map((login) => ({
          host: login.host,
          url: login.url,
          label: login.label,
        })),
        widgets: boardWidgets.map((widget) => ({
          id: widget.id,
          title: widget.title,
          metrics: widget.data.metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
            delta: metric.delta,
          })),
        })),
        // Only research reads them, but the list is already loaded for the
        // memory drawer and the rail, so nothing extra is queried.
        notes:
          workbench.id === "research"
            ? memoryPanel.notes.map((note) => ({
                id: note.id,
                content: note.content,
                tags: note.tags,
                createdAt: note.createdAt,
              }))
            : [],
        teams: developerTeams,
        agents: developerAgents,
      }
    : null;

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
      template={template}
      workbenchLabel={workbench?.label}
      workbench={
        workbench && workbenchData ? (
          <TemplateWorkbench template={template} data={workbenchData} projects={projectList} />
        ) : undefined
      }
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
          dashboardTemplate={template}
          dashboardWidgetTitles={dashboardWidgetTitles}
          memoryEnabled={memoryPanel.enabled}
          memoryNotes={memoryPanel.notes}
          contextLabel={
            activeDashboard
              ? `${activeDashboard.name}${workbench ? ` · ${workbench.label}` : ""}`
              : null
          }
          starterPrompts={workbench?.prompts ?? []}
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
          template={template}
        />
      }
    />
  );
}

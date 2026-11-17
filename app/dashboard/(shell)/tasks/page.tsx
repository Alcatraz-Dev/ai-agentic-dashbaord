import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListChecks } from "lucide-react";

import { TaskBoard, type TaskLibrary } from "@/components/tasks/task-board";
import { listAgentMcpServers } from "@/lib/agent-mcp";
import { listAgentsForUser } from "@/lib/agents";
import { getIntegration } from "@/lib/apps/catalog";
import { getConnectedToolkits } from "@/lib/composio/connections";
import { listCustomDiagramsForUser } from "@/lib/custom-diagrams";
import { listCustomPluginsForUser } from "@/lib/custom-plugins";
import { listCustomSkillsForUser } from "@/lib/custom-skills";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureTaskRolesForUser, listTasksForUser } from "@/lib/tasks";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Tasks" };

/**
 * The workspace task board. One board per owner, independent of dashboards:
 * a task is work to do, not a widget on a page. The page also resolves what the
 * workspace can put on a card — its roles, skills, plugins, MCP servers and
 * connected apps — so the board can offer them without another round trip.
 */
export default async function TasksPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const [tasks, agents, roles, skills, diagrams, plugins, mcpServers, toolkits] = await Promise.all([
    listTasksForUser(profile.id),
    listAgentsForUser(profile.id),
    ensureTaskRolesForUser(profile.id),
    listCustomSkillsForUser(profile.id),
    listCustomDiagramsForUser(profile.id),
    listCustomPluginsForUser(profile.id),
    listAgentMcpServers(profile.id),
    getConnectedToolkits(profile.id),
  ]);

  const library: TaskLibrary = {
    skills: skills.map((skill) => skill.name),
    diagrams: diagrams.map((diagram) => diagram.name),
    plugins: plugins.map((plugin) => ({ slug: plugin.slug, name: plugin.name })),
    mcpServers: mcpServers.map((server) => ({ id: server.id, label: server.label })),
    apps: toolkits.map((slug) => ({ slug, name: getIntegration(slug)?.name ?? slug })),
  };

  return (
    <div className="aui-page max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Work</p>
          <h1 className="aui-title mt-2">Tasks</h1>
          <p className="aui-subtitle mt-2">
            Everything the workspace is doing, in one board. Drag a card between columns, give each
            role its own agent and progress, break the card into steps, pick the tools it may use,
            or turn it into a scheduled run.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <ListChecks className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{tasks.length}</span> cards
        </span>
      </div>

      <TaskBoard initialTasks={tasks} agents={agents} roles={roles} library={library} />
    </div>
  );
}

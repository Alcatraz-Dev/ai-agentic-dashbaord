import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Calculator,
  Clock,
  Globe2,
  LogIn,
  Monitor,
  MousePointerClick,
  ScanText,
  Search,
  type LucideIcon,
} from "lucide-react";

import { CreateAgentButton } from "@/components/dashboard/create-agent-dialog";
import { PluginsManager } from "@/components/plugins/plugins-manager";
import { AGENT_TOOL_OPTIONS, type AgentToolId } from "@/lib/agent-tool-options";
import { listAgentsForUser } from "@/lib/agents";
import { listCustomPluginsForUser } from "@/lib/custom-plugins";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Plugins" };

const PLUGIN_LOOK: Record<AgentToolId, { icon: LucideIcon; tone: string; group: string }> = {
  web_search: {
    icon: Search,
    tone: "bg-muted text-foreground ring-border",
    group: "Research",
  },
  read_webpage: {
    icon: Globe2,
    tone: "bg-muted text-foreground ring-border",
    group: "Research",
  },
  browser_open: {
    icon: Monitor,
    tone: "bg-muted text-foreground ring-border",
    group: "Cloud browser",
  },
  browser_act: {
    icon: MousePointerClick,
    tone: "bg-muted text-foreground ring-border",
    group: "Cloud browser",
  },
  browser_extract: {
    icon: ScanText,
    tone: "bg-muted text-foreground ring-border",
    group: "Cloud browser",
  },
  browser_request_login: {
    icon: LogIn,
    tone: "bg-muted text-foreground ring-border",
    group: "Cloud browser",
  },
  calculate: {
    icon: Calculator,
    tone: "bg-muted text-foreground ring-border",
    group: "Utilities",
  },
  current_time: {
    icon: Clock,
    tone: "bg-muted text-foreground ring-border",
    group: "Utilities",
  },
};

/**
 * Built-in plugins — the tools an agent may call. Unlike apps, these ship with
 * the workspace; an agent opts into them from its config rail.
 */
export default async function PluginsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const [agents, customPlugins] = await Promise.all([
    listAgentsForUser(profile.id),
    listCustomPluginsForUser(profile.id),
  ]);

  return (
    <div className="aui-page max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            Built-in tools
          </p>
          <h1 className="aui-title mt-2">Plugins</h1>
          <p className="aui-subtitle mt-2">
            Built-in tools ship with the workspace. Add your own HTTP plugin below and every agent
            can call it — no deploy required.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="aui-chip text-[0.72rem]">
            <span className="font-semibold text-foreground tabular-nums">
              {AGENT_TOOL_OPTIONS.length + customPlugins.length}
            </span>{" "}
            plugins · {customPlugins.length} custom
          </span>
          <CreateAgentButton className="h-8 rounded-full px-3 text-[0.75rem]" />
        </div>
      </div>

      <PluginsManager plugins={customPlugins} />

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            Built in
          </p>
          <h2 className="mt-1 text-[0.95rem] font-semibold">Included tools</h2>
        </div>
        <span className="text-[0.68rem] text-muted-foreground tabular-nums">
          {AGENT_TOOL_OPTIONS.length} tools
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_TOOL_OPTIONS.map((plugin) => {
          const look = PLUGIN_LOOK[plugin.id];
          const Icon = look.icon;
          const enabledFor = agents.filter((agent) =>
            agent.enabledTools ? agent.enabledTools.includes(plugin.id) : true,
          ).length;

          return (
            <article
              key={plugin.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
                    look.tone,
                  )}
                >
                  <Icon className="size-[1.15rem]" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[0.9rem] font-semibold">{plugin.name}</h2>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.58rem] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
                      Installed
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.66rem] font-medium tracking-wide text-muted-foreground uppercase">
                    {look.group}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[0.75rem] leading-relaxed text-muted-foreground">
                {plugin.description}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                <span className="text-[0.66rem] text-muted-foreground">
                  {agents.length === 0
                    ? "Create an agent to use it"
                    : `On for ${enabledFor} of ${agents.length} ${
                        agents.length === 1 ? "agent" : "agents"
                      }`}
                </span>
                <span className="text-[0.62rem] text-muted-foreground/80">Built in</span>
              </div>
            </article>
          );
        })}
      </div>

      <p className="pt-3 text-[0.68rem] leading-relaxed text-muted-foreground">
        Plugins run in the agent runtime and are budgeted per reply. Manage them per agent in the
        chat&apos;s config rail.
      </p>
    </div>
  );
}


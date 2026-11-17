import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { AgentsProvider } from "@/components/dashboard/agents-provider";
import { SidebarProvider } from "@/components/ui/sidebar";

const AGENTS = [
  {
    id: 1,
    name: "Launch Copilot",
    avatar: "circle:happy",
    color: "blue",
    provider: "openai",
    approvalMode: "ask" as const,
    enabledTools: null,
    mcpTools: null,
    enabledSkills: null,
    enabledPlugins: null,
    enabledDiagrams: null,
  },
  {
    id: 2,
    name: "Research Scout",
    avatar: "pebble:calm",
    color: "violet",
    provider: "openai",
    approvalMode: "ask" as const,
    enabledTools: null,
    mcpTools: null,
    enabledSkills: null,
    enabledPlugins: null,
    enabledDiagrams: null,
  },
  {
    id: 3,
    name: "Ops",
    avatar: "droplet:shy",
    color: "emerald",
    provider: "openai",
    approvalMode: "auto" as const,
    enabledTools: null,
    mcpTools: null,
    enabledSkills: null,
    enabledPlugins: null,
    enabledDiagrams: null,
  },
];

export default function ShotPage() {
  return (
    <AgentsProvider
      initialAgents={AGENTS}
      models={{ builtin: [], custom: [], defaultKey: "openai/gpt-5.4" }}
    >
      <SidebarProvider>
        <AppSidebar
          user={{ name: "Shot Test", email: "shot@example.com", imageUrl: null }}
          dashboard={{ id: 1, name: "Launch", icon: "sparkles", color: "blue", template: "blank" }}
          dashboards={[{ id: 1, name: "Launch", icon: "sparkles", color: "blue", template: "blank" }]}
          connectedApps={3}
          plan="free"
        />
      </SidebarProvider>
    </AgentsProvider>
  );
}

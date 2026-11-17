"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow,
  Bell,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  GitBranch,
  LayoutGrid,
  LogOut,
  Package,
  PanelsTopLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareKanban,
  UsersRound,
  Waypoints,
} from "lucide-react";

import { signOutAction } from "@/app/actions/auth";
import { AgentsProvider, useAgents } from "@/components/dashboard/agents-provider";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { ThemeMenu } from "@/components/theme/theme-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NotificationStack, type Notice } from "@/components/ui/notification-stack";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import type { AgentModelCatalog, AgentSummary } from "@/lib/agent-options";
import type { AgentScheduleRunWithContext } from "@/lib/agent-schedule-options";
import { getDashboardPortrait } from "@/lib/dashboard-options";
import { PRICING_URL, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

type ShellUser = {
  name: string;
  email: string;
  imageUrl: string | null;
};

type ShellDashboard = {
  id: number;
  name: string;
  icon: string;
  color: string;
  template: string;
};

/** One quiet button look for every icon action in the bar. */
const HEADER_ICON_BUTTON =
  "grid size-9 place-items-center rounded-xl text-muted-foreground outline-none transition-[background-color,color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground";

/** Route → breadcrumb section. Longest match wins, so nested pages stay right. */
const SECTIONS = [
  { href: "/dashboard/apps", label: "Apps", icon: AppWindow },
  { href: "/dashboard/mcps", label: "MCPs", icon: Waypoints },
  { href: "/dashboard/plugins", label: "Plugins", icon: Package },
  { href: "/dashboard/skills", label: "Skills", icon: BookOpen },
  { href: "/dashboard/diagrams", label: "Diagrams", icon: GitBranch },
  { href: "/dashboard/inbox", label: "Inbox", icon: Bell },
  { href: "/dashboard/tasks", label: "Tasks", icon: SquareKanban },
  { href: "/dashboard/teams", label: "Teams", icon: UsersRound },
  { href: "/dashboard/jobs", label: "Scheduled jobs", icon: CalendarClock },
  { href: "/dashboard/automations", label: "Scheduled jobs", icon: CalendarClock },
  { href: "/dashboard/settings", label: "Settings", icon: SlidersHorizontal },
  { href: "/dashboard/dashboards", label: "Dashboards", icon: PanelsTopLeft },
] as const;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}

function initials(value: string) {
  const [first = "", second = ""] = value.trim().split(/[\s@]+/);
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase() || "A";
}

/**
 * The top bar: sidebar trigger, identity breadcrumb (dashboard → section →
 * agent), a ⌘K jump-to search, then theme, alerts and the account menu. It is
 * 64px tall on desktop so it lines up with the sidebar logo row.
 */
function ShellHeader({
  user,
  dashboard,
  alerts,
  plan,
}: {
  user: ShellUser;
  dashboard: ShellDashboard;
  alerts: { count: number; runs: AgentScheduleRunWithContext[] };
  plan: PlanId;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const { agents } = useAgents();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const notices: Notice[] = alerts.runs.map((run) => ({
    id: String(run.id),
    badge: "Run failed",
    title: run.scheduleTitle,
    text: `${run.agentName} · ${timeAgo(run.createdAt)}`,
    action: { label: "Open run history", href: "/dashboard/settings" },
    pattern: "grid",
  }));

  const agentMatch = /^\/dashboard\/agents\/(\d+)/.exec(pathname);
  const agentId = agentMatch ? Number(agentMatch[1]) : null;
  const agent = agentId === null ? null : agents.find((entry) => entry.id === agentId) ?? null;
  const section =
    agentId !== null
      ? { href: "/dashboard", label: "Agents", icon: Sparkles }
      : SECTIONS.filter((entry) => pathname.startsWith(entry.href)).sort(
          (a, b) => b.href.length - a.href.length,
        )[0] ?? null;

  const isDashboardHome = pathname === "/dashboard";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setPaletteOpen(false);
    router.push(href);
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border/60 bg-background/75 px-2.5 backdrop-blur-2xl sm:h-16 sm:gap-2.5 sm:px-4">
        <SidebarTrigger className="size-9 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" />

        <span aria-hidden="true" className="hidden h-5 w-px bg-border/60 sm:block" />

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5">
            <li className="min-w-0">
              <Link
                href="/dashboard"
                className="flex max-w-[9rem] items-center gap-1.5 rounded-lg py-1 pr-1 text-[0.8rem] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[14rem]"
              >
                {isDashboardHome ? (
                  <AgentAvatar
                    avatar={getDashboardPortrait(dashboard.icon)}
                    color={dashboard.color}
                    className="size-5 shrink-0"
                  />
                ) : (
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-muted/80 text-muted-foreground">
                    <LayoutGrid className="size-3" />
                  </span>
                )}
                <span className="truncate">{dashboard.name}</span>
              </Link>
            </li>

            {section ? (
              <>
                <li aria-hidden="true" className="shrink-0">
                  <ChevronRight className="size-3 text-muted-foreground/45" />
                </li>
                <li className="min-w-0">
                  {agent ? (
                    <span className="flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
                      <Sparkles className="size-3.5 shrink-0" />
                      <span className="hidden sm:inline">{section.label}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 truncate text-[0.8rem] font-semibold text-foreground">
                      <section.icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{section.label}</span>
                    </span>
                  )}
                </li>
              </>
            ) : null}

            {agent ? (
              <>
                <li aria-hidden="true" className="shrink-0">
                  <ChevronRight className="size-3 text-muted-foreground/45" />
                </li>
                <li className="flex min-w-0 items-center gap-1.5">
                  <AgentAvatar avatar={agent.avatar} color={agent.color} className="size-5 shrink-0" />
                  <span className="truncate text-[0.8rem] font-semibold text-foreground">
                    {agent.name}
                  </span>
                  <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-emerald-700 sm:inline-flex dark:bg-emerald-500/10 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </li>
              </>
            ) : null}
          </ol>
        </nav>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search pages and agents"
          className="flex h-9 items-center gap-2 rounded-full border border-border/70 bg-card/80 px-2.5 text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[border-color,background-color,color,box-shadow] hover:border-border hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:w-60 sm:justify-start sm:px-3"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden flex-1 text-left text-[0.78rem] sm:inline">Search workspace…</span>
          <kbd className="hidden h-5 items-center rounded-md border border-border/70 bg-background/90 px-1.5 font-sans text-[0.6rem] font-medium tracking-wide text-muted-foreground sm:inline-flex">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <ThemeMenu className="size-9 rounded-lg" />

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Notifications" className={cn(HEADER_ICON_BUTTON, "relative")}>
              <Bell className="size-4" />
              {alerts.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[0.55rem] leading-4 font-semibold text-white tabular-nums ring-2 ring-background">
                  {alerts.count > 9 ? "9+" : alerts.count}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-[min(calc(100vw-2rem),20rem)] p-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                <p className="text-[0.78rem] font-semibold">Notifications</p>
                {alerts.count > 0 ? (
                  <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.62rem] font-medium text-rose-700 tabular-nums">
                    {alerts.count} failed
                  </span>
                ) : (
                  <span className="text-[0.62rem] text-muted-foreground">All clear</span>
                )}
              </div>

              {alerts.runs.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Bell className="mx-auto size-5 text-muted-foreground/50" />
                  <p className="mt-2 text-[0.78rem] font-medium">You&rsquo;re all caught up</p>
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                    Failed agent runs from the last 7 days show up here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-2">
                    <NotificationStack notices={notices} />
                  </div>
                  <div className="border-t border-border/60 px-3 py-2">
                    <Link
                      href="/dashboard/settings"
                      className="text-[0.72rem] font-medium text-brand-ink hover:underline"
                    >
                      Open run history
                    </Link>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-border/70 sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Your account"
              className="flex items-center gap-1.5 rounded-full p-0.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Avatar className="size-8 ring-1 ring-border">
                {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
                <AvatarFallback className="bg-foreground text-[0.62rem] font-semibold text-background">
                  {initials(user.name || user.email)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-28 truncate pr-0.5 text-[0.78rem] font-medium lg:block">
                {user.name || user.email}
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-[min(calc(100vw-2rem),17rem)] p-0">
              <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-3">
                <Avatar className="size-10 shrink-0 ring-1 ring-border">
                  {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
                  <AvatarFallback className="bg-foreground text-[0.7rem] font-semibold text-background">
                    {initials(user.name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.82rem] leading-tight font-semibold">
                    {user.name || "Signed in"}
                  </p>
                  <p className="truncate text-[0.68rem] leading-tight text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[0.58rem] font-semibold tracking-[0.08em] uppercase",
                    plan === "pro"
                      ? "brand-gradient text-brand-on"
                      : "border border-border bg-muted text-muted-foreground",
                  )}
                >
                  {plan}
                </span>
              </div>

              <DropdownMenuGroup className="p-1.5">
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/dashboards")}
                  className="gap-2.5 text-[0.8rem]"
                >
                  <LayoutGrid className="size-4 text-muted-foreground" />
                  Dashboards
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/settings")}
                  className="gap-2.5 text-[0.8rem]"
                >
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  Settings
                </DropdownMenuItem>
                {plan === "free" ? (
                  <DropdownMenuItem
                    nativeButton={false}
                    render={<Link href={PRICING_URL} />}
                    className="gap-2.5 text-[0.8rem] text-brand-ink"
                  >
                    <Sparkles className="size-4" />
                    Upgrade to Pro
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuGroup className="p-1.5">
                <DropdownMenuItem
                  variant="destructive"
                  nativeButton
                  render={<button type="submit" form="app-sign-out" />}
                  className="gap-2.5 text-[0.8rem]"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        title="Search"
        description="Jump to a page or an agent"
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput placeholder="Search pages and agents…" autoFocus />
          <CommandList>
            <CommandEmpty>Nothing found.</CommandEmpty>
            <CommandGroup heading="Workspace">
              {[
                { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
                ...SECTIONS.filter((item) => item.href !== "/dashboard/automations"),
              ].map((item) => (
                <CommandItem
                  key={item.href}
                  value={`page ${item.label}`}
                  onSelect={() => go(item.href)}
                  className="gap-2.5"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted/70 text-muted-foreground">
                    <item.icon className="size-3.5" />
                  </span>
                  <span className="text-[0.82rem] font-medium">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {agents.length > 0 ? (
              <CommandGroup heading="Agents">
                {agents.map((entry) => (
                  <CommandItem
                    key={entry.id}
                    value={`agent ${entry.name}`}
                    onSelect={() => go(`/dashboard/agents/${entry.id}`)}
                    className="gap-2.5"
                  >
                    <AgentAvatar avatar={entry.avatar} color={entry.color} className="size-5 shrink-0" />
                    <span className="flex-1 truncate text-[0.82rem] font-medium">{entry.name}</span>
                    {entry.id === agentId ? (
                      <span className="text-[0.62rem] text-muted-foreground">Open now</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-[0.64rem] text-muted-foreground">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span>esc to close</span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}

export function DashboardShell({
  user,
  dashboard,
  dashboards,
  agentCounts,
  widgetCounts,
  agents,
  models,
  alerts,
  connectedApps,
  plan,
  defaultOpen,
  children,
}: {
  user: ShellUser;
  dashboard: ShellDashboard;
  dashboards: ShellDashboard[];
  /** Agents per dashboard, for the "Your dashboards" dialog. */
  agentCounts?: Record<number, number>;
  /** Widgets per dashboard, shown beside the agent count. */
  widgetCounts?: Record<number, number>;
  agents: AgentSummary[];
  models: AgentModelCatalog;
  alerts: { count: number; runs: AgentScheduleRunWithContext[] };
  /** Apps connected through Composio; the sidebar shows the count. */
  connectedApps?: number;
  plan: PlanId;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <AgentsProvider initialAgents={agents} models={models}>
      <SidebarProvider defaultOpen={defaultOpen}>
        {/* Referenced by the sign-out menu items so they work from inside menus. */}
        <form id="app-sign-out" action={signOutAction} className="hidden" />

        <AppSidebar
          user={user}
          dashboard={dashboard}
          dashboards={dashboards}
          agentCounts={agentCounts}
          widgetCounts={widgetCounts}
          connectedApps={connectedApps}
          plan={plan}
        />

        <SidebarInset>
          <ShellHeader user={user} dashboard={dashboard} alerts={alerts} plan={plan} />

          <div className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden bg-background p-3 sm:p-6 lg:p-8">
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
              <div className="premium-grid absolute inset-0 opacity-35 [mask-image:radial-gradient(70%_50%_at_50%_0%,black,transparent)]" />
              <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--brand-soft)_55%,transparent),transparent)]" />
            </div>
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AgentsProvider>
  );
}

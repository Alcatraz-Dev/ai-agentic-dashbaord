"use client";

import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppWindow,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronsUpDown,
  Folder,
  FolderOpen,
  GitBranch,
  LayoutGrid,
  LogOut,
  Package,
  Plus,
  SlidersHorizontal,
  Sparkles,
  SquareKanban,
  Trash2,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { deleteAgentAction } from "@/app/actions/agents";
import { switchDashboardAction } from "@/app/actions/dashboards";
import { LogoMark } from "@/components/brand/logo";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { useAgents } from "@/components/dashboard/agents-provider";
import { CreateAgentButton } from "@/components/dashboard/create-agent-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { TreeView, type TreeNode } from "@/components/ui/tree-view";
import {
  getDashboardPortrait,
  getDashboardTemplate,
} from "@/lib/dashboard-options";
import { PRICING_URL, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

type SidebarUser = {
  name: string;
  email: string;
  imageUrl: string | null;
};

type SidebarDashboard = {
  id: number;
  name: string;
  icon: string;
  color: string;
  template: string;
};

/** Compact icon-mode / footer row. */
const NAV_ITEM =
  "h-6.5 gap-1.5 rounded-lg px-1.5 text-[0.68rem] font-medium text-sidebar-foreground/80 transition-[background-color,color] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-active:bg-brand-soft/80 data-active:font-semibold data-active:text-foreground";

type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const NAV_GROUPS: { id: string; label: string; items: NavEntry[] }[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutGrid,
        match: (pathname) => pathname === "/dashboard",
      },
      {
        href: "/dashboard/apps",
        label: "Apps",
        icon: AppWindow,
        match: (pathname) => pathname.startsWith("/dashboard/apps"),
      },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      {
        href: "/dashboard/mcps",
        label: "MCPs",
        icon: Waypoints,
        match: (pathname) => pathname.startsWith("/dashboard/mcps"),
      },
      {
        href: "/dashboard/plugins",
        label: "Plugins",
        icon: Package,
        match: (pathname) => pathname.startsWith("/dashboard/plugins"),
      },
      {
        href: "/dashboard/skills",
        label: "Skills",
        icon: BookOpen,
        match: (pathname) => pathname.startsWith("/dashboard/skills"),
      },
      {
        href: "/dashboard/diagrams",
        label: "Diagrams",
        icon: GitBranch,
        match: (pathname) => pathname.startsWith("/dashboard/diagrams"),
      },
      {
        href: "/dashboard/memory",
        label: "Memory",
        icon: Brain,
        match: (pathname) => pathname.startsWith("/dashboard/memory"),
      },
    ],
  },
  {
    id: "work",
    label: "Work",
    items: [
      {
        href: "/dashboard/tasks",
        label: "Tasks",
        icon: SquareKanban,
        match: (pathname) => pathname.startsWith("/dashboard/tasks"),
      },
      {
        href: "/dashboard/jobs",
        label: "Scheduled jobs",
        icon: CalendarClock,
        match: (pathname) =>
          pathname.startsWith("/dashboard/jobs") ||
          pathname.startsWith("/dashboard/automations"),
      },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function navLeafId(href: string) {
  return href;
}

function groupId(id: string) {
  return `group:${id}`;
}

function initials(value: string) {
  const [first = "", second = ""] = value.trim().split(/[\s@]+/);
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase() || "A";
}

export function AppSidebar({
  user,
  dashboard,
  dashboards,
  connectedApps = 0,
  plan = "free",
}: {
  user: SidebarUser;
  dashboard: SidebarDashboard;
  dashboards: SidebarDashboard[];
  /** Apps connected through Composio, shown as a count next to Apps. */
  connectedApps?: number;
  /** Free workspaces see the Upgrade to Pro item in the footer. */
  plan?: PlanId;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  const iconCollapsed = sidebarState === "collapsed" && !isMobile;

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [pathname, isMobile, setOpenMobile]);

  const { agents, removeAgent } = useAgents();
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const portrait = getDashboardPortrait(dashboard.icon);
  const template = getDashboardTemplate(dashboard.template);
  const onSettingsPage = pathname.startsWith("/dashboard/dashboards");

  const activeNavHref =
    ALL_NAV_ITEMS.find((item) => item.match(pathname))?.href ?? null;

  const activeGroupIds = NAV_GROUPS.filter((group) =>
    group.items.some((item) => item.match(pathname)),
  ).map((group) => groupId(group.id));

  const [expandedNav, setExpandedNav] = useState<string[]>(() =>
    NAV_GROUPS.map((group) => groupId(group.id)),
  );

  const activeGroupKey = activeGroupIds.join(",");
  useEffect(() => {
    if (!activeGroupKey) return;
    const ids = activeGroupKey.split(",");
    setExpandedNav((prev) => {
      const missing = ids.filter((id) => !prev.includes(id));
      return missing.length === 0 ? prev : [...prev, ...missing];
    });
  }, [activeGroupKey]);

  const navTreeItems: TreeNode[] = NAV_GROUPS.map((group) => ({
    id: groupId(group.id),
    label: group.label,
    icon: <Folder className="size-3" />,
    openIcon: <FolderOpen className="size-3" />,
    meta: (
      <span className="tabular-nums text-[0.52rem] text-muted-foreground">
        {group.items.length}
      </span>
    ),
    children: group.items.map((item) => {
      const Icon = item.icon;
      const showAppsBadge = item.href === "/dashboard/apps" && connectedApps > 0;
      return {
        id: navLeafId(item.href),
        label: item.label,
        icon: <Icon className="size-3" />,
        meta: showAppsBadge ? (
          <span className="rounded-full bg-emerald-50 px-1 py-px text-[0.5rem] font-semibold text-emerald-700 tabular-nums dark:bg-emerald-500/10 dark:text-emerald-300">
            {connectedApps}
          </span>
        ) : undefined,
      };
    }),
  }));

  async function switchDashboard(next: SidebarDashboard) {
    if (next.id === dashboard.id || switching !== null) return;

    setSwitching(next.id);
    setSwitchError(null);

    try {
      const result = await switchDashboardAction(next.id);
      if (!result.ok) {
        setSwitchError(result.error);
        return;
      }

      if (pathname !== "/dashboard") router.push("/dashboard");
      router.refresh();
    } catch {
      setSwitchError("We couldn't switch dashboards. Please try again.");
    } finally {
      setSwitching(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || isDeleting) return;

    const { id } = pendingDelete;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteAgentAction({ id });
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }

      removeAgent(id);
      setPendingDelete(null);

      if (pathname === `/dashboard/agents/${id}`) {
        router.replace("/dashboard");
      } else {
        router.refresh();
      }
    } catch {
      setDeleteError("We couldn't delete that agent. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border/80">
      <SidebarHeader className="h-12 justify-center gap-0 border-b border-sidebar-border/60 px-2 py-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 rounded-lg px-1 py-1 outline-none group-data-[collapsible=icon]:justify-center focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogoMark className="size-5 rounded-md shadow-md ring-1 ring-black/5" />
          <span className="truncate text-[0.8rem] font-semibold tracking-[-0.02em] group-data-[collapsible=icon]:hidden">
            Alcatraz<span className="text-brand-ink">.</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="pt-3">
          <SidebarGroupContent>
            {/* Dashboard picker */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex h-8 w-full items-center gap-1.5 rounded-lg border border-sidebar-border bg-card px-1.5 text-left shadow-sm transition-[background-color,border-color,box-shadow] outline-none hover:border-brand-border hover:bg-brand-soft/30 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  "group-data-[collapsible=icon]:size-6 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none",
                )}
              >
                <AgentAvatar
                  avatar={portrait}
                  color={dashboard.color}
                  className="size-5 shrink-0 rounded-md shadow-sm ring-1 ring-black/5"
                />
                <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <span className="block truncate text-[0.7rem] leading-tight font-semibold">
                    {dashboard.name}
                  </span>
                  <span className="block truncate text-[0.54rem] leading-tight text-muted-foreground">
                    {template.name} template
                  </span>
                </span>
                <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" sideOffset={6} className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 py-1 text-[0.6rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Your dashboards
                  </DropdownMenuLabel>
                  {dashboards.map((option) => {
                    const active = option.id === dashboard.id;

                    return (
                      <DropdownMenuItem
                        key={option.id}
                        className={cn("gap-2.5 px-2 py-2", active && "bg-brand-soft/50")}
                        onClick={() => void switchDashboard(option)}
                      >
                        <AgentAvatar
                          avatar={getDashboardPortrait(option.icon)}
                          color={option.color}
                          className="size-7 shrink-0 rounded-lg"
                        />
                        <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium">
                          {option.name}
                        </span>
                        {switching === option.id ? (
                          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                        ) : active ? (
                          <Check className="size-3.5 shrink-0 text-brand-ink" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                  {switchError ? (
                    <p role="alert" className="px-2 pb-1 text-[0.7rem] text-destructive">
                      {switchError}
                    </p>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  nativeButton={false}
                  render={<Link href="/dashboard/new" />}
                  className="gap-2.5 px-2 py-2"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-muted/60 text-muted-foreground">
                    <Plus className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.82rem] font-medium leading-tight">
                      New dashboard
                    </span>
                    <span className="block truncate text-[0.65rem] text-muted-foreground">
                      Pick a portrait and template
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  nativeButton={false}
                  render={<Link href="/dashboard/dashboards" />}
                  className={cn("gap-2.5 px-2 py-2", onSettingsPage && "bg-muted")}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg border",
                      onSettingsPage
                        ? "border-brand-border bg-brand-soft text-brand-ink"
                        : "border-border bg-muted/60 text-muted-foreground",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.82rem] font-medium leading-tight">
                      Dashboard settings
                    </span>
                    <span className="block truncate text-[0.65rem] text-muted-foreground">
                      {onSettingsPage ? "Editing this dashboard" : dashboard.name} · portrait,
                      template
                    </span>
                  </span>
                  {onSettingsPage ? (
                    <Check className="size-3.5 shrink-0 text-brand-ink" />
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mx-1 my-2 h-px bg-sidebar-border/60 group-data-[collapsible=icon]:mx-0" />

            {iconCollapsed ? (
              <SidebarMenu className="gap-0.5">
                {ALL_NAV_ITEMS.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        isActive={active}
                        render={<Link href={item.href} />}
                        className={NAV_ITEM}
                      >
                        <Icon className="size-3" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <TreeView
                aria-label="Workspace navigation"
                guides
                items={navTreeItems}
                expanded={expandedNav}
                onExpandedChange={setExpandedNav}
                selected={activeNavHref}
                onSelect={(id) => {
                  if (id.startsWith("/")) router.push(id);
                }}
                className="sidebar-nav-tree px-0.5"
              />
            )}

            <div className="mt-2">
              <CreateAgentButton
                id="sidebar-create-agent"
                className={cn(
                  "h-7 w-full justify-start gap-1.5 rounded-lg bg-foreground px-2 text-[0.68rem] font-semibold text-background shadow-sm transition-[background-color,box-shadow,transform] hover:bg-foreground/90 hover:shadow-md active:scale-[0.995]",
                  "group-data-[collapsible=icon]:size-6 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                )}
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="pt-0.5">
          <SidebarGroupLabel className="flex h-6 items-center px-2 text-[0.52rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <span>Agents</span>
            <span className="ml-auto flex items-center gap-1">
              {agents.length > 0 && (
                <span className="rounded-full bg-sidebar-accent px-1.5 text-[0.5rem] font-semibold tabular-nums text-sidebar-accent-foreground">
                  {agents.length}
                </span>
              )}
              <span
                role="button"
                tabIndex={0}
                title="Create AI agent"
                aria-label="Create AI agent"
                onClick={() => {
                  const trigger = document.getElementById("sidebar-create-agent");
                  if (trigger instanceof HTMLElement) trigger.click();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const trigger = document.getElementById("sidebar-create-agent");
                    if (trigger instanceof HTMLElement) trigger.click();
                  }
                }}
                className="grid size-3.5 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Plus className="size-3" />
              </span>
            </span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {agents.length > 0 ? (
              <SidebarMenu className="gap-px">
                {agents.map((agent) => {
                  const active = pathname === `/dashboard/agents/${agent.id}`;
                  return (
                    <SidebarMenuItem key={agent.id} className="group/agent">
                      <SidebarMenuButton
                        tooltip={agent.name}
                        isActive={active}
                        render={<Link href={`/dashboard/agents/${agent.id}`} />}
                        className={cn(
                          "relative h-7 gap-1.5 rounded-lg px-1.5 pr-7 text-[0.68rem] transition-colors data-active:bg-brand-soft/70 data-active:text-foreground",
                          "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5! group-data-[collapsible=icon]:pr-0.5!",
                          !active && "hover:bg-sidebar-accent/70",
                        )}
                      >
                        {active ? (
                          <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-brand-ink" />
                        ) : null}
                        <span className="relative shrink-0">
                          <AgentAvatar
                            avatar={agent.avatar}
                            color={agent.color}
                            className={cn(
                              "size-5 rounded-md shadow-sm ring-1 ring-black/5 transition-transform",
                              "group-hover/agent:scale-[1.03] group-data-[collapsible=icon]:size-5 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:shadow-none",
                            )}
                          />
                          {active && (
                            <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-sidebar bg-emerald-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium group-data-[collapsible=icon]:hidden">
                          {agent.name}
                        </span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        type="button"
                        showOnHover
                        title={`Delete ${agent.name}`}
                        aria-label={`Delete ${agent.name}`}
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete({ id: agent.id, name: agent.name });
                        }}
                        className="top-1/2! -translate-y-1/2 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover/agent:opacity-100 group-focus-within/agent:opacity-100 dark:hover:bg-rose-500/10"
                      >
                        <Trash2 className="size-3" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            ) : (
              <>
                <div className="mt-1 rounded-lg border border-dashed border-sidebar-border bg-gradient-to-b from-card to-muted/20 px-2.5 py-2.5 text-center group-data-[collapsible=icon]:hidden">
                  <span className="mx-auto grid size-6 place-items-center rounded-lg bg-muted text-foreground shadow-sm ring-1 ring-border">
                    <Sparkles className="size-3 text-brand-ink" />
                  </span>
                  <p className="mt-1.5 text-[0.68rem] font-semibold">No agents yet</p>
                  <p className="mx-auto mt-0.5 max-w-[12rem] text-[0.6rem] leading-relaxed text-muted-foreground">
                    Create an agent to chat, run tasks, and build widgets.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const trigger = document.getElementById("sidebar-create-agent");
                      if (trigger instanceof HTMLElement) trigger.click();
                    }}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[0.65rem] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <Plus className="size-3" />
                    New agent
                  </button>
                </div>
                <div className="hidden justify-center pt-1 group-data-[collapsible=icon]:flex">
                  <button
                    type="button"
                    title="Create your first agent"
                    aria-label="Create your first agent"
                    onClick={() => {
                      const trigger = document.getElementById("sidebar-create-agent");
                      if (trigger instanceof HTMLElement) trigger.click();
                    }}
                    className="grid size-7 place-items-center rounded-lg border border-dashed border-sidebar-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  >
                    <Sparkles className="size-3.5" />
                  </button>
                </div>
              </>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0.5 border-t border-sidebar-border/60 p-1.5">
        <SidebarMenu>
          {plan === "free" ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Upgrade to Pro"
                render={<Link href={PRICING_URL} />}
                className="brand-gradient h-6.5 gap-1.5 rounded-lg px-2 text-[0.68rem] font-semibold text-brand-on shadow-sm transition-[filter,box-shadow] hover:text-brand-on hover:shadow-md hover:brightness-105 focus-visible:text-brand-on active:text-brand-on active:brightness-95"
              >
                <Sparkles className="size-3" />
                <span>Upgrade to Pro</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={pathname.startsWith("/dashboard/settings")}
              render={<Link href="/dashboard/settings" />}
              className={NAV_ITEM}
            >
              <SlidersHorizontal className="size-3 text-muted-foreground" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mx-1 mt-1 mb-1.5 h-px bg-sidebar-border/70 group-data-[collapsible=icon]:mx-0" />

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0.5",
            )}
          >
            <Avatar className="size-5 shrink-0 rounded-md ring-1 ring-border/70">
              {user.imageUrl ? <AvatarImage src={user.imageUrl} alt="" /> : null}
              <AvatarFallback className="bg-foreground text-[0.55rem] font-semibold text-background">
                {initials(user.name || user.email)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-[0.68rem] leading-tight font-medium">
                {user.name || "Your account"}
              </span>
              <span className="block truncate text-[0.54rem] leading-tight text-muted-foreground">
                {user.email}
              </span>
            </span>
            {plan === "pro" ? (
              <span className="brand-gradient hidden shrink-0 rounded-full px-1.5 py-px text-[0.5rem] font-semibold tracking-wide text-brand-on uppercase group-data-[collapsible=icon]:hidden sm:inline-flex">
                Pro
              </span>
            ) : null}
            <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="block truncate text-[0.78rem] font-medium text-foreground">
                  {user.name || "Signed in"}
                </span>
                <span className="block truncate text-[0.7rem] font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton={false}
              render={<Link href="/dashboard/settings" />}
              className="gap-2 text-[0.82rem]"
            >
              <SlidersHorizontal className="size-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              nativeButton
              render={<button type="submit" form="app-sign-out" />}
              className="gap-2 text-[0.82rem]"
            >
              <LogOut className="size-3.5" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{pendingDelete?.name}</span> will be
              removed along with its chat history and schedules. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={confirmDelete}>
              {isDeleting ? "Deleting…" : "Delete agent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

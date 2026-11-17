import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Cable,
  CalendarClock,
  LayoutPanelTop,
  Monitor,
  Plug,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { SkillsManager } from "@/components/skills/skills-manager";
import { listCustomSkillsForUser } from "@/lib/custom-skills";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Skills" };

type Skill = {
  name: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  href: string;
  cta: string;
};

const SKILLS: Skill[] = [
  {
    name: "Deep research",
    description: "Search the live web, compare sources and read long pages before answering.",
    icon: Search,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard/plugins",
    cta: "See research plugins",
  },
  {
    name: "Live browsing",
    description: "Drive a real cloud browser through sign-ins, clicks, forms and multi-step flows.",
    icon: Monitor,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard/plugins",
    cta: "See browser plugins",
  },
  {
    name: "Connected apps",
    description: "Work inside 1,700+ services through Composio, with approvals before any change.",
    icon: Plug,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard/apps",
    cta: "Browse apps",
  },
  {
    name: "Custom MCP tools",
    description: "Bring any remote MCP server and give every agent its tools in one connection.",
    icon: Cable,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard/mcps",
    cta: "Add a server",
  },
  {
    name: "Dashboard widgets",
    description: "Turn a result into a live card on the dashboard, refreshed as new data arrives.",
    icon: LayoutPanelTop,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard",
    cta: "Open dashboard",
  },
  {
    name: "Scheduled runs",
    description: "Run an agent on a cadence and keep its widgets and run history up to date.",
    icon: CalendarClock,
    tone: "bg-muted text-foreground ring-border",
    href: "/dashboard/settings",
    cta: "View run history",
  },
];

/**
 * A plain-language index of what every agent can do. Skills are not installed,
 * billed or enabled globally: they are the product surfaces the runtime already
 * exposes, with a path to the place that controls each one.
 */
export default async function SkillsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const customSkills = await listCustomSkillsForUser(profile.id);
  const totalSkills = SKILLS.length + customSkills.length;

  return (
    <div className="aui-page max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            Agent capabilities
          </p>
          <h1 className="aui-title mt-2">Skills</h1>
          <p className="aui-subtitle mt-2">
            Add your own playbooks on top of the built-in capabilities. A skill is listed to every
            agent and loaded only when a task needs it.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{totalSkills}</span>{" "}
          skills · {customSkills.length} custom
        </span>
      </div>

      <SkillsManager skills={customSkills} />

      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            Built in
          </p>
          <h2 className="mt-1 text-[0.95rem] font-semibold">Included with every agent</h2>
        </div>
        <span className="text-[0.68rem] text-muted-foreground tabular-nums">
          {SKILLS.length} capabilities
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;

          return (
            <article
              key={skill.name}
              className="group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
                    skill.tone,
                  )}
                >
                  <Icon className="size-[1.15rem]" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h2 className="text-[0.9rem] font-semibold">{skill.name}</h2>
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.58rem] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
                      Included
                    </span>
                  </div>
                  <p className="mt-0.5 text-[0.66rem] text-muted-foreground">Always available</p>
                </div>
              </div>

              <p className="mt-3 text-[0.75rem] leading-relaxed text-muted-foreground">
                {skill.description}
              </p>

              <Link
                href={skill.href}
                className="mt-auto flex items-center gap-1 border-t border-border/60 pt-3 text-[0.7rem] font-medium text-brand-ink transition-colors hover:text-foreground"
              >
                {skill.cta}
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-brand-border bg-brand-soft px-4 py-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-ink" />
        <p className="text-[0.74rem] leading-relaxed text-muted-foreground">
          A skill is only used when the task calls for it. An agent&apos;s instructions and its
          plugin switches decide how far it can go — nothing runs in the background unless you
          schedule it.
        </p>
      </div>
    </div>
  );
}

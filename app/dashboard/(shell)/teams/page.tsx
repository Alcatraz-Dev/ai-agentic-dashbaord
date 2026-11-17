import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";

import { TeamsManager } from "@/components/teams/teams-manager";
import { listAgentsForUser } from "@/lib/agents";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { listTeamsForUser } from "@/lib/teams";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Teams" };

/**
 * Teams on the active dashboard. The page loads the board's agents as the
 * roster pool, so the dialog can only offer agents that really share this board
 * — a team never spans two dashboards.
 */
export default async function TeamsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const [teams, agents] = await Promise.all([
    listTeamsForUser(profile.id, dashboard.id),
    listAgentsForUser(profile.id, dashboard.id),
  ]);

  return (
    <div className="aui-page max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Work</p>
          <h1 className="aui-title mt-2">Teams</h1>
          <p className="aui-subtitle mt-2">
            Agents that work together, led by one of them. A team chat runs with the lead, which can
            hand a self-contained part of the work to a teammate and show you their answer.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <UsersRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{teams.length}</span>{" "}
          {teams.length === 1 ? "team" : "teams"} on {dashboard.name}
        </span>
      </div>

      <TeamsManager teams={teams} agents={agents} />
    </div>
  );
}

import "server-only";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { agents, db, teams } from "@/db";
import {
  normalizeTeamAvatar,
  type TeamMember,
  type TeamSummary,
} from "@/lib/team-types";

/**
 * Teams are workspace records with one twist: the roster is not a join table.
 * `agents.team_id` is the membership, so there is exactly one source of truth
 * and an agent can never be listed on two teams at once. Every write here is
 * owner-scoped, and membership is only ever given to agents the owner has on
 * the team's own board.
 */

type TeamRow = typeof teams.$inferSelect;

const memberColumns = {
  id: agents.id,
  name: agents.name,
  avatar: agents.avatar,
  color: agents.color,
  objective: agents.objective,
  provider: agents.provider,
  approvalMode: agents.approvalMode,
};

/** Members grouped by team id, one query for the whole list. */
async function membersByTeam(
  profileId: number,
  teamIds: number[],
): Promise<Map<number, TeamMember[]>> {
  const grouped = new Map<number, TeamMember[]>();
  if (teamIds.length === 0) return grouped;

  const rows = await db
    .select({ ...memberColumns, teamId: agents.teamId })
    .from(agents)
    .where(and(eq(agents.ownerId, profileId), inArray(agents.teamId, teamIds)))
    .orderBy(asc(agents.createdAt), asc(agents.id));

  for (const row of rows) {
    if (row.teamId === null) continue;
    const { teamId, ...member } = row;
    const list = grouped.get(teamId) ?? [];
    list.push({
      ...member,
      // Stored text; the UI only ever sees the three known modes.
      approvalMode: member.approvalMode as TeamMember["approvalMode"],
    });
    grouped.set(teamId, list);
  }

  return grouped;
}

function toSummary(row: TeamRow, members: TeamMember[]): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    objective: row.objective,
    dashboardId: row.dashboardId,
    leadAgentId: row.leadAgentId,
    members,
    createdAt: row.createdAt.toISOString(),
  };
}

/** One board's teams, or every team in the workspace when no board is given. */
export async function listTeamsForUser(
  profileId: number,
  dashboardId?: number | null,
): Promise<TeamSummary[]> {
  const scope =
    typeof dashboardId === "number" && Number.isInteger(dashboardId) && dashboardId > 0
      ? and(eq(teams.ownerId, profileId), eq(teams.dashboardId, dashboardId))
      : eq(teams.ownerId, profileId);

  const rows = await db.select().from(teams).where(scope).orderBy(asc(teams.createdAt), asc(teams.id));
  const members = await membersByTeam(
    profileId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toSummary(row, members.get(row.id) ?? []));
}

/** One team, scoped to its owner. Null when missing or not theirs. */
export async function getTeamForUser(
  profileId: number,
  teamId: number,
): Promise<TeamSummary | null> {
  if (!Number.isInteger(teamId) || teamId <= 0) return null;

  const [row] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, profileId)))
    .limit(1);
  if (!row) return null;

  const members = await membersByTeam(profileId, [row.id]);
  return toSummary(row, members.get(row.id) ?? []);
}

export async function countTeamsForUser(profileId: number): Promise<number> {
  const rows = await db.select({ id: teams.id }).from(teams).where(eq(teams.ownerId, profileId));
  return rows.length;
}

/**
 * Who may join: the owner's agents on the team's own board. Anything else is
 * dropped rather than rejected, so a stale form (an agent deleted in another
 * tab) still saves the rest of the roster.
 */
async function eligibleMemberIds(
  profileId: number,
  dashboardId: number | null,
  requested: number[],
): Promise<number[]> {
  const ids = [...new Set(requested)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        eq(agents.ownerId, profileId),
        inArray(agents.id, ids),
        typeof dashboardId === "number" ? eq(agents.dashboardId, dashboardId) : undefined,
      ),
    );

  const allowed = new Set(rows.map((row) => row.id));
  return ids.filter((id) => allowed.has(id));
}

/** Points the roster at this team and detaches everyone else who was on it. */
async function setMembership(
  profileId: number,
  teamId: number,
  memberIds: number[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const detach = and(eq(agents.ownerId, profileId), eq(agents.teamId, teamId));
    await tx
      .update(agents)
      .set({ teamId: null, updatedAt: new Date() })
      .where(
        memberIds.length > 0
          ? and(detach, notInArray(agents.id, memberIds))
          : detach,
      );

    if (memberIds.length > 0) {
      await tx
        .update(agents)
        .set({ teamId, updatedAt: new Date() })
        .where(and(eq(agents.ownerId, profileId), inArray(agents.id, memberIds)));
    }
  });
}

export type TeamInput = {
  name: string;
  avatar: string;
  color: string;
  objective: string | null;
  /** The lead must be one of `memberIds`; anything else stores null. */
  leadAgentId: number | null;
  memberIds: number[];
};

export async function createTeamForUser(
  profileId: number,
  input: TeamInput,
  dashboardId: number | null,
): Promise<TeamSummary | null> {
  const memberIds = await eligibleMemberIds(profileId, dashboardId, input.memberIds);
  const leadAgentId =
    input.leadAgentId !== null && memberIds.includes(input.leadAgentId)
      ? input.leadAgentId
      : null;

  const [row] = await db
    .insert(teams)
    .values({
      ownerId: profileId,
      dashboardId,
      name: input.name,
      avatar: normalizeTeamAvatar(input.avatar),
      color: input.color,
      objective: input.objective,
      leadAgentId,
    })
    .returning();

  if (!row) return null;

  if (memberIds.length > 0) await setMembership(profileId, row.id, memberIds);
  return getTeamForUser(profileId, row.id);
}

/**
 * Saves a team and its roster. A member list is a full replacement: everyone
 * named joins, everyone else who was on this team is detached. Another team
 * they belong to is overwritten too, because `agents.team_id` holds one team.
 */
export async function updateTeamForUser(
  profileId: number,
  teamId: number,
  input: TeamInput,
): Promise<TeamSummary | null> {
  if (!Number.isInteger(teamId) || teamId <= 0) return null;

  const existing = await getTeamForUser(profileId, teamId);
  if (!existing) return null;

  const memberIds = await eligibleMemberIds(profileId, existing.dashboardId, input.memberIds);
  const leadAgentId =
    input.leadAgentId !== null && memberIds.includes(input.leadAgentId)
      ? input.leadAgentId
      : null;

  const [row] = await db
    .update(teams)
    .set({
      name: input.name,
      avatar: normalizeTeamAvatar(input.avatar),
      color: input.color,
      objective: input.objective,
      leadAgentId,
      updatedAt: new Date(),
    })
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, profileId)))
    .returning();

  if (!row) return null;

  await setMembership(profileId, teamId, memberIds);
  return getTeamForUser(profileId, teamId);
}

/** Deletes a team; its agents stay, simply without a team. */
export async function deleteTeamForUser(profileId: number, teamId: number): Promise<boolean> {
  if (!Number.isInteger(teamId) || teamId <= 0) return false;

  const deleted = await db
    .delete(teams)
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, profileId)))
    .returning({ id: teams.id });

  return deleted.length > 0;
}

/** The agents on one team, newest roster read for the runtime's hand-off list. */
export async function listTeamAgentsForUser(
  profileId: number,
  teamId: number,
): Promise<TeamMember[]> {
  const members = await membersByTeam(profileId, [teamId]);
  return members.get(teamId) ?? [];
}

"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_TEAM_AVATAR,
  DEFAULT_TEAM_COLOR,
  TEAM_MEMBERS_MAX,
  TEAMS_MAX,
  normalizeTeamAvatar,
  type TeamSummary,
} from "@/lib/team-types";
import { isAgentColor } from "@/lib/agent-options";
import { getActiveDashboardForProfile } from "@/lib/dashboards";
import {
  countTeamsForUser,
  createTeamForUser,
  deleteTeamForUser,
  getTeamForUser,
  updateTeamForUser,
} from "@/lib/teams";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Teams are written from one dialog: name, portrait, objective, lead and the
 * roster. Validation happens here so the client can't store a nameless team or
 * a "lead" who isn't on it; the store then re-checks ownership and board scope.
 */

export type TeamInput = {
  name: string;
  avatar: string;
  color: string;
  objective?: string | null;
  leadAgentId?: number | null;
  memberIds?: number[];
};

export type TeamActionResult =
  | { ok: true; team: TeamSummary }
  | { ok: false; error: string };

function cleanName(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return [...new Set(ids)].slice(0, TEAM_MEMBERS_MAX);
}

function cleanLead(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function refresh() {
  revalidatePath("/dashboard/teams");
  revalidatePath("/dashboard");
}

export async function createTeamAction(input: TeamInput): Promise<TeamActionResult> {
  const user = await requireUser();

  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "Give this team a name." };
  if (name.length > 48) return { ok: false, error: "Keep the team name under 48 characters." };

  const objective = String(input.objective ?? "").trim();
  if (objective.length > 300) {
    return { ok: false, error: "Keep the objective under 300 characters." };
  }

  try {
    const profile = await ensureUserRecord(user);

    if ((await countTeamsForUser(profile.id)) >= TEAMS_MAX) {
      return { ok: false, error: `A workspace can keep ${TEAMS_MAX} teams. Delete one first.` };
    }

    const dashboard = await getActiveDashboardForProfile(profile.id);
    const team = await createTeamForUser(
      profile.id,
      {
        name,
        avatar: normalizeTeamAvatar(String(input.avatar ?? DEFAULT_TEAM_AVATAR)),
        color: isAgentColor(String(input.color ?? "")) ? input.color : DEFAULT_TEAM_COLOR,
        objective: objective || null,
        leadAgentId: cleanLead(input.leadAgentId),
        memberIds: cleanIds(input.memberIds),
      },
      dashboard?.id ?? null,
    );

    if (!team) return { ok: false, error: "We couldn't create that team. Please try again." };

    refresh();
    return { ok: true, team };
  } catch (error) {
    console.error("[teams] create failed", error);
    return { ok: false, error: "We couldn't create that team. Please try again." };
  }
}

export async function updateTeamAction(
  input: TeamInput & { id: number },
): Promise<TeamActionResult> {
  const user = await requireUser();

  const teamId = Number(input.id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return { ok: false, error: "That team could not be found." };
  }

  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "Give this team a name." };
  if (name.length > 48) return { ok: false, error: "Keep the team name under 48 characters." };

  const objective = String(input.objective ?? "").trim();
  if (objective.length > 300) {
    return { ok: false, error: "Keep the objective under 300 characters." };
  }

  try {
    const profile = await ensureUserRecord(user);

    const existing = await getTeamForUser(profile.id, teamId);
    if (!existing) return { ok: false, error: "That team could not be found." };

    const team = await updateTeamForUser(profile.id, teamId, {
      name,
      avatar: normalizeTeamAvatar(String(input.avatar ?? existing.avatar)),
      color: isAgentColor(String(input.color ?? "")) ? input.color : existing.color,
      objective: objective || null,
      leadAgentId: cleanLead(input.leadAgentId),
      memberIds: cleanIds(input.memberIds),
    });

    if (!team) return { ok: false, error: "That team could not be found." };

    refresh();
    revalidatePath(`/dashboard/teams/${teamId}`);
    return { ok: true, team };
  } catch (error) {
    console.error("[teams] update failed", error);
    return { ok: false, error: "We couldn't save that team. Please try again." };
  }
}

export type DeleteTeamResult = { ok: true } | { ok: false; error: string };

export async function deleteTeamAction(input: { id: number }): Promise<DeleteTeamResult> {
  const user = await requireUser();

  const teamId = Number(input.id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return { ok: false, error: "That team could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteTeamForUser(profile.id, teamId);

    if (!deleted) return { ok: false, error: "That team could not be found." };

    refresh();
    return { ok: true };
  } catch (error) {
    console.error("[teams] delete failed", error);
    return { ok: false, error: "We couldn't delete that team. Please try again." };
  }
}

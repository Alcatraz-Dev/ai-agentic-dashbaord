import { normalizeAgentAvatar, type AgentApprovalMode } from "@/lib/agent-options";

/**
 * Teams: a named group of this workspace's agents with one lead.
 *
 * Membership is `agents.team_id`, so an agent belongs to at most one team and
 * the roster is never a separate list that can drift. The lead is the agent a
 * team chat runs with; it can hand a part of the work to any other member with
 * `ask_teammate`, and its teammates are exactly this roster — not every agent
 * on the board.
 *
 * Client-safe: the Teams page, the team chat page, the runtime prompt and the
 * manager all read these types.
 */

export type TeamMember = {
  id: number;
  name: string;
  avatar: string;
  color: string;
  objective: string | null;
  provider: string;
  approvalMode: AgentApprovalMode;
};

export type TeamSummary = {
  id: number;
  name: string;
  avatar: string;
  color: string;
  objective: string | null;
  /** The board the team works on; null on rows created before boards scoped it. */
  dashboardId: number | null;
  /** Who answers a team chat; null until the owner picks one. */
  leadAgentId: number | null;
  /** Everyone on the team, oldest agent first, lead included. */
  members: TeamMember[];
  createdAt: string;
};

export const TEAM_NAME_MAX_LENGTH = 48;
export const TEAM_OBJECTIVE_MAX_LENGTH = 300;
/** Teams one workspace may keep. A team is a working unit, not a tag. */
export const TEAMS_MAX = 12;
/** Agents one team may hold: enough for a real hand-off chain, bounded so a lead's roster stays readable. */
export const TEAM_MEMBERS_MAX = 8;

export const DEFAULT_TEAM_AVATAR = "circle:attentive";
export const DEFAULT_TEAM_COLOR = "blue";

/** Same canonical portrait value agents store; teams share the maker. */
export function normalizeTeamAvatar(value: string): string {
  return normalizeAgentAvatar(value);
}

/** The lead's member record, or null when the team has no usable lead. */
export function teamLead(team: TeamSummary): TeamMember | null {
  if (team.leadAgentId === null) return null;
  return team.members.find((member) => member.id === team.leadAgentId) ?? null;
}

/** Everyone except the lead: the roster a team chat may hand work to. */
export function teamTeammates(team: TeamSummary): TeamMember[] {
  return team.members.filter((member) => member.id !== team.leadAgentId);
}

/** "Bella, Ravi and Sam" — for empty states and the chat's roster line. */
export function teamMemberNames(members: TeamMember[]): string {
  const names = members.map((member) => member.name);
  if (names.length === 0) return "no agents yet";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a team is missing before a chat can run with it. The page says this in
 * words instead of disabling a button with no explanation.
 */
export function teamReadiness(team: TeamSummary): string | null {
  if (team.members.length === 0) return "Add agents to this team before chatting with it.";
  if (team.leadAgentId === null) return "Pick a lead agent — the team chat runs with it.";
  if (!teamLead(team)) return "The lead is no longer on this team. Pick another one.";
  return null;
}

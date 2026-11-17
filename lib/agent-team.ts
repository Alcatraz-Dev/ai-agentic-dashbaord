/**
 * Teammates: the agents on the same dashboard.
 *
 * A lead can hand one self-contained subtask to a teammate with the
 * `ask_teammate` tool. The teammate runs its own model, instructions, tools and
 * board scope, and its answer comes back into the lead's reply — the lead still
 * owns the final answer. Client-safe: the runtime, the prompt and the chat card
 * all read these types.
 */

export type AgentTeammate = {
  id: number;
  name: string;
  /** One short line on what the teammate is for, shown to the lead. */
  objective: string | null;
  avatar: string;
  color: string;
  /** Stored model key, so the card can say which model answered. */
  provider: string;
};

/** What one hand-off did, forwarded to the chat as a `handoff` event. */
export type AgentHandoffResult = {
  id: string;
  to: { id: number; name: string; avatar: string; color: string };
  /** The instruction the lead gave, in its own words. */
  task: string;
  /** The teammate's answer, or why it could not finish. */
  reply: string;
  ok: boolean;
  durationMs: number;
};

export const TEAM_LIMITS = {
  /** Hand-offs one reply may make. A team is not a way to answer in parallel. */
  handoffsPerReply: 2,
  /** Teammates listed to the model in one run. */
  teammatesMax: 6,
  /** A hand-off brief is one task, not the transcript. */
  taskMax: 600,
} as const;

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Finds a teammate by the name the model used.
 *
 * Exact (case-insensitive) wins, then a unique prefix match, so "Ravi" and
 * "ravi chandra" both reach `Ravi Chandra`. An ambiguous or unknown name is a
 * miss, and the caller answers with the real roster instead of guessing.
 */
export function resolveTeammate(
  teammates: AgentTeammate[],
  query: string,
): AgentTeammate | null {
  const wanted = normalizeName(query);
  if (!wanted) return null;

  const exact = teammates.find((teammate) => normalizeName(teammate.name) === wanted);
  if (exact) return exact;

  // Also accept the first word of a longer name ("Ana" → "Ana Silva").
  const firstWord = teammates.filter(
    (teammate) => normalizeName(teammate.name).split(" ")[0] === wanted,
  );
  if (firstWord.length === 1) return firstWord[0];

  const prefixed = teammates.filter((teammate) => normalizeName(teammate.name).startsWith(wanted));
  return prefixed.length === 1 ? prefixed[0] : null;
}

/** "Ravi, Bella and Sam" — for an error the model can act on. */
export function teammateNames(teammates: AgentTeammate[]): string {
  const names = teammates.map((teammate) => teammate.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

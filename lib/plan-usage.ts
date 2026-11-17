import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { agents, aiUsage, db, users, widgets } from "@/db";
import {
  PLANS,
  PRICING_URL,
  formatTokens,
  normalizePlan,
  type PlanDefinition,
  type PlanId,
} from "@/lib/plans";

/**
 * Everything a plan check needs, read from the database.
 *
 * Tokens are model input + output recorded in `ai_usage` since the first of the
 * current month in UTC. The runtime writes one row per agent turn; the same sum
 * powers the Settings meter, the run guard and the agent-run guard, so a
 * workspace can't be blocked by one number while the UI shows another.
 */

export type PlanUsage = {
  plan: PlanId;
  definition: PlanDefinition;
  agentsUsed: number;
  widgetsUsed: number;
  tokensUsed: number;
  /** First of the month, UTC, as an ISO string. */
  monthStart: string;
};

/** First instant of the current calendar month, UTC. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getPlanUsage(profileId: number): Promise<PlanUsage> {
  const monthStart = monthStartUtc();

  const [userRows, agentRows, widgetRows, usageRows] = await Promise.all([
    db.select({ plan: users.plan }).from(users).where(eq(users.id, profileId)).limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(eq(agents.ownerId, profileId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(widgets)
      .where(eq(widgets.ownerId, profileId)),
    db
      .select({
        tokens: sql<number>`coalesce(sum(${aiUsage.tokensPrompt} + ${aiUsage.tokensCompletion}), 0)::int`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.ownerId, profileId), gte(aiUsage.startedAt, monthStart))),
  ]);

  const plan = normalizePlan(userRows[0]?.plan);

  return {
    plan,
    definition: PLANS[plan],
    agentsUsed: Number(agentRows[0]?.count ?? 0),
    widgetsUsed: Number(widgetRows[0]?.count ?? 0),
    tokensUsed: Number(usageRows[0]?.tokens ?? 0),
    monthStart: monthStart.toISOString(),
  };
}

function upgradeHint(plan: PlanDefinition): string {
  return `Pro includes ${PLANS.pro.agents} agents, ${PLANS.pro.widgets} widgets and ${formatTokens(PLANS.pro.tokens)} tokens a month. See ${PRICING_URL} to upgrade.`;
}

/** Null when another agent fits; otherwise the message to show the owner. */
export async function agentLimitError(profileId: number): Promise<string | null> {
  const usage = await getPlanUsage(profileId);
  if (usage.agentsUsed < usage.definition.agents) return null;

  return `Your ${usage.definition.name} plan includes ${usage.definition.agents} agents. ${upgradeHint(usage.definition)}`;
}

/** Null when another widget fits; otherwise the message to show the owner. */
export async function widgetLimitError(profileId: number): Promise<string | null> {
  const usage = await getPlanUsage(profileId);
  if (usage.widgetsUsed < usage.definition.widgets) return null;

  return `Your ${usage.definition.name} plan includes ${usage.definition.widgets} widgets. ${upgradeHint(usage.definition)}`;
}

/** Null while this month's token budget has room for another agent run. */
export async function agentRunLimitError(profileId: number): Promise<string | null> {
  const usage = await getPlanUsage(profileId);
  if (usage.tokensUsed < usage.definition.tokens) return null;

  return `This workspace has used its ${formatTokens(usage.definition.tokens)} monthly tokens (input + output since the 1st, UTC) on the ${usage.definition.name} plan. ${upgradeHint(usage.definition)}`;
}

/** What spent the tokens: a chat/scheduled turn, a widget refresh or a widget edit. */
export type AiUsageActivity = "agent" | "widget_refresh" | "widget_edit";

/** Writes one AI run's token consumption to the usage ledger. */
export async function recordAgentUsage(input: {
  ownerId: number;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  startedAt: Date;
  endedAt: Date;
  activity?: AiUsageActivity;
}): Promise<void> {
  const tokensPrompt = Math.max(0, Math.round(input.inputTokens));
  const tokensCompletion = Math.max(0, Math.round(input.outputTokens));
  const tokensTotal = tokensPrompt + tokensCompletion;
  if (tokensTotal === 0) return;

  await db.insert(aiUsage).values({
    ownerId: input.ownerId,
    activity: input.activity ?? "agent",
    model: input.model,
    tokensPrompt,
    tokensCompletion,
    tokensTotal,
    cost: "0",
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  });
}

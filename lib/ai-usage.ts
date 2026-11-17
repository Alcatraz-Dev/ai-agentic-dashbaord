import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { aiUsage, db } from "@/db";
import { getBuiltinModelList } from "@/lib/agent-model-catalog";
import type {
  AiUsageActivityRow,
  AiUsageDay,
  AiUsageModelRow,
  AiUsageSummary,
} from "@/lib/ai-usage-types";

export type {
  AiUsageActivityRow,
  AiUsageDay,
  AiUsageModelRow,
  AiUsageSummary,
} from "@/lib/ai-usage-types";

/**
 * Real AI usage for one workspace.
 *
 * The ledger is written by the agent runtime after every turn, from the token
 * counts the CloudHike AI response reports. Costs are not stored: they are
 * estimated here from the live CloudHike model list (`GET /models`), which
 * already includes CloudHike's markup, so the card never shows a made-up price.
 * A model that is not on that list (a custom endpoint, or a renamed id) keeps
 * its token counts and shows no cost.
 */

const ALLOWED_DAYS = [7, 30, 90] as const;

export function normalizeUsageDays(value: string | null | undefined): number {
  const days = Number(value);
  return (ALLOWED_DAYS as readonly number[]).includes(days) ? days : 30;
}

function asCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function roundCost(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

type Price = { name: string; input: number; output: number };

async function loadPrices(): Promise<Map<string, Price>> {
  const prices = new Map<string, Price>();
  try {
    const models = await getBuiltinModelList();
    for (const model of models) {
      if (model.inputPrice == null || model.outputPrice == null) continue;
      prices.set(model.id, {
        name: model.name,
        input: model.inputPrice,
        output: model.outputPrice,
      });
    }
  } catch (error) {
    console.warn("[ai-usage] could not read CloudHike model prices", error);
  }
  return prices;
}

export async function getAiUsageSummary(profileId: number, days: number): Promise<AiUsageSummary> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const inRange = and(eq(aiUsage.ownerId, profileId), gte(aiUsage.startedAt, startDate));

  const [prices, totalRows, modelRows, activityRows, dailyRows] = await Promise.all([
    loadPrices(),
    db
      .select({
        requests: sql<number>`count(*)::int`,
        tokensPrompt: sql<number>`coalesce(sum(${aiUsage.tokensPrompt}), 0)::int`,
        tokensCompletion: sql<number>`coalesce(sum(${aiUsage.tokensCompletion}), 0)::int`,
        tokensTotal: sql<number>`coalesce(sum(${aiUsage.tokensTotal}), 0)::int`,
      })
      .from(aiUsage)
      .where(inRange),
    db
      .select({
        model: aiUsage.model,
        requests: sql<number>`count(*)::int`,
        tokensPrompt: sql<number>`coalesce(sum(${aiUsage.tokensPrompt}), 0)::int`,
        tokensCompletion: sql<number>`coalesce(sum(${aiUsage.tokensCompletion}), 0)::int`,
        tokensTotal: sql<number>`coalesce(sum(${aiUsage.tokensTotal}), 0)::int`,
      })
      .from(aiUsage)
      .where(inRange)
      .groupBy(aiUsage.model)
      .orderBy(sql`coalesce(sum(${aiUsage.tokensTotal}), 0) desc`),
    db
      .select({
        activity: aiUsage.activity,
        requests: sql<number>`count(*)::int`,
        tokensPrompt: sql<number>`coalesce(sum(${aiUsage.tokensPrompt}), 0)::int`,
        tokensCompletion: sql<number>`coalesce(sum(${aiUsage.tokensCompletion}), 0)::int`,
        tokensTotal: sql<number>`coalesce(sum(${aiUsage.tokensTotal}), 0)::int`,
      })
      .from(aiUsage)
      .where(inRange)
      .groupBy(aiUsage.activity)
      .orderBy(sql`coalesce(sum(${aiUsage.tokensTotal}), 0) desc`),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${aiUsage.startedAt}), 'YYYY-MM-DD')`,
        requests: sql<number>`count(*)::int`,
        tokensTotal: sql<number>`coalesce(sum(${aiUsage.tokensTotal}), 0)::int`,
      })
      .from(aiUsage)
      .where(inRange)
      .groupBy(sql`date_trunc('day', ${aiUsage.startedAt})`)
      .orderBy(sql`date_trunc('day', ${aiUsage.startedAt}) asc`),
  ]);

  const byModel: AiUsageModelRow[] = modelRows.map((row) => {
    const price = row.model ? prices.get(row.model) : undefined;
    const requests = asCount(row.requests);
    const tokensPrompt = asCount(row.tokensPrompt);
    const tokensCompletion = asCount(row.tokensCompletion);
    return {
      model: row.model,
      name: price?.name ?? row.model ?? "Unknown model",
      requests,
      tokensPrompt,
      tokensCompletion,
      tokensTotal: asCount(row.tokensTotal),
      cost: price
        ? roundCost((tokensPrompt / 1_000_000) * price.input + (tokensCompletion / 1_000_000) * price.output)
        : null,
    };
  });

  const priced = byModel.filter((row) => row.cost !== null);
  const unpricedRequests = byModel
    .filter((row) => row.cost === null)
    .reduce((sum, row) => sum + row.requests, 0);
  const totalCost = priced.length
    ? roundCost(priced.reduce((sum, row) => sum + (row.cost ?? 0), 0))
    : null;

  return {
    range: String(days),
    days,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totals: {
      requests: asCount(totalRows[0]?.requests),
      tokensPrompt: asCount(totalRows[0]?.tokensPrompt),
      tokensCompletion: asCount(totalRows[0]?.tokensCompletion),
      tokensTotal: asCount(totalRows[0]?.tokensTotal),
      cost: totalCost,
      unpricedRequests,
    },
    byModel,
    byActivity: activityRows.map((row) => ({
      activity: row.activity,
      requests: asCount(row.requests),
      tokensPrompt: asCount(row.tokensPrompt),
      tokensCompletion: asCount(row.tokensCompletion),
      tokensTotal: asCount(row.tokensTotal),
    })),
    daily: dailyRows.map((row) => ({
      date: row.date,
      requests: asCount(row.requests),
      tokensTotal: asCount(row.tokensTotal),
    })),
    pricingAvailable: prices.size > 0,
  };
}

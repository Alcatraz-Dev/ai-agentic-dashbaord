/**
 * Plan catalog and limits.
 *
 * Client-safe: the pricing table, the sidebar upgrade item and the server-side
 * guards all read the same numbers from here, so a limit can never disagree
 * between the UI and enforcement. Plans are stored on `users.plan`; the
 * in-app pricing page (`/pricing`) is the public explanation of them.
 */

export type PlanId = "free" | "pro";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  /** Monthly price in USD; 0 for the free plan. */
  price: number;
  agents: number;
  widgets: number;
  /** Model input + output tokens per calendar month (UTC). */
  tokens: number;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    agents: 2,
    widgets: 5,
    tokens: 500_000,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 19,
    agents: 20,
    widgets: 100,
    tokens: 10_000_000,
  },
};

/** The in-app pricing page every upgrade link points at. */
export const PRICING_URL = "/pricing";

export function normalizePlan(value: unknown): PlanId {
  return value === "pro" ? "pro" : "free";
}

/** 500000 → "500K", 10000000 → "10M". */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
  }
  return String(value);
}

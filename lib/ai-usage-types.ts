/** Client-safe shape of the AI usage summary returned by `/api/ai-usage`. */

export type AiUsageModelRow = {
  model: string | null;
  name: string;
  requests: number;
  tokensPrompt: number;
  tokensCompletion: number;
  tokensTotal: number;
  /** Null when the model has no published price on the AI connection. */
  cost: number | null;
};

export type AiUsageActivityRow = {
  activity: string;
  requests: number;
  tokensPrompt: number;
  tokensCompletion: number;
  tokensTotal: number;
};

export type AiUsageDay = {
  /** YYYY-MM-DD, UTC. */
  date: string;
  requests: number;
  tokensTotal: number;
};

export type AiUsageSummary = {
  range: string;
  days: number;
  startDate: string;
  endDate: string;
  totals: {
    requests: number;
    tokensPrompt: number;
    tokensCompletion: number;
    tokensTotal: number;
    /** Sum of the priced models; null when none of them has a price. */
    cost: number | null;
    unpricedRequests: number;
  };
  byModel: AiUsageModelRow[];
  byActivity: AiUsageActivityRow[];
  daily: AiUsageDay[];
  pricingAvailable: boolean;
};

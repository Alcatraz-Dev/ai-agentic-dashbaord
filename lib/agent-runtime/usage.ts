import "server-only";

/**
 * Defensive read of the Agents SDK's accumulated token usage for one run.
 *
 * The SDK exposes usage on the run's `state`, but the shape has changed between
 * versions, so every reader tolerates missing fields instead of trusting the
 * type. Shared by the chat runtime, widget refreshes and widget edits so their
 * usage rows can't drift apart.
 */
export function readRunUsage(result: unknown): { inputTokens: number; outputTokens: number } {
  const candidate = result as
    | { state?: { usage?: { inputTokens?: number; outputTokens?: number } } }
    | null;
  const usage = candidate?.state?.usage;
  const inputTokens = Number(usage?.inputTokens);
  const outputTokens = Number(usage?.outputTokens);

  return {
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
  };
}

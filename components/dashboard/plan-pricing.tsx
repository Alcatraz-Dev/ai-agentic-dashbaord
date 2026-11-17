import Link from "next/link";
import { Check } from "lucide-react";

import { PLANS, PRICING_URL, formatTokens } from "@/lib/plans";
import type { PlanUsage } from "@/lib/plan-usage";
import { cn } from "@/lib/utils";

/**
 * Settings → Plan & pricing.
 *
 * The meters read the same `getPlanUsage` numbers the server guards use, so the
 * limit shown here is the limit enforced on agent creation, widget creation and
 * the start of every agent run. Plan details live on `/pricing`.
 */

function Meter({
  label,
  used,
  limit,
  exact = false,
}: {
  label: string;
  used: number;
  limit: number;
  exact?: boolean;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const full = used >= limit;
  const formatted = exact
    ? `${used.toLocaleString()} of ${limit.toLocaleString()}`
    : `${used} of ${limit}`;

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.68rem] font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-[0.62rem] font-medium tabular-nums",
            full ? "text-rose-600" : "text-foreground/70",
          )}
        >
          {formatted}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            full ? "bg-rose-500" : percent >= 80 ? "bg-amber-500" : "bg-brand-from",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-[0.6rem] text-muted-foreground tabular-nums">{percent}% used</p>
    </div>
  );
}

export function PlanPricing({ usage }: { usage: PlanUsage }) {
  const plan = PLANS[usage.plan];
  const since = new Date(usage.monthStart).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <section className="premium-panel mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Plan &amp; pricing
          </p>
          <h2 className="mt-1 text-[0.95rem] font-semibold">Your plan</h2>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            You&rsquo;re on <span className="font-medium text-foreground">{plan.name}</span>. Agent
            and widget counts are current; tokens reset on the 1st (UTC).
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[0.66rem] font-medium",
            usage.plan === "pro"
              ? "bg-brand-from/10 text-brand-ink"
              : "bg-muted text-muted-foreground",
          )}
        >
          {plan.name} plan
        </span>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <Meter label="Agents" used={usage.agentsUsed} limit={plan.agents} />
        <Meter label="Widgets" used={usage.widgetsUsed} limit={plan.widgets} />
        <Meter
          label="Tokens this month"
          used={usage.tokensUsed}
          limit={plan.tokens}
          exact
        />
      </div>
      <p className="mt-2.5 text-[0.64rem] leading-relaxed text-muted-foreground">
        Tokens count model input plus output since {since} (UTC). The same total is checked before
        every agent run.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {Object.values(PLANS).map((option) => {
          const current = option.id === usage.plan;

          return (
            <article
              key={option.id}
              className={cn(
                "flex flex-col rounded-xl border p-4",
                current
                  ? "border-brand-border bg-muted/30"
                  : "border-border/70 bg-card",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[0.85rem] font-semibold">{option.name}</h3>
                <p className="text-[0.85rem] font-semibold">
                  {option.price === 0 ? "Free" : `$${option.price}`}
                  {option.price > 0 ? (
                    <span className="text-[0.62rem] font-normal text-muted-foreground">/month</span>
                  ) : null}
                </p>
              </div>

              <ul className="mt-3 space-y-1.5 text-[0.7rem] text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 shrink-0 text-emerald-600" />
                  {option.agents} agents
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 shrink-0 text-emerald-600" />
                  {option.widgets} widgets
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="size-3 shrink-0 text-emerald-600" />
                  {formatTokens(option.tokens)} tokens a month
                </li>
              </ul>

              <div className="mt-auto pt-4">
                {current ? (
                  <span className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border bg-background text-[0.7rem] font-medium text-muted-foreground">
                    Current plan
                  </span>
                ) : (
                  <Link
                    href={PRICING_URL}
                    className="inline-flex h-8 w-full items-center justify-center rounded-lg brand-gradient text-[0.7rem] font-medium text-white shadow-sm transition hover:opacity-90"
                  >
                    {option.id === "pro" ? "Upgrade to Pro" : "View plans"}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-[0.64rem] text-muted-foreground">
        Compare what each plan includes on the{" "}
        <Link href={PRICING_URL} className="font-medium text-brand-ink hover:underline">
          pricing page
        </Link>
        . Pro is activated per workspace.
      </p>
    </section>
  );
}

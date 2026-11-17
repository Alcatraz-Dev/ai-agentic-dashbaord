"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/shimmer-loader";
import type { AiUsageSummary } from "@/lib/ai-usage-types";

const RANGES = ["7", "30", "90"] as const;

function isRange(value: string | null): value is (typeof RANGES)[number] {
  return value === "7" || value === "30" || value === "90";
}

const numberFormat = new Intl.NumberFormat("en-US");

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatCost(value: number): string {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

const ACTIVITY_LABELS: Record<string, string> = {
  agent: "Agent turns",
  widget_refresh: "Widget updates",
  widget_edit: "Widget edits",
  web_search: "Web searches",
  browser: "Browser sessions",
};

function activityLabel(activity: string): string {
  return ACTIVITY_LABELS[activity] ?? activity.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function AiUsageSection() {
  const searchParams = useSearchParams();
  const [range, setRange] = useState<(typeof RANGES)[number]>(() => {
    const fromUrl = searchParams.get("range");
    return isRange(fromUrl) ? fromUrl : "30";
  });
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);
    // Don't keep the previous range's numbers on screen under the new range.
    setData(null);

    fetch(`/api/ai-usage?range=${range}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as { data?: AiUsageSummary; error?: string };
        if (!response.ok || !body.data) {
          throw new Error(body.error ?? "Could not read AI usage.");
        }
        return body.data;
      })
      .then((summary) => {
        if (!active) return;
        setData(summary);
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === "AbortError")) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : "Could not read AI usage.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, attempt]);

  const dailyMax = data ? Math.max(...data.daily.map((day) => day.tokensTotal), 1) : 1;
  const modelMax = data ? Math.max(...data.byModel.map((row) => row.tokensTotal), 1) : 1;

  return (
    <section className="premium-panel mt-6 rounded-2xl px-5 py-4">
      <h2 className="text-[0.9rem] font-semibold">AI usage</h2>
      <p className="mt-0.5 mb-3 text-[0.72rem] leading-relaxed text-muted-foreground">
        Token counts reported for agent turns, widget updates and widget edits on this
        workspace's CloudHike AI connection. Costs are estimated from CloudHike's live input and
        output prices per model.
      </p>

      <div className="mb-4">
        <SegmentedControl
          aria-label="Usage range"
          size="sm"
          value={range}
          onChange={(value) => setRange(isRange(value) ? value : "30")}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
            { value: "90", label: "90 days" },
          ]}
        />
      </div>

      {loading && !data ? (
        <div aria-busy="true">
          <p className="sr-only">Loading AI usage…</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <Skeleton width={76} height={9} radius={999} />
                <Skeleton className="mt-3" width={112} height={24} radius={6} />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4" width="100%" height={64} radius={10} />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border px-4 py-6 text-center">
          <p className="text-[0.82rem] font-medium">AI usage couldn't be loaded</p>
          <p className="mt-1 text-[0.72rem] text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-2 text-[0.72rem] font-medium text-brand-ink underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : data && data.totals.requests === 0 ? (
        <EmptyState
          bare
          title={`No AI usage in the last ${data.days} days`}
          text="Once an agent turn or widget update runs on this workspace's CloudHike AI connection, its token counts and estimated cost appear here."
        />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border p-3">
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Total tokens
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                <NumberTicker value={data.totals.tokensTotal} />
              </p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                {numberFormat.format(data.totals.tokensPrompt)} prompt ·{" "}
                {numberFormat.format(data.totals.tokensCompletion)} completion
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Agent turns
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                <NumberTicker value={data.totals.requests} />
              </p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">recorded in this range</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Est. cost
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {data.totals.cost === null ? "—" : formatCost(data.totals.cost)}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                {data.totals.unpricedRequests > 0
                  ? `${data.totals.unpricedRequests} run${data.totals.unpricedRequests === 1 ? "" : "s"} without a published price`
                  : data.pricingAvailable
                    ? "Input + output prices"
                    : "Prices unavailable"}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                Avg per turn
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatTokens(Math.round(data.totals.tokensTotal / Math.max(1, data.totals.requests)))}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">tokens in and out</p>
            </div>
          </div>

          {data.daily.length > 0 ? (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                  Daily tokens
                </p>
                <p className="text-[0.62rem] text-muted-foreground">
                  Peak {formatTokens(dailyMax)}
                </p>
              </div>
              <div
                className="mt-2 flex h-20 items-end gap-[2px]"
                role="img"
                aria-label={`Daily token usage across ${data.daily.length} day(s)`}
              >
                {data.daily.map((day) => (
                  <div
                    key={day.date}
                    className="min-w-[2px] flex-1 rounded-t-[2px] bg-brand-ink/70"
                    style={{ height: `${Math.max(3, Math.round((day.tokensTotal / dailyMax) * 100))}%` }}
                    title={`${day.date} · ${numberFormat.format(day.tokensTotal)} tokens · ${day.requests} run${day.requests === 1 ? "" : "s"}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                <span>{data.daily[0]?.date}</span>
                <span>{data.daily[data.daily.length - 1]?.date}</span>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                By model
              </p>
              <ul className="mt-2 space-y-2.5">
                {data.byModel.map((row) => (
                  <li key={row.model ?? "unknown"}>
                    <div className="flex items-baseline justify-between gap-3 text-[0.78rem]">
                      <span className="min-w-0 truncate font-medium">{row.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {numberFormat.format(row.tokensTotal)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-ink/70"
                        style={{ width: `${Math.max(2, Math.round((row.tokensTotal / modelMax) * 100))}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 text-[0.62rem] text-muted-foreground">
                      <span className="truncate">
                        {row.model && row.model !== row.name ? `${row.model} · ` : null}
                        {row.requests} run{row.requests === 1 ? "" : "s"}
                      </span>
                      <span className="shrink-0">
                        {row.cost === null ? "no price" : `~${formatCost(row.cost)}`}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="font-mono text-[0.6rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
                By activity
              </p>
              <ul className="mt-2 space-y-2">
                {data.byActivity.map((row) => (
                  <li
                    key={row.activity}
                    className="flex items-baseline justify-between gap-3 text-[0.78rem]"
                  >
                    <span className="min-w-0 truncate">{activityLabel(row.activity)}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {numberFormat.format(row.tokensTotal)} · {row.requests} run
                      {row.requests === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-5 text-[0.62rem] leading-relaxed text-muted-foreground">
            Estimates use the published input and output price per million tokens recorded in
            CloudHike's model list; a prompt served from cache or a model without a listed price
            can differ from the final charge.
          </p>
        </>
      ) : null}
    </section>
  );
}

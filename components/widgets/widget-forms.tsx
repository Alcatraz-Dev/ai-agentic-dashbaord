import { ArrowDownRight, ArrowUpRight, Check, Minus } from "lucide-react";

import { ArchifyDiagram } from "@/components/agents/archify-diagram";
import { WidgetConnectAction } from "@/components/widgets/widget-connect-action";
import { resolveIntegrationSlug } from "@/lib/integrations/catalog";
import type { AppAccountSummary } from "@/lib/integrations/types";
import { WidgetIllustration } from "@/components/widgets/widget-illustration";
import { getWidgetIcon } from "@/components/widgets/widget-icon";
import {
  getWidgetDesign,
  widgetFormSupported,
  widgetGaugeData,
  widgetMetricValues,
  widgetPercent,
  widgetPercentMetric,
  type WidgetForm,
  type WidgetIllustrationKey,
  type WidgetItem,
  type WidgetItemTone,
  type WidgetMetric,
  type WidgetPayload,
  type WidgetSize,
} from "@/lib/widget-types";
import { cn } from "@/lib/utils";

type Design = ReturnType<typeof getWidgetDesign>;
type Trend = "up" | "down" | "flat";

const LOGO_BASE = "https://logos.composio.dev/api";

function pointCount(size: WidgetSize, small: number, medium: number, large: number): number {
  return size === "small" ? small : size === "large" ? large : medium;
}

function shortValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function signedValue(value: number): string {
  if (Math.abs(value) < 0.05) return "0";
  return `${value > 0 ? "+" : ""}${shortValue(value)}`;
}

function trendOf(value: number): Trend {
  if (value > 0.001) return "up";
  if (value < -0.001) return "down";
  return "flat";
}

function primaryOf(data: WidgetPayload): {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
} {
  const metric = data.metrics[0];
  if (metric) return metric;
  const point = data.series[data.series.length - 1];
  if (point) return { label: point.label || "Latest", value: shortValue(point.value) };
  const goal = data.goals?.[0];
  if (goal) {
    const percent = goal.target > 0 ? Math.round((goal.value / goal.target) * 100) : 0;
    return { label: goal.label, value: `${percent}%` };
  }
  return { label: "Tracked", value: String(data.items.length) };
}

function toneClass(tone: WidgetItemTone | undefined, design: Design): string {
  if (tone === "positive") return design.positive;
  if (tone === "warning") return design.negative;
  return design.neutral;
}

/** A rounded change pill: the delta with its direction, coloured by the style. */
function ChangePill({
  delta,
  trend,
  design,
  className,
}: {
  delta?: string;
  trend?: Trend;
  design: Design;
  className?: string;
}) {
  if (!delta) return null;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[0.55rem] font-semibold tabular-nums ring-1 ring-current/20",
        "bg-current/10",
        trend === "up" ? design.positive : trend === "down" ? design.negative : design.neutral,
        className,
      )}
    >
      <Icon className="size-2.5" strokeWidth={2.5} />
      {delta}
    </span>
  );
}

/** Compact label + value chips for the metrics a form doesn't lead with. */
function StatChips({
  metrics,
  design,
  max = 3,
  className,
}: {
  metrics: WidgetMetric[];
  design: Design;
  max?: number;
  className?: string;
}) {
  if (metrics.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {metrics.slice(0, max).map((metric, index) => (
        <span
          key={`${metric.label}-${index}`}
          className={cn(
            "inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.52rem]",
            design.chip,
          )}
        >
          <span className="max-w-[5.5rem] truncate opacity-75">{metric.label}</span>
          <span className={cn("shrink-0 font-semibold tabular-nums", design.value)}>
            {metric.value}
          </span>
          {metric.delta ? (
            <span
              className={cn(
                "shrink-0 tabular-nums",
                metric.trend === "up"
                  ? design.positive
                  : metric.trend === "down"
                    ? design.negative
                    : design.neutral,
              )}
            >
              {metric.delta}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function FigureIcon({
  keyName,
  design,
}: {
  keyName?: WidgetPayload["figureIcon"];
  design: Design;
}) {
  if (!keyName) return null;
  const Icon = getWidgetIcon(keyName);
  return <Icon className={cn("size-3 shrink-0", design.muted)} strokeWidth={2} aria-hidden />;
}

function StatusChip({ item, design }: { item: WidgetItem; design: Design }) {
  if (!item.status) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-current/10 px-1.5 py-px text-[0.5rem] font-medium ring-1 ring-current/20",
        toneClass(item.tone, design),
      )}
    >
      {item.status}
    </span>
  );
}

/** A brand mark on a neutral plate, with the row's initial behind the image. */
function WidgetLogo({ slug, title }: { slug?: string; title: string }) {
  if (!slug) return null;
  const letter = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="relative grid size-5 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-[0.5rem] font-semibold text-muted-foreground ring-1 ring-border/60"
    >
      {letter}
      {/* eslint-disable-next-line @next/next/no-img-element -- a plain img keeps this external logo out of the Next image pipeline */}
      <img
        src={`${LOGO_BASE}/${slug}`}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="absolute inset-0 size-full object-contain p-px"
      />
    </span>
  );
}

/** The shared line for trend, forecast and row sparklines. */
function Sparkline({
  points,
  design,
  className,
  fill = true,
}: {
  points: { value: number }[];
  design: Design;
  className?: string;
  fill?: boolean;
}) {
  const width = 100;
  const height = 42;
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((point, index) => ({
    x: index * step,
    y: 4 + (height - 10) - ((point.value - min) / span) * (height - 12),
  }));
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Line through real points"
      className={cn("overflow-visible", className)}
      style={{ color: design.accent }}
    >
      {fill ? <path d={area} fill="currentColor" opacity={0.13} /> : null}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={coords[coords.length - 1]?.x} cy={coords[coords.length - 1]?.y} r={2.2} fill="currentColor" />
    </svg>
  );
}

function NumberForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const primary = primaryOf(data);
  const extras = data.metrics.slice(1, size === "small" ? 2 : 4);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <p className={cn("flex items-center gap-1 text-[0.55rem] font-medium tracking-[0.1em] uppercase", design.muted)}>
          <FigureIcon keyName={data.figureIcon} design={design} />
          {primary.label}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p
            className={cn(
              "leading-none font-semibold tracking-[-0.05em] tabular-nums",
              size === "small" ? "text-[2.2rem]" : size === "large" ? "text-[3rem]" : "text-[2.5rem]",
              design.value,
            )}
          >
            {primary.value}
          </p>
          <ChangePill delta={primary.delta} trend={primary.trend} design={design} />
        </div>
      </div>

      <StatChips
        metrics={extras}
        design={design}
        className={cn("mt-auto border-t pt-2", design.divider)}
      />
    </div>
  );
}

function TrendForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const points = data.series;
  const primary = primaryOf(data);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("flex items-center gap-1 truncate text-[0.52rem] uppercase", design.muted)}>
            <FigureIcon keyName={data.figureIcon} design={design} />
            {primary.label}
          </p>
          <p className={cn("text-[1.15rem] font-semibold tabular-nums", design.value)}>
            {primary.value}
          </p>
        </div>
        <ChangePill delta={primary.delta} trend={primary.trend} design={design} />
      </div>

      <div className={cn("min-h-0 flex-1", size === "small" ? "mt-1.5" : "mt-2")}>
        <Sparkline points={points} design={design} className="h-full w-full" />
      </div>

      {size !== "small" ? (
        <div className={cn("mt-1 flex justify-between text-[0.5rem]", design.muted)}>
          <span className="truncate">{points[0]?.label}</span>
          <span className="truncate">{points[Math.floor(points.length / 2)]?.label}</span>
          <span className="truncate">{points[points.length - 1]?.label}</span>
        </div>
      ) : null}

      <StatChips metrics={data.metrics.slice(1)} design={design} max={size === "small" ? 1 : 2} className="mt-1" />
    </div>
  );
}

function BarsForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const points = data.series.slice(-pointCount(size, 6, 9, 12));
  const primary = primaryOf(data);
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("flex items-center gap-1 truncate text-[0.52rem] uppercase", design.muted)}>
          <FigureIcon keyName={data.figureIcon} design={design} />
          {primary.label}
        </p>
        <div className="flex items-center gap-1">
          <p className={cn("text-[1rem] font-semibold tabular-nums", design.value)}>{primary.value}</p>
          <ChangePill delta={primary.delta} trend={primary.trend} design={design} />
        </div>
      </div>
      <div
        className="mt-2 flex min-h-0 flex-1 items-end gap-[3px]"
        style={{ color: design.accent }}
        role="img"
        aria-label="Compared points as bars"
      >
        {points.map((point, index) => {
          const ratio = (point.value - min) / span;
          return (
            <span
              key={`${point.label}-${index}`}
              title={`${point.label}: ${shortValue(point.value)}`}
              style={{ height: `${Math.max(7, Math.round(ratio * 100))}%` }}
              className={cn(
                "flex-1 rounded-t-[2px] bg-current",
                index === points.length - 1 ? "opacity-100" : "opacity-35",
              )}
            />
          );
        })}
      </div>
      {size !== "small" ? (
        <div className={cn("mt-1 flex justify-between text-[0.5rem]", design.muted)}>
          <span className="truncate">{points[0]?.label}</span>
          <span className="truncate">{points[points.length - 1]?.label}</span>
        </div>
      ) : null}
      <StatChips metrics={data.metrics.slice(1)} design={design} max={size === "small" ? 1 : 2} className="mt-1" />
    </div>
  );
}

function HeatForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const points = data.series.slice(-pointCount(size, 9, 12, 20));
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const cols = size === "small" ? 3 : size === "large" ? 5 : 4;
  const primary = primaryOf(data);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("flex items-center gap-1 truncate text-[0.52rem] uppercase", design.muted)}>
          <FigureIcon keyName={data.figureIcon} design={design} />
          {primary.label}
        </p>
        <div className="flex items-center gap-1">
          <p className={cn("text-[0.9rem] font-semibold tabular-nums", design.value)}>{primary.value}</p>
          <ChangePill delta={primary.delta} trend={primary.trend} design={design} />
        </div>
      </div>
      <div
        className="mt-2 grid min-h-0 flex-1 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="img"
        aria-label="Heat grid of the series"
      >
        {points.map((point, index) => {
          const ratio = (point.value - min) / span;
          return (
            <span
              key={`${point.label}-${index}`}
              title={`${point.label}: ${shortValue(point.value)}`}
              className="rounded-[2px]"
              style={{ backgroundColor: design.accent, opacity: 0.12 + ratio * 0.88 }}
            />
          );
        })}
      </div>
      {size !== "small" ? (
        <div className={cn("mt-1 flex justify-between text-[0.5rem]", design.muted)}>
          <span className="truncate">{points[0]?.label}</span>
          <span className="truncate">{points[points.length - 1]?.label}</span>
        </div>
      ) : null}
      <StatChips metrics={data.metrics.slice(1)} design={design} max={size === "small" ? 1 : 2} className="mt-1" />
    </div>
  );
}

function GaugeForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const percent = widgetPercent(data) ?? 0;
  const primary = widgetPercentMetric(data) ?? primaryOf(data);
  const ring = size === "small" ? "size-[5.6rem]" : size === "large" ? "size-[9rem]" : "size-[7.4rem]";

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center">
      <div className={cn("relative grid shrink-0 place-items-center", ring)}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${design.accent} ${percent * 3.6}deg, color-mix(in srgb, ${design.accent} 14%, transparent) 0)`,
            maskImage: "radial-gradient(circle, transparent 58%, #000 59%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 58%, #000 59%)",
          }}
          role="img"
          aria-label={`${Math.round(percent)} percent`}
        />
        <div className="relative flex flex-col items-center">
          <p
            className={cn(
              "font-semibold tracking-[-0.05em] tabular-nums",
              size === "small" ? "text-[1.4rem]" : size === "large" ? "text-[2.1rem]" : "text-[1.7rem]",
              design.value,
            )}
          >
            {primary.value}
          </p>
          <p className={cn("max-w-[8rem] truncate text-[0.52rem] uppercase", design.muted)}>
            {primary.label}
          </p>
        </div>
      </div>
      {size === "large" && data.metrics[1] ? (
        <p className={cn("mt-3 text-[0.62rem]", design.muted)}>
          {data.metrics[1].label} · {data.metrics[1].value}
        </p>
      ) : null}
    </div>
  );
}

function WaffleForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const percent = widgetPercent(data) ?? 0;
  const cells = size === "small" ? 25 : 100;
  const cols = size === "small" ? 5 : 10;
  const filled = Math.round((percent / 100) * cells);
  const primary = widgetPercentMetric(data) ?? primaryOf(data);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("truncate text-[0.52rem] uppercase", design.muted)}>{primary.label}</p>
        <p className={cn("text-[1rem] font-semibold tabular-nums", design.value)}>{primary.value}</p>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid h-full w-full max-w-[15rem] gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${cols}, minmax(0, 1fr))`,
          }}
          role="img"
          aria-label={`${Math.round(percent)} percent filled`}
        >
          {Array.from({ length: cells }, (_, index) => (
            <span
              key={index}
              className="min-h-0 rounded-[1px]"
              style={{
                backgroundColor:
                  index < filled
                    ? design.accent
                    : `color-mix(in srgb, ${design.accent} 12%, transparent)`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type RankRow = { title: string; meta?: string; value?: number };

function rankingRows(data: WidgetPayload): RankRow[] {
  if (data.items.length > 0) {
    return data.items.map((item) => ({ title: item.title, meta: item.meta }));
  }
  return [...data.series]
    .sort((a, b) => b.value - a.value)
    .map((point) => ({ title: point.label, value: point.value, meta: shortValue(point.value) }));
}

function RankingForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const rows = rankingRows(data).slice(0, pointCount(size, 2, 3, 5));
  const max = Math.max(...rows.map((row) => row.value ?? 0), 1);

  return (
    <div className="flex h-full min-h-0 flex-col space-y-1.5">
      {rows.map((row, index) => (
        <div key={`${row.title}-${index}`} className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-3 shrink-0 text-[0.58rem] font-semibold tabular-nums", design.muted)}>
              {index + 1}
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-[0.68rem] font-medium", design.title)}>
              {row.title}
            </span>
            <span className={cn("shrink-0 text-[0.56rem] tabular-nums", design.muted)}>
              {row.meta ?? ""}
            </span>
          </div>
          {row.value !== undefined ? (
            <div className="mt-1 ml-[1.15rem] h-1 overflow-hidden rounded-full bg-current/10">
              <span
                className="block h-full rounded-full bg-current"
                style={{ width: `${Math.max(5, (row.value / max) * 100)}%`, color: design.accent }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function partShade(design: Design, index: number): string {
  return `color-mix(in srgb, ${design.accent} ${Math.max(35, 100 - index * 24)}%, ${
    index % 2 === 0 ? "#ffffff" : "#0f172a"
  })`;
}

function SplitForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const metricValues = widgetMetricValues(data);
  const parts =
    metricValues.length >= 2
      ? metricValues.slice(0, size === "small" ? 2 : 3)
      : [...data.series]
          .sort((a, b) => b.value - a.value)
          .slice(0, size === "small" ? 2 : 3)
          .map((point) => ({ label: point.label, value: point.value }));
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1;
  let cursor = 0;
  const stops = parts.map((part, index) => {
    const from = cursor;
    cursor += (Math.max(0, part.value) / total) * 100;
    return `${partShade(design, index)} ${from}% ${cursor}%`;
  });

  return (
    <div className="flex h-full min-h-0 items-center gap-2.5">
      <div
        className={cn(
          "relative shrink-0 rounded-full",
          size === "small" ? "size-[4.6rem]" : size === "large" ? "size-[8rem]" : "size-[6.2rem]",
        )}
        style={{
          background: `conic-gradient(${stops.join(", ")})`,
          maskImage: "radial-gradient(circle, transparent 52%, #000 53%)",
          WebkitMaskImage: "radial-gradient(circle, transparent 52%, #000 53%)",
        }}
        role="img"
        aria-label="Parts of one total"
      />
      <div className="min-w-0 flex-1 space-y-1">
        {parts.map((part, index) => (
          <div key={`${part.label}-${index}`} className="flex items-center gap-1 text-[0.58rem]">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: partShade(design, index) }}
            />
            <span className={cn("truncate", design.muted)}>{part.label}</span>
            <span className={cn("ml-auto shrink-0 tabular-nums", design.title)}>
              {Math.round((Math.max(0, part.value) / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TilesForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const metrics = data.metrics.slice(0, size === "small" ? 2 : 4);

  return (
    <div className="grid h-full min-h-0 grid-cols-2 content-center gap-2">
      {metrics.map((metric, index) => (
        <div
          key={`${metric.label}-${index}`}
          className={cn("min-w-0 rounded-lg border p-2", design.divider, "bg-current/[0.025]")}
        >
          <p className={cn("truncate text-[0.5rem] uppercase", design.muted)}>{metric.label}</p>
          <p className={cn("mt-0.5 truncate text-[1.05rem] font-semibold tabular-nums", design.value)}>
            {metric.value}
          </p>
          <ChangePill delta={metric.delta} trend={metric.trend} design={design} />
        </div>
      ))}
    </div>
  );
}

function FeedForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, pointCount(size, 2, 4, 6));

  return (
    <ul className="flex h-full min-h-0 flex-col justify-center">
      {items.map((item, index) => (
        <li
          key={`${item.title}-${index}`}
          className={cn("flex min-w-0 items-center gap-2 py-1.5", index > 0 && "border-t", design.divider)}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full bg-current", toneClass(item.tone, design))} />
          <span className={cn("min-w-0 flex-1 truncate text-[0.68rem] font-medium", design.title)}>
            {item.title}
          </span>
          {item.delta ? (
            <ChangePill delta={item.delta} trend={item.trend} design={design} />
          ) : item.meta ? (
            <span className={cn("shrink-0 text-[0.55rem]", design.muted)}>{item.meta}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function PodiumForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const top = [...data.series].sort((a, b) => b.value - a.value).slice(0, 3);
  const order = size === "small" ? [0, 1, 2] : [1, 0, 2];
  const max = Math.max(...top.map((point) => point.value), 1);

  return (
    <div className="flex h-full min-h-0 items-end justify-center gap-1.5 pb-1">
      {order.map((slot, displayIndex) => {
        const point = top[slot];
        if (!point) return null;
        const height =
          size === "small"
            ? 52 + (point.value / max) * 30
            : size === "large"
              ? 80 + (point.value / max) * 120
              : 58 + (point.value / max) * 70;
        const place = slot + 1;
        return (
          <div
            key={`${point.label}-${displayIndex}`}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
            style={{ height: `${height}px` }}
          >
            <p className={cn("mb-1 max-w-full truncate text-[0.55rem]", design.muted)}>
              {point.label}
            </p>
            <div
              className="flex w-full flex-1 flex-col items-center justify-start rounded-t-lg pt-1.5 text-white"
              style={{
                backgroundColor: `color-mix(in srgb, ${design.accent} ${
                  place === 1 ? 82 : place === 2 ? 55 : 34
                }%, transparent)`,
              }}
            >
              <span className="text-[0.8rem] font-semibold tabular-nums">{place}</span>
              <span className="text-[0.52rem] tabular-nums text-white/85">
                {shortValue(point.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const all = data.series;
  const limit = pointCount(size, 3, 5, 7);
  const points =
    all.length <= limit
      ? all
      : Array.from({ length: limit }, (_, index) =>
          all[Math.round((index / (limit - 1)) * (all.length - 1))],
        );
  const primary = primaryOf(data);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center">
      <div className="flex items-baseline justify-between">
        <p className={cn("truncate text-[0.52rem] uppercase", design.muted)}>{primary.label}</p>
        <p className={cn("text-[0.86rem] font-semibold tabular-nums", design.value)}>
          {primary.value}
        </p>
      </div>
      <div className="relative mt-4">
        <span
          className="absolute top-1 right-1 left-1 h-px"
          style={{ backgroundColor: `color-mix(in srgb, ${design.accent} 28%, transparent)` }}
        />
        <div className="relative flex justify-between">
          {points.map((point, index) => (
            <span
              key={`${point.label}-${index}`}
              title={`${point.label}: ${shortValue(point.value)}`}
              className="size-2 rounded-full ring-2"
              style={{
                backgroundColor: design.accent,
                boxShadow: "0 0 0 2px var(--card)",
                opacity: index === points.length - 1 ? 1 : 0.55,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between gap-1 text-[0.5rem]">
        <span className={cn("truncate", design.muted)}>{points[0]?.label}</span>
        {size !== "small" ? (
          <span className={cn("truncate", design.muted)}>
            {points[points.length - 1]?.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SceneForm({
  size,
  data,
  illustration,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  illustration: WidgetIllustrationKey;
  design: Design;
}) {
  const primary = primaryOf(data);
  const secondary = data.metrics.slice(1, 3);

  return (
    <div className="relative flex h-full min-h-0 items-center gap-2">
      <div className={cn("min-w-0 flex-1", size === "small" && "max-w-[62%]")}>
        <p className={cn("flex items-center gap-1 text-[0.52rem] uppercase", design.muted)}>
          <FigureIcon keyName={data.figureIcon} design={design} />
          {primary.label}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p
            className={cn(
              "leading-none font-semibold tracking-[-0.04em] tabular-nums",
              size === "small" ? "text-[1.7rem]" : size === "large" ? "text-[2.4rem]" : "text-[2rem]",
              design.value,
            )}
          >
            {primary.value}
          </p>
          <ChangePill delta={primary.delta} trend={primary.trend} design={design} />
        </div>
        {secondary.length > 0 ? (
          <StatChips
            metrics={secondary}
            design={design}
            max={size === "small" ? 1 : 2}
            className="mt-2"
          />
        ) : null}
      </div>
      <WidgetIllustration
        illustration={illustration}
        className={cn(
          "shrink-0",
          size === "small" ? "h-16 w-24" : size === "large" ? "h-32 w-44" : "h-24 w-32",
        )}
      />
    </div>
  );
}

/** A KPI strip over one line chart. */
function KpiForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const metrics = data.metrics.slice(0, size === "small" ? 2 : size === "large" ? 4 : 3);
  const points = data.series;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-3">
        {metrics.map((metric, index) => (
          <div key={`${metric.label}-${index}`} className="min-w-0 flex-1">
            <p className={cn("truncate text-[0.48rem] uppercase", design.muted)}>{metric.label}</p>
            <div className="flex flex-wrap items-baseline gap-1">
              <p
                className={cn(
                  "truncate font-semibold tabular-nums",
                  index === 0 ? "text-[1rem]" : "text-[0.82rem]",
                  design.value,
                )}
              >
                {metric.value}
              </p>
              {index === 0 ? (
                <ChangePill delta={metric.delta} trend={metric.trend} design={design} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 min-h-0 flex-1">
        <Sparkline points={points} design={design} className="h-full w-full" />
      </div>
      {size !== "small" ? (
        <div className={cn("mt-1 flex justify-between text-[0.5rem]", design.muted)}>
          <span className="truncate">{points[0]?.label}</span>
          <span className="truncate">{points[points.length - 1]?.label}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Items as rows: logo, name, a sparkline and a change pill. */
function RowsForm({
  size,
  data,
  design,
  connectedApps,
  appAccounts,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
  connectedApps?: string[];
  appAccounts?: Record<string, AppAccountSummary>;
}) {
  const items = data.items.slice(0, pointCount(size, 2, 3, 5));

  /** The account behind a row's app, when this surface knows it. */
  function accountFor(logo: string | undefined) {
    if (!logo || !appAccounts) return null;
    const toolkit = resolveIntegrationSlug(logo);
    return toolkit ? (appAccounts[toolkit] ?? null) : null;
  }

  return (
    <ul className="flex h-full min-h-0 flex-col justify-center">
      {items.map((item, index) => {
        const connectedAccount = accountFor(item.logo);

        return (
        <li
          key={`${item.title}-${index}`}
          className={cn("flex min-w-0 items-center gap-1.5 py-1.5", index > 0 && "border-t", design.divider)}
        >
          <WidgetLogo slug={item.logo} title={item.title} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[0.66rem] font-medium", design.title)}>{item.title}</p>
            {/* A connected row names the account it is using; the app's own
                capability line moves into the tooltip. */}
            {connectedAccount?.accountLabel ? (
              <p
                className={cn("truncate text-[0.5rem]", design.muted)}
                title={item.meta ?? undefined}
              >
                {connectedAccount.accountLabel}
              </p>
            ) : item.meta ? (
              <p className={cn("truncate text-[0.5rem]", design.muted)}>{item.meta}</p>
            ) : null}
          </div>
          {item.spark ? (
            <Sparkline
              points={item.spark.map((value) => ({ value }))}
              design={design}
              fill={false}
              className="h-5 w-10 shrink-0"
            />
          ) : null}
          {item.logo && connectedApps ? (
            <WidgetConnectAction
              slug={item.logo}
              connectedApps={connectedApps}
              accountLabel={connectedAccount?.accountLabel ?? null}
              lastCheckedAt={connectedAccount?.lastCheckedAt ?? null}
              className="shrink-0"
            />
          ) : (
            <div className="flex shrink-0 flex-col items-end">
              <span className={cn("text-[0.62rem] font-semibold tabular-nums", design.value)}>
                {item.value ?? item.status ?? ""}
              </span>
              <ChangePill delta={item.delta} trend={item.trend} design={design} />
            </div>
          )}
        </li>
        );
      })}
    </ul>
  );
}

function ChecklistForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, pointCount(size, 2, 4, 6));

  return (
    <ul className="flex h-full min-h-0 flex-col justify-center gap-0.5">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`} className="flex min-w-0 items-center gap-1.5 py-1">
          <span
            aria-hidden
            className={cn("grid size-3.5 shrink-0 place-items-center rounded-[4px] border", !item.done && design.divider)}
            style={item.done ? { borderColor: design.accent, color: design.accent } : undefined}
          >
            {item.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[0.66rem]",
              item.done ? design.muted : design.title,
              item.done && "line-through decoration-1",
            )}
          >
            {item.title}
          </span>
          {item.meta ? (
            <span className={cn("shrink-0 text-[0.5rem]", design.muted)}>{item.meta}</span>
          ) : null}
          <StatusChip item={item} design={design} />
        </li>
      ))}
    </ul>
  );
}

function InboxForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, pointCount(size, 3, 5, 6));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {data.metrics[0] ? (
        <div className="flex items-baseline gap-2">
          <p className={cn("text-[1.15rem] font-semibold tabular-nums", design.value)}>
            {data.metrics[0].value}
          </p>
          <p className={cn("truncate text-[0.52rem] uppercase", design.muted)}>
            {data.metrics[0].label}
          </p>
          <ChangePill
            delta={data.metrics[0].delta}
            trend={data.metrics[0].trend}
            design={design}
            className="ml-auto"
          />
        </div>
      ) : null}
      <div className="mt-1 flex min-h-0 flex-1 flex-wrap content-center gap-1.5">
        {items.map((item, index) => (
          <span
            key={`${item.title}-${index}`}
            className={cn(
              "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-1 text-[0.58rem]",
              design.chip,
            )}
          >
            <span className={cn("size-1.5 shrink-0 rounded-full bg-current", toneClass(item.tone, design))} />
            <span className="max-w-[9rem] truncate">{item.title}</span>
            {item.meta ? (
              <span className={cn("shrink-0 rounded-full bg-current/10 px-1 text-[0.5rem] tabular-nums", design.muted)}>
                {item.meta}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function NewsForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, size === "small" ? 2 : size === "large" ? 4 : 4);

  return (
    <div className={cn("grid h-full min-h-0 content-center gap-1.5", size === "small" ? "grid-cols-1" : "grid-cols-2")}>
      {items.map((item, index) => (
        <div
          key={`${item.title}-${index}`}
          className={cn("min-w-0 rounded-lg border px-1.5 py-1.5", design.divider, "bg-current/[0.02]")}
        >
          <div className="flex items-center gap-1">
            <span className={cn("size-1 shrink-0 rounded-full bg-current", toneClass(item.tone, design))} />
            <span className={cn("truncate text-[0.45rem] font-medium tracking-[0.08em] uppercase", design.muted)}>
              {item.meta || item.status || "Update"}
            </span>
          </div>
          <p className={cn("mt-0.5 line-clamp-2 text-[0.6rem] leading-snug font-medium", design.title)}>
            {item.title}
          </p>
          {item.meta && item.status ? (
            <p className={cn("mt-0.5 truncate text-[0.48rem]", design.muted)}>{item.status}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ActivityForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, pointCount(size, 2, 4, 5));
  const primary = primaryOf(data);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className={cn("truncate text-[0.52rem] uppercase", design.muted)}>{primary.label}</p>
        <p className={cn("text-[0.9rem] font-semibold tabular-nums", design.value)}>{primary.value}</p>
      </div>
      <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-hidden">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="flex min-w-0 items-start gap-1.5">
            <span className="relative mt-1 flex size-2 shrink-0">
              <span
                className={cn("absolute inset-0 rounded-full bg-current", toneClass(item.tone, design), item.status ? "animate-pulse" : "")}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[0.62rem] font-medium", design.title)}>{item.title}</p>
              {item.meta ? (
                <p className={cn("truncate text-[0.5rem]", design.muted)}>{item.meta}</p>
              ) : null}
            </div>
            <StatusChip item={item} design={design} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgendaForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, pointCount(size, 2, 4, 5));

  return (
    <ul className="flex h-full min-h-0 flex-col justify-center">
      {items.map((item, index) => (
        <li
          key={`${item.title}-${index}`}
          className={cn("flex min-w-0 items-start gap-1.5 py-1.5", index > 0 && "border-t", design.divider)}
        >
          <span className={cn("w-8 shrink-0 pt-px text-[0.5rem] font-medium tabular-nums", design.muted)}>
            {item.meta ?? ""}
          </span>
          <span
            className="mt-1 size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.tone === "warning" ? undefined : design.accent }}
          >
            {item.tone === "warning" ? (
              <span className={cn("block size-1.5 rounded-full bg-current", design.negative)} />
            ) : null}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-[0.64rem] font-medium", design.title)}>
            {item.title}
          </span>
          <StatusChip item={item} design={design} />
        </li>
      ))}
    </ul>
  );
}

function ForecastForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const count = pointCount(size, 4, 5, 6);
  const all = data.series;
  const start = Math.max(0, all.length - count);
  const points = all.slice(start);
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const span = max - min || 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className={cn("text-[0.5rem] uppercase", design.muted)}>Forecast</p>
      <div
        className="mt-1 flex min-h-0 flex-1 items-stretch gap-1"
        role="img"
        aria-label="Next points side by side"
      >
        {points.map((point, index) => {
          const absolute = start + index;
          const previous = absolute > 0 ? all[absolute - 1] : null;
          const diff = previous ? point.value - previous.value : null;
          const ratio = (point.value - min) / span;
          return (
            <div key={`${point.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center">
              <span className={cn("truncate text-[0.48rem]", design.muted)}>{point.label}</span>
              <div className="mt-1 flex w-full min-h-0 flex-1 items-end justify-center">
                <span
                  className={cn("w-full rounded-t-[3px]", index === points.length - 1 ? "opacity-100" : "opacity-60")}
                  style={{ height: `${Math.max(8, Math.round(ratio * 100))}%`, backgroundColor: design.accent }}
                />
              </div>
              <span className={cn("mt-1 text-[0.55rem] font-semibold tabular-nums", design.value)}>
                {shortValue(point.value)}
              </span>
              {diff !== null ? (
                <ChangePill delta={signedValue(diff)} trend={trendOf(diff)} design={design} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingsForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const gauges = widgetGaugeData(data).slice(0, size === "small" ? 1 : size === "large" ? 3 : 2);
  const ring = size === "small" ? "size-[6.5rem]" : size === "large" ? "size-[6.4rem]" : "size-[5.6rem]";

  return (
    <div className="flex h-full min-h-0 items-center justify-center gap-3">
      {gauges.map((gauge, index) => (
        <div key={`${gauge.label}-${index}`} className="flex min-w-0 flex-col items-center gap-1">
          <div className={cn("relative grid shrink-0 place-items-center", ring)}>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(${design.accent} ${gauge.percent * 3.6}deg, color-mix(in srgb, ${design.accent} 12%, transparent) 0)`,
                maskImage: "radial-gradient(circle, transparent 62%, #000 63%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 62%, #000 63%)",
              }}
              role="img"
              aria-label={`${gauge.label}: ${gauge.percent} percent`}
            />
            <p className={cn("text-[1rem] font-semibold tabular-nums", design.value)}>
              {gauge.percent}%
            </p>
          </div>
          <p className={cn("max-w-[7rem] truncate text-[0.5rem] uppercase", design.muted)}>
            {gauge.label}
          </p>
          {size !== "small" ? (
            <p className={cn("text-[0.48rem] tabular-nums", design.muted)}>{gauge.value}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DialsForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const gauges = widgetGaugeData(data).slice(0, size === "small" ? 2 : size === "large" ? 4 : 3);

  return (
    <div className="flex h-full min-h-0 items-center justify-center gap-2">
      {gauges.map((gauge, index) => (
        <div key={`${gauge.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center">
          <div className="relative aspect-[2/1] w-full max-w-[6rem]">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(from 270deg, ${design.accent} ${gauge.percent * 1.8}deg, color-mix(in srgb, ${design.accent} 14%, transparent) ${gauge.percent * 1.8}deg 180deg, transparent 180deg)`,
                maskImage: "radial-gradient(circle, transparent 60%, #000 61%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 60%, #000 61%)",
                clipPath: "inset(0 0 50% 0)",
              }}
              role="img"
              aria-label={`${gauge.label}: ${gauge.percent} percent`}
            />
          </div>
          <p className={cn("-mt-1 text-[0.8rem] font-semibold tabular-nums", design.value)}>
            {gauge.percent}%
          </p>
          <p className={cn("max-w-full truncate text-[0.46rem] uppercase", design.muted)}>
            {gauge.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function MetersForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const gauges = widgetGaugeData(data).slice(0, size === "small" ? 2 : 4);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      {gauges.map((gauge, index) => (
        <div key={`${gauge.label}-${index}`} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-[0.58rem] font-medium", design.title)}>{gauge.label}</span>
            <span className={cn("shrink-0 text-[0.55rem] tabular-nums", design.muted)}>{gauge.value}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-current/10" style={{ color: design.accent }}>
            <span
              className="block h-full rounded-full bg-current"
              style={{ width: `${Math.max(3, gauge.percent)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const metricValues = widgetMetricValues(data);
  const parts =
    metricValues.length >= 2
      ? metricValues.slice(0, size === "small" ? 3 : 4)
      : [...data.series]
          .sort((a, b) => b.value - a.value)
          .slice(0, 4)
          .map((point) => ({ label: point.label, value: point.value }));
  const total = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1;
  let cursor = 0;
  const stops = parts.map((part, index) => {
    const from = cursor;
    cursor += (Math.max(0, part.value) / total) * 100;
    return `${partShade(design, index)} ${from}% ${cursor}%`;
  });

  return (
    <div className="flex h-full min-h-0 items-center gap-2.5">
      <div
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full",
          size === "small" ? "size-[4.8rem]" : size === "large" ? "size-[8rem]" : "size-[6.4rem]",
        )}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${stops.join(", ")})`,
            maskImage: "radial-gradient(circle, transparent 60%, #000 61%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 60%, #000 61%)",
          }}
          role="img"
          aria-label="Parts of one total"
        />
        <div className="relative flex flex-col items-center">
          <p className={cn("text-[0.72rem] font-semibold tabular-nums", design.value)}>
            {shortValue(total)}
          </p>
          <p className={cn("text-[0.42rem] uppercase", design.muted)}>total</p>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {parts.map((part, index) => (
          <div key={`${part.label}-${index}`} className="flex items-center gap-1 text-[0.55rem]">
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: partShade(design, index) }} />
            <span className={cn("truncate", design.muted)}>{part.label}</span>
            <span className={cn("ml-auto shrink-0 tabular-nums", design.title)}>
              {Math.round((Math.max(0, part.value) / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BriefingForm({
  size,
  data,
  design,
}: {
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
}) {
  const items = data.items.slice(0, size === "small" ? 2 : 4);

  return (
    <div className={cn("grid h-full min-h-0 content-center gap-1.5", size === "small" ? "grid-cols-1" : "grid-cols-2")}>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} className={cn("min-w-0 rounded-lg border p-1.5", design.divider)}>
          <div className="flex items-baseline justify-between gap-1">
            <p className={cn("truncate text-[0.45rem] font-medium tracking-[0.08em] uppercase", design.muted)}>
              {item.meta || "Briefing"}
            </p>
            {item.value ? (
              <p className={cn("shrink-0 text-[0.62rem] font-semibold tabular-nums", design.value)}>
                {item.value}
              </p>
            ) : null}
          </div>
          <p className={cn("mt-0.5 line-clamp-3 text-[0.6rem] leading-snug", design.title)}>{item.title}</p>
          {item.status ? (
            <p className={cn("mt-0.5 truncate text-[0.48rem]", toneClass(item.tone, design))}>{item.status}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * A saved diagram. Archify JSON is drawn by the same renderer the library uses
 * (a legacy Mermaid row still draws through the old component), so the card
 * never shows a stale image, and a card with no source says so instead of
 * inventing a diagram.
 */
function DiagramForm({ size, data }: { size: WidgetSize; data: WidgetPayload }) {
  const source = data.diagram?.source ?? "";
  const frame = size === "small" ? 168 : size === "large" ? 360 : 248;

  if (!source) {
    return (
      <p className="mt-2 text-[0.72rem] leading-relaxed text-muted-foreground">
        This diagram has no source saved.
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex min-h-0 flex-col gap-1.5">
      <div className="min-h-0 flex-1 overflow-auto rounded-lg">
        <ArchifyDiagram source={source} height={frame} />
      </div>
      {data.footnote ? (
        <p className="text-[0.6rem] leading-snug text-muted-foreground">{data.footnote}</p>
      ) : null}
    </div>
  );
}

/** The body for one form. Nothing here calls a model: every size is derived. */
export function WidgetFormBody({
  form,
  size,
  data,
  design,
  illustration,
  connectedApps,
  appAccounts,
}: {
  form: WidgetForm;
  size: WidgetSize;
  data: WidgetPayload;
  design: Design;
  illustration: WidgetIllustrationKey;
  /** Connected toolkits, so an app row can offer a real Connect action. */
  connectedApps?: string[];
  /** Which account sits behind each connected toolkit, for the row's label. */
  appAccounts?: Record<string, AppAccountSummary>;
}) {
  const active = widgetFormSupported(data, form) ? form : "number";

  switch (active) {
    case "trend":
      return <TrendForm size={size} data={data} design={design} />;
    case "bars":
      return <BarsForm size={size} data={data} design={design} />;
    case "heat":
      return <HeatForm size={size} data={data} design={design} />;
    case "gauge":
      return <GaugeForm size={size} data={data} design={design} />;
    case "waffle":
      return <WaffleForm size={size} data={data} design={design} />;
    case "ranking":
      return <RankingForm size={size} data={data} design={design} />;
    case "split":
      return <SplitForm size={size} data={data} design={design} />;
    case "tiles":
      return <TilesForm size={size} data={data} design={design} />;
    case "feed":
      return <FeedForm size={size} data={data} design={design} />;
    case "podium":
      return <PodiumForm size={size} data={data} design={design} />;
    case "timeline":
      return <TimelineForm size={size} data={data} design={design} />;
    case "scene":
      return <SceneForm size={size} data={data} illustration={illustration} design={design} />;
    case "kpi":
      return <KpiForm size={size} data={data} design={design} />;
    case "rows":
      return (
        <RowsForm
          size={size}
          data={data}
          design={design}
          connectedApps={connectedApps}
          appAccounts={appAccounts}
        />
      );
    case "checklist":
      return <ChecklistForm size={size} data={data} design={design} />;
    case "inbox":
      return <InboxForm size={size} data={data} design={design} />;
    case "news":
      return <NewsForm size={size} data={data} design={design} />;
    case "activity":
      return <ActivityForm size={size} data={data} design={design} />;
    case "agenda":
      return <AgendaForm size={size} data={data} design={design} />;
    case "forecast":
      return <ForecastForm size={size} data={data} design={design} />;
    case "rings":
      return <RingsForm size={size} data={data} design={design} />;
    case "dials":
      return <DialsForm size={size} data={data} design={design} />;
    case "meters":
      return <MetersForm size={size} data={data} design={design} />;
    case "donut":
      return <DonutForm size={size} data={data} design={design} />;
    case "briefing":
      return <BriefingForm size={size} data={data} design={design} />;
    case "diagram":
      return <DiagramForm size={size} data={data} />;
    case "number":
    default:
      return <NumberForm size={size} data={data} design={design} />;
  }
}

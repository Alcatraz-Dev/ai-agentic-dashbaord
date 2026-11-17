"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown, Globe2 } from "lucide-react";

/**
 * Thinking State — an AI working panel with a live timer, searched sources and
 * thinking steps that appear one by one.
 *
 * Rebuilt locally from the affectUI Pro reference because this workspace has no
 * affectUI access key. It keeps the same layout and motion: a 3×3 thinking
 * mark, a timer, a vertical trail, source chips with a “+N more” reveal, a blue
 * current-step marker, and a drawn check when the work finishes.
 *
 * It is self-contained and injects its own CSS, so it needs no extra files.
 * The extra `visibleSteps` / `done` props let a real stream drive the panel
 * instead of the demo timer.
 */

export type ThinkingSource = {
  label: string;
  href?: string;
  icon?: ReactNode;
};

export type ThinkingSearchStep = {
  kind: "search";
  label: string;
  sources: ThinkingSource[];
  /** Extra sources kept behind the “+N more” chip. */
  moreSources?: ThinkingSource[];
};

export type ThinkingStepItem = {
  kind: "step";
  label: string;
};

export type ThinkingStep = ThinkingSearchStep | ThinkingStepItem;

export type ThinkingStateProps = {
  /** Searches and thinking steps, revealed in order. */
  steps: ThinkingStep[];
  /** Label of the final row. */
  doneLabel?: string;
  /** Pause between two steps, in ms. */
  stepMs?: number;
  /** Starts over a few seconds after finishing. */
  loop?: boolean;
  /** Called once all steps are done. */
  onDone?: (seconds: number) => void;
  className?: string;
  /**
   * Controlled reveal for streaming UIs: how many rows are visible.
   * When set, the demo timer does not reveal steps.
   */
  visibleSteps?: number;
  /**
   * Controlled completion for streaming UIs. When `false`, the finish row and
   * the internal auto-finish stay off.
   */
  done?: boolean;
};

const VISIBLE_SOURCES = 4;
const GRID_DOTS = Array.from({ length: 9 }, (_, index) => index);
const CHECK_PATH = "M5.1 9.8 8.3 13 13.2 6.9";

function secondsLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes}m ${value % 60}s`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function hostOf(href: string | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

/** A source tile: a supplied node, the site's favicon, or a globe fallback. */
function SourceGlyph({ source }: { source: ThinkingSource }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(source.href);

  if (source.icon) return <span className="ui-ts__source-icon">{source.icon}</span>;
  if (host && !failed) {
    return (
      <span className="ui-ts__source-icon">
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span className="ui-ts__source-icon ui-ts__source-icon--fallback" aria-hidden="true">
      <Globe2 />
    </span>
  );
}

function SourceList({
  sources,
  moreSources = [],
}: {
  sources: ThinkingSource[];
  moreSources?: ThinkingSource[];
}) {
  const [expanded, setExpanded] = useState(false);
  const all = [...sources, ...moreSources];
  const hidden = Math.max(0, all.length - VISIBLE_SOURCES);
  const visible = expanded ? all : all.slice(0, VISIBLE_SOURCES);

  if (all.length === 0) return null;

  return (
    <div className="ui-ts__sources">
      {visible.map((source, index) => {
        const content = (
          <>
            <SourceGlyph source={source} />
            <span className="ui-ts__source-label">{source.label}</span>
          </>
        );

        return source.href ? (
          <a
            key={`${source.href}-${index}`}
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            title={source.label}
            className="ui-ts__chip"
          >
            {content}
          </a>
        ) : (
          <span
            key={`${source.label}-${index}`}
            title={source.label}
            className="ui-ts__chip"
          >
            {content}
          </span>
        );
      })}

      {hidden > 0 && !expanded ? (
        <button
          type="button"
          className="ui-ts__chip ui-ts__chip--more"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          title={`Show ${hidden} more source${hidden === 1 ? "" : "s"}`}
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}

/** The little globe-and-magnifier mark beside a search row. */
function SearchMark() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="ui-ts__search-svg">
      <circle cx="8.2" cy="8.2" r="6.1" stroke="currentColor" strokeWidth="1.45" />
      <ellipse cx="8.2" cy="8.2" rx="2.8" ry="6.1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.4 6.3h11.6M2.4 10.1h9.4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="14.2" cy="14.1" r="3.1" fill="var(--ui-ts-bg, #fff)" stroke="currentColor" strokeWidth="1.45" />
      <path d="m16.6 16.5 2.2 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ThinkingState({
  steps,
  doneLabel = "Finished thinking",
  stepMs = 1300,
  loop = false,
  onDone,
  className,
  visibleSteps,
  done,
}: ThinkingStateProps) {
  const [expanded, setExpanded] = useState(true);
  const [startedAt] = useState(() => Date.now());
  const startRef = useRef(startedAt);
  const [elapsed, setElapsed] = useState(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [internalRevealed, setInternalRevealed] = useState(steps.length > 0 ? 1 : 0);
  const [internalFinished, setInternalFinished] = useState(false);
  const notified = useRef(false);

  const isFinished = done === true || (done === undefined && internalFinished);
  const safeSteps = Array.isArray(steps) ? steps : [];
  const requestedVisible =
    visibleSteps === undefined ? internalRevealed : Math.floor(visibleSteps);
  const visibleCount = isFinished
    ? safeSteps.length
    : Math.max(0, Math.min(requestedVisible, safeSteps.length));
  const shown = safeSteps.slice(0, visibleCount);
  const currentIndex = isFinished ? -1 : visibleCount - 1;
  const pause = Number.isFinite(stepMs) ? Math.max(200, stepMs) : 1300;

  // Live clock. It freezes as soon as the panel finishes.
  useEffect(() => {
    if (isFinished) return;
    const id = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [isFinished]);

  useEffect(() => {
    if (isFinished && finishedAt === null) {
      setFinishedAt(Math.max(1, elapsed));
    }
  }, [isFinished, finishedAt, elapsed]);

  useEffect(() => {
    if (!isFinished || notified.current) return;
    notified.current = true;
    onDone?.(finishedAt ?? Math.max(1, elapsed));
  }, [isFinished, finishedAt, elapsed, onDone]);

  // Demo reveal: one row at a time, then the final check.
  useEffect(() => {
    if (visibleSteps !== undefined || done !== undefined) return;

    if (safeSteps.length === 0) {
      setInternalRevealed(0);
      setInternalFinished(false);
      return;
    }
    if (internalRevealed === 0) {
      setInternalRevealed(1);
      return;
    }
    if (internalRevealed < safeSteps.length) {
      const id = window.setTimeout(
        () => setInternalRevealed((value) => Math.min(safeSteps.length, value + 1)),
        pause,
      );
      return () => window.clearTimeout(id);
    }
    if (!internalFinished) {
      const id = window.setTimeout(() => setInternalFinished(true), 520);
      return () => window.clearTimeout(id);
    }
  }, [
    visibleSteps,
    done,
    safeSteps.length,
    internalRevealed,
    internalFinished,
    pause,
  ]);

  // Start over a few seconds after the finished state.
  useEffect(() => {
    if (!loop || !isFinished || done !== undefined) return;
    const id = window.setTimeout(() => {
      startRef.current = Date.now();
      setElapsed(0);
      setFinishedAt(null);
      setInternalRevealed(safeSteps.length > 0 ? 1 : 0);
      setInternalFinished(false);
      setExpanded(true);
      notified.current = false;
    }, 3200);
    return () => window.clearTimeout(id);
  }, [loop, isFinished, done, safeSteps.length]);

  const seconds = finishedAt ?? Math.max(0, elapsed);
  const title = isFinished ? `Worked for ${secondsLabel(seconds)}` : "Thinking";

  return (
    <section
      className={["ui-ts", className].filter(Boolean).join(" ")}
      data-finished={isFinished || undefined}
      aria-label={isFinished ? "Thinking complete" : "Thinking"}
    >
      <style href="ui-thinking-state-clean" precedence="default">
        {css}
      </style>

      <button
        type="button"
        className="ui-ts__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        title={expanded ? "Collapse thinking" : "Expand thinking"}
      >
        <span className="ui-ts__grid" aria-hidden="true">
          {GRID_DOTS.map((dot) => (
            <i
              key={dot}
              style={{ "--ui-ts-i": dot } as CSSProperties}
            />
          ))}
        </span>
        <span className="ui-ts__title">{title}</span>
        {!isFinished ? <span className="ui-ts__timer">{secondsLabel(seconds)}</span> : null}
        <ChevronDown className="ui-ts__chevron" aria-hidden="true" />
      </button>

      <div
        className="ui-ts__body"
        hidden={!expanded}
        role="list"
        aria-live="polite"
        aria-atomic="false"
      >
        <span className="ui-ts__line" aria-hidden="true" />

        {shown.map((step, index) => {
          if (step.kind === "search") {
            return (
              <div
                key={`search-${index}-${step.label}`}
                className="ui-ts__row ui-ts__row--search"
                role="listitem"
              >
                <span className="ui-ts__search-mark" aria-hidden="true">
                  <SearchMark />
                </span>
                <div className="ui-ts__search-copy">
                  <p className="ui-ts__row-label">{step.label}</p>
                  <SourceList
                    sources={Array.isArray(step.sources) ? step.sources : []}
                    moreSources={Array.isArray(step.moreSources) ? step.moreSources : []}
                  />
                </div>
              </div>
            );
          }

          const current = index === currentIndex;

          return (
            <div
              key={`step-${index}-${step.label}`}
              className={`ui-ts__row ui-ts__row--step${current ? " is-current" : ""}`}
              role="listitem"
            >
              <span className="ui-ts__marker" aria-hidden="true">
                {current ? <span className="ui-ts__square" /> : <span className="ui-ts__dot" />}
              </span>
              <p className="ui-ts__row-label">{step.label}</p>
            </div>
          );
        })}

        {isFinished ? (
          <div className="ui-ts__row ui-ts__row--finish" role="listitem">
            <span className="ui-ts__marker" aria-hidden="true">
              <span className="ui-ts__check">
                <svg viewBox="0 0 20 20" fill="none">
                  <path
                    d={CHECK_PATH}
                    pathLength={1}
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
            <p className="ui-ts__row-label ui-ts__row-label--finish">{doneLabel}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const css = /* css */ `
.ui-ts {
  --ui-ts-ink: var(--aui-ink, #171717);
  --ui-ts-muted: var(--aui-muted, #6b6b6b);
  --ui-ts-blue: var(--aui-blue, #4a8dff);
  --ui-ts-surface: var(--aui-surface, #ffffff);
  --ui-ts-bg: var(--aui-surface, #ffffff);
  --ui-ts-line: color-mix(in oklab, var(--ui-ts-muted) 27%, transparent);
  --ui-ts-chip-border: color-mix(in oklab, var(--ui-ts-muted) 25%, transparent);
  --ui-ts-chip-bg: color-mix(in oklab, var(--ui-ts-surface) 92%, transparent);
  --ui-ts-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  --ui-ts-font: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  color: var(--ui-ts-ink);
  font-family: var(--ui-ts-font);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: -0.006em;
  -webkit-font-smoothing: antialiased;
  text-align: left;
}

.ui-ts *,
.ui-ts *::before,
.ui-ts *::after {
  box-sizing: border-box;
}

.ui-ts__header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 22px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.ui-ts__header:focus-visible {
  border-radius: 6px;
  box-shadow: 0 0 0 2px var(--aui-focus, var(--ui-ts-blue));
}

.ui-ts__title {
  color: var(--ui-ts-ink);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.ui-ts__timer {
  color: var(--ui-ts-muted);
  font-size: 14px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.ui-ts__chevron {
  width: 13px;
  height: 13px;
  margin-left: auto;
  opacity: 0;
  color: var(--ui-ts-muted);
  transition: opacity 160ms ease, transform 220ms var(--ui-ts-ease);
}

.ui-ts__header:hover .ui-ts__chevron,
.ui-ts__header:focus-visible .ui-ts__chevron {
  opacity: 0.55;
}

.ui-ts__header[aria-expanded="false"] .ui-ts__chevron {
  transform: rotate(-90deg);
}

/* 3 × 3 thinking mark */
.ui-ts__grid {
  display: grid;
  flex: none;
  grid-template-columns: repeat(3, 4.5px);
  grid-template-rows: repeat(3, 4.5px);
  gap: 2px;
  width: 17.5px;
  height: 17.5px;
  color: var(--ui-ts-blue);
}

.ui-ts__grid i {
  display: block;
  width: 4.5px;
  height: 4.5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.38;
  animation: ui-ts-grid 1.35s ease-in-out infinite;
  animation-delay: calc(var(--ui-ts-i) * 75ms);
}

.ui-ts[data-finished] .ui-ts__grid i {
  animation: none;
  opacity: 1;
}

/* Trail */
.ui-ts__body {
  position: relative;
  margin-top: 17px;
  padding: 1px 0 2px;
}

.ui-ts__body[hidden] {
  display: none;
}

.ui-ts__line {
  position: absolute;
  top: 25px;
  bottom: 17px;
  left: 9px;
  width: 1px;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--ui-ts-line) 0,
    var(--ui-ts-line) 2.5px,
    transparent 2.5px,
    transparent 6px
  );
  mask-image: linear-gradient(to bottom, transparent 0, #000 5px, #000 calc(100% - 5px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 5px, #000 calc(100% - 5px), transparent 100%);
}

.ui-ts__row {
  position: relative;
  display: flex;
  min-height: 20px;
  padding-left: 32px;
}

.ui-ts__row + .ui-ts__row {
  margin-top: 16px;
}

.ui-ts__row--search {
  min-height: 21px;
}

.ui-ts__marker {
  position: absolute;
  top: 1px;
  left: 1px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
}

.ui-ts__dot {
  display: block;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--ui-ts-muted);
  opacity: 0.55;
}

.ui-ts__square {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--ui-ts-blue);
  animation: ui-ts-square 1.15s ease-in-out infinite;
}

.ui-ts__search-mark {
  position: absolute;
  top: -1px;
  left: 0;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--ui-ts-muted);
}

.ui-ts__search-svg {
  width: 20px;
  height: 20px;
}

.ui-ts__search-copy {
  min-width: 0;
}

.ui-ts__row-label {
  margin: 0;
  color: var(--ui-ts-muted);
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: -0.006em;
  overflow-wrap: anywhere;
}

.ui-ts__row--search .ui-ts__row-label {
  color: var(--ui-ts-ink);
}

.ui-ts__row--step.is-current .ui-ts__row-label {
  color: color-mix(in oklab, var(--ui-ts-muted) 88%, var(--ui-ts-ink));
}

.ui-ts__row--finish {
  align-items: center;
}

.ui-ts__row-label--finish {
  color: var(--ui-ts-ink);
  font-weight: 500;
}

.ui-ts__check {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--ui-ts-blue);
  color: #fff;
  box-shadow: 0 1px 2px color-mix(in oklab, var(--ui-ts-blue) 30%, transparent);
  animation: ui-ts-check-pop 360ms var(--aui-ease-spring, cubic-bezier(0.34, 1.35, 0.64, 1)) both;
}

.ui-ts__check svg {
  width: 18px;
  height: 18px;
}

.ui-ts__check path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: ui-ts-check-draw 300ms 120ms var(--ui-ts-ease) forwards;
}

/* Source chips */
.ui-ts__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.ui-ts__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(270px, 100%);
  height: 36px;
  padding: 0 11px;
  border: 1px solid var(--ui-ts-chip-border);
  border-radius: 10px;
  background: var(--ui-ts-chip-bg);
  color: var(--ui-ts-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.005em;
  text-decoration: none;
  white-space: nowrap;
  transition: background-color 160ms ease, border-color 160ms ease;
}

a.ui-ts__chip:hover,
button.ui-ts__chip:hover {
  border-color: color-mix(in oklab, var(--ui-ts-muted) 38%, transparent);
  background: color-mix(in oklab, var(--ui-ts-surface) 80%, var(--ui-ts-muted) 4%);
}

.ui-ts__chip--more {
  color: var(--ui-ts-muted);
  cursor: pointer;
}

.ui-ts__source-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-ts__source-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 17px;
  height: 17px;
  overflow: hidden;
  border-radius: 4px;
  color: var(--ui-ts-muted);
}

.ui-ts__source-icon img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}

.ui-ts__source-icon--fallback svg {
  width: 14px;
  height: 14px;
}

@keyframes ui-ts-grid {
  0%, 65%, 100% { opacity: 0.32; transform: scale(0.82); }
  32% { opacity: 1; transform: scale(1); }
}

@keyframes ui-ts-square {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.72; transform: scale(0.78); }
}

@keyframes ui-ts-check-pop {
  from { opacity: 0; transform: scale(0.55); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes ui-ts-check-draw {
  to { stroke-dashoffset: 0; }
}

/* Dark mode: follows the app's .dark class and a plain data-theme="dark". */
:where(.dark, [data-theme="dark"]) .ui-ts {
  --ui-ts-ink: var(--aui-ink, #ededed);
  --ui-ts-muted: var(--aui-muted, #8f8f8f);
  --ui-ts-surface: var(--aui-surface, #161618);
  --ui-ts-bg: var(--aui-surface, #161618);
  --ui-ts-chip-bg: color-mix(in oklab, var(--ui-ts-surface) 88%, transparent);
}

@media (max-width: 520px) {
  .ui-ts__chip {
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-ts *,
  .ui-ts *::before,
  .ui-ts *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .ui-ts__square { animation: none; }
  .ui-ts__grid i { opacity: 0.8; }
}
`;

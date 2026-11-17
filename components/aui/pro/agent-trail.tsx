"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/*
 * Agent Trail (Pro) – the steps an agent works through, as one quiet trail.
 * Rebuilt from the published Pro contract (agent-trail.md): done steps with a
 * drawn check and their time, the running step with a spinning ring, its status
 * and a live timer, sub-steps that branch under it with a light running into the
 * one it is on, and a gated step that waits with a dashed ring until it is
 * approved or declined. One self-contained file, styles injected, dark mode
 * built in, container-query friendly.
 */

export type TrailStepState = "done" | "running" | "pending" | "waiting" | "failed" | "declined";

export type TrailSubstep = {
  id?: string;
  title: string;
  state?: "done" | "running" | "pending";
  /** A short fact on the right – a file, a diff, a count. */
  detail?: string;
};

export type TrailStep = {
  /** Stable id – expansion, focus and the live region track steps by it. */
  id: string;
  title: string;
  state: TrailStepState;
  /** How long a done step took: ms, or your own text. */
  duration?: number | string;
  /** What a running step is doing right now – one word in the present. */
  status?: string;
  /** When the running step started (Date.now()) – drives the live timer. */
  startedAt?: number;
  /** Needs approval before it runs. */
  gate?: boolean;
  /** The tool or system the step works in. */
  tool?: { logo: ReactNode; name: string };
  substeps?: TrailSubstep[];
  /** What a waiting step asks you to approve. */
  ask?: string;
};

export type AgentTrailLabels = {
  title: string;
  running: string;
  approval: string;
  waiting: string;
  failed: string;
  declined: string;
  done: string;
  pending: string;
  empty: string;
  untitled: string;
  earlier: string;
  more: string;
  fewer: string;
  approve: string;
  decline: string;
};

const LABELS: AgentTrailLabels = {
  title: "Steps",
  running: "Working",
  approval: "Approval",
  waiting: "Needs you",
  failed: "Failed",
  declined: "Declined",
  done: "Done",
  pending: "To do",
  empty: "No steps yet",
  untitled: "Untitled step",
  earlier: "earlier",
  more: "more",
  fewer: "Show fewer",
  approve: "Approve",
  decline: "Decline",
};

/** 8000 → "8s", 64000 → "1m 4s", 3720000 → "1h 2m", 273600000 → "3d 4h". */
export function formatTrailDuration(value: number | string | undefined | null): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") return value;
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1000) return "<1s";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The rows a long sub-step list folds around the one the agent is on. */
function foldSubsteps(substeps: TrailSubstep[]) {
  if (substeps.length <= 6) {
    return { shown: substeps, earlier: 0, more: 0 };
  }
  const focus = Math.max(0, substeps.findIndex((substep) => substep.state === "running"));
  const start = Math.min(Math.max(focus - 2, 0), substeps.length - 5);
  return { shown: substeps.slice(start, start + 5), earlier: start, more: substeps.length - start - 5 };
}

const CHECK = (
  <svg viewBox="0 0 12 12" aria-hidden className="ui-atr__check">
    <path d="M2.5 6.4 5 8.9l4.5-5.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function StepMarker({ state, gate }: { state: TrailStepState; gate?: boolean }) {
  const className = `ui-atr__mark ui-atr__mark--${state}${gate ? " is-gate" : ""}`;

  if (state === "done") return <span className={className}>{CHECK}</span>;
  if (state === "running") {
    return (
      <span className={className} aria-hidden>
        <span className="ui-atr__ring" />
      </span>
    );
  }
  if (state === "waiting") {
    return (
      <span className={className} aria-hidden>
        <span className="ui-atr__pause" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={className} aria-hidden>
        <svg viewBox="0 0 12 12" className="ui-atr__cross">
          <path d="M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "declined") {
    return (
      <span className={className} aria-hidden>
        <span className="ui-atr__dash" />
      </span>
    );
  }
  return <span className={className} aria-hidden />;
}

export function AgentTrail({
  steps,
  title,
  agent,
  labels,
  expanded,
  onExpandedChange,
  onApprove,
  onDecline,
  className,
}: {
  steps: TrailStep[];
  /** The task, in a header over the trail. Leave it out for no header. */
  title?: string;
  agent?: { name: string; logo?: ReactNode };
  labels?: Partial<AgentTrailLabels>;
  /** Which steps show their sub-steps (controlled). */
  expanded?: string[];
  onExpandedChange?: (ids: string[]) => void;
  onApprove?: (step: TrailStep) => void;
  onDecline?: (step: TrailStep) => void;
  className?: string;
}) {
  const text = { ...LABELS, ...labels };
  const baseId = useId();
  const doneCount = steps.filter((step) => step.state === "done").length;
  const running = steps.some((step) => step.state === "running");
  const now = useNow(running);

  const [openOwn, setOpenOwn] = useState<string[]>(() =>
    steps.filter((step) => step.state === "running" && (step.substeps?.length ?? 0) > 0).map((step) => step.id),
  );
  const openIds = expanded ?? openOwn;

  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [showAllFor, setShowAllFor] = useState<string[]>([]);
  const approveRef = useRef<HTMLButtonElement | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastStates = useRef<Record<string, TrailStepState>>({});

  const setOpen = useCallback(
    (next: string[]) => {
      if (expanded === undefined) setOpenOwn(next);
      onExpandedChange?.(next);
    },
    [expanded, onExpandedChange],
  );

  // A polite note whenever a step finishes, fails or starts waiting for you.
  useEffect(() => {
    const spoken: string[] = [];
    for (const step of steps) {
      const before = lastStates.current[step.id];
      if (before !== step.state && (step.state === "done" || step.state === "failed" || step.state === "waiting")) {
        spoken.push(`${step.title || text.untitled} – ${text[step.state]}`);
      }
      lastStates.current[step.id] = step.state;
    }
    if (spoken.length > 0) setAnnouncement(spoken.join(". "));
  }, [steps, text]);

  useEffect(() => {
    if (answerFor) approveRef.current?.focus();
  }, [answerFor]);

  function stepAria(step: TrailStep) {
    const state = text[step.state];
    const took = formatTrailDuration(step.duration);
    return [step.title || text.untitled, state, took].filter(Boolean).join(" – ");
  }

  return (
    <section className={["ui-atr", className].filter(Boolean).join(" ")} aria-label={title || text.title}>
      <style href="ui-agent-trail" precedence="default">
        {TRAIL_CSS}
      </style>

      {(title || agent) && (
        <header className="ui-atr__head">
          {agent && (
            <span className="ui-atr__agent">
              {agent.logo ? <span className="ui-atr__agentlogo">{agent.logo}</span> : null}
              <span className="ui-atr__agentname">{agent.name}</span>
            </span>
          )}
          {title ? <span className="ui-atr__title">{title}</span> : <span className="ui-atr__title">{text.title}</span>}
          <span
            className="ui-atr__count"
            title={`${doneCount} of ${steps.length} steps done`}
            dir="ltr"
          >
            <b>{doneCount}</b>
            <span aria-hidden>/{steps.length}</span>
            <span className="ui-atr__sr">{`${doneCount} of ${steps.length} steps done`}</span>
          </span>
        </header>
      )}

      {steps.length === 0 ? (
        <p className="ui-atr__empty">{text.empty}</p>
      ) : (
        <ol className="ui-atr__list">
          {steps.map((step, index) => {
            const hasSubs = (step.substeps?.length ?? 0) > 0;
            const isOpen = hasSubs && openIds.includes(step.id);
            const last = index === steps.length - 1;
            const runningIndex = step.state === "running";
            const live =
              runningIndex && step.startedAt ? formatTrailDuration(now - step.startedAt) : null;
            const took = formatTrailDuration(step.duration) ?? (runningIndex ? live : null);
            const folded = hasSubs ? foldSubsteps(step.substeps ?? []) : null;
            const all = showAllFor.includes(step.id);
            const visibleSubs = folded ? (all ? step.substeps ?? [] : folded.shown) : [];
            const waiting = step.state === "waiting";
            const canAnswer = waiting && Boolean(onApprove || onDecline) && Boolean(step.gate);

            return (
              <li
                key={step.id}
                className={`ui-atr__step ui-atr__step--${step.state}${step.gate ? " is-gate" : ""}`}
                aria-current={runningIndex ? "step" : undefined}
                data-last={last ? "true" : undefined}
              >
                <span className="ui-atr__rail" aria-hidden>
                  <StepMarker state={step.state} gate={step.gate} />
                  {!last && <span className="ui-atr__line" />}
                </span>

                <div className="ui-atr__body">
                  <div className="ui-atr__row">
                    {hasSubs ? (
                      <button
                        type="button"
                        className="ui-atr__toggle"
                        aria-expanded={isOpen}
                        aria-controls={`${baseId}-subs-${step.id}`}
                        onClick={() =>
                          setOpen(isOpen ? openIds.filter((id) => id !== step.id) : [...openIds, step.id])
                        }
                      >
                        <StepTitle step={step} fallback={text.untitled} />
                      </button>
                    ) : (
                      <span className="ui-atr__name" title={step.title || text.untitled}>
                        {step.tool ? <span className="ui-atr__tool ui-atr__tool--idle">{step.tool.logo}</span> : null}
                        <span className="ui-atr__nametext">{step.title || text.untitled}</span>
                      </span>
                    )}

                    <span className="ui-atr__meta">
                      <StepStateLabel step={step} text={text} took={took} />
                      {canAnswer ? (
                        <button
                          type="button"
                          className="ui-atr__needs"
                          aria-expanded={answerFor === step.id}
                          onClick={() => setAnswerFor(answerFor === step.id ? null : step.id)}
                        >
                          {text.waiting}
                        </button>
                      ) : null}
                    </span>
                  </div>

                  {step.status && step.state !== "done" && step.state !== "pending" ? (
                    <p className="ui-atr__status" aria-live="off">
                      {step.status}
                    </p>
                  ) : null}

                  {answerFor === step.id && canAnswer ? (
                    <div
                      className="ui-atr__answer"
                      role="group"
                      aria-label={text.waiting}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setAnswerFor(null);
                        }
                      }}
                    >
                      {step.ask ? <p className="ui-atr__ask">{step.ask}</p> : null}
                      <div className="ui-atr__answers">
                        {onApprove ? (
                          <button
                            ref={approveRef}
                            type="button"
                            className="ui-atr__btn ui-atr__btn--primary"
                            onClick={() => {
                              onApprove(step);
                              setAnswerFor(null);
                            }}
                          >
                            {text.approve}
                          </button>
                        ) : null}
                        {onDecline ? (
                          <button
                            type="button"
                            className="ui-atr__btn"
                            onClick={() => {
                              onDecline(step);
                              setAnswerFor(null);
                            }}
                          >
                            {text.decline}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {hasSubs ? (
                    <div
                      id={`${baseId}-subs-${step.id}`}
                      className="ui-atr__subs"
                      inert={!isOpen}
                      data-open={isOpen ? "true" : "false"}
                    >
                      {step.state === "running" ? <span className="ui-atr__light" aria-hidden /> : null}
                      <ul className="ui-atr__sublist">
                        {!all && folded && folded.earlier > 0 ? (
                          <li className="ui-atr__fold">
                            <button
                              type="button"
                              className="ui-atr__foldbtn"
                              onClick={() => setShowAllFor((ids) => [...ids, step.id])}
                            >
                              +{folded.earlier} {text.earlier}
                            </button>
                          </li>
                        ) : null}

                        {visibleSubs.map((substep, subIndex) => {
                          const state = substep.state ?? "done";
                          return (
                            <li
                              key={substep.id ?? `${step.id}-sub-${subIndex}`}
                              className={`ui-atr__sub ui-atr__sub--${state}`}
                              aria-current={state === "running" ? "step" : undefined}
                            >
                              <span className="ui-atr__submark" aria-hidden>
                                {state === "done" ? CHECK : null}
                                {state === "running" ? <span className="ui-atr__ring ui-atr__ring--sm" /> : null}
                              </span>
                              <span className="ui-atr__subtext" title={substep.title}>
                                {substep.title}
                              </span>
                              {substep.detail ? (
                                <span className="ui-atr__detail" title={substep.detail}>
                                  {substep.detail}
                                </span>
                              ) : null}
                            </li>
                          );
                        })}

                        {!all && folded && folded.more > 0 ? (
                          <li className="ui-atr__fold">
                            <button
                              type="button"
                              className="ui-atr__foldbtn"
                              onClick={() => setShowAllFor((ids) => [...ids, step.id])}
                            >
                              +{folded.more} {text.more}
                            </button>
                          </li>
                        ) : null}

                        {all && (step.substeps?.length ?? 0) > 6 ? (
                          <li className="ui-atr__fold">
                            <button
                              type="button"
                              className="ui-atr__foldbtn"
                              onClick={() => setShowAllFor((ids) => ids.filter((id) => id !== step.id))}
                            >
                              {text.fewer}
                            </button>
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="ui-atr__sr" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

function StepTitle({ step, fallback }: { step: TrailStep; fallback: string }) {
  return (
    <span className="ui-atr__name" title={step.title || fallback}>
      {step.tool ? (
        <span className="ui-atr__tool" title={step.tool.name}>
          {step.tool.logo}
        </span>
      ) : null}
      <span className="ui-atr__nametext">{step.title || fallback}</span>
      <svg viewBox="0 0 10 10" aria-hidden className="ui-atr__chev">
        <path d="M2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function StepStateLabel({
  step,
  text,
  took,
}: {
  step: TrailStep;
  text: AgentTrailLabels;
  took: string | null;
}) {
  if (step.state === "done") {
    return (
      <span className="ui-atr__state ui-atr__state--done" dir="ltr">
        {took ?? text.done}
      </span>
    );
  }
  if (step.state === "running") {
    return (
      <span className="ui-atr__state ui-atr__state--running" dir="ltr">
        {took ?? text.running}
      </span>
    );
  }
  if (step.state === "waiting") {
    return (
      <span className="ui-atr__state ui-atr__state--waiting">
        <span className="ui-atr__dot" aria-hidden />
        {text.waiting}
      </span>
    );
  }
  if (step.state === "failed") return <span className="ui-atr__state ui-atr__state--failed">{text.failed}</span>;
  if (step.state === "declined") return <span className="ui-atr__state ui-atr__state--declined">{text.declined}</span>;
  return (
    <span className={`ui-atr__state ui-atr__state--pending${step.gate ? " is-gate" : ""}`}>
      {step.gate ? text.approval : text.pending}
    </span>
  );
}

export const TRAIL_CSS = `
.ui-atr {
  --ui-atr-accent: var(--aui-blue, #2f6bff);
  --ui-atr-wash: color-mix(in oklab, var(--ui-atr-accent) 10%, transparent);
  --ui-atr-loop: 1.4s;
  --ui-atr-ink: var(--aui-ink, rgba(0, 0, 0, 0.88));
  --ui-atr-text: var(--aui-muted, rgba(0, 0, 0, 0.61));
  --ui-atr-line: var(--aui-line, rgba(0, 0, 0, 0.09));
  --ui-atr-surface: var(--aui-surface, #ffffff);
  --ui-atr-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  --ui-atr-orange: #d9820a;
  --ui-atr-red: #dc4a4a;
  container-type: inline-size;
  position: relative;
  color: var(--ui-atr-ink);
  font-family: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  line-height: 1.35;
  -webkit-font-smoothing: antialiased;
}
.ui-atr__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  margin-bottom: 4px;
  padding: 0 2px;
}
.ui-atr__agent { display: inline-flex; align-items: center; gap: 5px; flex: none; max-width: 40%; }
.ui-atr__agentlogo { display: inline-flex; width: 14px; height: 14px; }
.ui-atr__agentlogo > svg, .ui-atr__agentlogo > img { width: 14px; height: 14px; border-radius: 4px; }
.ui-atr__agentname { font-size: 11px; color: var(--ui-atr-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-atr__title {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.ui-atr__count {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  font-size: 11px;
  color: var(--ui-atr-text);
  font-variant-numeric: tabular-nums;
}
.ui-atr__count b { font-weight: 600; color: var(--ui-atr-ink); }
.ui-atr__list { list-style: none; margin: 0; padding: 0; }
.ui-atr__step { display: flex; gap: 8px; }
.ui-atr__rail { position: relative; flex: none; width: 16px; display: flex; justify-content: center; }
.ui-atr__mark {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--ui-atr-surface);
  color: var(--ui-atr-text);
}
.ui-atr__mark--pending { box-shadow: inset 0 0 0 1.5px var(--ui-atr-line); }
.ui-atr__mark--done { background: var(--ui-atr-wash); color: var(--ui-atr-accent); }
.ui-atr__mark--running { color: var(--ui-atr-accent); }
.ui-atr__mark--waiting { background: color-mix(in oklab, var(--ui-atr-orange) 14%, transparent); color: var(--ui-atr-orange); }
.ui-atr__mark--failed { background: color-mix(in oklab, var(--ui-atr-red) 12%, transparent); color: var(--ui-atr-red); }
.ui-atr__mark--declined { color: var(--ui-atr-text); }
.ui-atr__mark.is-gate { box-shadow: 0 0 0 1.5px var(--ui-atr-surface), 0 0 0 2.5px color-mix(in oklab, var(--ui-atr-orange) 55%, transparent); }
.ui-atr__check { width: 10px; height: 10px; }
.ui-atr__check path { stroke-dasharray: 14; stroke-dashoffset: 0; animation: ui-atr-draw 260ms var(--ui-atr-ease) both; }
.ui-atr__cross { width: 10px; height: 10px; }
.ui-atr__ring {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.7px solid color-mix(in oklab, var(--ui-atr-accent) 26%, transparent);
  border-top-color: var(--ui-atr-accent);
  animation: ui-atr-spin 900ms linear infinite;
}
.ui-atr__ring--sm { width: 10px; height: 10px; border-width: 1.4px; }
.ui-atr__pause { width: 6px; height: 6px; border-radius: 1.5px; background: currentColor; box-shadow: 5px 0 0 currentColor; margin-left: -5px; }
.ui-atr__dash { width: 7px; height: 1.6px; border-radius: 2px; background: currentColor; opacity: 0.7; }
.ui-atr__line { position: absolute; top: 24px; bottom: -8px; width: 1px; background: var(--ui-atr-line); }
.ui-atr__body { min-width: 0; flex: 1 1 auto; padding-bottom: 6px; }
.ui-atr__row { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.ui-atr__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
  padding: 4px 0;
  margin: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 5px;
}
.ui-atr__toggle:focus-visible { outline: 2px solid var(--ui-atr-accent); outline-offset: 2px; }
.ui-atr__name { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; }
.ui-atr__nametext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-atr__step--pending .ui-atr__nametext, .ui-atr__step--pending .ui-atr__tool { color: var(--ui-atr-text); }
.ui-atr__step--declined .ui-atr__nametext { color: var(--ui-atr-text); text-decoration: line-through; text-decoration-color: var(--ui-atr-line); }
.ui-atr__tool { display: inline-flex; width: 14px; height: 14px; flex: none; opacity: 0.95; }
.ui-atr__tool--idle { opacity: 0.55; }
.ui-atr__tool > svg, .ui-atr__tool > img { width: 14px; height: 14px; border-radius: 3px; }
.ui-atr__chev { width: 9px; height: 9px; flex: none; opacity: 0.5; transition: transform 160ms var(--ui-atr-ease); }
.ui-atr__toggle[aria-expanded="true"] .ui-atr__chev { transform: rotate(180deg); }
.ui-atr__meta { display: flex; align-items: center; gap: 6px; flex: none; max-width: 40%; }
.ui-atr__state {
  font-size: 11px;
  color: var(--ui-atr-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-atr__state--running { color: var(--ui-atr-accent); }
.ui-atr__state--waiting { color: var(--ui-atr-orange); font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
.ui-atr__state--failed { color: var(--ui-atr-red); }
.ui-atr__state--pending.is-gate { color: color-mix(in oklab, var(--ui-atr-orange) 78%, var(--ui-atr-text)); }
.ui-atr__dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.ui-atr__status {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--ui-atr-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: ui-atr-shimmer 1.6s ease-in-out infinite;
}
.ui-atr__needs {
  border: 0;
  margin: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--ui-atr-orange) 14%, transparent);
  color: var(--ui-atr-orange);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.ui-atr__needs:focus-visible { outline: 2px solid var(--ui-atr-orange); outline-offset: 2px; }
.ui-atr__answer {
  margin: 4px 0 6px 22px;
  padding: 9px 10px;
  border-radius: 9px;
  background: color-mix(in oklab, var(--ui-atr-orange) 7%, var(--ui-atr-surface));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ui-atr-orange) 22%, transparent);
}
.ui-atr__ask { margin: 0 0 8px; font-size: 11.5px; color: var(--ui-atr-ink); }
.ui-atr__answers { display: flex; gap: 6px; }
.ui-atr__btn {
  border: 0;
  margin: 0;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--ui-atr-surface);
  box-shadow: inset 0 0 0 1px var(--ui-atr-line);
  color: var(--ui-atr-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
}
.ui-atr__btn--primary { background: var(--ui-atr-accent); color: #fff; box-shadow: none; }
.ui-atr__btn:focus-visible { outline: 2px solid var(--ui-atr-accent); outline-offset: 2px; }
.ui-atr__subs {
  position: relative;
  margin-left: 7px;
  padding-left: 14px;
  border-left: 1px solid var(--ui-atr-line);
  overflow: hidden;
  max-height: 0;
  opacity: 0;
  transition: max-height 240ms var(--ui-atr-ease), opacity 160ms linear;
}
.ui-atr__subs[data-open="true"] { max-height: 420px; opacity: 1; }
.ui-atr__sublist { list-style: none; margin: 2px 0 0; padding: 0; }
.ui-atr__sub { display: flex; align-items: center; gap: 6px; min-height: 24px; font-size: 11.5px; color: var(--ui-atr-text); }
.ui-atr__sub--running { color: var(--ui-atr-ink); }
.ui-atr__submark { display: inline-grid; place-items: center; width: 10px; height: 10px; flex: none; color: var(--ui-atr-accent); }
.ui-atr__submark .ui-atr__check { width: 9px; height: 9px; }
.ui-atr__subtext { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-atr__detail {
  margin-left: auto;
  flex: none;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: right;
  opacity: 0.8;
  font-variant-numeric: tabular-nums;
}
.ui-atr__fold { min-height: 22px; display: flex; align-items: center; }
.ui-atr__foldbtn {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 11px;
  color: var(--ui-atr-accent);
  cursor: pointer;
  border-radius: 4px;
}
.ui-atr__foldbtn:focus-visible { outline: 2px solid var(--ui-atr-accent); outline-offset: 2px; }
.ui-atr__light {
  position: absolute;
  top: 0;
  left: -1px;
  width: 1px;
  height: 34%;
  background: linear-gradient(180deg, transparent, var(--ui-atr-accent));
  filter: drop-shadow(0 0 3px color-mix(in oklab, var(--ui-atr-accent) 60%, transparent));
  animation: ui-atr-run var(--ui-atr-loop) var(--ui-atr-ease) infinite;
}
.ui-atr__empty { margin: 2px 0; font-size: 11.5px; color: var(--ui-atr-text); }
.ui-atr__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
@keyframes ui-atr-spin { to { transform: rotate(360deg); } }
@keyframes ui-atr-draw { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
@keyframes ui-atr-run { 0% { transform: translateY(-100%); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(230%); opacity: 0; } }
@keyframes ui-atr-shimmer { 0% { opacity: 0.45; } 50% { opacity: 1; } 100% { opacity: 0.45; } }
@container (max-width: 320px) {
  .ui-atr__detail { max-width: 34%; }
  .ui-atr__meta { max-width: 46%; }
}
@media (hover: none) {
  .ui-atr__row { min-height: 40px; }
  .ui-atr__sub { min-height: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-atr__ring, .ui-atr__light, .ui-atr__check path, .ui-atr__status { animation: none; }
  .ui-atr__subs { transition: none; }
}
:where(.dark, [data-theme="dark"]) .ui-atr {
  --ui-atr-ink: rgba(255, 255, 255, 0.92);
  --ui-atr-text: rgba(255, 255, 255, 0.62);
  --ui-atr-line: rgba(255, 255, 255, 0.13);
  --ui-atr-surface: #1c1c1e;
  --ui-atr-accent: #4fb0fe;
  --ui-atr-orange: #f0a13a;
  --ui-atr-red: #ff6b6b;
}
`;

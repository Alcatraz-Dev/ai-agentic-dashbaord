"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Approval Gates (Pro) – the approval requests of an agent run as a stack of
 * cards: the one to decide now on top with who asks, what exactly and why, the
 * diff or arguments on it. Approve, Edit or Reject, and it drops into the
 * Decided list while the next rises; the steps behind an open gate are held.
 * Rebuilt from the published Pro contract (approval-gates.md). One self-
 * contained file, styles injected, dark mode built in.
 */

export type ApprovalGateKind = "tool" | "file" | "agent" | "message";
export type ApprovalGateStatus = "open" | "approved" | "edited" | "rejected";

export type ApprovalGateDiffLine = { type: "add" | "del" | "same"; text: string };
export type ApprovalGateDiff = { file: string; lines: ApprovalGateDiffLine[] };

export type ApprovalGate = {
  id: string;
  /** Who asks – the agent's name. */
  agent: string;
  avatar?: ReactNode;
  kind: ApprovalGateKind;
  /** What exactly happens – "Email 1,284 trial users". */
  action: string;
  /** Why it needs a person, in one line. */
  reason: string;
  status: ApprovalGateStatus;
  /** When it came up – "1m ago". */
  at?: string;
  /** The arguments, prompt or message. */
  input?: string;
  diff?: ApprovalGateDiff[];
  files?: string[];
  /** The steps before it. */
  context?: string[];
  /** The steps that wait for it. */
  holds?: string[];
  /** What the person changed or said. */
  note?: string;
};

export type ApprovalDecision = "approved" | "edited" | "rejected";

const KIND_LABEL: Record<ApprovalGateKind, string> = {
  tool: "Tool call",
  file: "File change",
  agent: "Sub-agent",
  message: "Message",
};

const STATUS_LABEL: Record<Exclude<ApprovalGateStatus, "open">, string> = {
  approved: "Approved",
  edited: "Approved with changes",
  rejected: "Stopped the run",
};

export function ApprovalGates({
  gates,
  task,
  live = false,
  onDecide,
  title = "Approvals",
  labels,
  className,
}: {
  gates: ApprovalGate[];
  /** What the run is about – shown muted next to the title. */
  task?: string;
  /** The run is still going: with nothing open it reads Running. */
  live?: boolean;
  onDecide?: (id: string, decision: ApprovalDecision, value?: string) => void;
  title?: string;
  labels?: Partial<{ approve: string; edit: string; reject: string; save: string; cancel: string; running: string; empty: string }>;
  className?: string;
}) {
  const text = {
    approve: "Approve",
    edit: "Change it first",
    reject: "Reject",
    save: "Approve with changes",
    cancel: "Cancel",
    running: "Running",
    empty: "Nothing waits for you",
    ...labels,
  };

  const baseId = useId();
  const open = gates.filter((gate) => gate.status === "open");
  const decided = gates.filter((gate) => gate.status !== "open");

  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const approveRef = useRef<HTMLButtonElement | null>(null);
  const editRef = useRef<HTMLButtonElement | null>(null);
  const editFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // The stack shows the newest open request; a decision keeps the next one up.
  const top = open.length > 0 ? open[Math.min(Math.max(selected, 0), open.length - 1)] : null;

  useEffect(() => {
    if (selected > open.length - 1) setSelected(Math.max(0, open.length - 1));
  }, [open.length, selected]);

  useEffect(() => {
    if (editing) editFieldRef.current?.focus();
  }, [editing]);

  // New requests arriving while someone decides shouldn't move the card.
  useEffect(() => {
    if (!top) return;
    setEditing(false);
    setDraft(top.input ?? "");
  }, [top?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function decide(gate: ApprovalGate, decision: ApprovalDecision, value?: string) {
    const status =
      decision === "approved" ? STATUS_LABEL.approved : decision === "edited" ? STATUS_LABEL.edited : STATUS_LABEL.rejected;
    setAnnouncement(`${gate.action} – ${status}. ${Math.max(0, open.length - 1)} left.`);
    onDecide?.(gate.id, decision, value);
    setEditing(false);
    // Focus moves on to the next card's Approve once the parent rerenders.
    requestAnimationFrame(() => {
      if (open.length > 1) approveRef.current?.focus();
    });
  }

  function move(direction: -1 | 1) {
    if (open.length < 2 || editing) return;
    setSelected((current) => {
      const next = (current + direction + open.length) % open.length;
      return next;
    });
    requestAnimationFrame(() => approveRef.current?.focus());
  }

  const stackBehind = Math.min(2, Math.max(0, open.length - 1));
  const groupLabel = open.length > 0
    ? `${open.length} ${open.length === 1 ? "request" : "requests"} waiting${top ? `, ${top.action} on top` : ""}`
    : live
      ? `${title} – ${text.running}`
      : `${title} – ${text.empty}`;

  return (
    <section className={["ui-gate", className].filter(Boolean).join(" ")} aria-label={groupLabel}>
      <style href="ui-approval-gates" precedence="default">
        {GATE_CSS}
      </style>

      <div className="ui-gate__block">
        <header className="ui-gate__head">
          <span className="ui-gate__heading">{title}</span>
          {task ? <span className="ui-gate__task" title={task}>{task}</span> : null}
          <span className="ui-gate__count" dir="ltr">
            {open.length > 0 ? (
              <>
                <span className="ui-gate__pip" aria-hidden />
                {open.length} open
              </>
            ) : live ? (
              <>
                <span className="ui-gate__live" aria-hidden />
                {text.running}
              </>
            ) : (
              text.empty
            )}
          </span>
        </header>

        {top ? (
          <div
            className="ui-gate__stack"
            role="group"
            aria-label={groupLabel}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                move(1);
              } else if (event.key === "Escape" && editing) {
                event.stopPropagation();
                setEditing(false);
                requestAnimationFrame(() => editRef.current?.focus());
              }
            }}
            tabIndex={-1}
          >
            {stackBehind > 0
              ? Array.from({ length: stackBehind }).map((_, index) => (
                  <span
                    key={`peek-${index}`}
                    aria-hidden
                    className="ui-gate__peek"
                    style={{ "--peek": String(stackBehind - index) } as CSSProperties}
                  />
                ))
              : null}

            <article ref={cardRef} className="ui-gate__card" aria-labelledby={`${baseId}-action`}>
              <div className="ui-gate__who">
                {top.avatar ? <span className="ui-gate__avatar">{top.avatar}</span> : null}
                <span className="ui-gate__agent">{top.agent}</span>
                <span className="ui-gate__kind">{KIND_LABEL[top.kind]}</span>
                {top.at ? <span className="ui-gate__at">{top.at}</span> : null}
                {open.length > 1 ? (
                  <span className="ui-gate__nav" aria-hidden>
                    <button type="button" className="ui-gate__navbtn" onClick={() => move(-1)} tabIndex={-1} aria-label="Previous request">‹</button>
                    <button type="button" className="ui-gate__navbtn" onClick={() => move(1)} tabIndex={-1} aria-label="Next request">›</button>
                  </span>
                ) : null}
              </div>

              <h3 id={`${baseId}-action`} className="ui-gate__action">{top.action}</h3>
              <p className="ui-gate__reason">{top.reason}</p>

              <div className="ui-gate__data">
                {top.diff?.length ? (
                  <div className="ui-gate__diffs">
                    {top.diff.map((file) => (
                      <div key={file.file} className="ui-gate__diff">
                        <p className="ui-gate__file">{file.file}</p>
                        <pre className="ui-gate__lines">
                          {file.lines.map((line, index) => (
                            <span key={index} className={`ui-gate__line ui-gate__line--${line.type}`}>
                              <span className="ui-gate__sign" aria-hidden>
                                {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                              </span>
                              <span className="ui-gate__sr">
                                {line.type === "add" ? "Added: " : line.type === "del" ? "Removed: " : ""}
                              </span>
                              {line.text}
                            </span>
                          ))}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}

                {top.files?.length ? (
                  <ul className="ui-gate__files">
                    {top.files.map((file) => (
                      <li key={file}>{file}</li>
                    ))}
                  </ul>
                ) : null}

                {editing ? (
                  <label className="ui-gate__edit">
                    <span className="ui-gate__editlabel">
                      {top.kind === "file" ? "What should change instead?" : "Change it before it runs"}
                    </span>
                    <textarea
                      ref={editFieldRef}
                      className="ui-gate__field"
                      value={draft}
                      rows={3}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          decide(top, "edited", draft);
                        }
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          event.preventDefault();
                          setEditing(false);
                          requestAnimationFrame(() => editRef.current?.focus());
                        }
                      }}
                    />
                  </label>
                ) : top.input ? (
                  <pre className="ui-gate__input">{top.input}</pre>
                ) : null}
              </div>

              {top.holds?.length ? (
                <p className="ui-gate__holds">
                  <span className="ui-gate__holdslabel">Holding</span>
                  {top.holds.map((step) => (
                    <span key={step} className="ui-gate__hold">{step}</span>
                  ))}
                </p>
              ) : null}

              <div className="ui-gate__actions">
                <button
                  ref={approveRef}
                  type="button"
                  className="ui-gate__btn ui-gate__btn--primary"
                  onClick={() => decide(top, "approved")}
                >
                  {text.approve}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="ui-gate__btn"
                    onClick={() => decide(top, "edited", draft)}
                  >
                    {text.save}
                  </button>
                ) : (
                  <button
                    ref={editRef}
                    type="button"
                    className="ui-gate__btn"
                    onClick={() => {
                      setEditing(true);
                      setDraft(top.input ?? "");
                    }}
                  >
                    {text.edit}
                  </button>
                )}
                <button type="button" className="ui-gate__btn ui-gate__btn--stop" onClick={() => decide(top, "rejected")}>
                  {text.reject}
                </button>
              </div>
            </article>
          </div>
        ) : (
          <div className="ui-gate__rest">
            <span className="ui-gate__restdot" aria-hidden data-live={live ? "true" : "false"} />
            <span>{live ? `${text.running} – nothing waits for you` : text.empty}</span>
          </div>
        )}
      </div>

      {decided.length > 0 ? (
        <div className="ui-gate__block">
          <header className="ui-gate__head">
            <span className="ui-gate__heading">Decided</span>
            <span className="ui-gate__count" dir="ltr">{decided.length}</span>
          </header>
          <ul className="ui-gate__decided">
            {decided.map((gate) => {
              const isOpen = expanded.includes(gate.id);
              return (
                <li key={gate.id} className={`ui-gate__decidedrow ui-gate__decidedrow--${gate.status}`}>
                  <button
                    type="button"
                    className="ui-gate__decidedbtn"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setExpanded((ids) => (ids.includes(gate.id) ? ids.filter((id) => id !== gate.id) : [...ids, gate.id]))
                    }
                  >
                    <span className={`ui-gate__status ui-gate__status--${gate.status}`}>
                      {STATUS_LABEL[gate.status as Exclude<ApprovalGateStatus, "open">]}
                    </span>
                    <span className="ui-gate__decidedaction">{gate.action}</span>
                    <span className="ui-gate__decidedagent">{gate.agent}</span>
                    {gate.at ? <span className="ui-gate__decidedat">{gate.at}</span> : null}
                  </button>
                  {isOpen ? (
                    <div className="ui-gate__decidedbody">
                      <p className="ui-gate__decidedreason">{gate.reason}</p>
                      {gate.note ? <p className="ui-gate__note">Changed: {gate.note}</p> : null}
                      {gate.diff?.length ? (
                        <pre className="ui-gate__lines ui-gate__lines--quiet">
                          {gate.diff.flatMap((file) =>
                            file.lines.map((line, index) => (
                              <span key={`${file.file}-${index}`} className={`ui-gate__line ui-gate__line--${line.type}`}>
                                <span className="ui-gate__sign" aria-hidden>
                                  {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                                </span>
                                {line.text}
                              </span>
                            )),
                          )}
                        </pre>
                      ) : gate.input ? (
                        <pre className="ui-gate__input">{gate.input}</pre>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="ui-gate__sr" aria-live="polite">{announcement}</p>
    </section>
  );
}

export const GATE_CSS = `
.ui-gate {
  --ui-gate-w: 560px;
  --ui-gate-peek: 7px;
  --ui-gate-shrink: 0.025;
  --ui-gate-accent: var(--aui-blue, #2f6bff);
  --ui-gate-ink: var(--aui-ink, rgba(0, 0, 0, 0.88));
  --ui-gate-text: var(--aui-muted, rgba(0, 0, 0, 0.61));
  --ui-gate-line: var(--aui-line, rgba(0, 0, 0, 0.09));
  --ui-gate-surface: var(--aui-surface, #ffffff);
  --ui-gate-wash: var(--aui-wash, #f6f6f7);
  --ui-gate-ease: var(--aui-ease, cubic-bezier(0.22, 1, 0.36, 1));
  --ui-gate-orange: #d9820a;
  --ui-gate-red: #dc4a4a;
  font-family: var(--aui-font, "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--ui-gate-ink);
  font-size: 13px;
  line-height: 1.4;
  display: grid;
  gap: 10px;
  container-type: inline-size;
  -webkit-font-smoothing: antialiased;
}
.ui-gate__block { width: 100%; max-width: var(--ui-gate-w); }
.ui-gate__head { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; min-height: 18px; }
.ui-gate__heading { font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--ui-gate-text); }
.ui-gate__task { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--ui-gate-text); opacity: 0.85; }
.ui-gate__count { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--ui-gate-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ui-gate__pip { width: 5px; height: 5px; border-radius: 50%; background: var(--ui-gate-orange); }
.ui-gate__live { width: 5px; height: 5px; border-radius: 50%; background: var(--ui-gate-accent); animation: ui-gate-pulse 1.6s ease-in-out infinite; }
.ui-gate__stack { position: relative; padding-top: calc(var(--ui-gate-peek) * 2); }
.ui-gate__peek {
  position: absolute;
  left: calc((var(--peek) * 8px));
  right: calc((var(--peek) * 8px));
  top: calc((var(--peek) - 1) * var(--ui-gate-peek));
  height: 24px;
  border-radius: 10px;
  background: var(--ui-gate-surface);
  box-shadow: 0 0 0 0.5px var(--ui-gate-line), var(--aui-shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06));
  opacity: calc(1 - (var(--peek) * 0.18));
  transform: scale(calc(1 - (var(--peek) * var(--ui-gate-shrink))));
  transform-origin: bottom center;
}
.ui-gate__card {
  position: relative;
  z-index: 1;
  border-radius: 12px;
  background: var(--ui-gate-surface);
  padding: 12px 14px 12px;
  box-shadow: 0 0 0 0.5px var(--ui-gate-line), var(--aui-shadow-card, 0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 24px -16px rgba(0, 0, 0, 0.28));
  animation: ui-gate-in 220ms var(--ui-gate-ease) both;
}
.ui-gate__who { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ui-gate-text); min-height: 18px; }
.ui-gate__avatar { display: inline-flex; width: 16px; height: 16px; }
.ui-gate__avatar > * { width: 16px; height: 16px; border-radius: 4px; }
.ui-gate__agent { font-weight: 600; color: var(--ui-gate-ink); }
.ui-gate__kind { padding: 1px 6px; border-radius: 999px; background: var(--ui-gate-wash); font-size: 10.5px; }
.ui-gate__at { margin-left: auto; font-variant-numeric: tabular-nums; }
.ui-gate__nav { margin-left: auto; display: inline-flex; gap: 2px; }
.ui-gate__navbtn { border: 0; background: none; color: var(--ui-gate-text); width: 18px; height: 18px; border-radius: 5px; line-height: 1; cursor: pointer; font-size: 13px; }
.ui-gate__action { margin: 6px 0 2px; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.ui-gate__reason { margin: 0 0 8px; font-size: 12px; color: var(--ui-gate-text); }
.ui-gate__data { display: grid; gap: 6px; }
.ui-gate__diffs { display: grid; gap: 6px; }
.ui-gate__diff { border-radius: 8px; overflow: hidden; background: var(--ui-gate-wash); }
.ui-gate__file { margin: 0; padding: 5px 8px; font-family: var(--aui-font-mono, ui-monospace, monospace); font-size: 10.5px; color: var(--ui-gate-text); border-bottom: 1px solid var(--ui-gate-line); }
.ui-gate__lines { margin: 0; padding: 5px 0; overflow: auto; max-height: 168px; font-family: var(--aui-font-mono, ui-monospace, monospace); font-size: 11px; line-height: 1.5; }
.ui-gate__line { display: block; padding: 0 8px 0 2px; white-space: pre; }
.ui-gate__line--add { background: color-mix(in oklab, #2f9e44 12%, transparent); }
.ui-gate__line--del { background: color-mix(in oklab, var(--ui-gate-red) 11%, transparent); opacity: 0.85; }
.ui-gate__sign { display: inline-block; width: 12px; text-align: center; opacity: 0.65; }
.ui-gate__files { margin: 0; padding: 0 0 0 4px; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; }
.ui-gate__files li { padding: 2px 7px; border-radius: 5px; background: var(--ui-gate-wash); font-family: var(--aui-font-mono, ui-monospace, monospace); font-size: 10.5px; }
.ui-gate__input { margin: 0; padding: 7px 9px; border-radius: 8px; background: var(--ui-gate-wash); font-family: var(--aui-font-mono, ui-monospace, monospace); font-size: 11px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 168px; overflow: auto; }
.ui-gate__edit { display: grid; gap: 4px; }
.ui-gate__editlabel { font-size: 11px; color: var(--ui-gate-text); }
.ui-gate__field {
  width: 100%;
  resize: vertical;
  padding: 7px 9px;
  border-radius: 8px;
  border: 0;
  box-shadow: inset 0 0 0 1px var(--ui-gate-line);
  background: var(--ui-gate-surface);
  color: inherit;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
}
.ui-gate__field:focus-visible { outline: 2px solid var(--ui-gate-accent); outline-offset: 1px; }
.ui-gate__holds { margin: 8px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: 11px; color: var(--ui-gate-text); }
.ui-gate__holdslabel { font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; font-size: 9.5px; }
.ui-gate__hold { padding: 2px 7px; border-radius: 999px; background: var(--ui-gate-wash); color: var(--ui-gate-ink); }
.ui-gate__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ui-gate__btn {
  border: 0;
  margin: 0;
  padding: 5px 11px;
  border-radius: 7px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  background: var(--ui-gate-wash);
  color: var(--ui-gate-ink);
  box-shadow: inset 0 0 0 0.5px var(--ui-gate-line);
  transition: background 140ms var(--ui-gate-ease), transform 140ms var(--ui-gate-ease);
}
.ui-gate__btn:hover { background: color-mix(in oklab, var(--ui-gate-wash) 70%, var(--ui-gate-line)); }
.ui-gate__btn:focus-visible { outline: 2px solid var(--ui-gate-accent); outline-offset: 2px; }
.ui-gate__btn--primary { background: var(--ui-gate-accent); color: #fff; box-shadow: none; }
.ui-gate__btn--primary:hover { filter: brightness(1.04); background: var(--ui-gate-accent); }
.ui-gate__btn--stop { margin-left: auto; color: var(--ui-gate-red); }
.ui-gate__rest {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--ui-gate-surface);
  box-shadow: 0 0 0 0.5px var(--ui-gate-line);
  color: var(--ui-gate-text);
  font-size: 12px;
}
.ui-gate__restdot { width: 6px; height: 6px; border-radius: 50%; background: var(--ui-gate-line); }
.ui-gate__restdot[data-live="true"] { background: var(--ui-gate-accent); animation: ui-gate-pulse 1.6s ease-in-out infinite; }
.ui-gate__decided { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ui-gate__decidedrow { border-radius: 8px; background: var(--ui-gate-surface); box-shadow: 0 0 0 0.5px var(--ui-gate-line); overflow: hidden; }
.ui-gate__decidedbtn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 4px 9px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 11.5px;
  text-align: left;
  cursor: pointer;
}
.ui-gate__decidedbtn:focus-visible { outline: 2px solid var(--ui-gate-accent); outline-offset: -2px; }
.ui-gate__status { flex: none; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; }
.ui-gate__status--approved { background: color-mix(in oklab, #2f9e44 13%, transparent); color: #237a35; }
.ui-gate__status--edited { background: color-mix(in oklab, var(--ui-gate-accent) 13%, transparent); color: var(--ui-gate-accent); }
.ui-gate__status--rejected { background: color-mix(in oklab, var(--ui-gate-red) 12%, transparent); color: var(--ui-gate-red); }
.ui-gate__decidedaction { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ui-gate__decidedagent { margin-left: auto; flex: none; color: var(--ui-gate-text); }
.ui-gate__decidedat { flex: none; color: var(--ui-gate-text); font-variant-numeric: tabular-nums; opacity: 0.8; }
.ui-gate__decidedbody { padding: 2px 10px 9px; display: grid; gap: 6px; }
.ui-gate__decidedreason { margin: 0; font-size: 11.5px; color: var(--ui-gate-text); }
.ui-gate__note { margin: 0; font-size: 11.5px; color: var(--ui-gate-ink); }
.ui-gate__lines--quiet { background: var(--ui-gate-wash); border-radius: 6px; }
.ui-gate__sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@keyframes ui-gate-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes ui-gate-in { from { opacity: 0; transform: translateY(6px) scale(0.985); } to { opacity: 1; transform: none; } }
@container (max-width: 420px) {
  .ui-gate__actions { gap: 5px; }
  .ui-gate__btn { padding: 5px 9px; font-size: 11.5px; }
  .ui-gate__decidedagent { display: none; }
  .ui-gate__count { font-size: 10.5px; }
}
@media (prefers-reduced-motion: reduce) {
  .ui-gate__card, .ui-gate__live, .ui-gate__restdot[data-live="true"] { animation: none; }
  .ui-gate__btn { transition: none; }
}
:where(.dark, [data-theme="dark"]) .ui-gate {
  --ui-gate-ink: rgba(255, 255, 255, 0.92);
  --ui-gate-text: rgba(255, 255, 255, 0.62);
  --ui-gate-line: rgba(255, 255, 255, 0.13);
  --ui-gate-surface: #1c1c1e;
  --ui-gate-wash: rgba(255, 255, 255, 0.055);
  --ui-gate-accent: #4fb0fe;
  --ui-gate-orange: #f0a13a;
  --ui-gate-red: #ff6b6b;
}
`;

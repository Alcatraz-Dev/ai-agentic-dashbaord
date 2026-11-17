"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A terminal window in the affectUI house style: a dark glass panel with window
 * dots, a title bar, a read-only badge, scrollback and a prompt row.
 *
 * The component owns only presentation and input history — what a command does
 * is the caller's `onRun`, and the caller supplies the scrollback. Here that is
 * the read-only project shell in `lib/project-files.ts`, so nothing typed can
 * leave the attached folder.
 */

export type TerminalLine = { command: string; output: string; ok: boolean };

/**
 * A script that outlived its typed line. The caller owns the process; this is
 * only its output block, with the two actions that end or clear it.
 */
export type TerminalBackground = {
  script: string;
  status: "running" | "exited";
  exitCode: number | null;
  lines: string[];
  stopping?: boolean;
  onStop: () => void;
  onDismiss: () => void;
};

export function Terminal({
  title,
  cwd,
  lines,
  running = false,
  onRun,
  quick = [],
  intro,
  background = null,
  className,
}: {
  title: string;
  /** Shown in the prompt, e.g. the project's short name. */
  cwd: string;
  lines: TerminalLine[];
  running?: boolean;
  onRun: (command: string) => void;
  /** One-tap commands under the prompt. */
  quick?: string[];
  intro?: string;
  /** A long script the caller started; its output sits above the prompt. */
  background?: TerminalBackground | null;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [step, setStep] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backgroundRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines.length, running]);

  useEffect(() => {
    const node = backgroundRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [background?.lines.length]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  function submit() {
    const next = value.trim();
    if (!next || running) return;
    setValue("");
    setStep(null);
    onRun(next);
  }

  function recall(direction: -1 | 1) {
    if (lines.length === 0) return;
    const current = step === null ? lines.length : step;
    const next = Math.min(lines.length, Math.max(0, current + direction));
    setStep(next === lines.length ? null : next);
    setValue(next === lines.length ? "" : lines[next].command);
  }

  const log = lines
    .map((line) => `${cwd} $ ${line.command}\n${line.output}`)
    .join("\n\n");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f14] text-[#d7e0ea] shadow-[0_18px_40px_-28px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5">
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.6rem] font-semibold tracking-[0.12em] text-white/50 uppercase">
          {title}
        </span>
        {background?.status === "running" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[0.56rem] font-medium text-amber-200">
            <Loader2 className="size-2.5 animate-spin" aria-hidden="true" />
            script
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[0.56rem] font-medium text-emerald-300">
            <Lock className="size-2.5" aria-hidden="true" />
            read-only
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(log)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
          disabled={lines.length === 0}
          aria-label={copied ? "Output copied" : "Copy the output"}
          className="grid size-5 shrink-0 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-30"
        >
          {copied ? <Check className="size-3 text-emerald-300" /> : <Copy className="size-3" />}
        </button>
      </div>

      <div
        ref={bodyRef}
        role="log"
        aria-label={`${title} output`}
        className="max-h-[20rem] min-h-[9rem] flex-1 overflow-y-auto overscroll-contain px-3 py-2 font-mono text-[0.66rem] leading-[1.6]"
      >
        {intro ? <p className="text-white/45">{intro}</p> : null}

        {lines.map((line, index) => (
          <div key={`${line.command}-${index}`} className="mt-2">
            <p className="text-emerald-300">
              <span className="text-white/40">{cwd} $ </span>
              {line.command}
            </p>
            <pre
              className={cn(
                "mt-0.5 whitespace-pre-wrap break-words",
                line.ok ? "text-[#d7e0ea]" : "text-rose-300",
              )}
            >
              {line.output || "(no output)"}
            </pre>
          </div>
        ))}

        {running ? (
          <p className="mt-2 flex items-center gap-1.5 text-white/45">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            running…
          </p>
        ) : null}
      </div>

      {background ? (
        <div className="shrink-0 border-t border-white/10 bg-black/25">
          <div className="flex items-center gap-2 px-3 py-1">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                background.status === "running"
                  ? "animate-pulse bg-amber-300"
                  : background.exitCode === 0
                    ? "bg-emerald-400"
                    : "bg-rose-400",
              )}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[0.6rem] text-white/70">
              npm run {background.script}
            </span>
            <span className="shrink-0 font-mono text-[0.56rem] text-white/45">
              {background.status === "running"
                ? "running"
                : background.exitCode === null
                  ? "exited"
                  : `exited ${background.exitCode}`}
            </span>
            {background.status === "running" ? (
              <button
                type="button"
                onClick={background.onStop}
                disabled={background.stopping}
                className="shrink-0 rounded-md border border-white/15 px-1.5 py-0.5 font-mono text-[0.58rem] text-white/70 transition-colors hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-40"
              >
                {background.stopping ? "stopping…" : "stop"}
              </button>
            ) : (
              <button
                type="button"
                onClick={background.onDismiss}
                className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[0.58rem] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
              >
                dismiss
              </button>
            )}
          </div>
          <pre
            ref={backgroundRef}
            className="max-h-[9rem] overflow-y-auto overscroll-contain whitespace-pre-wrap break-words px-3 pb-1.5 font-mono text-[0.6rem] leading-[1.5] text-white/60"
          >
            {background.lines.length > 0 ? background.lines.join("\n") : "Waiting for output…"}
          </pre>
        </div>
      ) : null}

      <form
        className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span className="shrink-0 font-mono text-[0.66rem] text-emerald-300">{cwd} $</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              recall(-1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              recall(1);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="Read-only shell command"
          placeholder="Type help for the allowed commands"
          className="min-w-0 flex-1 bg-transparent font-mono text-[0.66rem] text-white outline-none placeholder:text-white/25"
        />
        <button
          type="submit"
          disabled={running || !value.trim()}
          className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 font-mono text-[0.62rem] text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          run
        </button>
      </form>

      {quick.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-t border-white/10 px-3 py-1.5">
          {quick.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => !running && onRun(entry)}
              disabled={running}
              className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[0.58rem] text-white/55 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-200 disabled:opacity-40"
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

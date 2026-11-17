import "server-only";

import { spawn } from "node:child_process";

import type { ProjectScriptRun } from "@/lib/project-types";

/**
 * Scripts that outlive the line that started them: a dev server, a watcher, a
 * long build.
 *
 * A server action answers once, so it cannot host a process. The pane keeps
 * this registry instead — `startProjectRun` spawns the script in its own
 * process group (so Stop ends what the script spawned too, since `next dev`
 * starts a worker of its own) and the pane polls `snapshotProjectRun` for the
 * output collected here. The registry lives on `globalThis` because a Next
 * route can be evaluated more than once, and a child must not be orphaned when
 * that happens.
 */

const MAX_LINES = 300;
const MAX_CHARS = 40_000;
/** Windows-scale guard: this is a pane, not a process manager. */
const MAX_CONCURRENT = 4;
const STOP_GRACE_MS = 4_000;
/** Colours a script prints are noise in a captured log. */
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

type Run = {
  script: string;
  status: "running" | "exited";
  exitCode: number | null;
  startedAt: number;
  lines: string[];
  chars: number;
  child: ReturnType<typeof spawn> | null;
  stopTimer: NodeJS.Timeout | null;
};

type Registry = Map<string, Run>;
type GlobalWithRuns = typeof globalThis & { __alcatrazProjectRuns?: Registry };

function registry(): Registry {
  const store = globalThis as GlobalWithRuns;
  if (!store.__alcatrazProjectRuns) store.__alcatrazProjectRuns = new Map();
  return store.__alcatrazProjectRuns;
}

/** One run per owner and project, so two tabs cannot start two servers. */
export function projectRunKey(ownerId: number, projectId: number | null): string {
  return `${ownerId}:${projectId ?? "app"}`;
}

function append(run: Run, chunk: string) {
  const text = chunk.replace(ANSI, "").replace(/\r/g, "");
  const lines = text.split("\n");
  // A chunk usually ends mid-line, so a trailing empty piece is not a line yet.
  if (lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    const kept = line.length > 400 ? `${line.slice(0, 400)}…` : line;
    run.lines.push(kept);
    run.chars += kept.length;
  }

  while (run.lines.length > MAX_LINES || run.chars > MAX_CHARS) {
    const dropped = run.lines.shift();
    if (dropped === undefined) break;
    run.chars -= dropped.length;
  }
}

function snapshot(run: Run): ProjectScriptRun {
  return {
    script: run.script,
    status: run.status,
    exitCode: run.exitCode,
    startedAt: new Date(run.startedAt).toISOString(),
    lines: [...run.lines],
  };
}

export function snapshotProjectRun(key: string): ProjectScriptRun | null {
  const run = registry().get(key);
  return run ? snapshot(run) : null;
}

export function startProjectRun(
  key: string,
  root: string,
  script: string,
): ProjectScriptRun | { error: string } {
  const runs = registry();
  const existing = runs.get(key);

  if (existing?.status === "running") {
    return { error: `\`npm run ${existing.script}\` is already running here. Stop it first.` };
  }

  const active = [...runs.values()].filter((run) => run.status === "running").length;
  if (active >= MAX_CONCURRENT) {
    return { error: `This workspace already has ${active} scripts running. Stop one first.` };
  }

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn("npm", ["run", "--silent", script], {
      cwd: root,
      // Its own group, so a stop reaches the children the script starts.
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
  } catch {
    return { error: `\`npm run ${script}\` could not start in that project.` };
  }

  const run: Run = {
    script,
    status: "running",
    exitCode: null,
    startedAt: Date.now(),
    lines: [],
    chars: 0,
    child,
    stopTimer: null,
  };

  const finish = (code: number | null) => {
    if (run.status === "exited") return;
    run.status = "exited";
    run.exitCode = code;
    run.child = null;
    if (run.stopTimer) {
      clearTimeout(run.stopTimer);
      run.stopTimer = null;
    }
    append(run, `\n[${script} exited${code === null ? "" : ` with code ${code}`}]`);
  };

  child.stdout?.on("data", (chunk: Buffer) => append(run, chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => append(run, chunk.toString()));
  child.on("error", (error: Error) => {
    append(run, `Could not start npm: ${error.message}`);
    finish(null);
  });
  child.on("close", (code) => finish(code));

  runs.set(key, run);
  return snapshot(run);
}

export function stopProjectRun(key: string): ProjectScriptRun | null {
  const run = registry().get(key);
  if (!run) return null;

  if (run.status === "running" && run.child?.pid) {
    const pid = run.child.pid;
    append(run, "Stopping…");

    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        run.child.kill("SIGTERM");
      } catch {
        // It had already gone.
      }
    }

    // A script that ignores the polite signal gets a firmer one.
    run.stopTimer = setTimeout(() => {
      if (run.status !== "running") return;
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // It had already gone.
      }
    }, STOP_GRACE_MS);
    run.stopTimer.unref?.();
  }

  return snapshot(run);
}

/** Forgets a finished run so the pane's output block can be closed. */
export function dismissProjectRun(key: string): void {
  const run = registry().get(key);
  if (run && run.status === "running") return;
  registry().delete(key);
}

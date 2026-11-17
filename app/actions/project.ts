"use server";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { requireUser } from "@/lib/session";

/**
 * Read-only access to the repository this workspace runs from, for the
 * `developer` template's workbench.
 *
 * This is deliberately not a shell: there is no spawn of `/bin/sh`, no pipes,
 * no redirects and no arbitrary binaries. Every command is parsed here and run
 * through `execFile` with an explicit argument list from a fixed allowlist, so a
 * typed line can never do more than read the working tree that the dashboard
 * already owns. Files under dot-directories, environment files and key material
 * are refused by name, and every resolved path must stay inside the project.
 */

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

/** Directories that are never walked: generated, vendored or secret. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
  "coverage",
  "dist",
  "build",
]);

const DENIED_PATH = /(^|\/)\.env|(^|\/)\.git(\/|$)|\.(pem|key|p12|pfx|keystore|jks)$/i;
const MAX_ENTRIES = 250;
const MAX_FILE_BYTES = 220_000;
const MAX_FILE_CHARS = 80_000;
const MAX_OUTPUT_CHARS = 14_000;

export type ProjectEntry = {
  name: string;
  path: string;
  type: "dir" | "file";
};

export type ProjectTreeResult =
  | { ok: true; entries: ProjectEntry[]; path: string }
  | { ok: false; error: string };

export type ProjectFileResult =
  | { ok: true; path: string; content: string; lines: number; truncated: boolean; bytes: number }
  | { ok: false; error: string };

export type ProjectChangesResult =
  | {
      ok: true;
      branch: string;
      commits: { hash: string; subject: string }[];
      changes: { status: string; path: string }[];
      clean: boolean;
    }
  | { ok: false; error: string };

export type ProjectCommandResult = { ok: true; output: string } | { ok: false; output: string };

/** Resolves a workspace-relative path, refusing anything outside the project. */
function resolveInside(rel: string): string | null {
  const cleaned = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  if (!cleaned) return ROOT;
  if (cleaned.split("/").some((part) => part === ".." || part === "")) return null;
  const abs = path.resolve(ROOT, cleaned);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

/** The path as the UI shows it: always forward slashes, no leading slash. */
function displayPath(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

export async function listProjectTreeAction(relPath?: string): Promise<ProjectTreeResult> {
  await requireUser();

  const abs = resolveInside(typeof relPath === "string" ? relPath : "");
  if (!abs) return { ok: false, error: "That folder is outside this project." };
  if (DENIED_PATH.test(displayPath(abs))) {
    return { ok: false, error: "That folder is not readable here." };
  }

  try {
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const entries: ProjectEntry[] = dirents
      .filter((entry) => !isHidden(entry.name))
      .filter((entry) => !(entry.isDirectory() ? SKIP_DIRS.has(entry.name) : false))
      .slice(0, MAX_ENTRIES)
      .map((entry) => ({
        name: entry.name,
        path: displayPath(path.join(abs, entry.name)),
        type: entry.isDirectory() ? ("dir" as const) : ("file" as const),
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));

    return { ok: true, entries, path: displayPath(abs) };
  } catch {
    return { ok: false, error: "That folder could not be read." };
  }
}

/** Reads one text file. Binaries, secrets and anything over the cap are refused. */
async function readTextFile(rel: string): Promise<ProjectFileResult> {
  const abs = resolveInside(rel);
  if (!abs || abs === ROOT) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(abs);
  if (DENIED_PATH.test(shown)) return { ok: false, error: "That file is not readable here." };

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return { ok: false, error: "That path is a folder." };
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, error: "That file is too large to open here (over 220 KB)." };
    }

    const buffer = await fs.readFile(abs);
    if (buffer.subarray(0, 8_000).includes(0)) {
      return { ok: false, error: "That file is binary, so there is nothing to read as text." };
    }

    const text = buffer.toString("utf8");
    const truncated = text.length > MAX_FILE_CHARS;

    return {
      ok: true,
      path: shown,
      content: truncated ? text.slice(0, MAX_FILE_CHARS) : text,
      lines: text.split("\n").length,
      truncated,
      bytes: stat.size,
    };
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}

export async function readProjectFileAction(relPath: string): Promise<ProjectFileResult> {
  await requireUser();
  if (typeof relPath !== "string" || !relPath.trim()) {
    return { ok: false, error: "Pick a file first." };
  }
  return readTextFile(relPath);
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: ROOT,
    timeout: 8_000,
    maxBuffer: 1_000_000,
    windowsHide: true,
  });
  return stdout;
}

/** The working tree: branch, recent commits and uncommitted files. */
export async function projectChangesAction(): Promise<ProjectChangesResult> {
  await requireUser();

  try {
    let branch = "detached";
    try {
      branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "detached";
    } catch {
      // A repository with no commits still has a working tree worth listing.
      branch = "no commits yet";
    }

    let commits: { hash: string; subject: string }[] = [];
    try {
      const log = await git(["log", "--oneline", "-8", "--no-decorate"]);
      commits = log
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, ...rest] = line.split(" ");
          return { hash: hash ?? "", subject: rest.join(" ") };
        });
    } catch {
      commits = [];
    }

    const status = await git(["status", "--porcelain=v1"]);
    const changes = status
      .split("\n")
      .filter(Boolean)
      .slice(0, 200)
      .map((line) => ({
        status: line.slice(0, 2).trim() || "?",
        path: line.slice(3).trim(),
      }));

    return { ok: true, branch, commits, changes, clean: changes.length === 0 };
  } catch {
    return { ok: false, error: "This project is not a git repository, or git is unavailable." };
  }
}

/** Splits a typed line the way a shell would, without ever invoking one. */
function tokenize(line: string): string[] | null {
  if (/[;&|<>`$]/.test(line)) return null;
  const parts = line.match(/"([^"]*)"|'([^']*)'|[^\s]+/g);
  if (!parts) return [];
  return parts.map((part) => {
    if (part.startsWith("\"") && part.endsWith("\"")) return part.slice(1, -1);
    if (part.startsWith("'") && part.endsWith("'")) return part.slice(1, -1);
    return part;
  });
}

const HELP = `Read-only shell. These commands work here:

  help                 this list
  pwd                  the project root
  ls [folder]          names in a folder
  cat <file>           a text file
  wc -l <file>         how many lines a file has
  git status           uncommitted files
  git log              the last eight commits
  git diff --stat      changed lines per file

Pipes, redirects and other commands are refused by design.`;

function clampOutput(value: string, note = ""): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value + note;
  return value.slice(0, MAX_OUTPUT_CHARS) + `\n… output truncated${note ? ` (${note})` : ""}`;
}

/**
 * Runs one allowlisted read-only command. Nothing here writes, installs or
 * reaches the network; the checks are on the parsed arguments, not the string.
 */
export async function runProjectCommandAction(line: string): Promise<ProjectCommandResult> {
  await requireUser();

  const raw = typeof line === "string" ? line.trim() : "";
  if (!raw) return { ok: true, output: "" };

  const parts = tokenize(raw);
  if (!parts) {
    return {
      ok: false,
      output: "Only the listed read-only commands run here — no pipes, redirects or chained commands.",
    };
  }

  const [command, ...args] = parts;

  try {
    if (command === "help" || command === "?") return { ok: true, output: HELP };

    if (command === "pwd") return { ok: true, output: "this project (repository root)" };

    if (command === "ls") {
      const target = args[0] ?? "";
      const abs = resolveInside(target);
      if (!abs) return { ok: false, output: "That folder is outside this project." };
      if (DENIED_PATH.test(displayPath(abs))) {
        return { ok: false, output: "That folder is not readable here." };
      }
      const dirents = await fs.readdir(abs, { withFileTypes: true });
      const names = dirents
        .filter((entry) => !(entry.isDirectory() ? SKIP_DIRS.has(entry.name) : false))
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((a, b) => a.localeCompare(b));
      return { ok: true, output: names.join("  ") || "(empty)" };
    }

    if (command === "cat") {
      if (!args[0]) return { ok: false, output: "cat needs a file path." };
      const file = await readTextFile(args[0]);
      return file.ok ? { ok: true, output: file.content } : { ok: false, output: file.error };
    }

    if (command === "wc") {
      if (args[0] !== "-l" || !args[1]) return { ok: false, output: "Only `wc -l <file>` runs here." };
      const file = await readTextFile(args[1]);
      return file.ok ? { ok: true, output: `${file.lines} ${file.path}` } : { ok: false, output: file.error };
    }

    if (command === "git") {
      const sub = args[0];
      if (sub === "status" || (sub === "status" && args.length === 1)) {
        const result = await projectChangesAction();
        if (!result.ok) return { ok: false, output: result.error };
        if (result.clean) return { ok: true, output: `On ${result.branch}: nothing to commit, working tree clean` };
        return {
          ok: true,
          output: clampOutput(
            `On ${result.branch}\n` + result.changes.map((entry) => `${entry.status.padEnd(2)} ${entry.path}`).join("\n"),
          ),
        };
      }
      if (sub === "log") {
        const result = await projectChangesAction();
        if (!result.ok) return { ok: false, output: result.error };
        if (result.commits.length === 0) return { ok: true, output: "(no commits yet)" };
        return {
          ok: true,
          output: result.commits.map((entry) => `${entry.hash} ${entry.subject}`).join("\n"),
        };
      }
      if (sub === "diff") {
        if (args[1] !== "--stat" || args.length > 2) {
          return { ok: false, output: "Only `git diff --stat` runs here." };
        }
        const result = await git(["diff", "--stat"]);
        return { ok: true, output: clampOutput(result.trim() || "(no unstaged changes to tracked files)") };
      }
      return { ok: false, output: "Only `git status`, `git log` and `git diff --stat` run here." };
    }

    return { ok: false, output: `\`${command}\` is not one of the commands this shell allows. Type \`help\`.` };
  } catch {
    return { ok: false, output: "That command failed." };
  }
}

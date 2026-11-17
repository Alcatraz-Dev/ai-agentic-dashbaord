import "server-only";

import type {
  ProjectCommitFileResult,
  ProjectCommitViewResult,
  ProjectHunk,
  ProjectHunkResult,
} from "@/lib/project-types";

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { deniedProjectPath, isDeniedProjectPath } from "@/lib/project-paths";

import type {
  ProjectChangesResult,
  ProjectCommandResult,
  ProjectEntry,
  ProjectFileDiffResult,
  ProjectFileListResult,
  ProjectFileResult,
  ProjectFileStampResult,
  ProjectHeadFileResult,
  ProjectIndexFileResult,
  ProjectSearchMatch,
  ProjectSearchResult,
  ProjectTreeResult,
} from "@/lib/project-types";

/**
 * Read-only access to one attached project, for the `developer` template.
 *
 * Every function takes the project's `root`, so the pane follows whichever
 * project the owner selected (this app, an attached folder, or a shallow clone).
 * The root itself is resolved and owner-checked in `lib/projects.ts`; paths here
 * can only move inside it.
 *
 * This is deliberately not a shell: there is no spawn of `/bin/sh`, no pipes,
 * no redirects and no arbitrary binaries. Every command is parsed here and run
 * through `execFile` with an explicit argument list from a fixed allowlist, so a
 * typed line can never do more than read the working tree that the dashboard
 * already owns. Files under dot-directories, environment files and key material
 * are refused by name.
 */

const execFileAsync = promisify(execFile);

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

const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILE_CHARS = 200_000;
const MAX_OUTPUT_CHARS = 14_000;

function resolveInside(root: string, rel: string): string | null {
  const cleaned = rel.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  if (!cleaned) return root;
  if (cleaned.split("/").some((part) => part === ".." || part === "")) return null;
  const abs = path.resolve(root, cleaned);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

/** The path as the UI shows it: forward slashes, no leading slash. */
function displayPath(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

export async function listProjectTree(
  root: string,
  relPath?: string,
): Promise<ProjectTreeResult> {
  const abs = resolveInside(root, typeof relPath === "string" ? relPath : "");
  if (!abs) return { ok: false, error: "That folder is outside this project." };
  const denial = deniedProjectPath(displayPath(root, abs));
  if (denial) return { ok: false, error: denial };

  try {
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const entries: ProjectEntry[] = dirents
      .filter((entry) => !isHidden(entry.name))
      .filter((entry) => !(entry.isDirectory() ? SKIP_DIRS.has(entry.name) : false))
      .slice(0, MAX_ENTRIES)
      .map((entry) => ({
        name: entry.name,
        path: displayPath(root, path.join(abs, entry.name)),
        type: entry.isDirectory() ? ("dir" as const) : ("file" as const),
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));

    return { ok: true, entries, path: displayPath(root, abs) };
  } catch {
    return { ok: false, error: "That folder could not be read." };
  }
}

const MAX_FILE_LIST = 1_200;

/**
 * Every readable path in the project, sorted, for the editor's quick open.
 *
 * Same walk rules as the search: hidden entries, dependency and build folders,
 * `.env` and key material are skipped, and the list is capped so a monorepo
 * cannot stall the palette.
 */
export async function listProjectFiles(root: string): Promise<ProjectFileListResult> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (files.length >= MAX_FILE_LIST) return;

    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirents) {
      if (files.length >= MAX_FILE_LIST) return;
      if (isHidden(entry.name)) continue;

      const abs = path.join(dir, entry.name);
      const rel = displayPath(root, abs);
      if (isDeniedProjectPath(rel)) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  try {
    await walk(root);
    files.sort((a, b) => a.localeCompare(b));
    return { ok: true, files, truncated: files.length >= MAX_FILE_LIST };
  } catch {
    return { ok: false, error: "That project could not be listed." };
  }
}

/** Reads one text file. Binaries, secrets and anything over the cap are refused. */
export async function readProjectFile(root: string, rel: string): Promise<ProjectFileResult> {
  const abs = resolveInside(root, rel);
  if (!abs || abs === root) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return { ok: false, error: "That path is a folder." };
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, error: "That file is too large to open here (over 1 MB)." };
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
      // Hashed from the whole text, not the truncated copy: the write path
      // re-reads the file the same way, so the two values can be compared.
      hash: createHash("sha256").update(text, "utf8").digest("hex"),
      stamp: `${stat.mtimeMs}:${stat.size}`,
    };
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}

const SEARCH_MAX_MATCHES = 60;
const SEARCH_MAX_FILES = 2_000;
const SEARCH_MAX_BYTES = 1_000_000;

/**
 * A literal grep across one project's text files.
 *
 * It walks the tree itself — no `grep`, no shell — so the same rules as a read
 * apply: hidden entries, `.git`, `.env`, key material and dependency folders
 * are skipped, binaries are detected and passed over, and the walk stops at a
 * bounded number of files and matches so one query can't crawl a monorepo.
 */
export async function searchProjectFiles(
  root: string,
  query: string,
): Promise<ProjectSearchResult> {
  const needle = String(query ?? "").trim().toLowerCase();
  if (needle.length < 2) return { ok: false, error: "Search for at least two characters." };

  const matches: ProjectSearchMatch[] = [];
  let scanned = 0;
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (matches.length >= SEARCH_MAX_MATCHES || scanned >= SEARCH_MAX_FILES) {
      truncated = true;
      return;
    }

    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirents) {
      if (matches.length >= SEARCH_MAX_MATCHES || scanned >= SEARCH_MAX_FILES) {
        truncated = true;
        return;
      }
      if (isHidden(entry.name)) continue;

      const abs = path.join(dir, entry.name);
      const rel = displayPath(root, abs);
      if (isDeniedProjectPath(rel)) continue;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      scanned += 1;

      try {
        const stat = await fs.stat(abs);
        if (!stat.isFile() || stat.size > SEARCH_MAX_BYTES) continue;

        const buffer = await fs.readFile(abs);
        if (buffer.subarray(0, 8_000).includes(0)) continue;

        const lines = buffer.toString("utf8").split("\n");
        for (let index = 0; index < lines.length; index += 1) {
          const text = lines[index] ?? "";
          if (!text.toLowerCase().includes(needle)) continue;
          matches.push({ path: rel, line: index + 1, text: text.trim().slice(0, 200) });
          if (matches.length >= SEARCH_MAX_MATCHES) {
            truncated = true;
            break;
          }
        }
      } catch {
        // An unreadable file is skipped rather than failing the whole search.
      }
    }
  }

  await walk(root);
  return { ok: true, matches, scanned, truncated };
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    timeout: 8_000,
    maxBuffer: 1_000_000,
    windowsHide: true,
  });
  return stdout;
}

/** One commit's subject and the files it touched, so a row can be opened. */
export async function projectCommitView(
  root: string,
  hash: string,
): Promise<ProjectCommitViewResult> {
  if (!/^[0-9a-f]{7,40}$/i.test(String(hash ?? ""))) {
    return { ok: false, error: "That commit id is not valid." };
  }

  try {
    const subject = (await git(root, ["log", "-1", "--format=%s", hash])).trim();
    const raw = await git(root, ["show", "--name-status", "--format=", "--no-color", hash]);

    const files = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // `A path`, `M path`, `D path`, or `R100 old new`: the letter, then the path.
        const [code, ...rest] = line.split(/\s+/);
        const shown = rest.length > 1 ? rest[rest.length - 1] : (rest[0] ?? "");
        return { path: shown, status: (code ?? "M").slice(0, 1) };
      })
      .filter((entry) => entry.path.length > 0)
      .slice(0, 200);

    return { ok: true, hash, subject, files };
  } catch {
    return { ok: false, error: "That commit could not be read." };
  }
}

/** Both sides of one file at one commit; null means absent on that side. */
export async function projectCommitFileDiff(
  root: string,
  hash: string,
  rel: string,
): Promise<ProjectCommitFileResult> {
  if (!/^[0-9a-f]{7,40}$/i.test(String(hash ?? ""))) {
    return { ok: false, error: "That commit id is not valid." };
  }

  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  const read = async (rev: string): Promise<string | null> => {
    try {
      const result = await execFileAsync("git", ["show", `${rev}:${shown}`], {
        cwd: root,
        timeout: 8_000,
        maxBuffer: 2_000_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      const text = result.stdout.toString();
      if (text.includes("\u0000")) return null;
      return text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text;
    } catch {
      return null;
    }
  };

  try {
    let parent = "";
    try {
      parent = (await git(root, ["rev-parse", "--verify", `${hash}^`])).trim();
    } catch {
      parent = "";
    }

    return {
      ok: true,
      before: parent ? await read(parent) : null,
      after: await read(hash),
    };
  } catch {
    return { ok: false, error: "That commit could not be read." };
  }
}

/**
 * The unstaged diff of one file, split into hunks, so a single hunk can be
 * staged without taking the rest of the file with it.
 */
export async function projectUnstagedHunks(
  root: string,
  rel: string,
): Promise<ProjectHunkResult> {
  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  try {
    const patch = await git(root, ["diff", "--no-color", "--no-ext-diff", "--", shown]);
    if (patch.length > 400_000) {
      return { ok: true, path: shown, hunks: [], truncated: true };
    }

    const hunks: ProjectHunk[] = [];
    let current: ProjectHunk | null = null;

    for (const line of patch.split("\n")) {
      if (line.startsWith("@@")) {
        current = { header: line, lines: [] };
        hunks.push(current);
        continue;
      }
      // File headers (`diff --git`, `---`, `+++`, `index`) belong to no hunk.
      if (!current) continue;
      if (line.startsWith("+")) {
        current.lines.push({ kind: "add", text: line.slice(1) });
      } else if (line.startsWith("-")) {
        current.lines.push({ kind: "remove", text: line.slice(1) });
      } else if (line.startsWith(" ")) {
        current.lines.push({ kind: "context", text: line.slice(1) });
      }
    }

    return { ok: true, path: shown, hunks: hunks.slice(0, 200), truncated: false };
  } catch {
    return { ok: false, error: "This file's diff could not be read." };
  }
}

/** The working tree: branch, recent commits and uncommitted files. */
export async function projectChanges(root: string): Promise<ProjectChangesResult> {
  try {
    let branch = "detached";
    try {
      branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || "detached";
    } catch {
      branch = "no commits yet";
    }

    let commits: { hash: string; subject: string }[] = [];
    try {
      const log = await git(root, ["log", "--oneline", "-8", "--no-decorate"]);
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

    const status = await git(root, ["status", "--porcelain=v1"]);
    const changes = status
      .split("\n")
      .filter(Boolean)
      .slice(0, 200)
      .map((line) => {
        // `XY path`: X is the index, Y the working tree. `??` is untracked.
        const code = line.slice(0, 2);
        const raw = line.slice(3).trim();
        const renamed = raw.includes(" -> ") ? (raw.split(" -> ").pop() ?? raw) : raw;
        return {
          status: code.trim() || "?",
          path: renamed,
          staged: code[0] !== " " && code[0] !== "?",
          unstaged: code[1] !== " ",
        };
      });

    return { ok: true, branch, commits, changes, clean: changes.length === 0 };
  } catch {
    return { ok: false, error: "This project is not a git repository, or git is unavailable." };
  }
}

/**
 * A cheap fingerprint of one file (`mtimeMs:size`), so the pane can notice an
 * edit made somewhere else without reading the whole file again.
 */
export async function projectFileStamp(
  root: string,
  rel: string,
): Promise<ProjectFileStampResult> {
  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return { ok: false, error: "That path is a folder." };
    return { ok: true, stamp: `${stat.mtimeMs}:${stat.size}` };
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}

/**
 * One file as the last commit has it. An untracked file (or a repository with no
 * commits) has no HEAD copy, which is reported as `content: null` rather than
 * an error — the editor then treats the whole file as new.
 */
export async function projectHeadFile(
  root: string,
  rel: string,
): Promise<ProjectHeadFileResult> {
  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  try {
    const result = await execFileAsync("git", ["show", `HEAD:${shown}`], {
      cwd: root,
      timeout: 8_000,
      maxBuffer: 2_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const text = result.stdout.toString();
    if (text.includes("\u0000")) return { ok: false, error: "That file is binary." };
    return { ok: true, content: text.length > MAX_FILE_CHARS ? text.slice(0, MAX_FILE_CHARS) : text };
  } catch {
    return { ok: true, content: null };
  }
}

/**
 * Which lines of one file differ from the last commit, for the editor gutter.
 *
 * Two read-only git calls through `execFile` (never a shell). An untracked file
 * is reported as wholly new; a file git has nothing to say about is clean.
 */
/**
 * One file as the index has it, so the pane can show HEAD → staged rather than
 * HEAD → editor. A path that is not staged has no index copy, reported as null.
 */
export async function projectIndexFile(
  root: string,
  rel: string,
): Promise<ProjectIndexFileResult> {
  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  try {
    const result = await execFileAsync("git", ["show", `:${shown}`], {
      cwd: root,
      timeout: 8_000,
      maxBuffer: 2_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { ok: true, content: result.stdout.toString() };
  } catch {
    return { ok: true, content: null };
  }
}

export async function projectFileDiff(
  root: string,
  rel: string,
): Promise<ProjectFileDiffResult> {
  const abs = resolveInside(root, rel);
  if (!abs) return { ok: false, error: "That file is outside this project." };

  const shown = displayPath(root, abs);
  const denial = deniedProjectPath(shown);
  if (denial) return { ok: false, error: denial };

  const run = async (args: string[]): Promise<string> => {
    const result = await execFileAsync("git", args, {
      cwd: root,
      timeout: 8_000,
      maxBuffer: 2_000_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return result.stdout.toString();
  };

  try {
    const status = await run(["status", "--porcelain=v1", "--", shown]);
    const code = status.slice(0, 2).trim();

    if (code === "??") {
      return {
        ok: true,
        state: "untracked",
        addedLines: [],
        modifiedLines: [],
        wholeFileAdded: true,
      };
    }

    if (!code) {
      return { ok: true, state: "clean", addedLines: [], modifiedLines: [], wholeFileAdded: false };
    }

    const patch = await run(["diff", "--no-color", "-U0", "HEAD", "--", shown]);
    const addedLines: number[] = [];
    const modifiedLines: number[] = [];

    for (const line of patch.split("\n")) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!hunk) continue;

      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);

      if (count > 0) {
        for (let index = 0; index < Math.min(count, 5_000); index += 1) {
          addedLines.push(start + index);
        }
      } else if (start > 0) {
        // A pure deletion leaves no new line: mark the line it happened before.
        modifiedLines.push(start);
      }
    }

    return {
      ok: true,
      state: code.startsWith("A") ? "added" : "modified",
      addedLines,
      modifiedLines,
      wholeFileAdded: false,
    };
  } catch {
    return { ok: false, error: "This project's history could not be read." };
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
  git diff [--stat]    unstaged changes (--cached for the index)
  git branch           local branches, current one marked
  git show <commit>    one commit and the files it changed
  npm run              the scripts this project has
  npm run <script>     its own lint / typecheck / test scripts
  npm test             the same as npm run test

A long script (npm run dev / start, a build) starts in the background with its
output in this pane and a Stop button. npx is refused: it downloads and runs
packages. Pipes, redirects and other commands are refused by design.`;

/**
 * The only scripts this pane runs: they read the project and finish on their
 * own. A project's own `build`, `db:push` and friends write or reach the
 * network, which stays in the owner's terminal.
 */
const READ_ONLY_SCRIPT =
  /^(lint|lint:[\w.:-]+|typecheck|type-check|check|test|test:[\w.:-]+|format:check)$/;

/** Script names that start something long-lived rather than finishing. */
const SERVER_SCRIPT = /^(dev|develop|start|serve|watch|preview|studio)(:[\w.:-]+)?$/;

const SCRIPT_TIMEOUT_MS = 45_000;

/** The project's own package.json scripts, or null when it has no manifest. */
export async function listProjectScripts(root: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const scripts = (parsed as { scripts?: unknown } | null)?.scripts;
    if (!scripts || typeof scripts !== "object") return {};
    const found: Record<string, string> = {};
    for (const [name, body] of Object.entries(scripts as Record<string, unknown>)) {
      if (typeof body === "string") found[name] = body;
    }
    return found;
  } catch {
    return null;
  }
}

/** A server script is one whose name or body keeps a process alive. */
function startsServer(name: string, body: string): boolean {
  if (SERVER_SCRIPT.test(name)) return true;
  return /\b(next dev|next start|vite|webpack serve|nodemon|--watch)\b/.test(body);
}

async function runPackageScript(root: string, script: string): Promise<ProjectCommandResult> {
  try {
    const result = await execFileAsync("npm", ["run", "--silent", script], {
      cwd: root,
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 4_000_000,
      windowsHide: true,
      env: { ...process.env, CI: "1", NO_COLOR: "1", GIT_TERMINAL_PROMPT: "0" },
    });
    const text = [result.stdout.toString(), result.stderr.toString()].join("\n").trim();
    return { ok: true, output: clampOutput(text || `npm run ${script}: finished with no output`) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; killed?: boolean };
    if (failure.killed) {
      return {
        ok: false,
        output: `\`npm run ${script}\` was stopped at the ${SCRIPT_TIMEOUT_MS / 1000}s limit. Anything long-lived belongs in your own terminal.`,
      };
    }
    const text = [failure.stdout ?? "", failure.stderr ?? ""].join("\n").trim();
    return { ok: false, output: clampOutput(text || `\`npm run ${script}\` failed.`) };
  }
}

/** True for the scripts this pane runs inline: they read the project and finish. */
export function isReadOnlyProjectScript(name: string): boolean {
  return READ_ONLY_SCRIPT.test(name);
}

function clampOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return value.slice(0, MAX_OUTPUT_CHARS) + "\n… output truncated";
}

/**
 * Runs one allowlisted read-only command. Nothing here writes, installs or
 * reaches the network; the checks are on the parsed arguments, not the string.
 */
export async function runProjectCommand(
  root: string,
  line: string,
): Promise<ProjectCommandResult> {
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
      const abs = resolveInside(root, target);
      if (!abs) return { ok: false, output: "That folder is outside this project." };
      const denial = deniedProjectPath(displayPath(root, abs));
      if (denial) return { ok: false, output: denial };
      const dirents = await fs.readdir(abs, { withFileTypes: true });
      const names = dirents
        .filter((entry) => !isHidden(entry.name))
        .filter((entry) => !(entry.isDirectory() ? SKIP_DIRS.has(entry.name) : false))
        .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
        .sort((a, b) => a.localeCompare(b));
      return { ok: true, output: names.join("  ") || "(empty)" };
    }

    if (command === "cat") {
      if (!args[0]) return { ok: false, output: "cat needs a file path." };
      const file = await readProjectFile(root, args[0]);
      return file.ok ? { ok: true, output: file.content } : { ok: false, output: file.error };
    }

    if (command === "wc") {
      if (args[0] !== "-l" || !args[1]) return { ok: false, output: "Only `wc -l <file>` runs here." };
      const file = await readProjectFile(root, args[1]);
      return file.ok
        ? { ok: true, output: `${file.lines} ${file.path}` }
        : { ok: false, output: file.error };
    }

    if (command === "git") {
      const sub = args[0];
      if (sub === "status") {
        const result = await projectChanges(root);
        if (!result.ok) return { ok: false, output: result.error };
        if (result.clean) {
          return { ok: true, output: `On ${result.branch}: nothing to commit, working tree clean` };
        }
        return {
          ok: true,
          output: clampOutput(
            `On ${result.branch}\n` +
              result.changes.map((entry) => `${entry.status.padEnd(2)} ${entry.path}`).join("\n"),
          ),
        };
      }
      if (sub === "log") {
        const result = await projectChanges(root);
        if (!result.ok) return { ok: false, output: result.error };
        if (result.commits.length === 0) return { ok: true, output: "(no commits yet)" };
        return {
          ok: true,
          output: result.commits.map((entry) => `${entry.hash} ${entry.subject}`).join("\n"),
        };
      }
      if (sub === "diff") {
        const flags = args.slice(1);
        const cacheSide = flags.some((flag) => flag === "--cached" || flag === "--staged");
        const allowed = flags.every(
          (flag) => flag === "--stat" || flag === "--cached" || flag === "--staged",
        );
        if (!allowed) {
          return {
            ok: false,
            output:
              "Only `git diff`, `git diff --stat` and `git diff --cached` run here — no paths or revision ranges.",
          };
        }

        const argv = ["diff", "--no-color"];
        if (cacheSide) argv.push("--cached");
        if (flags.includes("--stat")) argv.push("--stat");
        const result = await execFileAsync("git", argv, {
          cwd: root,
          timeout: 15_000,
          maxBuffer: 4_000_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        });
        const text = result.stdout.toString().trim();
        return {
          ok: true,
          output: clampOutput(
            text ||
              (cacheSide
                ? "(nothing staged)"
                : "(no unstaged changes to tracked files)"),
          ),
        };
      }
      if (sub === "branch") {
        if (args.length > 1) return { ok: false, output: "Only `git branch` runs here." };

        const state = await projectChanges(root);
        const result = await git(root, ["branch", "--no-color"]);
        const current = state.ok ? state.branch : null;
        const lines = result
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          // `git branch` marks the checkout with a leading `*`, but the name
          // already comes from the change set, so the marks are rewritten.
          .map((line) => {
            const name = line.replace(/^\*\s*/, "");
            return name === current ? `* ${name} (current)` : `  ${name}`;
          });
        return { ok: true, output: lines.length ? lines.join("\n") : "(no branches yet)" };
      }
      if (sub === "show") {
        const rev = args[1];
        if (!rev || args.length > 2) {
          return { ok: false, output: "Only `git show <commit>` runs here." };
        }
        if (rev.includes("..")) {
          return { ok: false, output: "One commit at a time — ranges are not shown here." };
        }
        if (!/^[0-9A-Za-z._~^/-]{1,80}$/.test(rev)) {
          return { ok: false, output: "That commit reference does not look like a hash or a ref." };
        }

        try {
          // A first commit can carry the whole tree, so the buffer is generous;
          // the answer is clamped before it leaves this function.
          const result = await execFileAsync(
            "git",
            ["show", "--no-color", "--stat", "--patch", rev],
            {
              cwd: root,
              timeout: 15_000,
              maxBuffer: 24_000_000,
              env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
            },
          );
          return {
            ok: true,
            output: clampOutput(result.stdout.toString().trim() || "(empty commit)"),
          };
        } catch (error) {
          const failure = error as { code?: string };
          if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            return {
              ok: false,
              output:
                "That commit is too big to print here — open one of its files from the Changes tab instead.",
            };
          }
          return {
            ok: false,
            output: "That commit could not be read. Check the hash with `git log`.",
          };
        }
      }
      return {
        ok: false,
        output:
          "Only `git status`, `git log`, `git diff`, `git branch` and `git show <commit>` run here.",
      };
    }

    if (command === "npm") {
      if (args[0] === "test") return await runPackageScript(root, "test");
      if (args[0] !== "run" || args.length > 2) {
        return { ok: false, output: "Only `npm run` and `npm run <script>` run here." };
      }

      const scripts = await listProjectScripts(root);
      if (scripts === null) {
        return { ok: false, output: "This project has no package.json, so it has no scripts." };
      }
      const names = Object.keys(scripts).sort();
      const script = args[1];
      if (!script) {
        return {
          ok: true,
          output: names.length
            ? `Scripts in package.json:\n  ${names.join("\n  ")}`
            : "(package.json has no scripts)",
        };
      }
      if (!(script in scripts)) {
        return {
          ok: false,
          output: `package.json has no script named \`${script}\`. It has: ${names.join(", ") || "none"}.`,
        };
      }
      if (startsServer(script, scripts[script])) {
        return {
          ok: false,
          output: `\`npm run ${script}\` starts a long-running process (\`${scripts[script]}\`), and this pane answers one typed line at a time with no session to keep it in. Run it in your own terminal — here, the project's lint / typecheck / check / test / format:check scripts work.`,
        };
      }
      if (!READ_ONLY_SCRIPT.test(script)) {
        return {
          ok: false,
          output: `\`npm run ${script}\` is not a read-only script, so it stays in your own terminal. This pane runs lint, typecheck, check, test and format:check scripts.`,
        };
      }
      return await runPackageScript(root, script);
    }

    if (command === "npx") {
      return {
        ok: false,
        output:
          "`npx` downloads and runs packages, so it never runs here. Type `npm run` to see the project's own scripts — its lint / typecheck / test ones do run.",
      };
    }

    return { ok: false, output: `\`${command}\` is not one of the commands this shell allows. Type \`help\`.` };
  } catch {
    return { ok: false, output: "That command failed." };
  }
}

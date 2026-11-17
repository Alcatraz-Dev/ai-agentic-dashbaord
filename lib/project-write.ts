import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PROJECT_PATCH_MAX_CHARS } from "@/lib/project-patch";
import type {
  ProjectCommitResult,
  ProjectPullResult,
  ProjectPushResult,
  ProjectStagingResult,
} from "@/lib/project-types";
import { getProjectForUser } from "@/lib/projects";
import { isDeniedProjectPath } from "@/lib/project-paths";

const execFileAsync = promisify(execFile);

/** Runs git with hooks disabled, no prompts and never through a shell. */
async function runGit(
  root: string,
  args: string[],
  timeout = 15_000,
): Promise<string> {
  const result = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    timeout,
    maxBuffer: 2_000_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return result.stdout.toString();
}

/**
 * The one write path for an attached project.
 *
 * The agent can only ever *propose* a patch; this function runs after the owner
 * clicks Apply, and it refuses to touch anything unless every check passes:
 * the project belongs to the owner, the path resolves inside that project, the
 * file is text and under the cap, and its SHA-256 still equals the hash from the
 * proposal — so a file that changed in the meantime is never overwritten.
 *
 * Only attached projects are writable. This app's own repository is readable
 * through `project: "app"`, but it is never written from chat.
 */

const MAX_TARGET_BYTES = 1_000_000;

/** SHA-256 of a file's text, the value the proposal carries. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Normalises a path the patch may write, or null when it must not. */
export function writableProjectPath(raw: string): string | null {
  const cleaned = String(raw ?? "")
    .replace(/\\/g, "/")
    .trim()
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "");
  if (!cleaned || cleaned.length > 400) return null;

  const parts = cleaned.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  if (isDeniedProjectPath(cleaned)) return null;

  return parts.join("/");
}

export type ApplyPatchResult =
  | { ok: true; path: string; lines: number }
  | { ok: false; error: string };

/** Writes one reviewed patch to an attached project. */
export async function applyProjectPatchForUser(
  profileId: number,
  input: { projectId: number; path: string; content: string; beforeHash: string },
): Promise<ApplyPatchResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const rel = writableProjectPath(input.path);
  if (!rel) return { ok: false, error: "That path can't be written from here." };

  const content = String(input.content ?? "");
  if (content.length > PROJECT_PATCH_MAX_CHARS) {
    return { ok: false, error: "That file is larger than the patch limit (300k characters)." };
  }
  if (content.includes("\u0000")) return { ok: false, error: "That content is not text." };

  const root = project.location;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { ok: false, error: "That path is outside this project." };
  }

  let before = "";
  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) return { ok: false, error: "That path is a folder." };
    if (stat.size > MAX_TARGET_BYTES) {
      return { ok: false, error: "That file is too large to patch here." };
    }
    before = await fs.readFile(abs, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, error: "That file could not be read." };
    }
  }

  if (hashContent(before) !== String(input.beforeHash ?? "")) {
    return {
      ok: false,
      error:
        "That file changed after the patch was proposed, so nothing was written. Ask the agent to look at it again.",
    };
  }

  // Write beside the target and rename, so a failure can never leave half a file.
  const temp = `${abs}.${process.pid}.${Date.now().toString(36)}.tmp`;

  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(temp, content, "utf8");
    await fs.rename(temp, abs);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    console.error("[projects] patch write failed", error);
    return { ok: false, error: "We couldn't write that file." };
  }

  return { ok: true, path: rel, lines: content.split("\n").length };
}

export type ProjectFileOpResult = { ok: true; path: string } | { ok: false; error: string };

/** Resolves a writable target inside an owner's attached project. */
async function resolveWriteTarget(
  profileId: number,
  projectId: number,
  raw: string,
): Promise<{ ok: true; root: string; rel: string; abs: string } | { ok: false; error: string }> {
  const project = await getProjectForUser(profileId, Number(projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const rel = writableProjectPath(raw);
  if (!rel) return { ok: false, error: "That path can't be written from here." };

  const root = project.location;
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { ok: false, error: "That path is outside this project." };
  }

  return { ok: true, root, rel, abs };
}

/**
 * Creates one empty text file. Content never arrives here: the new file opens
 * in a tab and is written through the reviewed patch path like any other edit.
 * `wx` makes the existence check and the write one step, so a file that appears
 * in between is never overwritten.
 */
export async function createProjectFileForUser(
  profileId: number,
  input: { projectId: number; path: string },
): Promise<ProjectFileOpResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  try {
    await fs.mkdir(path.dirname(target.abs), { recursive: true });
    await fs.writeFile(target.abs, "", { encoding: "utf8", flag: "wx" });
    return { ok: true, path: target.rel };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { ok: false, error: "A file already exists at that path." };
    }
    console.error("[projects] create failed", error);
    return { ok: false, error: "We couldn't create that file." };
  }
}

/** Renames one file inside the project; the target must not already exist. */
export async function renameProjectFileForUser(
  profileId: number,
  input: { projectId: number; from: string; to: string },
): Promise<ProjectFileOpResult> {
  const from = await resolveWriteTarget(profileId, input.projectId, input.from);
  if (!from.ok) return from;
  const to = await resolveWriteTarget(profileId, input.projectId, input.to);
  if (!to.ok) return to;
  if (from.abs === to.abs) return { ok: true, path: from.rel };

  try {
    const stat = await fs.stat(from.abs);
    if (!stat.isFile()) return { ok: false, error: "Only files can be renamed here." };

    const taken = await fs
      .access(to.abs)
      .then(() => true)
      .catch(() => false);
    if (taken) return { ok: false, error: "A file already exists at that path." };

    await fs.mkdir(path.dirname(to.abs), { recursive: true });
    await fs.rename(from.abs, to.abs);
    return { ok: true, path: to.rel };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "That file could not be found." };
    }
    console.error("[projects] rename failed", error);
    return { ok: false, error: "We couldn't rename that file." };
  }
}

/** Creates a folder (and any missing parents) inside the project. */
export async function createProjectFolderForUser(
  profileId: number,
  input: { projectId: number; path: string },
): Promise<ProjectFileOpResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  try {
    const taken = await fs
      .access(target.abs)
      .then(() => true)
      .catch(() => false);
    if (taken) return { ok: false, error: "A file or folder already exists at that path." };

    await fs.mkdir(target.abs, { recursive: true });
    return { ok: true, path: target.rel };
  } catch (error) {
    console.error("[projects] create folder failed", error);
    return { ok: false, error: "We couldn't create that folder." };
  }
}

/** Renames one folder; the target must not exist and cannot be inside itself. */
export async function renameProjectFolderForUser(
  profileId: number,
  input: { projectId: number; from: string; to: string },
): Promise<ProjectFileOpResult> {
  const from = await resolveWriteTarget(profileId, input.projectId, input.from);
  if (!from.ok) return from;
  const to = await resolveWriteTarget(profileId, input.projectId, input.to);
  if (!to.ok) return to;
  if (from.abs === to.abs) return { ok: true, path: from.rel };

  if (to.rel.startsWith(`${from.rel}/`)) {
    return { ok: false, error: "A folder can't be moved inside itself." };
  }

  try {
    const stat = await fs.stat(from.abs);
    if (!stat.isDirectory()) return { ok: false, error: "That path is not a folder." };

    const taken = await fs
      .access(to.abs)
      .then(() => true)
      .catch(() => false);
    if (taken) return { ok: false, error: "A file or folder already exists at that path." };

    await fs.mkdir(path.dirname(to.abs), { recursive: true });
    await fs.rename(from.abs, to.abs);
    return { ok: true, path: to.rel };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "That folder could not be found." };
    }
    console.error("[projects] rename folder failed", error);
    return { ok: false, error: "We couldn't rename that folder." };
  }
}

/** Removes one file from the project. Folders are refused on purpose. */
export async function deleteProjectFileForUser(
  profileId: number,
  input: { projectId: number; path: string },
): Promise<ProjectFileOpResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  try {
    const stat = await fs.stat(target.abs);
    if (!stat.isFile()) return { ok: false, error: "Only files can be removed here." };
    await fs.unlink(target.abs);
    return { ok: true, path: target.rel };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "That file could not be found." };
    }
    console.error("[projects] delete failed", error);
    return { ok: false, error: "We couldn't remove that file." };
  }
}

/**
 * Removes one folder, refusing anything this pane must never touch.
 *
 * A recursive delete is the one operation that could take a nested repository,
 * an environment file or `node_modules` with it, so the walk refuses the whole
 * folder when it meets one of those, and caps the size so a mistake cannot walk
 * a million files. Empty folders are the normal case here.
 */
export async function deleteProjectFolderForUser(
  profileId: number,
  input: { projectId: number; path: string },
): Promise<ProjectFileOpResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  try {
    const stat = await fs.stat(target.abs);
    if (!stat.isDirectory()) return { ok: false, error: "Only folders can be removed here." };

    let files = 0;
    const stack = [target.abs];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        const shown = path.relative(target.root, abs).split(path.sep).join("/");
        if (isDeniedProjectPath(shown)) {
          return {
            ok: false,
            error:
              "That folder contains a nested repository, environment file or dependency folder, so it is never removed here.",
          };
        }
        if (entry.isDirectory()) {
          stack.push(abs);
          continue;
        }
        files += 1;
        if (files > 200) {
          return {
            ok: false,
            error: "That folder holds more than 200 files — remove it from the terminal or git instead.",
          };
        }
      }
    }

    await fs.rm(target.abs, { recursive: true, force: false });
    return { ok: true, path: target.rel };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, error: "That folder could not be found." };
    }
    console.error("[projects] delete folder failed", error);
    return { ok: false, error: "We couldn't remove that folder." };
  }
}

/** Adds paths to the index; the working tree is untouched. */
export async function stageProjectPathsForUser(
  profileId: number,
  input: { projectId: number; paths: string[] },
): Promise<ProjectStagingResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const paths: string[] = [];
  for (const raw of Array.isArray(input.paths) ? input.paths : []) {
    const rel = writableProjectPath(raw);
    if (!rel) return { ok: false, error: "One of those paths can't be staged from here." };

    const abs = path.resolve(project.location, rel);
    if (abs !== project.location && !abs.startsWith(project.location + path.sep)) {
      return { ok: false, error: "One of those paths is outside this project." };
    }
    if (!paths.includes(rel)) paths.push(rel);
  }

  if (paths.length === 0) return { ok: false, error: "Pick at least one file to stage." };
  if (paths.length > 100) return { ok: false, error: "Stage at most 100 files at a time." };

  try {
    // `-A` stages a deletion as well as an edit, the same way a commit would.
    await runGit(project.location, ["add", "-A", "--", ...paths]);
    return { ok: true };
  } catch (error) {
    console.error("[projects] stage failed", error);
    return { ok: false, error: "We couldn't stage those files." };
  }
}

/** Takes paths back out of the index without touching the files themselves. */
export async function unstageProjectPathsForUser(
  profileId: number,
  input: { projectId: number; paths: string[] },
): Promise<ProjectStagingResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const paths: string[] = [];
  for (const raw of Array.isArray(input.paths) ? input.paths : []) {
    const rel = writableProjectPath(raw);
    if (!rel) return { ok: false, error: "One of those paths can't be staged from here." };

    const abs = path.resolve(project.location, rel);
    if (abs !== project.location && !abs.startsWith(project.location + path.sep)) {
      return { ok: false, error: "One of those paths is outside this project." };
    }
    if (!paths.includes(rel)) paths.push(rel);
  }

  if (paths.length === 0) return { ok: false, error: "Pick at least one file to unstage." };
  if (paths.length > 100) return { ok: false, error: "Unstage at most 100 files at a time." };

  try {
    try {
      await runGit(project.location, ["restore", "--staged", "--", ...paths]);
    } catch {
      // A repository with no commits has nothing to restore from.
      await runGit(project.location, ["rm", "--cached", "-r", "-q", "--ignore-unmatch", "--", ...paths]);
    }
    return { ok: true };
  } catch (error) {
    console.error("[projects] unstage failed", error);
    return { ok: false, error: "We couldn't unstage those files." };
  }
}

/**
 * Stages one hunk of a file's unstaged diff.
 *
 * The diff is recomputed here rather than sent by the browser: the caller names
 * the hunk by its `@@` header, only a hunk that still exists is applied, and the
 * patch is written to a temp file because `git apply` takes it as an argument.
 * `--cached` touches the index only, so the working tree is never rewritten.
 */
export async function stageProjectHunkForUser(
  profileId: number,
  input: { projectId: number; path: string; header: string },
): Promise<ProjectStagingResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  const header = String(input.header ?? "").trim();
  if (!header.startsWith("@@")) return { ok: false, error: "That is not a diff hunk." };

  try {
    const found = await unstagedHunkPatch(target.root, target.rel, header);
    if (!found.ok) return found;

    await applyHunkPatch(target.root, found.patch, false);
    return { ok: true };
  } catch (error) {
    console.error("[projects] stage hunk failed", error);
    return {
      ok: false,
      error: "That hunk could not be staged — the file changed since the diff was drawn.",
    };
  }
}

/** The applyable patch for one hunk of a file's unstaged diff, or why it is gone. */
async function unstagedHunkPatch(
  root: string,
  rel: string,
  header: string,
): Promise<{ ok: true; patch: string } | { ok: false; error: string }> {
  const patch = await runGit(root, ["diff", "--no-color", "--no-ext-diff", "--", rel]);
  const lines = patch.split("\n");

  const start = lines.findIndex((line) => line.startsWith("@@") && line.trim() === header);
  if (start === -1) {
    return {
      ok: false,
      error: "That hunk changed since the diff was drawn — refresh it and try again.",
    };
  }

  let end = start + 1;
  while (
    end < lines.length &&
    !lines[end].startsWith("@@") &&
    !lines[end].startsWith("diff --git")
  ) {
    end += 1;
  }

  // The diff's final newline leaves one empty element, which is not a line.
  const body = lines
    .slice(start, end)
    .filter((line) => line.length > 0)
    .join("\n");

  return {
    ok: true,
    patch: `diff --git a/${rel} b/${rel}\n--- a/${rel}\n+++ b/${rel}\n${body}\n`,
  };
}

/**
 * Applies a one-hunk patch from a temp file. `--cached` writes the index and
 * `--reverse` writes the working tree; `--recount` trusts the hunk's own counts.
 */
async function applyHunkPatch(root: string, patch: string, reverse: boolean): Promise<void> {
  const temp = path.join(
    os.tmpdir(),
    `alcatraz-hunk-${process.pid}-${Date.now().toString(36)}${reverse ? "-undo" : ""}.patch`,
  );
  try {
    await fs.writeFile(temp, patch, "utf8");
    await runGit(root, [
      "apply",
      ...(reverse ? ["--reverse"] : ["--cached"]),
      "--recount",
      "--whitespace=nowarn",
      temp,
    ]);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

/** Throws one hunk of a file's unstaged changes away, leaving the rest alone. */
export async function discardProjectHunkForUser(
  profileId: number,
  input: { projectId: number; path: string; header: string },
): Promise<ProjectStagingResult> {
  const target = await resolveWriteTarget(profileId, input.projectId, input.path);
  if (!target.ok) return target;

  const header = String(input.header ?? "").trim();
  if (!header.startsWith("@@")) return { ok: false, error: "That is not a diff hunk." };

  try {
    const found = await unstagedHunkPatch(target.root, target.rel, header);
    if (!found.ok) return found;

    // Reverse-applied to the working tree only: the index is untouched.
    await applyHunkPatch(target.root, found.patch, true);
    return { ok: true };
  } catch (error) {
    console.error("[projects] discard hunk failed", error);
    return {
      ok: false,
      error: "That hunk could not be discarded — the file changed since the diff was drawn.",
    };
  }
}

/**
 * Pushes the current branch to its remote, never forcing.
 *
 * The first push of a branch sets its upstream (`-u`); later pushes go to the
 * same remote. A working tree with uncommitted files is refused rather than
 * half-shipped, and git's own stderr becomes the message, because "rejected"
 * and "authentication failed" need different actions from the owner.
 */
export async function pushProjectBranchForUser(
  profileId: number,
  input: { projectId: number },
): Promise<ProjectPushResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const root = project.location;

  try {
    let branch = "";
    try {
      branch = (await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    } catch {
      branch = "";
    }
    if (!branch || branch === "HEAD") {
      return { ok: false, error: "This checkout is not on a branch, so there is nothing to push." };
    }

    const dirty = (await runGit(root, ["status", "--porcelain=v1"])).trim();
    if (dirty) {
      return {
        ok: false,
        error: "Commit your changes first — nothing is pushed while the working tree has uncommitted files.",
      };
    }

    const remotes = (await runGit(root, ["remote"])).split("\n").filter(Boolean);
    if (remotes.length === 0) {
      return { ok: false, error: "This project has no remote yet, so there is nowhere to push." };
    }
    const remote = remotes.includes("origin") ? "origin" : remotes[0];

    let upstream = "";
    try {
      upstream = (
        await runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
      ).trim();
    } catch {
      upstream = "";
    }

    await runGit(
      root,
      upstream ? ["push", remote, branch] : ["push", "-u", remote, branch],
      60_000,
    );

    const hash = (await runGit(root, ["rev-parse", "--short", "HEAD"])).trim();
    return { ok: true, branch, remote, hash };
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");

    if (/could not read Username|Authentication failed|terminal prompts disabled|Permission denied/i.test(stderr)) {
      return {
        ok: false,
        error: "This remote needs credentials this workspace does not have. Push from a terminal where your git login is set up.",
      };
    }
    if (/non-fast-forward|\[rejected\]|fetch first/i.test(stderr)) {
      return {
        ok: false,
        error: "The remote has commits this clone does not, so the push was refused. Nothing was forced — pull first.",
      };
    }
    if (/no upstream branch|has no upstream/i.test(stderr)) {
      return { ok: false, error: "This branch has no upstream on the remote yet." };
    }

    console.error("[projects] push failed", error);
    return { ok: false, error: "We couldn't push this branch." };
  }
}

/**
 * Fast-forwards the current branch from its upstream, never merging.
 *
 * `--ff-only` is deliberate: this pane is not a merge tool, so a branch that has
 * diverged is reported instead of being resolved behind the owner's back. The
 * working tree must be clean, and a branch with no upstream is refused rather
 * than guessed at.
 */
export async function pullProjectBranchForUser(
  profileId: number,
  input: { projectId: number },
): Promise<ProjectPullResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const root = project.location;

  try {
    let branch = "";
    try {
      branch = (await runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    } catch {
      branch = "";
    }
    if (!branch || branch === "HEAD") {
      return { ok: false, error: "This checkout is not on a branch, so there is nothing to pull." };
    }

    const dirty = (await runGit(root, ["status", "--porcelain=v1"])).trim();
    if (dirty) {
      return {
        ok: false,
        error: "Commit or discard your changes first — nothing is pulled while the working tree has uncommitted files.",
      };
    }

    let upstream = "";
    try {
      upstream = (
        await runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
      ).trim();
    } catch {
      upstream = "";
    }
    if (!upstream) {
      return { ok: false, error: "This branch has no upstream yet — push it once, then pull." };
    }

    const remote = upstream.split("/")[0] || "origin";
    const before = (await runGit(root, ["rev-parse", "HEAD"])).trim();

    await runGit(root, ["pull", "--ff-only", "--no-rebase"], 60_000);

    const hash = (await runGit(root, ["rev-parse", "--short", "HEAD"])).trim();
    const updated =
      Number((await runGit(root, ["rev-list", "--count", `${before}..HEAD`])).trim()) || 0;

    return { ok: true, branch, remote, hash, updated };
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");

    if (/could not read Username|Authentication failed|terminal prompts disabled|Permission denied/i.test(stderr)) {
      return {
        ok: false,
        error: "This remote needs credentials this workspace does not have. Pull from a terminal where your git login is set up.",
      };
    }
    if (/not possible to fast-forward|divergent branches|Need to specify how to reconcile/i.test(stderr)) {
      return {
        ok: false,
        error: "This branch and its remote have both moved, so nothing was pulled. Merge or rebase it yourself.",
      };
    }
    if (/no tracking information|no such remote|couldn't find remote ref/i.test(stderr)) {
      return { ok: false, error: "This branch has no upstream to pull from." };
    }

    console.error("[projects] pull failed", error);
    return { ok: false, error: "We couldn't pull this branch." };
  }
}

/**
 * Stages exactly the picked paths and commits them locally.
 *
 * Nothing is pushed, and repository hooks are disabled for this call so a
 * checkout cannot run its own code through the dashboard. `-A` is deliberate:
 * staging a path whose file was deleted has to record the deletion too.
 */
export async function commitProjectForUser(
  profileId: number,
  input: { projectId: number; message: string; amend?: boolean },
): Promise<ProjectCommitResult> {
  const project = await getProjectForUser(profileId, Number(input.projectId));
  if (!project) {
    return { ok: false, error: "That project could not be found. Attach it again from the Desk panel." };
  }

  const message = String(input.message ?? "").trim();
  if (!message) return { ok: false, error: "Write a commit message first." };
  if (message.length > 500) {
    return { ok: false, error: "Keep the commit message under 500 characters." };
  }
  if (message.includes("\u0000")) return { ok: false, error: "That message is not text." };

  // Only what the owner staged is committed: nothing is added here.
  const amend = input.amend === true;

  try {
    const staged = (await runGit(project.location, ["diff", "--cached", "--name-only"]))
      .split("\n")
      .filter(Boolean);

    if (staged.length === 0) {
      return { ok: false, error: "Nothing is staged yet — stage a file first." };
    }
    if (staged.length > 100) {
      return {
        ok: false,
        error: "This commit would include more than 100 files — commit a smaller set.",
      };
    }

    await runGit(project.location, amend ? ["commit", "--amend", "-m", message] : ["commit", "-m", message]);
    const hash = (await runGit(project.location, ["rev-parse", "--short", "HEAD"])).trim();
    return { ok: true, hash, files: staged.length };
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? "");

    if (/nothing to amend/i.test(stderr)) {
      return { ok: false, error: "There is no commit to amend yet — commit once first." };
    }
    if (/nothing to commit|no changes added to commit/i.test(stderr)) {
      return { ok: false, error: "Those files have no changes to commit." };
    }
    if (/Please tell me who you are|user\.email|user\.name/i.test(stderr)) {
      return {
        ok: false,
        error: "Git needs a name and email for this repository before it can commit.",
      };
    }

    console.error("[projects] commit failed", error);
    return { ok: false, error: "We couldn't commit those files." };
  }
}

import "server-only";

import { isDeniedProjectPath } from "@/lib/project-paths";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { and, asc, eq } from "drizzle-orm";

import { db, projects } from "@/db";
import { PROJECT_UPLOAD_LIMITS, type ProjectSummary } from "@/lib/project-types";

/**
 * Code projects the owner attached to the workspace, and the root the project
 * pane reads.
 *
 * Two kinds: a repository cloned into `.projects/<owner>/<slug>` on this
 * machine, and a folder the owner already has. Both are read-only from the app's
 * point of view — no write path exists.
 *
 * Repo URLs are restricted to https on a known host, with no credentials and no
 * query string, and the clone runs `git` through `execFile` with an argument
 * list (never a shell), `GIT_TERMINAL_PROMPT=0`, `--depth 1 --single-branch
 * --no-tags` and no hooks. Folders must be inside `PROJECT_ROOTS` (default: this
 * app's own directory), so a typo cannot hand the pane `/etc`.
 */

const execFileAsync = promisify(execFile);

/** Where cloned repositories live. */
export const CLONE_ROOT = path.join(process.cwd(), ".projects");

const REPO_HOSTS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
export const PROJECTS_MAX = 12;

/** Where folders uploaded from the browser are written. */
export const UPLOAD_ROOT = path.join(CLONE_ROOT, "uploads");
/** One uploaded folder: sized for a real code base, with the numbers client-safe. */
export const PROJECT_UPLOAD_MAX_FILES = PROJECT_UPLOAD_LIMITS.files;
export const PROJECT_UPLOAD_MAX_BYTES = PROJECT_UPLOAD_LIMITS.bytes;
export const PROJECT_UPLOAD_MAX_FILE_BYTES = PROJECT_UPLOAD_LIMITS.fileBytes;

export type ProjectRoot = { root: string; name: string; projectId: number | null };

/** Directories an attached folder may live under. */
export function allowedProjectRoots(): string[] {
  const configured = process.env.PROJECT_ROOTS;
  const roots = (configured ? configured.split(path.delimiter) : [process.cwd()])
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));

  return [...new Set(roots)];
}

function isInside(target: string, root: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

function insideAllowedRoots(target: string): boolean {
  return allowedProjectRoots().some((root) => isInside(target, root));
}

function columns() {
  return {
    id: projects.id,
    name: projects.name,
    kind: projects.kind,
    location: projects.location,
    url: projects.url,
    createdAt: projects.createdAt,
  };
}

function toSummary(row: {
  id: number;
  name: string;
  kind: string;
  location: string;
  url: string | null;
  createdAt: Date;
}): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "repo" ? "repo" : "folder",
    location: row.location,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listProjectsForUser(profileId: number): Promise<ProjectSummary[]> {
  const rows = await db
    .select(columns())
    .from(projects)
    .where(eq(projects.ownerId, profileId))
    .orderBy(asc(projects.createdAt), asc(projects.id));

  return rows.map(toSummary);
}

export async function getProjectForUser(profileId: number, id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;

  const [row] = await db
    .select(columns())
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, profileId)))
    .limit(1);

  return row ? toSummary(row) : null;
}

/**
 * The root the pane reads: one of the owner's attached projects, or this app's
 * own repository when none is selected (or the id is not theirs).
 */
export async function resolveProjectRoot(
  profileId: number,
  projectId: number | null,
): Promise<ProjectRoot> {
  if (projectId !== null) {
    const project = await getProjectForUser(profileId, projectId);
    if (project) {
      return { root: project.location, name: project.name, projectId: project.id };
    }
  }

  return { root: process.cwd(), name: "this app", projectId: null };
}

async function countProjects(profileId: number): Promise<number> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, profileId));
  return rows.length;
}

export type AttachProjectResult =
  | { ok: true; project: ProjectSummary }
  | { ok: false; error: string };

/** Attaches an existing folder on this machine (read-only). */
export async function attachFolderProject(
  profileId: number,
  rawPath: string,
): Promise<AttachProjectResult> {
  const input = String(rawPath ?? "").trim();
  if (!input) return { ok: false, error: "Paste the folder's full path." };

  const target = path.resolve(input);
  if (!insideAllowedRoots(target)) {
    return {
      ok: false,
      error: `That folder is outside the allowed roots (${allowedProjectRoots().join(", ")}).`,
    };
  }

  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) return { ok: false, error: "That path is a file, not a folder." };
  } catch {
    return { ok: false, error: "That folder does not exist on this machine." };
  }

  const existing = await listProjectsForUser(profileId);
  const already = existing.find((project) => project.location === target);
  if (already) return { ok: true, project: already };

  if (existing.length >= PROJECTS_MAX) {
    return { ok: false, error: `This workspace already has ${PROJECTS_MAX} projects. Remove one first.` };
  }

  const [row] = await db
    .insert(projects)
    .values({
      ownerId: profileId,
      name: path.basename(target) || target,
      kind: "folder",
      location: target,
      url: null,
    })
    .returning(columns());

  if (!row) return { ok: false, error: "We couldn't attach that folder." };
  return { ok: true, project: toSummary(row) };
}

/** Parses a repository URL into the parts a clone needs. */
export function parseRepoUrl(
  rawUrl: string,
): { url: string; host: string; owner: string; repo: string; name: string } | null {
  const input = String(rawUrl ?? "").trim().replace(/\/+$/, "");
  if (!input) return null;

  // Only https URLs: no scp-style git@host:path, no file://, no ssh.
  let parsed: URL;
  try {
    parsed = new URL(input.endsWith(".git") ? input.slice(0, -4) : input);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (!REPO_HOSTS.has(parsed.hostname.toLowerCase())) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;

  const [owner, repo] = segments;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;

  const host = parsed.hostname.toLowerCase();
  return {
    url: `https://${host}/${owner}/${repo}`,
    host,
    owner,
    repo,
    name: `${owner}/${repo}`,
  };
}

function slugFor(profileId: number, owner: string, repo: string): string {
  const safe = `${owner}__${repo}`.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return path.join(CLONE_ROOT, String(profileId), safe);
}

/** Clones a public repository shallowly and attaches it. */
export async function attachRepoProject(
  profileId: number,
  rawUrl: string,
): Promise<AttachProjectResult> {
  const parsed = parseRepoUrl(rawUrl);
  if (!parsed) {
    return {
      ok: false,
      error: "Use an https URL for a GitHub, GitLab or Bitbucket repository (https://github.com/owner/repo).",
    };
  }

  const existing = await listProjectsForUser(profileId);
  const already = existing.find((project) => project.url === parsed.url);
  if (already) return { ok: true, project: already };

  if (existing.length >= PROJECTS_MAX) {
    return { ok: false, error: `This workspace already has ${PROJECTS_MAX} projects. Remove one first.` };
  }

  const destination = slugFor(profileId, parsed.owner, parsed.repo);

  try {
    const stat = await fs.stat(destination).catch(() => null);
    if (!stat) {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await execFileAsync(
        "git",
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "protocol.ext.allow=never",
          "clone",
          "--depth",
          "1",
          "--single-branch",
          "--no-tags",
          parsed.url,
          destination,
        ],
        {
          cwd: path.dirname(destination),
          timeout: 120_000,
          maxBuffer: 2_000_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo" },
        },
      );
    }
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
    console.error("[projects] clone failed", error);
    return {
      ok: false,
      error: "That repository could not be cloned. It may be private, or the URL may be wrong.",
    };
  }

  const [row] = await db
    .insert(projects)
    .values({
      ownerId: profileId,
      name: parsed.name.slice(0, 120),
      kind: "repo",
      location: destination,
      url: parsed.url,
    })
    .returning(columns());

  if (!row) return { ok: false, error: "We couldn't attach that repository." };
  return { ok: true, project: toSummary(row) };
}

/** Detaches one project; a clone is deleted from disk, a folder is left alone. */
export async function detachProjectForUser(
  profileId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await getProjectForUser(profileId, id);
  if (!project) return { ok: false, error: "That project could not be found." };

  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, profileId)));

  if (
    (project.kind === "repo" && isInside(project.location, CLONE_ROOT)) ||
    isInside(project.location, UPLOAD_ROOT)
  ) {
    await fs.rm(project.location, { recursive: true, force: true }).catch(() => {});
    // Drop the owner's now-empty folder inside `.projects` too.
    await fs.rmdir(path.dirname(project.location)).catch(() => {});
  }

  return { ok: true };
}

/** Paths that are never written from an upload: secrets, git metadata, deps. */

/** One file from a browser upload: its relative path and its bytes. */
export type ProjectUploadEntry = { path: string; bytes: Uint8Array };

export type ProjectUploadResult =
  | { ok: true; project: ProjectSummary; written: number; skipped: number }
  | { ok: false; error: string };

/** Normalises an uploaded relative path, or null when it is unsafe. */
export function cleanUploadPath(raw: string): string | null {
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

function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, Math.min(bytes.byteLength, 8_000)).includes(0);
}

/**
 * Attaches a folder the owner picked in the browser.
 *
 * The files arrive as bytes from `POST /api/projects/upload` (a route handler,
 * because a server action's body limit is smaller than a real code folder) and
 * are written to `.projects/uploads/<owner>/<slug>-<stamp>/`, so the tree,
 * file reader, working tree and terminal treat them exactly like a clone.
 *
 * Binaries, environment files, key material and dependency folders are skipped
 * (and counted, so the dialog can say how many), and the total is capped.
 * Nothing is executed.
 */
export async function uploadFolderProject(
  profileId: number,
  rawName: string,
  entries: ProjectUploadEntry[],
): Promise<ProjectUploadResult> {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "Choose a folder with at least one file." };
  }
  if (entries.length > PROJECT_UPLOAD_MAX_FILES) {
    return {
      ok: false,
      error: `That folder has ${entries.length.toLocaleString()} files; the limit is ${PROJECT_UPLOAD_MAX_FILES.toLocaleString()}. Clone the repository, or attach the folder from this machine.`,
    };
  }

  const existing = await listProjectsForUser(profileId);
  if (existing.length >= PROJECTS_MAX) {
    return { ok: false, error: `This workspace already has ${PROJECTS_MAX} projects. Remove one first.` };
  }

  const accepted: { rel: string; bytes: Uint8Array }[] = [];
  let total = 0;
  let skipped = 0;

  for (const entry of entries) {
    const rel = cleanUploadPath(entry?.path ?? "");
    const bytes = entry?.bytes;
    if (!rel || !(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      skipped += 1;
      continue;
    }
    if (bytes.byteLength > PROJECT_UPLOAD_MAX_FILE_BYTES || looksBinary(bytes)) {
      skipped += 1;
      continue;
    }
    total += bytes.byteLength;
    if (total > PROJECT_UPLOAD_MAX_BYTES) {
      return {
        ok: false,
        error: `That folder is over ${Math.round(PROJECT_UPLOAD_MAX_BYTES / 1024 / 1024)} MB. Clone the repository, attach the folder from this machine, or upload it in parts.`,
      };
    }
    accepted.push({ rel, bytes });
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      error: "Every file in that folder was a binary, a dependency folder or a secret, so there was nothing to save.",
    };
  }

  const raw = String(rawName ?? "").trim();
  const folderName = (raw.split("/").filter(Boolean).pop() ?? "Uploaded folder").slice(0, 120);
  const slug =
    folderName
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "folder";
  const destination = path.join(UPLOAD_ROOT, String(profileId), `${slug}-${Date.now().toString(36)}`);

  if (!isInside(destination, CLONE_ROOT)) {
    return { ok: false, error: "That folder name is not valid." };
  }

  try {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of accepted) {
      const target = path.resolve(destination, entry.rel);
      if (!isInside(target, destination)) {
        skipped += 1;
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.bytes);
    }
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
    console.error("[projects] upload failed", error);
    return { ok: false, error: "We couldn't save that folder. Please try again." };
  }

  const [row] = await db
    .insert(projects)
    .values({
      ownerId: profileId,
      name: folderName,
      kind: "folder",
      location: destination,
      url: null,
    })
    .returning(columns());

  if (!row) return { ok: false, error: "We couldn't attach that folder." };
  return { ok: true, project: toSummary(row), written: accepted.length, skipped };
}

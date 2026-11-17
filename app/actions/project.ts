"use server";

import {
  listProjectFiles,
  listProjectTree,
  projectChanges,
  projectCommitFileDiff,
  projectCommitView,
  projectFileDiff,
  projectFileStamp,
  projectHeadFile,
  projectIndexFile,
  projectUnstagedHunks,
  readProjectFile,
  isReadOnlyProjectScript,
  listProjectScripts,
  runProjectCommand,
  searchProjectFiles,
} from "@/lib/project-files";
import {
  dismissProjectRun,
  projectRunKey,
  snapshotProjectRun,
  startProjectRun,
  stopProjectRun,
} from "@/lib/project-run";
import type {
  ProjectChangesResult,
  ProjectCommitFileResult,
  ProjectCommitViewResult,
  ProjectCommandResult,
  ProjectFileDiffResult,
  ProjectFileListResult,
  ProjectFileResult,
  ProjectCommitResult,
  ProjectFileStampResult,
  ProjectHeadFileResult,
  ProjectHunkResult,
  ProjectIndexFileResult,
  ProjectPushResult,
  ProjectPullResult,
  ProjectScriptResult,
  ProjectScriptStatusResult,
  ProjectSearchResult,
  ProjectStagingResult,
  ProjectSummary,
  ProjectTreeResult,
} from "@/lib/project-types";
import {
  attachFolderProject,
  attachRepoProject,
  detachProjectForUser,
  listProjectsForUser,
  resolveProjectRoot,
  type AttachProjectResult,
} from "@/lib/projects";
import {
  applyProjectPatchForUser,
  commitProjectForUser,
  createProjectFileForUser,
  createProjectFolderForUser,
  deleteProjectFileForUser,
  deleteProjectFolderForUser,
  discardProjectHunkForUser,
  pullProjectBranchForUser,
  pushProjectBranchForUser,
  renameProjectFileForUser,
  renameProjectFolderForUser,
  stageProjectHunkForUser,
  stageProjectPathsForUser,
  unstageProjectPathsForUser,
} from "@/lib/project-write";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Owner-checked wrappers around attached projects and the read-only project
 * reader. Every call needs a signed-in user; the filesystem work lives in
 * `lib/project-files.ts` and `lib/projects.ts`.
 *
 * These return a message instead of redirecting: a `redirect()` thrown from a
 * server action navigates the whole client app, which would be a surprising way
 * to say "your session ended". Nothing is read before the check.
 */

const SIGNED_OUT = "Sign in again to read this project.";

async function profileIdOrNull(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await ensureUserRecord(user);
  return profile.id;
}

export async function listProjectsAction(): Promise<ProjectSummary[]> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return [];
  return listProjectsForUser(profileId);
}

export async function attachProjectFolderAction(path: string): Promise<AttachProjectResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    return await attachFolderProject(profileId, path);
  } catch (error) {
    console.error("[projects] folder attach failed", error);
    return { ok: false, error: "We couldn't attach that folder." };
  }
}

export async function attachGithubRepoAction(url: string): Promise<AttachProjectResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    return await attachRepoProject(profileId, url);
  } catch (error) {
    console.error("[projects] repo attach failed", error);
    return { ok: false, error: "We couldn't open that repository." };
  }
}

export async function applyProjectPatchAction(input: {
  projectId: number;
  path: string;
  content: string;
  beforeHash: string;
}): Promise<{ ok: true; path: string; lines: number } | { ok: false; error: string }> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  const projectId = Number(input?.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return { ok: false, error: "Attach the project before applying a patch." };
  }

  try {
    return await applyProjectPatchForUser(profileId, {
      projectId,
      path: String(input.path ?? ""),
      content: String(input.content ?? ""),
      beforeHash: String(input.beforeHash ?? ""),
    });
  } catch (error) {
    console.error("[projects] patch failed", error);
    return { ok: false, error: "We couldn't write that file." };
  }
}

export async function detachProjectAction(
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return { ok: false, error: "That project could not be found." };
  }

  try {
    return await detachProjectForUser(profileId, projectId);
  } catch (error) {
    console.error("[projects] detach failed", error);
    return { ok: false, error: "We couldn't remove that project." };
  }
}

export async function listProjectTreeAction(
  projectId: number | null,
  relPath?: string,
): Promise<ProjectTreeResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await listProjectTree(root, relPath);
  } catch {
    return { ok: false, error: "That project could not be read." };
  }
}

export async function listProjectFilesAction(
  projectId: number | null,
): Promise<ProjectFileListResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await listProjectFiles(root);
  } catch {
    return { ok: false, error: "That project could not be listed." };
  }
}

export async function projectFileDiffAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectFileDiffResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  if (typeof relPath !== "string" || !relPath.trim()) {
    return { ok: false, error: "Open a file first." };
  }

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectFileDiff(root, relPath);
  } catch {
    return { ok: false, error: "That file's history could not be read." };
  }
}

export async function projectIndexFileAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectIndexFileResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectIndexFile(root, relPath);
  } catch {
    return { ok: false, error: "That file's staged copy could not be read." };
  }
}

export async function projectCommitViewAction(
  projectId: number | null,
  hash: string,
): Promise<ProjectCommitViewResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectCommitView(root, String(hash ?? ""));
  } catch {
    return { ok: false, error: "That commit could not be read." };
  }
}

export async function projectCommitFileAction(
  projectId: number | null,
  hash: string,
  relPath: string,
): Promise<ProjectCommitFileResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectCommitFileDiff(root, String(hash ?? ""), String(relPath ?? ""));
  } catch {
    return { ok: false, error: "That commit could not be read." };
  }
}

export async function projectUnstagedHunksAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectHunkResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectUnstagedHunks(root, String(relPath ?? ""));
  } catch {
    return { ok: false, error: "This file's diff could not be read." };
  }
}

export async function projectFileStampAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectFileStampResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectFileStamp(root, relPath);
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}

export async function projectHeadFileAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectHeadFileResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectHeadFile(root, relPath);
  } catch {
    return { ok: false, error: "That file's committed copy could not be read." };
  }
}

type FileOpResult = { ok: true; path: string } | { ok: false; error: string };

function writableProjectId(id: number): number | null {
  const projectId = Number(id);
  return Number.isInteger(projectId) && projectId > 0 ? projectId : null;
}

export async function createProjectFileAction(
  projectId: number,
  relPath: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before adding a file." };

  try {
    return await createProjectFileForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
    });
  } catch (error) {
    console.error("[projects] create failed", error);
    return { ok: false, error: "We couldn't create that file." };
  }
}

export async function renameProjectFileAction(
  projectId: number,
  from: string,
  to: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before renaming a file." };

  try {
    return await renameProjectFileForUser(profileId, {
      projectId: id,
      from: String(from ?? ""),
      to: String(to ?? ""),
    });
  } catch (error) {
    console.error("[projects] rename failed", error);
    return { ok: false, error: "We couldn't rename that file." };
  }
}

export async function createProjectFolderAction(
  projectId: number,
  relPath: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before adding a folder." };

  try {
    return await createProjectFolderForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
    });
  } catch (error) {
    console.error("[projects] create folder failed", error);
    return { ok: false, error: "We couldn't create that folder." };
  }
}

export async function renameProjectFolderAction(
  projectId: number,
  from: string,
  to: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before renaming a folder." };

  try {
    return await renameProjectFolderForUser(profileId, {
      projectId: id,
      from: String(from ?? ""),
      to: String(to ?? ""),
    });
  } catch (error) {
    console.error("[projects] rename folder failed", error);
    return { ok: false, error: "We couldn't rename that folder." };
  }
}

export async function deleteProjectFolderAction(
  projectId: number,
  relPath: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project first." };

  try {
    return await deleteProjectFolderForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
    });
  } catch (error) {
    console.error("[projects] delete folder failed", error);
    return { ok: false, error: "We couldn't remove that folder." };
  }
}

export async function unstageProjectPathsAction(
  projectId: number,
  paths: string[],
): Promise<ProjectStagingResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project first." };

  try {
    return await unstageProjectPathsForUser(profileId, {
      projectId: id,
      paths: Array.isArray(paths) ? paths.map((entry) => String(entry ?? "")) : [],
    });
  } catch (error) {
    console.error("[projects] unstage failed", error);
    return { ok: false, error: "We couldn't unstage those files." };
  }
}

export async function projectCommitAction(
  projectId: number,
  message: string,
  amend: boolean,
): Promise<ProjectCommitResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before committing." };

  try {
    return await commitProjectForUser(profileId, {
      projectId: id,
      message: String(message ?? ""),
      amend: amend === true,
    });
  } catch (error) {
    console.error("[projects] commit failed", error);
    return { ok: false, error: "We couldn't commit those files." };
  }
}

export async function pushProjectBranchAction(projectId: number): Promise<ProjectPushResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before pushing." };

  try {
    return await pushProjectBranchForUser(profileId, { projectId: id });
  } catch (error) {
    console.error("[projects] push failed", error);
    return { ok: false, error: "We couldn't push this branch." };
  }
}

export async function pullProjectBranchAction(projectId: number): Promise<ProjectPullResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before pulling." };

  try {
    return await pullProjectBranchForUser(profileId, { projectId: id });
  } catch (error) {
    console.error("[projects] pull failed", error);
    return { ok: false, error: "We couldn't pull this branch." };
  }
}

export async function discardProjectHunkAction(
  projectId: number,
  relPath: string,
  header: string,
): Promise<ProjectStagingResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project first." };

  try {
    return await discardProjectHunkForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
      header: String(header ?? ""),
    });
  } catch (error) {
    console.error("[projects] discard hunk failed", error);
    return { ok: false, error: "We couldn't discard that hunk." };
  }
}

export async function stageProjectHunkAction(
  projectId: number,
  relPath: string,
  header: string,
): Promise<ProjectStagingResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project first." };

  try {
    return await stageProjectHunkForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
      header: String(header ?? ""),
    });
  } catch (error) {
    console.error("[projects] stage hunk failed", error);
    return { ok: false, error: "We couldn't stage that hunk." };
  }
}

export async function stageProjectPathsAction(
  projectId: number,
  paths: string[],
): Promise<ProjectStagingResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project first." };

  try {
    return await stageProjectPathsForUser(profileId, {
      projectId: id,
      paths: Array.isArray(paths) ? paths.map((entry) => String(entry ?? "")) : [],
    });
  } catch (error) {
    console.error("[projects] stage failed", error);
    return { ok: false, error: "We couldn't stage those files." };
  }
}

export async function deleteProjectFileAction(
  projectId: number,
  relPath: string,
): Promise<FileOpResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  const id = writableProjectId(projectId);
  if (id === null) return { ok: false, error: "Attach the project before removing a file." };

  try {
    return await deleteProjectFileForUser(profileId, {
      projectId: id,
      path: String(relPath ?? ""),
    });
  } catch (error) {
    console.error("[projects] delete failed", error);
    return { ok: false, error: "We couldn't remove that file." };
  }
}

export async function readProjectFileAction(
  projectId: number | null,
  relPath: string,
): Promise<ProjectFileResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };
  if (typeof relPath !== "string" || !relPath.trim()) {
    return { ok: false, error: "Pick a file first." };
  }

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await readProjectFile(root, relPath);
  } catch {
    return { ok: false, error: "That file could not be read." };
  }
}

export async function searchProjectFilesAction(
  projectId: number | null,
  query: string,
): Promise<ProjectSearchResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await searchProjectFiles(root, query);
  } catch {
    return { ok: false, error: "That search could not run." };
  }
}

export async function projectChangesAction(projectId: number | null): Promise<ProjectChangesResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await projectChanges(root);
  } catch {
    return { ok: false, error: "That project's history could not be read." };
  }
}

/**
 * Runs one package script. A read-only script (`lint`, `typecheck`, `test`)
 * answers inline as before; anything long-lived is started in the background
 * and its output is polled through `projectScriptStatusAction`.
 */
export async function runProjectScriptAction(
  projectId: number | null,
  script: string,
): Promise<ProjectScriptResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, output: SIGNED_OUT, run: null };

  if (typeof script !== "string" || !/^[A-Za-z0-9:._@-]{1,80}$/.test(script)) {
    return { ok: false, output: "That is not a script name.", run: null };
  }

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    const scripts = await listProjectScripts(root);

    if (scripts === null) {
      return {
        ok: false,
        output: "This project has no package.json, so it has no scripts.",
        run: null,
      };
    }
    if (!(script in scripts)) {
      const names = Object.keys(scripts).sort();
      return {
        ok: false,
        output: `package.json has no script named \`${script}\`. It has: ${names.join(", ") || "none"}.`,
        run: null,
      };
    }

    if (isReadOnlyProjectScript(script)) {
      const result = await runProjectCommand(root, `npm run ${script}`);
      return { ok: result.ok, output: result.output, run: null };
    }

    const key = projectRunKey(profileId, projectId);
    const started = startProjectRun(key, root, script);
    if ("error" in started) {
      return { ok: false, output: started.error, run: snapshotProjectRun(key) };
    }

    return {
      ok: true,
      output: `Started \`npm run ${script}\` in the background. Its output streams below; Stop ends it.`,
      run: started,
    };
  } catch {
    return { ok: false, output: "That script could not start.", run: null };
  }
}

/** The output and state of this project's one background script. */
export async function projectScriptStatusAction(
  projectId: number | null,
): Promise<ProjectScriptStatusResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  return { ok: true, run: snapshotProjectRun(projectRunKey(profileId, projectId)) };
}

export async function stopProjectScriptAction(
  projectId: number | null,
): Promise<ProjectScriptStatusResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  return { ok: true, run: stopProjectRun(projectRunKey(profileId, projectId)) };
}

/** Forgets an exited run, so its output block can be closed. */
export async function dismissProjectScriptAction(
  projectId: number | null,
): Promise<ProjectScriptStatusResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, error: SIGNED_OUT };

  const key = projectRunKey(profileId, projectId);
  dismissProjectRun(key);
  return { ok: true, run: snapshotProjectRun(key) };
}

export async function runProjectCommandAction(
  projectId: number | null,
  line: string,
): Promise<ProjectCommandResult> {
  const profileId = await profileIdOrNull();
  if (profileId === null) return { ok: false, output: SIGNED_OUT };

  try {
    const { root } = await resolveProjectRoot(profileId, projectId);
    return await runProjectCommand(root, line);
  } catch {
    return { ok: false, output: "That command could not run." };
  }
}

import "server-only";

import { randomUUID } from "node:crypto";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  createAgentToolRunState,
  type AgentToolRunState,
} from "@/lib/agent-runtime/tools/context";
import { PROJECT_PATCH_MAX_CHARS, patchStats } from "@/lib/project-patch";
import { hashContent, writableProjectPath } from "@/lib/project-write";
import { listProjectsForUser, resolveProjectRoot } from "@/lib/projects";
import { readProjectFile, searchProjectFiles, listProjectTree } from "@/lib/project-files";

/**
 * `list_projects`, `list_project_files`, `read_project_file`, `search_project`.
 *
 * The Desk pane reads a project for the owner; these tools let the **agent**
 * read the same thing, so a question about the attached code can be answered
 * from the actual files instead of a guess.
 *
 * Safety is the pane's safety: the root is resolved owner-scoped in
 * `lib/projects.ts`, every path is resolved inside that root by
 * `lib/project-files.ts`, dot-directories, `.env`, `.git`, key material and
 * dependency folders are refused by name, and nothing here writes. There is no
 * shell: `search_project` walks files itself and never runs a program.
 */

type ResolvedProject =
  | { ok: true; root: string; name: string; projectId: number | null }
  | { ok: false; error: string };

const NO_OWNER =
  "This turn has no workspace owner, so no project can be read. Ask the user to open the agent from the dashboard.";

/** `"app"` (or no name) means this workspace's own repository. */
async function resolveByName(ownerId: number | null, rawName: string | undefined): Promise<ResolvedProject> {
  if (ownerId === null) return { ok: false, error: NO_OWNER };

  const wanted = (rawName ?? "").trim();
  const thisApp = !wanted || /^(this )?app$|^this workspace$/i.test(wanted);

  if (thisApp) {
    const resolved = await resolveProjectRoot(ownerId, null);
    return { ok: true, root: resolved.root, name: resolved.name, projectId: resolved.projectId };
  }

  const list = await listProjectsForUser(ownerId);
  const lower = wanted.toLowerCase();
  const match =
    list.find((project) => project.name.toLowerCase() === lower) ??
    list.find((project) => project.name.toLowerCase().endsWith(lower)) ??
    list.find((project) => project.name.toLowerCase().includes(lower));

  if (!match) {
    const names = list.map((project) => project.name).join(", ");
    return {
      ok: false,
      error: names
        ? `No attached project is called "${wanted}". Attached projects: ${names}. Use list_projects to see them, or "app" for this workspace's own repository.`
        : `No project is called "${wanted}" — nothing is attached to this workspace yet, so only "app" (this repository) can be read.`,
    };
  }

  const resolved = await resolveProjectRoot(ownerId, match.id);
  return { ok: true, root: resolved.root, name: resolved.name, projectId: resolved.projectId };
}

const emptyParameters = z.object({});

const listProjects: Tool<AgentToolRunState> = tool<typeof emptyParameters, AgentToolRunState>({
  name: "list_projects",
  description:
    "List the code projects this workspace can read: this app's own repository plus every folder or repository the owner attached. Call it before reading a project you have not seen in this conversation.",
  parameters: emptyParameters,
  execute: async (_args, runContext?: RunContext<AgentToolRunState>) => {
    const ownerId = runContext?.context?.ownerId ?? null;
    if (ownerId === null) return NO_OWNER;

    const list = await listProjectsForUser(ownerId);
    const app = await resolveProjectRoot(ownerId, null);

    const lines = [
      `app — this workspace's own repository (read it with project "app")`,
      ...list.map(
        (project) =>
          `${project.name} — ${project.kind === "repo" ? "cloned repository" : "folder on this machine"}${
            project.url ? ` (${project.url})` : ""
          }`,
      ),
    ];

    return [
      `Projects that can be read (${lines.length}):`,
      ...lines.map((line) => `- ${line}`),
      list.length === 0
        ? "\nNothing else is attached yet. The owner can attach a folder, clone a repository or upload one from the Desk panel."
        : "",
      `\nThis app's folder is "${app.name}". Reads are snapshots of the files on disk — say when something may be stale.`,
    ]
      .filter(Boolean)
      .join("\n");
  },
});

const listParameters = z.object({
  project: z
    .string()
    .optional()
    .describe('Attached project name, or "app" for this workspace\'s own repository.'),
  path: z
    .string()
    .optional()
    .describe('Folder relative to the project root, e.g. "lib/agent-runtime". Defaults to the root.'),
});

const listProjectFiles: Tool<AgentToolRunState> = tool<typeof listParameters, AgentToolRunState>({
  name: "list_project_files",
  description:
    "List one folder inside a readable project (default: the project root). Use it to find the file to read before opening anything.",
  parameters: listParameters,
  execute: async ({ project, path }, runContext?: RunContext<AgentToolRunState>) => {
    const target = await resolveByName(runContext?.context?.ownerId ?? null, project);
    if (!target.ok) return target.error;

    const result = await listProjectTree(target.root, path ?? "");
    if (!result.ok) return `${target.name}: ${result.error}`;

    if (result.entries.length === 0) {
      return `${target.name}/${result.path || "."} is empty, or everything in it is hidden or ignored.`;
    }

    const folders = result.entries.filter((entry) => entry.type === "dir");
    const files = result.entries.filter((entry) => entry.type === "file");

    return [
      `${target.name}/${result.path || "."} — ${folders.length} folders, ${files.length} files`,
      ...folders.map((entry) => `${entry.path}/`),
      ...files.map((entry) => entry.path),
      folders.length + files.length >= 250 ? "\n(list capped at 250 entries)" : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
});

const readParameters = z.object({
  project: z
    .string()
    .optional()
    .describe('Attached project name, or "app" for this workspace\'s own repository.'),
  path: z.string().describe('File path relative to the project root, e.g. "lib/tasks.ts".'),
});

const readProject: Tool<AgentToolRunState> = tool<typeof readParameters, AgentToolRunState>({
  name: "read_project_file",
  description:
    "Read one text file from a readable project. Environment files, .git, key material and dependency folders are refused, and long files are cut at 200k characters.",
  parameters: readParameters,
  execute: async ({ project, path }, runContext?: RunContext<AgentToolRunState>) => {
    const target = await resolveByName(runContext?.context?.ownerId ?? null, project);
    if (!target.ok) return target.error;

    const result = await readProjectFile(target.root, path);
    if (!result.ok) return `${target.name}: ${result.error}`;

    return [
      `${target.name}/${result.path} — ${result.lines} lines${result.truncated ? ", truncated" : ""}`,
      "",
      result.content,
      result.truncated ? "\n… the file continues; read a specific area or ask the owner for the rest." : "",
    ]
      .filter((line) => line !== undefined)
      .join("\n");
  },
});

const searchParameters = z.object({
  project: z
    .string()
    .optional()
    .describe('Attached project name, or "app" for this workspace\'s own repository.'),
  query: z.string().min(2).describe("Literal text to find, at least two characters."),
});

const searchProject: Tool<AgentToolRunState> = tool<typeof searchParameters, AgentToolRunState>({
  name: "search_project",
  description:
    'Find a literal string across a readable project\'s text files (like a grep). Returns matching lines with their file and line number. Use it to locate where something is defined or used before reading files.',
  parameters: searchParameters,
  execute: async ({ project, query }, runContext?: RunContext<AgentToolRunState>) => {
    const target = await resolveByName(runContext?.context?.ownerId ?? null, project);
    if (!target.ok) return target.error;

    const result = await searchProjectFiles(target.root, query);
    if (!result.ok) return `${target.name}: ${result.error}`;

    if (result.matches.length === 0) {
      return `No file in ${target.name} contains "${query}" (${result.scanned} files scanned).`;
    }

    return [
      `${result.matches.length} match${result.matches.length === 1 ? "" : "es"} for "${query}" in ${target.name} (${result.scanned} files scanned):`,
      ...result.matches.map((match) => `${match.path}:${match.line}: ${match.text}`),
      result.truncated ? "\n(more matches exist — narrow the query)" : "",
    ]
      .filter(Boolean)
      .join("\n");
  },
});

const proposePatchParameters = z.object({
  project: z.string().describe("Attached project name. This app's own repository is read-only."),
  path: z.string().describe('File path inside the project, e.g. "lib/tasks.ts".'),
  content: z.string().describe("The complete new contents of the file."),
  summary: z.string().describe("One sentence: what this changes and why."),
});

const proposeProjectPatch: Tool<AgentToolRunState> = tool<
  typeof proposePatchParameters,
  AgentToolRunState
>({
  name: "propose_project_patch",
  description:
    "Propose a complete new version of one file in an attached project. This is a review card, not a write: the owner sees a line diff and clicks Apply. Never claim a file changed before that click.",
  parameters: proposePatchParameters,
  execute: async (
    { project, path: filePath, content, summary },
    runContext?: RunContext<AgentToolRunState>,
  ) => {
    const state = runContext?.context ?? createAgentToolRunState();
    const target = await resolveByName(state.ownerId, project);
    if (!target.ok) return target.error;

    if (target.projectId === null) {
      return "This app's own repository is read-only. Attach the project you want to change from the Desk panel, then propose the patch to it.";
    }

    const rel = writableProjectPath(filePath);
    if (!rel) {
      return "That path can't be written: it must stay inside the project and can't be .env, .git, key material or a dependency folder.";
    }

    const next = String(content ?? "");
    if (next.includes("\u0000")) return "That content is not text.";
    if (next.length > PROJECT_PATCH_MAX_CHARS) {
      return `That file is larger than the patch limit (${Math.round(
        PROJECT_PATCH_MAX_CHARS / 1000,
      )}k characters). Change a smaller part at a time.`;
    }

    const current = await readProjectFile(target.root, rel);
    if (!current.ok && current.error !== "That file could not be read.") {
      return `Cannot patch that file: ${current.error}`;
    }
    if (current.ok && current.truncated) {
      return "That file is too large to patch in one go — change a smaller part of it.";
    }

    const before = current.ok ? current.content : "";
    if (before === next) return "That patch changes nothing. Send the file's real new contents.";

    const { additions, removals } = patchStats(before, next);

    state.projectPatches.push({
      id: randomUUID(),
      projectId: target.projectId,
      projectName: target.name,
      path: rel,
      summary: String(summary ?? "").trim().slice(0, 200) || `Update ${rel}`,
      before,
      after: next,
      beforeHash: hashContent(before),
      additions,
      removals,
      newFile: !current.ok,
    });

    return `Proposed a patch to ${target.name}/${rel} (+${additions} −${removals}). Nothing is written yet: the owner reviews the diff and clicks Apply.`;
  },
});

export const PROJECT_TOOLS: Tool<AgentToolRunState>[] = [
  listProjects,
  listProjectFiles,
  readProject,
  searchProject,
  proposeProjectPatch,
];

export const PROJECT_TOOL_LABELS: Record<string, string> = {
  list_projects: "Listing projects",
  list_project_files: "Listing project files",
  read_project_file: "Reading a project file",
  search_project: "Searching the project",
  propose_project_patch: "Preparing a patch for review",
};

/**
 * `read_project_file` and `search_project` are advertised in the system prompt
 * because they are how the agent answers from the code rather than memory.
 */
export const PROJECT_TOOL_SUMMARIES: { name: string; summary: string }[] = [
  {
    name: "list_projects",
    summary:
      'List the readable code projects (this app plus anything the owner attached). Call it before reading a project you have not seen this conversation.',
  },
  {
    name: "list_project_files",
    summary: "List one folder inside a project, so you can pick the file worth reading.",
  },
  {
    name: "read_project_file",
    summary:
      'Read one text file from a project (`project: "app"` for this workspace\'s own code). Secrets, .git and dependency folders are refused. Prefer it over guessing what the code does.',
  },
  {
    name: "search_project",
    summary:
      "Grep a project's text files for a literal string and get file:line matches. Use it to find where something is defined or used.",
  },
  {
    name: "propose_project_patch",
    summary:
      "Propose a complete new version of one file in an attached project. It becomes a review card with a line diff; nothing is written unless the owner clicks Apply, and never say a file changed before that.",
  },
];

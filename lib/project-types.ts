/**
 * Shapes for the read-only project pane of the `developer` template.
 *
 * Client-safe: the workbench renders exactly what the server returned, and the
 * implementation (filesystem + git) lives in `lib/project-files.ts`.
 */

export type ProjectEntry = {
  name: string;
  path: string;
  type: "dir" | "file";
};

export type ProjectTreeResult =
  | { ok: true; entries: ProjectEntry[]; path: string }
  | { ok: false; error: string };

export type ProjectFileResult =
  | {
      ok: true;
      path: string;
      content: string;
      lines: number;
      truncated: boolean;
      bytes: number;
      /**
       * SHA-256 of the file's full text, the value a reviewed write must match.
       * The workbench sends it back so a file that changed on disk is never
       * overwritten from the editor.
       */
      hash: string;
      /** `mtimeMs:size` when it was read, so an outside edit can be spotted. */
      stamp: string;
    }
  | { ok: false; error: string };

export type ProjectSearchMatch = { path: string; line: number; text: string };

export type ProjectSearchResult =
  | { ok: true; matches: ProjectSearchMatch[]; scanned: number; truncated: boolean }
  | { ok: false; error: string };

/** Every readable path, for the editor's quick open. */
export type ProjectFileListResult =
  | { ok: true; files: string[]; truncated: boolean }
  | { ok: false; error: string };

/** One file's difference from the last commit, for the editor's gutter. */
export type ProjectFileDiffResult =
  | {
      ok: true;
      state: "clean" | "modified" | "added" | "untracked";
      /** Line numbers that are new since HEAD, 1-based. */
      addedLines: number[];
      /** Lines a deletion happened before, 1-based. */
      modifiedLines: number[];
      /** An untracked file is all new, so the caller marks every line. */
      wholeFileAdded: boolean;
    }
  | { ok: false; error: string };

/** A cheap fingerprint of one file, for spotting an edit made outside the pane. */
export type ProjectFileStampResult = { ok: true; stamp: string } | { ok: false; error: string };

/** The file as the last commit has it; null when git has no committed copy. */
export type ProjectHeadFileResult =
  | { ok: true; content: string | null }
  | { ok: false; error: string };

/** A local commit of the paths the owner picked. */
export type ProjectCommitResult =
  | { ok: true; hash: string; files: number }
  | { ok: false; error: string };

export type ProjectChangesResult =
  | {
      ok: true;
      branch: string;
      commits: { hash: string; subject: string }[];
      /** `status` is the porcelain code; the flags say which side of it is set. */
      changes: {
        status: string;
        path: string;
        /** Part of the index — already staged. */
        staged: boolean;
        /** Differs from the index (or is untracked). */
        unstaged: boolean;
      }[];
      clean: boolean;
    }
  | { ok: false; error: string };

export type ProjectCommandResult = { ok: true; output: string } | { ok: false; output: string };

/** One package script running as a background process in its own project. */
export type ProjectScriptRun = {
  script: string;
  status: "running" | "exited";
  /** The exit code once it stopped, null while it runs. */
  exitCode: number | null;
  /** ISO string. */
  startedAt: string;
  /** Newest output lines, colours stripped and capped. */
  lines: string[];
};

/** A script either ran inline (read-only) or is now running in the background. */
export type ProjectScriptResult =
  | { ok: true; output: string; run: ProjectScriptRun | null }
  | { ok: false; output: string; run: ProjectScriptRun | null };

/** The state of the one background script this project may have. */
export type ProjectScriptStatusResult =
  | { ok: true; run: ProjectScriptRun | null }
  | { ok: false; error: string };

/** One file as the index has it: the staged copy, or null when it is not staged. */
export type ProjectIndexFileResult =
  | { ok: true; content: string | null }
  | { ok: false; error: string };

/** One file as one commit has it, both sides, so the pane can draw that commit. */
export type ProjectCommitFileResult =
  | { ok: true; before: string | null; after: string | null }
  | { ok: false; error: string };

/** One commit's subject and the files it touched. */
export type ProjectCommitViewResult =
  | { ok: true; hash: string; subject: string; files: { path: string; status: string }[] }
  | { ok: false; error: string };

/** One hunk of a file's unstaged diff, addressed by its `@@ … @@` header. */
export type ProjectHunk = {
  header: string;
  lines: { kind: "context" | "add" | "remove"; text: string }[];
};

export type ProjectHunkResult =
  | { ok: true; path: string; hunks: ProjectHunk[]; truncated: boolean }
  | { ok: false; error: string };

/** A push of the current branch, which never forces. */
export type ProjectPushResult =
  | { ok: true; branch: string; remote: string; hash: string }
  | { ok: false; error: string };

/** A fast-forward pull from the branch's upstream; `updated` counts new commits. */
export type ProjectPullResult =
  | { ok: true; branch: string; remote: string; hash: string; updated: number }
  | { ok: false; error: string };

/** Removing paths from the index changes no file, so success carries no path. */
export type ProjectStagingResult = { ok: true } | { ok: false; error: string };

/** One attached project, as the picker shows it. */
export type ProjectSummary = {
  id: number;
  name: string;
  kind: "repo" | "folder";
  /** Absolute path on this machine. */
  location: string;
  /** The https URL a repo was cloned from, null for a folder. */
  url: string | null;
  /** ISO string. */
  createdAt: string;
};

/**
 * One browser upload, sized for a real code base rather than a toy. Shared so
 * the dialog can filter before sending and the server enforces the same numbers.
 */
export const PROJECT_UPLOAD_LIMITS = {
  files: 4_000,
  /** Total across the folder. */
  bytes: 60 * 1024 * 1024,
  /** One file: bigger than this is not a source file worth uploading. */
  fileBytes: 4 * 1024 * 1024,
} as const;

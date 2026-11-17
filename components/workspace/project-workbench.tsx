"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  FileCode2,
  FileJson,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCompare,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import {
  applyProjectPatchAction,
  createProjectFileAction,
  createProjectFolderAction,
  deleteProjectFileAction,
  deleteProjectFolderAction,
  detachProjectAction,
  discardProjectHunkAction,
  listProjectFilesAction,
  listProjectTreeAction,
  projectChangesAction,
  projectCommitAction,
  projectCommitFileAction,
  projectCommitViewAction,
  projectFileDiffAction,
  projectFileStampAction,
  projectHeadFileAction,
  projectIndexFileAction,
  projectUnstagedHunksAction,
  pullProjectBranchAction,
  pushProjectBranchAction,
  readProjectFileAction,
  renameProjectFileAction,
  renameProjectFolderAction,
  runProjectCommandAction,
  runProjectScriptAction,
  projectScriptStatusAction,
  stopProjectScriptAction,
  dismissProjectScriptAction,
  searchProjectFilesAction,
  stageProjectHunkAction,
  stageProjectPathsAction,
  unstageProjectPathsAction,
} from "@/app/actions/project";
import { AttachProjectDialog } from "@/components/agents/attach-project-dialog";
import { useComposerIntent } from "@/components/agents/composer-intent";
import { Terminal } from "@/components/aui/pro/terminal";
import { CodeViewer, languageLabelFor } from "@/components/workspace/code-viewer";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { buildLineDiff } from "@/lib/project-patch";
import type {
  ProjectChangesResult,
  ProjectEntry,
  ProjectHunk,
  ProjectSummary,
} from "@/lib/project-types";
import { cn } from "@/lib/utils";

/**
 * The repository pane for the `developer` template, shaped like a code editor:
 * a project picker, a file tree, open-file tabs with their own drafts, a
 * breadcrumb for the active file, a caret/language status bar and ⌘P quick open
 * over every readable path.
 *
 * A tab keeps its own copy of what is on disk and its own draft, so switching
 * files never asks about unsaved typing and nothing is lost by reading around.
 * Closing a tab with a draft, switching project or removing the project asks
 * first. Typing is a draft only: it becomes a file through the reviewed,
 * hash-checked write the agent also uses, so a stale copy can never overwrite
 * newer work on disk.
 *
 * A file edited somewhere else is spotted by comparing a cheap `mtime:size`
 * fingerprint: a clean tab reloads itself, a tab with a draft is only flagged so
 * the owner chooses which copy to keep. Files can also be created, renamed and
 * deleted from the tree or the tab, each through an explicit confirmation, and
 * the editor can show the whole file against HEAD next to the gutter marks.
 *
 * Every read is owner-checked on the server and scoped to the selected project's
 * root; there is no general shell.
 */

const STORAGE_KEY = "alcatraz-project";

type OpenDirs = Record<string, ProjectEntry[] | "loading" | "error">;

type OpenTab = {
  path: string;
  /** What is on disk now — the base a draft is compared against. */
  content: string;
  lines: number;
  truncated: boolean;
  hash: string;
  /** `mtimeMs:size` when the tab last read or wrote the file. */
  stamp: string;
  /** The typed copy; null when the tab matches disk. */
  draft: string | null;
  /** The file changed on disk while this tab held a draft. */
  stale: boolean;
};

type PendingSwitch = { label: string; files: string[]; run: () => void };

/** What a project remembers about the last visit: its tabs, file and carets. */
type SavedSession = { tabs: string[]; active: string | null; carets: Record<string, number> };

/** A session reopens the last few tabs, not forty. */
const MAX_RESTORED_TABS = 8;

/** Labels for the one form that creates and renames files and folders. */
const FILE_OP_TEXT: Record<
  "create" | "folder" | "rename" | "rename-folder",
  { title: string; placeholder: string; submit: string; aria: string }
> = {
  create: {
    title: "New file",
    placeholder: "src/new-file.ts",
    submit: "Create file",
    aria: "Path for the new file",
  },
  folder: {
    title: "New folder",
    placeholder: "src/components",
    submit: "Create folder",
    aria: "Path for the new folder",
  },
  rename: {
    title: "Rename file",
    placeholder: "src/renamed.ts",
    submit: "Rename",
    aria: "New path for this file",
  },
  "rename-folder": {
    title: "Rename folder",
    placeholder: "src/renamed",
    submit: "Rename",
    aria: "New path for this folder",
  },
};

function sessionKey(projectId: number | null): string {
  return `alcatraz-ide:${projectId === null ? "app" : projectId}`;
}

/** The stored session, or null when there is none (or storage is unavailable). */
function readSession(projectId: number | null): SavedSession | null {
  try {
    const raw = window.localStorage.getItem(sessionKey(projectId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (!Array.isArray(parsed.tabs)) return null;

    const carets: Record<string, number> = {};
    if (parsed.carets && typeof parsed.carets === "object") {
      for (const [key, value] of Object.entries(parsed.carets)) {
        if (typeof value === "number" && Number.isFinite(value)) carets[key] = value;
      }
    }

    return {
      tabs: parsed.tabs.filter((entry): entry is string => typeof entry === "string"),
      active: typeof parsed.active === "string" ? parsed.active : null,
      carets,
    };
  } catch {
    return null;
  }
}

function shortName(name: string): string {
  return name.split("/").filter(Boolean).pop() ?? name;
}

/** The folder part shown beside a name in quick open. */
function folderOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

const CODE_FILE =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|css|scss|less|html|py|go|rs|sql|vue|svelte|sh)$/i;
const DATA_FILE = /\.(json|jsonc|yaml|yml|toml|md|mdx)$/i;

/** A file's mark in a tab, the tree and quick open. */
function TabIcon({ path }: { path: string }) {
  if (DATA_FILE.test(path)) {
    return <FileJson className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />;
  }
  if (CODE_FILE.test(path)) {
    return <FileCode2 className="size-3 shrink-0 text-brand-ink" />;
  }
  return <FileText className="size-3 shrink-0 text-muted-foreground" />;
}

export function ProjectWorkbench({
  tab,
  projects,
  onRequestTab,
}: {
  tab: string;
  projects: ProjectSummary[];
  /** The pane's tab lives in the parent; opening a file switches it to Files. */
  onRequestTab?: (tab: string) => void;
}) {
  const router = useRouter();
  const composer = useComposerIntent();
  const [list, setList] = useState<ProjectSummary[]>(projects);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [root, setRoot] = useState<ProjectEntry[] | null>(null);
  const [dirs, setDirs] = useState<OpenDirs>({});
  const [openDirs, setOpenDirs] = useState<string[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{
    path: string;
    line: number;
    column: number;
    selected: number;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [changes, setChanges] = useState<ProjectChangesResult | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [history, setHistory] = useState<{ command: string; output: string; ok: boolean }[]>([]);
  const [running, setRunning] = useState(false);
  /** The one background script this project may have, and its output. */
  const [scriptRun, setScriptRun] = useState<
    Awaited<ReturnType<typeof runProjectScriptAction>>["run"]
  >(null);
  const [stoppingScript, setStoppingScript] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [confirmDetach, setConfirmDetach] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    matches: { path: string; line: number; text: string }[];
    truncated: boolean;
  } | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // Quick open: the whole project's paths, fetched once per project.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteFiles, setPaletteFiles] = useState<string[] | null>(null);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [paletteIndex, setPaletteIndex] = useState(0);
  /** Text matches for the quick-open query, loaded after a short pause. */
  const [paletteHits, setPaletteHits] = useState<
    { path: string; line: number; text: string }[] | null
  >(null);
  /** Something that would drop drafts; confirmed in the banner. */
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  /** A create/rename form, and the confirmed delete of the active file. */
  const [fileOp, setFileOp] = useState<null | {
    kind: "create" | "folder" | "rename" | "rename-folder";
    value: string;
    /** The file a rename started from (a tree row or the active tab). */
    path?: string;
  }>(null);
  const [fileOpError, setFileOpError] = useState<string | null>(null);
  const [fileOpBusy, setFileOpBusy] = useState(false);
  const [deletePath, setDeletePath] = useState<null | {
    path: string;
    kind: "file" | "folder";
  }>(null);
  /** The path a stage/unstage is working on. */
  const [indexBusy, setIndexBusy] = useState<string | null>(null);
  /** The unstaged hunks of the active file, and the header being staged. */
  const [hunks, setHunks] = useState<{ path: string; hunks: ProjectHunk[] } | null>(null);
  const [hunkBusy, setHunkBusy] = useState<string | null>(null);
  const [hunksError, setHunksError] = useState<string | null>(null);
  /** The hunk whose change a second click would throw away. */
  const [discardConfirm, setDiscardConfirm] = useState<string | null>(null);
  /** Wide panes put the explorer beside the editor; narrow ones stack them. */
  const [splitPane, setSplitPane] = useState(false);
  const filesRef = useRef<HTMLDivElement | null>(null);
  /** The explorer's scroll box, so leaving a file keeps your place. */
  const explorerRef = useRef<HTMLDivElement | null>(null);
  const explorerScrollRef = useRef(0);
  /** Files closed recently, newest first; ⌘⇧T reopens one. */
  const [closedTabs, setClosedTabs] = useState<string[]>([]);
  /** Show only what the last commit did not capture. */
  const [changedOnly, setChangedOnly] = useState(false);
  /** The committed copy, and whether the full HEAD diff is open. */
  const [headContent, setHeadContent] = useState<{ path: string; content: string | null } | null>(
    null,
  );
  const [indexContent, setIndexContent] = useState<{ path: string; content: string | null } | null>(
    null,
  );
  /** Which copy the full diff compares HEAD against. */
  const [diffTarget, setDiffTarget] = useState<"editor" | "staged" | "unstaged">("editor");
  const [diffOpen, setDiffOpen] = useState(false);
  /** A path whose diff should open once it is the active tab. */
  const [pendingDiff, setPendingDiff] = useState<string | null>(null);
  /** Amend the last commit instead of adding one. */
  const [commitAmend, setCommitAmend] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitNote, setCommitNote] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullNote, setPullNote] = useState<string | null>(null);
  /** A recent commit opened for review, and one of its files. */
  const [commitView, setCommitView] = useState<{
    hash: string;
    subject: string;
    files: { path: string; status: string }[];
  } | null>(null);
  const [commitViewBusy, setCommitViewBusy] = useState<string | null>(null);
  const [commitViewError, setCommitViewError] = useState<string | null>(null);
  const [commitFile, setCommitFile] = useState<{
    path: string;
    before: string | null;
    after: string | null;
  } | null>(null);
  const [commitFileBusy, setCommitFileBusy] = useState(false);
  /** The commit file shown in the full diff panel. */
  const [diffCommit, setDiffCommit] = useState<{ hash: string; path: string } | null>(null);
  /** Lines of the active file that differ from the last commit. */
  const [marks, setMarks] = useState<{
    path: string;
    added: number[];
    modified: number[];
  } | null>(null);
  const [marksVersion, setMarksVersion] = useState(0);
  /** False while a project's saved tabs are still loading, so they aren't erased. */
  const [sessionReady, setSessionReady] = useState(false);
  const projectIdRef = useRef<number | null>(null);
  /** Caret per open file, so switching tabs returns you to your line. */
  const caretRef = useRef<Record<string, number>>({});
  /** The newest tabs and active file, for the disk-change poll. */
  const tabsRef = useRef<OpenTab[]>([]);
  const activePathRef = useRef<string | null>(null);
  const checkingRef = useRef(false);

  projectIdRef.current = projectId;
  tabsRef.current = tabs;
  activePathRef.current = activePath;

  const active = tabs.find((entry) => entry.path === activePath) ?? null;
  const dirtyTabs = tabs.filter((entry) => entry.draft !== null && entry.draft !== entry.content);
  const dirty = Boolean(active && active.draft !== null && active.draft !== active.content);

  useEffect(() => setList(projects), [projects]);

  // While a script runs, poll its output. One poller per run, and only while
  // the terminal is the visible tab.
  useEffect(() => {
    if (tab !== "terminal" || scriptRun?.status !== "running") return;

    const timer = window.setInterval(() => {
      void projectScriptStatusAction(projectIdRef.current)
        .then((result) => {
          if (result.ok) setScriptRun(result.run);
        })
        .catch(() => {
          // A failed poll keeps the output already on screen.
        });
    }, 2_000);

    return () => window.clearInterval(timer);
  }, [tab, scriptRun?.status, scriptRun?.startedAt]);

  // Quick open searches text too: a path match alone misses a symbol.
  useEffect(() => {
    if (!paletteOpen) return;
    const query = paletteQuery.trim();
    if (query.length < 3) {
      setPaletteHits(null);
      return;
    }

    let live = true;
    const timer = window.setTimeout(() => {
      void searchProjectFilesAction(projectIdRef.current, query)
        .then((result) => {
          if (live) setPaletteHits(result.ok ? result.matches.slice(0, 12) : []);
        })
        .catch(() => {
          if (live) setPaletteHits([]);
        });
    }, 350);

    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [paletteOpen, paletteQuery]);

  // Returning from a file restores the explorer's scroll position, so the
  // narrow layout never sends you back to the top of a long tree.
  useEffect(() => {
    if (!treeOpen) return;
    const node = explorerRef.current;
    if (node) node.scrollTop = explorerScrollRef.current;
  }, [treeOpen]);

  // Remember the project this workspace was last reading. When nothing valid is
  // stored — a freshly attached folder or clone — read the first one, so the
  // tree is already open the moment the attach dialog closes.
  useEffect(() => {
    if (projects.length === 0) {
      setProjectId(null);
      return;
    }

    setProjectId((current) => {
      if (current !== null && projects.some((entry) => entry.id === current)) return current;
      const stored = Number(window.localStorage.getItem(STORAGE_KEY) ?? "");
      if (Number.isInteger(stored) && projects.some((entry) => entry.id === stored)) return stored;
      return projects[0].id;
    });
  }, [projects]);

  const loadDir = useCallback(async (path: string) => {
    const id = projectIdRef.current;
    setDirs((current) => ({ ...current, [path]: "loading" }));
    try {
      const result = await listProjectTreeAction(id, path);
      setDirs((current) => ({
        ...current,
        [path]: result.ok ? result.entries : "error",
      }));
      if (!result.ok) setTreeError(result.error);
      return result;
    } catch {
      setDirs((current) => ({ ...current, [path]: "error" }));
      setTreeError("Sign in again to read the project.");
      return null;
    }
  }, []);

  // A new project resets everything that belonged to the old one, tabs included.
  useEffect(() => {
    let live = true;
    setRoot(null);
    setDirs({});
    setOpenDirs([]);
    setTabs([]);
    setActivePath(null);
    setCursor(null);
    caretRef.current = {};
    setScriptRun(null);
    setFileError(null);
    setChanges(null);
    setHistory([]);
    setConfirmDetach(false);
    setReviewOpen(false);
    setSaveError(null);
    setSearchResult(null);
    setSearchError(null);
    setTreeOpen(true);
    setSavedNote(null);
    setPendingSwitch(null);
    setHunks(null);
    setHunkBusy(null);
    setHunksError(null);
    setCommitView(null);
    setCommitViewBusy(null);
    setCommitViewError(null);
    setCommitFile(null);
    setCommitFileBusy(false);
    setPushNote(null);
    setPushError(null);
    setPulling(false);
    setPullNote(null);
    setPullError(null);
    setDiscardConfirm(null);
    setDiffCommit(null);
    setClosedTabs([]);
    setChangedOnly(false);
    setPaletteOpen(false);
    setPaletteFiles(null);
    setPaletteError(null);
    setFileOp(null);
    setFileOpError(null);
    setFileOpBusy(false);
    setDeletePath(null);
    setMarks(null);
    setSessionReady(false);
    setDiffOpen(false);
    setHeadContent(null);
    setPendingDiff(null);
    setCommitAmend(false);
    setCommitMessage("");
    setCommitError(null);
    setCommitNote(null);
    setCommitting(false);

    if (projectId !== null) {
      window.localStorage.setItem(STORAGE_KEY, String(projectId));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    void (async () => {
      try {
        const result = await listProjectTreeAction(projectId, "");
        if (!live) return;
        if (result.ok) {
          setRoot(result.entries);
          setTreeError(null);
        } else {
          setTreeError(result.error);
        }
      } catch {
        if (live) setTreeError("Sign in again to read the project.");
      }

      // Reopen the tabs this project was left with, with their carets.
      const saved = readSession(projectId);
      if (live && saved) {
        const opened: OpenTab[] = [];

        for (const savedPath of saved.tabs.slice(0, MAX_RESTORED_TABS)) {
          const file = await readProjectFileAction(projectId, savedPath);
          if (!live) return;
          if (!file.ok) continue; // gone from disk since the last visit

          opened.push({
            path: file.path,
            content: file.content,
            lines: file.lines,
            truncated: file.truncated,
            hash: file.hash,
            stamp: file.stamp,
            draft: null,
            stale: false,
          });

          const caret = saved.carets[savedPath];
          if (typeof caret === "number") caretRef.current[file.path] = caret;
        }

        if (!live) return;
        setTabs(opened);
        const wanted =
          saved.active && opened.some((entry) => entry.path === saved.active)
            ? saved.active
            : (opened[0]?.path ?? null);
        setActivePath(wanted);
        setTreeOpen(!wanted);
      }

      if (live) setSessionReady(true);
    })();

    return () => {
      live = false;
    };
  }, [projectId]);

  // A reload or a closed tab would drop every draft; the browser asks first.
  useEffect(() => {
    if (dirtyTabs.length === 0) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyTabs.length]);

  // Remember this project's tabs, active file and carets. Nothing is written
  // until the saved session has finished restoring, so an empty first render
  // can never erase what was stored.
  useEffect(() => {
    if (!sessionReady) return;

    const timer = window.setTimeout(() => {
      try {
        const key = sessionKey(projectId);
        if (tabs.length === 0 && !activePath) {
          window.localStorage.removeItem(key);
          return;
        }
        window.localStorage.setItem(
          key,
          JSON.stringify({
            tabs: tabs.map((entry) => entry.path).slice(0, MAX_RESTORED_TABS),
            active: activePath,
            carets: caretRef.current,
          }),
        );
      } catch {
        // Private mode or a full quota: the session simply isn't remembered.
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [tabs, activePath, projectId, sessionReady]);

  // Which lines of the active file differ from the last commit.
  useEffect(() => {
    if (!activePath) {
      setMarks(null);
      return;
    }

    let live = true;
    const path = activePath;
    const lineCount = Math.max(active?.lines ?? 0, 1);

    void projectFileDiffAction(projectIdRef.current, path)
      .then((result) => {
        if (!live) return;
        if (!result.ok) {
          setMarks(null);
          return;
        }
        setMarks({
          path,
          added: result.wholeFileAdded
            ? Array.from({ length: lineCount }, (_, index) => index + 1)
            : result.addedLines,
          modified: result.modifiedLines,
        });
      })
      .catch(() => {
        if (live) setMarks(null);
      });

    return () => {
      live = false;
    };
  }, [activePath, active?.lines, marksVersion]);

  // A different file gets a clean review state; drafts belong to their tab.
  useEffect(() => {
    setReviewOpen(false);
    setSaveError(null);
    setSavedNote(null);
    setDiffOpen(false);
    setHeadContent(null);
    setIndexContent(null);
    setDiffTarget("editor");
  }, [activePath]);

  // A diff asked for from the Changes list opens once that file is active.
  useEffect(() => {
    if (!pendingDiff || activePath !== pendingDiff) return;
    setPendingDiff(null);
    void openHeadDiff(pendingDiff);
    // `openHeadDiff` only reads refs and setters, so the path and tab are enough.
  }, [pendingDiff, activePath]);

  /**
   * Compares every open tab with disk. A clean tab reloads in place; a tab with
   * a draft is only flagged, because its draft is based on the older copy.
   */
  async function checkTabsForChanges() {
    if (checkingRef.current) return;
    const current = tabsRef.current;
    if (current.length === 0) return;

    checkingRef.current = true;
    try {
      for (const entry of current) {
        const stamp = await projectFileStampAction(projectIdRef.current, entry.path);
        if (!stamp.ok || stamp.stamp === entry.stamp) continue;

        const live = tabsRef.current.find((tab) => tab.path === entry.path);
        if (!live) continue;

        if (live.draft !== null && live.draft !== live.content) {
          setTabs((list) =>
            list.map((tab) => (tab.path === entry.path ? { ...tab, stale: true } : tab)),
          );
          continue;
        }

        const fresh = await readProjectFileAction(projectIdRef.current, entry.path);
        if (!fresh.ok) continue;

        setTabs((list) =>
          list.map((tab) =>
            tab.path === entry.path
              ? {
                  ...tab,
                  content: fresh.content,
                  lines: fresh.lines,
                  truncated: fresh.truncated,
                  hash: fresh.hash,
                  stamp: fresh.stamp,
                  stale: false,
                }
              : tab,
          ),
        );
        setMarksVersion((version) => version + 1);
        if (entry.path === activePathRef.current) {
          setSavedNote("Reloaded from disk — this file changed outside the editor.");
        }
      }
    } catch {
      // A poll that fails is not news; the next one tries again.
    } finally {
      checkingRef.current = false;
    }
  }

  // Poll while the pane is visible, plus whenever the window regains focus.
  useEffect(() => {
    if (tabs.length === 0) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void checkTabsForChanges();
    };

    const timer = window.setInterval(tick, 15_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [tabs.length]);

  const loadChanges = useCallback(async () => {
    setLoadingChanges(true);
    try {
      const result = await projectChangesAction(projectIdRef.current);
      setChanges(result);
      if (result.ok) setCommitError(null);
    } catch {
      setChanges({ ok: false, error: "Sign in again to read the working tree." });
    } finally {
      setLoadingChanges(false);
    }
  }, []);

  useEffect(() => {
    // The explorer draws its git marks from the same change set, so the file
    // view needs it too — otherwise a first visit shows an undecorated tree.
    if ((tab === "changes" || tab === "files") && !changes && !loadingChanges) void loadChanges();
  }, [tab, changes, loadingChanges, loadChanges]);

  async function toggleDir(path: string) {
    if (openDirs.includes(path)) {
      setOpenDirs((current) => current.filter((entry) => entry !== path));
      return;
    }
    setOpenDirs((current) => [...current, path]);
    if (!dirs[path] || dirs[path] === "error") await loadDir(path);
  }

  /**
   * Opens a file in a tab. An already-open tab is brought forward with its
   * draft intact instead of being re-read from disk.
   */
  async function openFile(path: string) {
    onRequestTab?.("files");
    setFileError(null);

    const existing = tabs.find((entry) => entry.path === path);
    if (existing) {
      explorerScrollRef.current = explorerRef.current?.scrollTop ?? explorerScrollRef.current;
      setActivePath(path);
      setTreeOpen(false);
      return;
    }

    setLoadingFile(true);
    try {
      const result = await readProjectFileAction(projectIdRef.current, path);
      if (!result.ok) {
        setFileError(result.error);
        return;
      }
      setTabs((current) =>
        current.some((entry) => entry.path === result.path)
          ? current
          : [
              ...current,
              {
                path: result.path,
                content: result.content,
                lines: result.lines,
                truncated: result.truncated,
                hash: result.hash,
                stamp: result.stamp,
                draft: null,
                stale: false,
              },
            ],
      );
      explorerScrollRef.current = explorerRef.current?.scrollTop ?? explorerScrollRef.current;
      setActivePath(result.path);
      setTreeOpen(false);
    } catch {
      setFileError("Sign in again to open that file.");
    } finally {
      setLoadingFile(false);
    }
  }

  /** Closes a tab, asking first when that tab holds typing. */
  function closeTab(path: string) {
    // Remember it before it goes, so ⌘⇧T can bring it back.
    setClosedTabs((current) => [path, ...current.filter((item) => item !== path)].slice(0, 12));

    const entry = tabs.find((candidate) => candidate.path === path);
    const unsaved = entry && entry.draft !== null && entry.draft !== entry.content;

    if (unsaved) {
      setPendingSwitch({ label: `Closing ${path}`, files: [path], run: () => dropTab(path) });
      return;
    }
    dropTab(path);
  }

  /** Reopens the file closed most recently; the editor's ⌘⇧T. */
  async function reopenTab() {
    const path = closedTabs[0];
    if (!path) return;

    setClosedTabs((current) => current.slice(1));
    await openFile(path);
  }

  function dropTab(path: string) {
    const index = tabs.findIndex((entry) => entry.path === path);
    const next = tabs.filter((entry) => entry.path !== path);
    setTabs(next);
    delete caretRef.current[path];
    setPendingSwitch(null);

    if (activePath !== path) return;
    const fallback = next[Math.min(index, next.length - 1)] ?? null;
    setActivePath(fallback ? fallback.path : null);
    setTreeOpen(!fallback);
  }

  function updateDraft(path: string, next: string) {
    setTabs((current) =>
      current.map((entry) => (entry.path === path ? { ...entry, draft: next } : entry)),
    );
  }

  /** Back to the file on disk, leaving editing mode. */
  function clearDraft(path: string) {
    setTabs((current) =>
      current.map((entry) => (entry.path === path ? { ...entry, draft: null } : entry)),
    );
  }

  /** Creates an empty file, then opens it so its content is written via review. */
  /** One submit path for the create/rename form, whichever kind it is. */
  function submitFileOp() {
    if (!fileOp) return;
    if (fileOp.kind === "create") void createFile(fileOp.value);
    else if (fileOp.kind === "folder") void createFolder(fileOp.value);
    else if (fileOp.kind === "rename") {
      void renameFile(fileOp.path ?? active?.path ?? "", fileOp.value);
    } else {
      void renameFolder(fileOp.path ?? "", fileOp.value);
    }
  }

  async function createFolder(rawPath: string) {
    const rel = rawPath.trim();
    if (projectId === null || fileOpBusy) return;
    if (!rel) {
      setFileOpError("Give the folder a path, like src/components.");
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await createProjectFolderAction(projectId, rel);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setFileOp(null);
      await reloadTree();
    } catch {
      setFileOpError("We couldn't create that folder.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /** Renames a folder and every open tab underneath it. */
  async function renameFolder(from: string, rawPath: string) {
    const to = rawPath.trim();
    if (projectId === null || !from || fileOpBusy) return;

    const insideDirty = tabs.some(
      (entry) =>
        (entry.path === from || entry.path.startsWith(`${from}/`)) &&
        entry.draft !== null &&
        entry.draft !== entry.content,
    );
    if (insideDirty) {
      setFileOpError("Save or cancel your drafts inside this folder before renaming it.");
      return;
    }
    if (!to || to === from) {
      setFileOp(null);
      setFileOpError(null);
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await renameProjectFolderAction(projectId, from, to);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setFileOp(null);

      const remap = (path: string) =>
        path === from || path.startsWith(`${from}/`)
          ? `${result.path}${path.slice(from.length)}`
          : path;

      setTabs((current) => current.map((entry) => ({ ...entry, path: remap(entry.path) })));
      const nextCarets: Record<string, number> = {};
      for (const [path, caret] of Object.entries(caretRef.current)) {
        nextCarets[remap(path)] = caret;
      }
      caretRef.current = nextCarets;
      if (activePath) setActivePath(remap(activePath));

      await reloadTree();
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setFileOpError("We couldn't rename that folder.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /** Commits exactly what is staged, or amends the last commit with it. */
  async function commitStaged() {
    if (projectId === null || committing) return;
    const message = commitMessage.trim();
    if (!message) {
      setCommitError("Write a commit message first.");
      return;
    }

    setCommitting(true);
    setCommitError(null);
    setCommitNote(null);
    try {
      const result = await projectCommitAction(projectId, message, commitAmend);
      if (!result.ok) {
        setCommitError(result.error);
        return;
      }
      setCommitNote(
        `${commitAmend ? "Amended" : "Committed"} ${result.hash} · ${result.files} file${
          result.files === 1 ? "" : "s"
        }. Nothing was pushed.`,
      );
      setCommitMessage("");
      setCommitAmend(false);
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setCommitError("We couldn't commit those files.");
    } finally {
      setCommitting(false);
    }
  }

  async function createFile(rawPath: string) {
    const rel = rawPath.trim();
    if (projectId === null || fileOpBusy) return;
    if (!rel) {
      setFileOpError("Give the new file a path, like src/new-file.ts.");
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await createProjectFileAction(projectId, rel);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setFileOp(null);
      await reloadTree();
      await openFile(result.path);
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setFileOpError("We couldn't create that file.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /** Renames one file, from a tree row or from the active tab. */
  async function renameFile(from: string, rawPath: string) {
    const to = rawPath.trim();
    if (projectId === null || !from || fileOpBusy) return;

    const source = tabs.find((entry) => entry.path === from);
    if (source && source.draft !== null && source.draft !== source.content) {
      setFileOpError("Save or cancel your draft before renaming the file.");
      return;
    }
    if (!to || to === from) {
      setFileOp(null);
      setFileOpError(null);
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await renameProjectFileAction(projectId, from, to);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setFileOp(null);
      setTabs((current) =>
        current.map((entry) =>
          entry.path === from
            ? { ...entry, path: result.path, draft: null, stale: false }
            : entry,
        ),
      );
      const caret = caretRef.current[from];
      if (typeof caret === "number") caretRef.current[result.path] = caret;
      delete caretRef.current[from];
      if (activePath === from) setActivePath(result.path);
      await reloadTree();
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setFileOpError("We couldn't rename that file.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /** Removes one file, from a tree row or from the active tab. */
  async function deleteFile(path: string) {
    if (projectId === null || !path || fileOpBusy) return;

    const source = tabs.find((entry) => entry.path === path);
    if (source && source.draft !== null && source.draft !== source.content) {
      setDeletePath(null);
      setFileOpError("Save or cancel your draft before removing the file.");
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await deleteProjectFileAction(projectId, path);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setDeletePath(null);
      dropTab(path);
      await reloadTree();
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setFileOpError("We couldn't remove that file.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /**
   * Removes a folder and everything inside it.
   *
   * The server refuses a folder holding a nested repository, environment file or
   * dependency folder, and caps the size; here we additionally refuse while a
   * draft sits anywhere underneath, so typing is never thrown away by a click.
   */
  async function deleteFolder(path: string) {
    if (projectId === null || !path || fileOpBusy) return;

    const insideDirty = tabs.some(
      (entry) =>
        (entry.path === path || entry.path.startsWith(`${path}/`)) &&
        entry.draft !== null &&
        entry.draft !== entry.content,
    );
    if (insideDirty) {
      setDeletePath(null);
      setFileOpError("Save or cancel your drafts inside this folder before removing it.");
      return;
    }

    setFileOpBusy(true);
    setFileOpError(null);
    try {
      const result = await deleteProjectFolderAction(projectId, path);
      if (!result.ok) {
        setFileOpError(result.error);
        return;
      }
      setDeletePath(null);

      setTabs((current) =>
        current.filter((entry) => entry.path !== path && !entry.path.startsWith(`${path}/`)),
      );
      const nextCarets: Record<string, number> = {};
      for (const [key, caret] of Object.entries(caretRef.current)) {
        if (key !== path && !key.startsWith(`${path}/`)) nextCarets[key] = caret;
      }
      caretRef.current = nextCarets;
      if (activePath === path || activePath?.startsWith(`${path}/`)) setActivePath(null);

      await reloadTree();
      await loadChanges();
      setMarksVersion((version) => version + 1);
    } catch {
      setFileOpError("We couldn't remove that folder.");
    } finally {
      setFileOpBusy(false);
    }
  }

  /** Adds one path to the index without touching the file. */
  async function stagePath(path: string) {
    if (projectId === null || indexBusy) return;
    setIndexBusy(path);
    setCommitError(null);
    setCommitNote(null);
    try {
      const result = await stageProjectPathsAction(projectId, [path]);
      if (!result.ok) {
        setCommitError(result.error);
        return;
      }
      await loadChanges();
    } catch {
      setCommitError("We couldn't stage that file.");
    } finally {
      setIndexBusy(null);
    }
  }

  /** Takes one path out of the index without touching the file. */
  async function unstagePath(path: string) {
    if (projectId === null || indexBusy) return;
    setIndexBusy(path);
    setCommitError(null);
    setCommitNote(null);
    try {
      const result = await unstageProjectPathsAction(projectId, [path]);
      if (!result.ok) {
        setCommitError(result.error);
        return;
      }
      await loadChanges();
    } catch {
      setCommitError("We couldn't unstage that file.");
    } finally {
      setIndexBusy(null);
    }
  }

  /** Replaces a stale tab with what is on disk now, dropping its draft. */
  async function reloadStale(path: string) {
    const fresh = await readProjectFileAction(projectIdRef.current, path);
    if (!fresh.ok) {
      setFileOpError(fresh.error);
      return;
    }

    setTabs((current) =>
      current.map((entry) =>
        entry.path === path
          ? {
              ...entry,
              content: fresh.content,
              lines: fresh.lines,
              truncated: fresh.truncated,
              hash: fresh.hash,
              stamp: fresh.stamp,
              draft: null,
              stale: false,
            }
          : entry,
      ),
    );
    setMarksVersion((version) => version + 1);
  }

  /** Fast-forwards from upstream; never merges and never rebases. */
  async function pullBranch() {
    if (projectId === null || pulling) return;
    setPulling(true);
    setPullError(null);
    setPullNote(null);
    try {
      const result = await pullProjectBranchAction(projectId);
      if (!result.ok) {
        setPullError(result.error);
        return;
      }
      setPullNote(
        result.updated === 0
          ? `Already up to date on ${result.branch} · ${result.hash}.`
          : `Pulled ${result.updated} ${
              result.updated === 1 ? "commit" : "commits"
            } into ${result.branch} · ${result.hash}.`,
      );
      // The committed copy, the index and the hunks all moved under us.
      setHeadContent(null);
      setIndexContent(null);
      setHunks(null);
      setMarksVersion((version) => version + 1);
      await loadChanges();
    } catch {
      setPullError("We couldn't pull this branch.");
    } finally {
      setPulling(false);
    }
  }

  /** Throws one hunk away after a second click on the same hunk. */
  async function discardHunk(header: string) {
    const path = active?.path;
    if (!path || projectId === null || hunkBusy) return;

    if (discardConfirm !== header) {
      setDiscardConfirm(header);
      return;
    }

    setDiscardConfirm(null);
    setHunkBusy(header);
    setHunksError(null);
    try {
      const result = await discardProjectHunkAction(projectId, path, header);
      if (!result.ok) {
        setHunksError(result.error);
        return;
      }

      setHunks(null);
      setMarksVersion((version) => version + 1);
      await loadChanges();

      // The file on disk changed: re-read it, or warn when a draft is in the way.
      const open = tabsRef.current.find((entry) => entry.path === path);
      if (open && open.draft !== null && open.draft !== open.content) {
        setTabs((current) =>
          current.map((entry) => (entry.path === path ? { ...entry, stale: true } : entry)),
        );
      } else {
        await reloadStale(path);
      }
    } catch {
      setHunksError("That hunk could not be discarded.");
    } finally {
      setHunkBusy(null);
    }
  }

  /** Pushes the branch; never forces, and never while the tree is dirty. */
  async function pushBranch() {
    if (projectId === null || pushing) return;
    setPushing(true);
    setPushError(null);
    setPushNote(null);
    try {
      const result = await pushProjectBranchAction(projectId);
      if (!result.ok) {
        setPushError(result.error);
        return;
      }
      setPushNote(`Pushed ${result.branch} to ${result.remote} · ${result.hash}.`);
    } catch {
      setPushError("We couldn't push this branch.");
    } finally {
      setPushing(false);
    }
  }

  /** Opens one recent commit, or closes it when it is already open. */
  async function openCommit(hash: string) {
    setCommitViewError(null);
    setCommitFile(null);
    setDiffCommit(null);

    if (commitView?.hash === hash) {
      setCommitView(null);
      return;
    }

    setCommitViewBusy(hash);
    try {
      const result = await projectCommitViewAction(projectIdRef.current, hash);
      if (!result.ok) {
        setCommitViewError(result.error);
        setCommitView(null);
        return;
      }
      setCommitView({ hash: result.hash, subject: result.subject, files: result.files });
    } catch {
      setCommitViewError("That commit could not be read.");
    } finally {
      setCommitViewBusy(null);
    }
  }

  /** Loads both sides of one file at one commit. */
  async function openCommitFile(hash: string, path: string) {
    setCommitFileBusy(true);
    setCommitViewError(null);
    try {
      const result = await projectCommitFileAction(projectIdRef.current, hash, path);
      if (!result.ok) {
        setCommitViewError(result.error);
        return;
      }
      setCommitFile({ path, before: result.before, after: result.after });
      // The commit's own diff opens in the full panel, which lives in the file
      // view, so the pane has to switch before the panel would be visible.
      setDiffCommit({ hash, path });
      setDiffOpen(true);
      onRequestTab?.("files");
    } catch {
      setCommitViewError("That file's version at this commit could not be read.");
    } finally {
      setCommitFileBusy(false);
    }
  }

  /** Stages one hunk, then re-reads the index, the marks and the tree. */
  async function stageHunk(header: string) {
    const path = active?.path;
    if (!path || projectId === null || hunkBusy) return;

    setHunkBusy(header);
    setHunksError(null);
    try {
      const result = await stageProjectHunkAction(projectId, path, header);
      if (!result.ok) {
        setHunksError(result.error);
        return;
      }
      setHunks(null);
      setIndexContent(null);
      setMarksVersion((version) => version + 1);
      await loadChanges();
    } catch {
      setHunksError("That hunk could not be staged.");
    } finally {
      setHunkBusy(null);
    }
  }

  /** Opens a file and its HEAD diff together, from the Changes list. */
  function openDiffFor(path: string, target: "editor" | "staged" = "editor") {
    setDiffCommit(null);
    setDiffTarget(target);
    setPendingDiff(path);
    void openFile(path);
  }

  // The staged copy is fetched only when HEAD → staged is what is on screen.
  useEffect(() => {
    const path = active?.path;
    if (!diffOpen || diffTarget !== "staged" || !path) return;
    if (indexContent?.path === path) return;

    let cancelled = false;
    void (async () => {
      const result = await projectIndexFileAction(projectIdRef.current, path);
      if (cancelled) return;
      setIndexContent({ path, content: result.ok ? result.content : null });
    })();
    return () => {
      cancelled = true;
    };
  }, [diffOpen, diffTarget, active?.path, indexContent]);

  // The unstaged hunks are read only while the index → editor view is open.
  useEffect(() => {
    const path = active?.path;
    if (!diffOpen || diffTarget !== "unstaged" || !path) return;
    if (hunks?.path === path) return;

    let cancelled = false;
    setHunksError(null);
    void (async () => {
      const result = await projectUnstagedHunksAction(projectIdRef.current, path);
      if (cancelled) return;
      if (!result.ok) {
        setHunksError(result.error);
        setHunks({ path, hunks: [] });
        return;
      }
      setHunks({ path, hunks: result.hunks });
    })();
    return () => {
      cancelled = true;
    };
  }, [diffOpen, diffTarget, active?.path, hunks]);

  /** Loads the committed copy and opens the full diff against HEAD. */
  async function openHeadDiff(forPath?: string) {
    const path = forPath ?? active?.path;
    if (!path) return;
    setDiffOpen(true);
    if (headContent?.path === path) return;

    setHeadContent(null);
    try {
      const result = await projectHeadFileAction(projectIdRef.current, path);
      setHeadContent({ path, content: result.ok ? result.content : null });
    } catch {
      setHeadContent({ path, content: null });
    }
  }

  /**
   * Anything that would abandon drafts — switching project, attaching another,
   * removing this one, closing a dirty tab — asks first.
   */
  function guardDiscard(label: string, run: () => void) {
    if (dirtyTabs.length === 0) {
      run();
      return;
    }
    setPendingSwitch({ label, files: dirtyTabs.map((entry) => entry.path), run });
  }

  async function reloadTree() {
    setDirs({});
    setOpenDirs([]);
    try {
      const result = await listProjectTreeAction(projectIdRef.current, "");
      if (result.ok) {
        setRoot(result.entries);
        setTreeError(null);
      } else {
        setTreeError(result.error);
      }
    } catch {
      setTreeError("Sign in again to read the project.");
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (query.length < 2 || searching) return;

    setSearching(true);
    setSearchError(null);

    try {
      const result = await searchProjectFilesAction(projectIdRef.current, query);
      if (!result.ok) {
        setSearchError(result.error);
        setSearchResult(null);
        return;
      }
      setSearchResult({ matches: result.matches, truncated: result.truncated });
    } catch {
      setSearchError("Sign in again to search the project.");
    } finally {
      setSearching(false);
    }
  }

  const openPalette = useCallback(async () => {
    setPaletteOpen(true);
    setPaletteQuery("");
    setPaletteIndex(0);
    setPaletteError(null);

    if (paletteFiles !== null) return;

    try {
      const result = await listProjectFilesAction(projectIdRef.current);
      if (!result.ok) {
        setPaletteError(result.error);
        setPaletteFiles([]);
        return;
      }
      setPaletteFiles(result.files);
    } catch {
      setPaletteError("Sign in again to list this project.");
      setPaletteFiles([]);
    }
  }, [paletteFiles]);

  // ⌘P / Ctrl+P anywhere on the Files tab opens quick open.
  useEffect(() => {
    if (tab !== "files") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void reopenTab();
      }

      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void openPalette();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tab, openPalette, closedTabs]);

  // A token match, so "app page" finds `src/app/page.tsx`.
  const paletteMatches = useMemo(() => {
    const files = paletteFiles ?? [];
    const tokens = paletteQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return files.slice(0, 50);

    return files
      .filter((path) => {
        const lower = path.toLowerCase();
        return tokens.every((token) => lower.includes(token));
      })
      .slice(0, 50);
  }, [paletteFiles, paletteQuery]);

  function chooseFile(path: string) {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    void openFile(path);
  }

  /**
   * Saves the active draft through the same reviewed write the agent uses: the
   * server re-hashes the file and refuses when it changed since it was opened.
   */
  async function saveDraft() {
    const target = active;
    if (!target || target.draft === null || saving || projectId === null) return;

    const draftText = target.draft;
    setSaving(true);
    setSaveError(null);

    try {
      const result = await applyProjectPatchAction({
        projectId,
        path: target.path,
        content: draftText,
        beforeHash: target.hash,
      });

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      // Re-read, so the tab holds what is actually on disk and gets the new
      // hash for the next save.
      const fresh = await readProjectFileAction(projectId, target.path);
      setTabs((current) =>
        current.map((entry) => {
          if (entry.path !== target.path) return entry;
          if (!fresh.ok) return { ...entry, draft: null, stale: false };
          return {
            ...entry,
            content: fresh.content,
            lines: fresh.lines,
            truncated: fresh.truncated,
            hash: fresh.hash,
            stamp: fresh.stamp,
            draft: null,
            stale: false,
          };
        }),
      );
      setReviewOpen(false);
      setSavedNote("Saved to disk. The editor holds what is now on disk.");
      await loadChanges();
      setMarksVersion((version) => version + 1);
      setHeadContent(null);
    } catch {
      setSaveError("We couldn't write that file. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function runCommand(raw?: string) {
    const line = String(raw ?? "").trim();
    if (!line || running) return;

    // `npm run <script>` goes through the script action: a read-only script
    // answers inline, a server or a build is started in its own process.
    const script =
      /^npm\s+run\s+([\w.:-]+)$/.exec(line)?.[1] ?? (/^npm\s+test$/.test(line) ? "test" : null);

    setRunning(true);
    try {
      if (script) {
        const result = await runProjectScriptAction(projectIdRef.current, script);
        setHistory((current) => [
          ...current,
          { command: line, output: result.output, ok: result.ok },
        ]);
        if (result.run) setScriptRun(result.run);
        return;
      }

      const result = await runProjectCommandAction(projectIdRef.current, line);
      setHistory((current) => [...current, { command: line, output: result.output, ok: result.ok }]);
    } catch {
      setHistory((current) => [
        ...current,
        { command: line, output: "Sign in again to use this shell.", ok: false },
      ]);
    } finally {
      setRunning(false);
    }
  }

  async function stopScript() {
    if (stoppingScript) return;
    setStoppingScript(true);
    try {
      const result = await stopProjectScriptAction(projectIdRef.current);
      if (result.ok && result.run) setScriptRun(result.run);
    } catch {
      setHistory((current) => [
        ...current,
        { command: "stop", output: "That run could not be stopped.", ok: false },
      ]);
    } finally {
      setStoppingScript(false);
    }
  }

  async function dismissScript() {
    setScriptRun(null);
    try {
      await dismissProjectScriptAction(projectIdRef.current);
    } catch {
      // The block is gone from this view either way; the registry clears on exit.
    }
  }

  async function detach() {
    if (projectId === null) return;

    try {
      const result = await detachProjectAction(projectId);
      if (!result.ok) {
        setAttachError(result.error);
        return;
      }
      setList((current) => current.filter((entry) => entry.id !== projectId));
      window.localStorage.removeItem(sessionKey(projectId));
      setProjectId(null);
      setConfirmDetach(false);
      router.refresh();
    } catch {
      setAttachError("We couldn't remove that project.");
    }
  }

  const selected = list.find((entry) => entry.id === projectId) ?? null;
  const label = selected ? shortName(selected.name) : "app";
  // This app's own repository is readable but never written from the pane, and a
  // file the reader had to cut down cannot be saved back safely.
  const canEdit = projectId !== null && Boolean(active) && !active?.truncated;
  const draftDiff =
    active && dirty ? buildLineDiff(active.content, active.draft ?? active.content) : null;
  // The full diff against HEAD (or against the staged copy) is computed only while open.
  const headDiff = useMemo(() => {
    if (!diffOpen || !active || !headContent || headContent.path !== active.path) return null;
    if (diffTarget === "unstaged") return null;
    const base = headContent.content ?? "";
    const next =
      diffTarget === "staged"
        ? indexContent?.path === active.path
          ? (indexContent.content ?? "")
          : null
        : (active.draft ?? active.content);
    if (next === null) return null;
    if (base.length > 120_000 || next.length > 120_000) return null;
    return buildLineDiff(base, next);
  }, [diffOpen, active, headContent, diffTarget, indexContent]);
  const pointer =
    active && cursor?.path === active.path
      ? cursor
      : { path: active?.path ?? "", line: 1, column: 1, selected: 0 };
  const stagedActive =
    active && changes?.ok
      ? changes.changes.some((entry) => entry.path === active.path && entry.staged)
      : false;
  const unstagedActive =
    active && changes?.ok
      ? changes.changes.some((entry) => entry.path === active.path && entry.unstaged)
      : false;
  const diffTargets: { id: "editor" | "staged" | "unstaged"; label: string; hint: string }[] = [
    { id: "editor", label: "Editor", hint: "Compare the last commit with the editor" },
    ...(stagedActive
      ? [
          {
            id: "staged" as const,
            label: "Staged",
            hint: "Compare the last commit with the staged copy",
          },
        ]
      : []),
    ...(unstagedActive
      ? [
          {
            id: "unstaged" as const,
            label: "Unstaged",
            hint: "Compare the index with the editor and stage one hunk at a time",
          },
        ]
      : []),
  ];
  /**
   * Git decorations for the explorer. A real editor's tree answers “what has
   * changed here?” before a file is opened, so each row carries its porcelain
   * state and a folder shows a dot when anything beneath it moved.
   */
  const treeStatus = useMemo(() => {
    const files = new Map<string, string>();
    const dirs = new Set<string>();

    if (changes?.ok) {
      for (const entry of changes.changes) {
        const code = entry.status.trim();
        files.set(
          entry.path,
          code.startsWith("?")
            ? "U"
            : code.includes("D")
              ? "D"
              : code.includes("A")
                ? "A"
                : "M",
        );

        const parts = entry.path.split("/");
        for (let index = 1; index < parts.length; index += 1) {
          dirs.add(parts.slice(0, index).join("/"));
        }
      }
    }

    return { files, dirs };
  }, [changes]);

  // A wide pane gets the explorer beside the editor; a narrow one stacks them,
  // the way an editor collapses its sidebar instead of squeezing both columns.
  useEffect(() => {
    const node = filesRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      setSplitPane((entries[0]?.contentRect.width ?? 0) >= 640);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tab]);

  const commitDiff = useMemo(() => {
    if (!commitFile) return null;
    const before = commitFile.before ?? "";
    const after = commitFile.after ?? "";
    if (before.length > 120_000 || after.length > 120_000) return null;
    return buildLineDiff(before, after);
  }, [commitFile]);
  const shownDiff = diffCommit ? commitDiff : headDiff;

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Select
            className="min-w-0 flex-1"
            size="sm"
            aria-label="Project to read"
            value={projectId === null ? "app" : String(projectId)}
            onChange={(next) =>
              guardDiscard("Switching projects", () => {
                setConfirmDetach(false);
                setProjectId(next === "app" ? null : Number(next));
              })
            }
            options={[
              {
                value: "app",
                label: "This app",
                description: "The repository this workspace runs from",
                icon: <GitBranch className="size-3.5" />,
              },
              ...list.map((project) => ({
                value: String(project.id),
                label: shortName(project.name),
                description:
                  project.kind === "repo" ? "Repository · shallow clone" : "Folder on this machine",
                icon:
                  project.kind === "repo" ? (
                    <GitBranch className="size-3.5" />
                  ) : (
                    <Folder className="size-3.5" />
                  ),
              })),
            ]}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="shrink-0"
            title="Attach a folder, clone a repository or upload a folder"
            aria-label="Add a project"
            onClick={() => setAttachOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
          {selected ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Remove this project from the workspace"
              aria-label="Remove this project from the workspace"
              onClick={() =>
                guardDiscard("Removing the project", () =>
                  setConfirmDetach((current) => !current),
                )
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <AttachProjectDialog
          open={attachOpen}
          onClose={() => setAttachOpen(false)}
          onAttached={(project) =>
            guardDiscard("Switching projects", () => {
              setList((current) => [...current.filter((entry) => entry.id !== project.id), project]);
              setProjectId(project.id);
              setConfirmDetach(false);
              setAttachError(null);
            })
          }
        />
      </div>

      {pendingSwitch ? (
        <div
          role="alertdialog"
          aria-label="Unsaved edits"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.62rem] text-amber-800 dark:text-amber-200"
        >
          <p>
            Unsaved edits in{" "}
            <span className="font-mono">{pendingSwitch.files.slice(0, 3).join(", ")}</span>
            {pendingSwitch.files.length > 3 ? ` and ${pendingSwitch.files.length - 3} more` : ""}.{" "}
            {pendingSwitch.label} will discard them.
          </p>
          <div className="mt-1 flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => {
                const run = pendingSwitch.run;
                setPendingSwitch(null);
                run();
              }}
            >
              Discard edits
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => setPendingSwitch(null)}
            >
              Keep editing
            </Button>
          </div>
        </div>
      ) : null}

      {confirmDetach && selected ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.62rem] text-destructive">
          <p>
            Remove <span className="font-medium">{selected.name}</span> from this workspace?
            {selected.kind === "repo"
              ? " The clone in .projects/ is deleted; the repository on GitHub is untouched."
              : " A folder you attached in place is untouched; a folder you uploaded here is deleted from .projects/uploads."}
          </p>
          <div className="mt-1 flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => void detach()}
            >
              Remove
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => setConfirmDetach(false)}
            >
              Keep
            </Button>
          </div>
        </div>
      ) : null}

      {fileOp ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {FILE_OP_TEXT[fileOp.kind].title}
          </p>
          <input
            autoFocus
            value={fileOp.value}
            onChange={(event) => setFileOp({ ...fileOp, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitFileOp();
              if (event.key === "Escape") {
                setFileOp(null);
                setFileOpError(null);
              }
            }}
            placeholder={FILE_OP_TEXT[fileOp.kind].placeholder}
            aria-label={FILE_OP_TEXT[fileOp.kind].aria}
            className="h-7 w-full rounded-lg border border-border bg-background px-2 font-mono text-[0.66rem] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand-border focus-visible:ring-2 focus-visible:ring-brand-border/40"
          />
          {fileOpError ? <p className="text-[0.62rem] text-destructive">{fileOpError}</p> : null}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              className="h-6 gap-1 px-2 text-[0.62rem]"
              disabled={fileOpBusy}
              onClick={submitFileOp}
            >
              {fileOpBusy ? <Loader2 className="size-3 animate-spin" /> : null}
              {FILE_OP_TEXT[fileOp.kind].submit}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => {
                setFileOp(null);
                setFileOpError(null);
              }}
            >
              Cancel
            </Button>
            {fileOp.kind === "create" || fileOp.kind === "folder" ? (
              <span className="ml-auto text-[0.58rem] text-muted-foreground">
                {fileOp.kind === "create"
                  ? "Created empty, then edited here."
                  : "Git tracks folders through the files in them."}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {deletePath ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.62rem] text-destructive">
          <p>
            {deletePath.kind === "folder" ? (
              <>
                Delete the folder <span className="font-mono">{deletePath.path}</span> and everything
                inside it? Files tracked by git can come back; anything untracked is gone. A folder
                holding a nested repository, environment file or dependency folder is refused.
              </>
            ) : (
              <>
                Delete <span className="font-mono">{deletePath.path}</span> from disk? A tracked file
                can be restored from git; an untracked one is gone.
              </>
            )}
          </p>
          {fileOpError ? <p className="mt-1 text-[0.62rem]">{fileOpError}</p> : null}
          <div className="mt-1 flex gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="destructive"
              className="h-6 gap-1 px-2 text-[0.62rem]"
              disabled={fileOpBusy}
              onClick={() =>
                deletePath.kind === "folder"
                  ? void deleteFolder(deletePath.path)
                  : void deleteFile(deletePath.path)
              }
            >
              {fileOpBusy ? <Loader2 className="size-3 animate-spin" /> : null}
              {deletePath.kind === "folder" ? "Delete folder" : "Delete file"}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-2 text-[0.62rem]"
              onClick={() => setDeletePath(null)}
            >
              Keep
            </Button>
          </div>
        </div>
      ) : null}

      {tab === "files" ? (
        <div ref={filesRef} className="space-y-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runSearch();
                  if (event.key === "Escape") {
                    setSearchQuery("");
                    setSearchResult(null);
                  }
                }}
                placeholder="Find in this project"
                aria-label="Search the project's text files"
                className="h-7 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[0.66rem] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand-border focus-visible:ring-2 focus-visible:ring-brand-border/40"
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                aria-label="Go to file"
                title="Go to file by name (⌘P)"
                onClick={() => void openPalette()}
              >
                <FileSearch className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                aria-label="Search the project"
                title="Search the project's text files for a literal match"
                disabled={searching || searchQuery.trim().length < 2}
                onClick={() => void runSearch()}
              >
                {searching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                aria-label={treeOpen ? "Hide the file tree" : "Show the file tree"}
                aria-pressed={treeOpen}
                title={
                  treeOpen && tabs.length === 0
                    ? "Open a file first, then the tree can be tucked away"
                    : treeOpen
                      ? "Hide the file tree"
                      : "Show the file tree"
                }
                disabled={treeOpen && tabs.length === 0}
                onClick={() => setTreeOpen((open) => !open)}
              >
                <FolderOpen className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                aria-label="Reopen the file closed last"
                title="Reopen the file closed last (⌘⇧T)"
                disabled={closedTabs.length === 0}
                onClick={() => void reopenTab()}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>

            {searchError ? (
              <p className="text-[0.62rem] text-destructive">{searchError}</p>
            ) : null}

            {searchResult ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Matches · {searchResult.matches.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSearchResult(null)}
                    className="text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {searchResult.matches.length === 0 ? (
                  <p className="px-2.5 py-2 text-[0.66rem] text-muted-foreground">
                    Nothing in this project matches that text.
                  </p>
                ) : (
                  <ul className="max-h-[15rem] overflow-y-auto py-1">
                    {searchResult.matches.map((match) => (
                      <li key={`${match.path}-${match.line}`}>
                        <button
                          type="button"
                          onClick={() => void openFile(match.path)}
                          className="w-full px-2.5 py-0.5 text-left font-mono text-[0.6rem] transition-colors hover:bg-muted/60"
                          title={`${match.path}:${match.line}`}
                        >
                          <span className="block truncate text-foreground/90">
                            {match.path}:{match.line}
                          </span>
                          <span className="block truncate text-muted-foreground">{match.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchResult.truncated ? (
                  <p className="border-t border-border/70 px-2.5 py-1 text-[0.58rem] text-muted-foreground">
                    The walk stopped at its limit. Narrow the query to see the rest.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "min-w-0",
              splitPane
                ? "grid grid-cols-[13rem_minmax(0,1fr)] items-start gap-2.5"
                : "space-y-2.5",
            )}
          >
          {treeOpen ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border/70 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Explorer · {label}
                </span>
                <span
                  className="shrink-0 text-[0.58rem] text-muted-foreground tabular-nums"
                  title={`${root?.length ?? 0} entries at the top level`}
                >
                  {root?.length ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() => setChangedOnly((only) => !only)}
                  aria-pressed={changedOnly}
                  aria-label="Show only changed files"
                  title={
                    changedOnly
                      ? "Showing only files changed since the last commit"
                      : "Show only files changed since the last commit"
                  }
                  className={cn(
                    "shrink-0 rounded p-1 transition-colors",
                    changedOnly
                      ? "bg-brand-soft text-brand-ink"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Filter className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFileOpError(null);
                    setFileOp({ kind: "create", value: "" });
                  }}
                  aria-label="New file"
                  title={
                    projectId === null
                      ? "Attach a project to add files"
                      : "Create a file in this project"
                  }
                  disabled={projectId === null}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <FilePlus className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFileOpError(null);
                    setFileOp({ kind: "folder", value: "" });
                  }}
                  aria-label="New folder"
                  title={
                    projectId === null
                      ? "Attach a project to add folders"
                      : "Create a folder in this project"
                  }
                  disabled={projectId === null}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <FolderPlus className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void reloadTree()}
                  aria-label="Reload the file tree"
                  title="Reload the file tree"
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RefreshCw className={cn("size-3", !root && !treeError && "animate-spin")} />
                </button>
              </div>

              <div ref={explorerRef} className="max-h-[22rem] overflow-y-auto py-1">
                {root === null && !treeError ? (
                  <p className="px-3 py-2 text-[0.68rem] text-muted-foreground">Reading folders…</p>
                ) : null}
                {treeError ? (
                  <p className="px-3 py-2 text-[0.68rem] text-destructive">{treeError}</p>
                ) : null}

                {root && root.length === 0 && !treeError ? (
                  <p className="px-3 py-2 text-[0.68rem] text-muted-foreground">
                    This project has no readable text files at its top level.
                  </p>
                ) : null}

                {changedOnly && treeStatus.files.size === 0 && !treeError ? (
                  <p className="px-3 py-2 text-[0.68rem] text-muted-foreground">
                    Nothing changed since the last commit.
                  </p>
                ) : null}

                <TreeNodes
                  entries={root ?? []}
                  depth={0}
                  openDirs={openDirs}
                  dirs={dirs}
                  selected={activePath}
                  onToggle={toggleDir}
                  onOpen={(path) => void openFile(path)}
                  onRename={(path) => {
                    setFileOpError(null);
                    setFileOp({ kind: "rename", value: path, path });
                  }}
                  onRenameFolder={(path) => {
                    setFileOpError(null);
                    setFileOp({ kind: "rename-folder", value: path, path });
                  }}
                  onDeleteFolder={(path) => {
                    setFileOp(null);
                    setFileOpError(null);
                    setDeletePath({ path, kind: "folder" });
                  }}
                  onDelete={(path) => {
                    setFileOp(null);
                    setFileOpError(null);
                    setDeletePath({ path, kind: "file" });
                  }}
                  statuses={treeStatus.files}
                  changedDirs={treeStatus.dirs}
                  changedOnly={changedOnly && Boolean(changes?.ok)}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setTreeOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-[0.62rem] text-muted-foreground transition-colors hover:border-brand-border hover:text-brand-ink"
            >
              <FolderOpen className="size-3.5 shrink-0" />
              Browse files · {root?.length ?? 0} at the top level
            </button>
          )}

          <div className="min-w-0 space-y-2.5">
          {loadingFile ? (
            <p className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Opening the file…
            </p>
          ) : null}
          {fileError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[0.68rem] text-destructive">
              {fileError}
            </p>
          ) : null}

          {!active && !loadingFile ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center">
              <FileSearch className="mx-auto size-5 text-muted-foreground/70" />
              <p className="mt-1.5 text-[0.7rem] font-medium">No file open</p>
              <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
                Pick one in the explorer, or press ⌘P to jump to a file by name.
              </p>
            </div>
          ) : null}

          {active ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {/* Active file: its path as a trail, then the actions for it. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/70 px-2.5 py-1.5">
                <Breadcrumbs path={active.path} />
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 justify-center px-0"
                  aria-label="Ask the agent about this file"
                  title="Ask the agent about this file"
                  onClick={() =>
                    composer?.prefill(
                      `Open \`${active.path}\` in the project \`${selected?.name ?? "app"}\` with read_project_file, then explain what it does, what calls it, and what would break if it changed. Read it before answering — do not guess from the path.`,
                    )
                  }
                >
                  <MessageSquarePlus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 justify-center px-0"
                  aria-label="Show this file against the last commit"
                  title="Show this file against the last commit"
                  onClick={() => void openHeadDiff()}
                >
                  <GitCompare className="size-3.5" />
                </Button>
                {projectId !== null ? (
                  <>                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 justify-center px-0"
                      aria-label="Rename this file"
                      title="Rename this file"
                      onClick={() => {
                        setFileOpError(null);
                        setFileOp({ kind: "rename", value: active.path, path: active.path });
                      }}
                    >
                      <FilePen className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 justify-center px-0 text-destructive"
                      aria-label="Delete this file"
                      title="Delete this file from disk"
                      onClick={() => {
                        setFileOp(null);
                        setFileOpError(null);

                        setDeletePath({ path: active.path, kind: "file" });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                ) : null}
                {canEdit ? (
                  active.draft !== null ? (
                    <>
                      {dirty ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 justify-center px-0"
                          aria-label="Review and save this draft"
                          title="Review and save this draft"
                          onClick={() => setReviewOpen(true)}
                        >
                          <Save className="size-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 justify-center px-0"
                        aria-label="Throw this draft away"
                        title="Throw this draft away; the file on disk is untouched"
                        onClick={() => {
                          clearDraft(active.path);
                          setReviewOpen(false);
                          setSaveError(null);
                        }}
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 justify-center px-0"
                      aria-label="Edit this file"
                      title="Edit this file"
                      onClick={() => updateDraft(active.path, active.content)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )
                ) : null}
              </div>

              {/* Open files, each with its own draft. */}
              <div
                role="tablist"
                aria-label="Open files"
                className="flex items-stretch overflow-x-auto border-b border-border/70 bg-muted/20"
              >
                {tabs.map((entry) => {
                  const isActive = entry.path === activePath;
                  const unsaved = entry.draft !== null && entry.draft !== entry.content;

                  return (
                    <div
                      key={entry.path}
                      className={cn(
                        "group relative flex max-w-[10rem] shrink-0 items-center gap-1 border-r border-border/70 pl-2 pr-1",
                        isActive ? "bg-card" : "hover:bg-muted/50",
                      )}
                    >
                      {isActive ? (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-brand-ink"
                        />
                      ) : null}
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActivePath(entry.path)}
                        title={entry.path}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left",
                          isActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <TabIcon path={entry.path} />
                        <span className="truncate font-mono text-[0.68rem]">
                          {shortName(entry.path)}
                        </span>
                        {unsaved ? (
                          <span
                            aria-label="Unsaved edits"
                            title="Unsaved edits"
                            className="size-1.5 shrink-0 rounded-full bg-brand-ink"
                          />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => closeTab(entry.path)}
                        aria-label={`Close ${shortName(entry.path)}`}
                        title={`Close ${entry.path}`}
                        className={cn(
                          "shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
                          isActive ? "opacity-100" : "opacity-0",
                        )}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {active.stale ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[0.6rem] text-amber-800 dark:text-amber-200"
                >
                  <span className="min-w-0 flex-1">
                    This file changed on disk since you opened it. Your draft is still based on the
                    older copy.
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-6 px-2 text-[0.62rem]"
                    onClick={() => void reloadStale(active.path)}
                  >
                    Load the new copy
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-6 px-2 text-[0.62rem]"
                    onClick={() =>
                      setTabs((current) =>
                        current.map((entry) =>
                          entry.path === active.path ? { ...entry, stale: false } : entry,
                        ),
                      )
                    }
                  >
                    Keep my draft
                  </Button>
                </div>
              ) : null}

              <CodeViewer
                content={active.draft ?? active.content}
                filePath={active.path}
                editable={active.draft !== null}
                caret={caretRef.current[active.path] ?? null}
                changedLines={
                  marks && marks.path === active.path
                    ? { added: marks.added, modified: marks.modified }
                    : null
                }
                onChange={(next) => updateDraft(active.path, next)}
                onCursorChange={(info) => {
                  caretRef.current[active.path] = info.head;
                  setCursor({
                    path: active.path,
                    line: info.line,
                    column: info.column,
                    selected: info.selected,
                  });
                }}
                onSaveRequest={() => {
                  if (active.draft !== null && active.draft !== active.content) setReviewOpen(true);
                }}
              />

              {active.draft !== null ? (
                <p className="border-t border-border/70 bg-brand-soft/40 px-2.5 py-1.5 text-[0.58rem] text-brand-ink">
                  Editing a draft. ⌘S opens the review; nothing is written until you save.
                </p>
              ) : projectId === null ? (
                <p className="border-t border-border/70 px-2.5 py-1.5 text-[0.6rem] text-muted-foreground">
                  This app's own source is read-only here. Attach a project to edit and save files.
                </p>
              ) : null}
              {active.truncated ? (
                <p className="border-t border-border/70 px-2.5 py-1.5 text-[0.6rem] text-muted-foreground">
                  The reader returns part of a very large file, so it can't be saved from here. Ask
                  the agent to read or patch the rest.
                </p>
              ) : null}
              {savedNote ? (
                <p className="border-t border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[0.6rem] text-emerald-700 dark:text-emerald-300">
                  {savedNote}
                </p>
              ) : null}

              {reviewOpen && dirty && draftDiff ? (
                <div className="border-t border-border/70">
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Review · {active.path}
                    </span>
                    <span className="shrink-0 space-x-1.5 text-[0.58rem] font-medium tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{draftDiff.lines.filter((line) => line.type === "add").length}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400">
                        −{draftDiff.lines.filter((line) => line.type === "remove").length}
                      </span>
                    </span>
                  </div>
                  <div className="max-h-[14rem] overflow-auto bg-muted/30 py-1.5 font-mono text-[0.68rem] leading-[1.6]">
                    {draftDiff.lines.map((line, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex gap-2 px-2.5",
                          line.type === "add" && "bg-emerald-500/10",
                          line.type === "remove" && "bg-rose-500/10",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "w-2 shrink-0 select-none text-center",
                            line.type === "add"
                              ? "text-emerald-600 dark:text-emerald-300"
                              : line.type === "remove"
                                ? "text-rose-600 dark:text-rose-300"
                                : "text-muted-foreground/50",
                          )}
                        >
                          {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                        </span>
                        <span className="min-w-0 whitespace-pre-wrap break-words">
                          {line.text || " "}
                        </span>
                      </div>
                    ))}
                  </div>
                  {saveError ? (
                    <p
                      role="alert"
                      className="border-t border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[0.62rem] text-destructive"
                    >
                      {saveError}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-1.5 border-t border-border/70 px-2.5 py-1.5">
                    <Button
                      type="button"
                      size="xs"
                      className="h-6 gap-1 px-2 text-[0.62rem]"
                      disabled={saving}
                      onClick={() => void saveDraft()}
                    >
                      {saving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Save className="size-3" />
                      )}
                      Save file
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="h-6 px-2 text-[0.62rem]"
                      disabled={saving}
                      onClick={() => setReviewOpen(false)}
                    >
                      Keep editing
                    </Button>
                    <span className="ml-auto text-[0.58rem] text-muted-foreground">
                      Written only on save.
                    </span>
                  </div>
                </div>
              ) : null}

              {diffOpen && active ? (
                <div className="border-t border-border/70">
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {diffCommit
                        ? `Commit ${diffCommit.hash} · ${diffCommit.path.split("/").pop() ?? diffCommit.path}`
                        : diffTarget === "unstaged"
                          ? "Changes · index → editor"
                          : `Changes · HEAD → ${diffTarget === "staged" ? "staged" : "editor"}`}
                    </span>
                    {!diffCommit && diffTargets.length > 1 ? (
                      <div className="flex shrink-0 items-center gap-0.5 text-[0.56rem]">
                        {diffTargets.map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            onClick={() => setDiffTarget(target.id)}
                            title={target.hint}
                            className={cn(
                              "rounded px-1 py-0.5 transition-colors",
                              diffTarget === target.id
                                ? "bg-brand-soft text-brand-ink"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {target.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {shownDiff ? (
                      <span className="shrink-0 space-x-1.5 text-[0.58rem] font-medium tabular-nums">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{shownDiff.lines.filter((line) => line.type === "add").length}
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          −{shownDiff.lines.filter((line) => line.type === "remove").length}
                        </span>
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setDiffOpen(false);
                        setDiffCommit(null);
                      }}
                      className="shrink-0 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>
                  {diffCommit ? (
                    commitFileBusy || !commitFile || commitFile.path !== diffCommit.path ? (
                      <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Reading that file at this
                        commit…
                      </p>
                    ) : !commitDiff ? (
                      <p className="px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                        This file is too large to diff here.
                      </p>
                    ) : commitDiff.lines.length === 0 ? (
                      <p className="px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                        That commit did not change this file's text.
                      </p>
                    ) : (
                      <div className="max-h-[22rem] overflow-auto bg-muted/30 py-1.5 font-mono text-[0.68rem] leading-[1.6]">
                        {commitDiff.lines.map((line, index) => (
                          <div
                            key={index}
                            className={cn(
                              "flex gap-2 px-2.5",
                              line.type === "add" && "bg-emerald-500/10",
                              line.type === "remove" && "bg-rose-500/10",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "w-2 shrink-0 select-none text-center",
                                line.type === "add"
                                  ? "text-emerald-600 dark:text-emerald-300"
                                  : line.type === "remove"
                                    ? "text-rose-600 dark:text-rose-300"
                                    : "text-muted-foreground/50",
                              )}
                            >
                              {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                            </span>
                            <span className="min-w-0 whitespace-pre-wrap break-words">
                              {line.text || " "}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : diffTarget === "unstaged" ? (
                    hunksError ? (
                      <p role="alert" className="px-2.5 py-1.5 text-[0.62rem] text-destructive">
                        {hunksError}
                      </p>
                    ) : !hunks || hunks.path !== active.path ? (
                      <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" /> Reading the unstaged diff…
                      </p>
                    ) : hunks.hunks.length === 0 ? (
                      <p className="px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                        Every change in this file is already staged.
                      </p>
                    ) : (
                      <div className="max-h-[16rem] overflow-auto bg-muted/30 py-1.5 font-mono text-[0.68rem] leading-[1.6]">
                        {hunks.hunks.map((hunk, index) => (
                          <div
                            key={`${index}-${hunk.header}`}
                            className="border-b border-border/50 last:border-0"
                          >
                            <div className="flex items-center gap-2 bg-muted/50 px-2.5 py-0.5 text-[0.56rem] text-muted-foreground">
                              <span className="min-w-0 flex-1 truncate" title={hunk.header}>
                                {hunk.header}
                              </span>
                              {discardConfirm === hunk.header ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void discardHunk(hunk.header)}
                                    disabled={hunkBusy !== null}
                                    title="Throw this hunk's changes away; nothing else in the file is touched"
                                    className="shrink-0 rounded bg-rose-500/15 px-1 py-0.5 font-medium text-rose-700 transition-colors hover:bg-rose-500/25 disabled:opacity-40 dark:text-rose-300"
                                  >
                                    Discard this change
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDiscardConfirm(null)}
                                    className="shrink-0 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void stageHunk(hunk.header)}
                                    disabled={hunkBusy !== null}
                                    title="Stage only this hunk; the rest of the file stays unstaged"
                                    className="shrink-0 rounded px-1 py-0.5 font-medium text-brand-ink transition-colors hover:bg-brand-soft disabled:opacity-40"
                                  >
                                    {hunkBusy === hunk.header ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      "Stage hunk"
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void discardHunk(hunk.header)}
                                    disabled={hunkBusy !== null}
                                    title="Throw this hunk's changes away"
                                    className="shrink-0 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-rose-600 disabled:opacity-40 dark:hover:text-rose-300"
                                  >
                                    Discard
                                  </button>
                                </>
                              )}
                            </div>
                            {hunk.lines.map((line, lineIndex) => (
                              <div
                                key={lineIndex}
                                className={cn(
                                  "flex gap-2 px-2.5",
                                  line.kind === "add" && "bg-emerald-500/10",
                                  line.kind === "remove" && "bg-rose-500/10",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    "w-2 shrink-0 select-none text-center",
                                    line.kind === "add"
                                      ? "text-emerald-600 dark:text-emerald-300"
                                      : line.kind === "remove"
                                        ? "text-rose-600 dark:text-rose-300"
                                        : "text-muted-foreground/50",
                                  )}
                                >
                                  {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
                                </span>
                                <span className="min-w-0 whitespace-pre-wrap break-words">
                                  {line.text || " "}
                                </span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  ) : headContent === null ||
                  (diffTarget === "staged" && indexContent?.path !== active.path) ? (
                    <p className="flex items-center gap-1.5 px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />{" "}
                      {diffTarget === "staged"
                        ? "Reading the staged copy…"
                        : "Reading the committed copy…"}
                    </p>
                  ) : !headDiff ? (
                    <p className="px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                      This file is too large to diff here. The gutter still marks the changed lines.
                    </p>
                  ) : headDiff.lines.length === 0 ? (
                    <p className="px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                      No changes against the last commit.
                    </p>
                  ) : (
                    <div className="max-h-[16rem] overflow-auto bg-muted/30 py-1.5 font-mono text-[0.68rem] leading-[1.6]">
                      {headDiff.lines.map((line, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex gap-2 px-2.5",
                            line.type === "add" && "bg-emerald-500/10",
                            line.type === "remove" && "bg-rose-500/10",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "w-2 shrink-0 select-none text-center",
                              line.type === "add"
                                ? "text-emerald-600 dark:text-emerald-300"
                                : line.type === "remove"
                                  ? "text-rose-600 dark:text-rose-300"
                                  : "text-muted-foreground/50",
                            )}
                          >
                            {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                          </span>
                          <span className="min-w-0 whitespace-pre-wrap break-words">
                            {line.text || " "}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* The status bar an editor always has, from real state. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 bg-muted/30 px-2.5 py-1.5 text-[0.62rem] text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <GitBranch className="size-3 shrink-0" />
                  <span className="truncate">{label}</span>
                  {treeStatus.files.get(active.path) ? (
                    <span
                      title="Changed since the last commit"
                      className="shrink-0 rounded bg-amber-500/15 px-1 font-mono font-semibold text-amber-700 dark:text-amber-300"
                    >
                      {treeStatus.files.get(active.path)}
                    </span>
                  ) : null}
                </span>
                <span>{languageLabelFor(active.path)}</span>
                <span className="tabular-nums">
                  Ln {pointer.line}, Col {pointer.column}
                </span>
                {pointer.selected > 0 ? (
                  <span className="tabular-nums">{pointer.selected} selected</span>
                ) : null}
                <span className="tabular-nums">{active.lines} lines</span>
                <span
                  className={cn(
                    "ml-auto rounded px-1.5 py-0.5 font-medium",
                    dirty
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      : canEdit
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {dirty ? "Draft" : canEdit ? "Editable" : "Read-only"}
                </span>
              </div>
            </div>
          ) : null}
          </div>
          </div>
        </div>
      ) : null}

      {tab === "changes" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[0.62rem]">
              <GitBranch className="size-2.5 shrink-0" />
              <span className="truncate">{changes?.ok ? changes.branch : "working tree"}</span>
            </span>
            <div className="flex items-center gap-2">
              {changes?.ok && changes.changes.length > 0 ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-5 gap-1 rounded px-1.5 text-[0.6rem]"
                  onClick={() =>
                    composer?.prefill(
                      `Review these uncommitted files in the project \`${selected?.name ?? "app"}\` and tell me what to commit first, in what order: ${changes.changes
                        .slice(0, 20)
                        .map((entry) => entry.path)
                        .join(", ")}. Use read_project_file for the ones that matter before answering.`,
                    )
                  }
                >
                  <MessageSquarePlus className="size-3" />
                  Ask
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => void loadChanges()}
                className="inline-flex items-center gap-1 text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className={cn("size-3", loadingChanges && "animate-spin")} />
                Refresh
              </button>
            </div>
          </div>

          {changes && !changes.ok ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[0.68rem] text-destructive">
              {changes.error}
            </p>
          ) : null}

          {changes?.ok ? (
            <>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <p className="border-b border-border/70 px-2.5 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Uncommitted · {changes.changes.length}
                </p>
                {changes.clean ? (
                  <p className="px-2.5 py-2 text-[0.68rem] text-muted-foreground">
                    Nothing uncommitted. The working tree matches the last commit.
                  </p>
                ) : (
                  <div className="max-h-[17rem] overflow-y-auto py-1">
                    {(["staged", "unstaged"] as const).map((group) => {
                      const rows = changes.changes.filter((entry) =>
                        group === "staged" ? entry.staged : entry.unstaged,
                      );
                      if (rows.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="px-2.5 pb-0.5 pt-1 text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">
                            {group === "staged" ? "Staged" : "Unstaged"} · {rows.length}
                          </p>
                          <ul>
                            {rows.map((entry) => (
                              <li
                                key={`${group}-${entry.status}-${entry.path}`}
                                className="flex items-center gap-2 px-2.5 py-0.5 font-mono text-[0.63rem]"
                              >
                                <span
                                  className={cn(
                                    "w-4 shrink-0 text-center font-semibold",
                                    entry.status.startsWith("?")
                                      ? "text-amber-600 dark:text-amber-300"
                                      : entry.status.includes("D")
                                        ? "text-rose-600 dark:text-rose-300"
                                        : "text-emerald-600 dark:text-emerald-300",
                                  )}
                                >
                                  {entry.status.startsWith("?")
                                    ? "U"
                                    : group === "staged"
                                      ? entry.status.slice(0, 1)
                                      : entry.status.slice(-1)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void openFile(entry.path)}
                                  className="min-w-0 flex-1 truncate text-left hover:underline"
                                  title={entry.path}
                                >
                                  {entry.path}
                                </button>
                                {group === "staged" ? (
                                  <button
                                    type="button"
                                    onClick={() => void unstagePath(entry.path)}
                                    aria-label={`Unstage ${entry.path}`}
                                    title="Take this path back out of the index; the file is untouched"
                                    disabled={indexBusy !== null}
                                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                  >
                                    {indexBusy === entry.path ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Undo2 className="size-3" />
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void stagePath(entry.path)}
                                    aria-label={`Stage ${entry.path}`}
                                    title="Put this path in the index, ready to commit"
                                    disabled={indexBusy !== null}
                                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                  >
                                    {indexBusy === entry.path ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Plus className="size-3" />
                                    )}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    openDiffFor(
                                      entry.path,
                                      group === "staged" ? "staged" : "editor",
                                    )
                                  }
                                  aria-label={`Changes in ${entry.path}`}
                                  title={
                                    group === "staged"
                                      ? "Show HEAD against the staged copy"
                                      : "Show this file against HEAD"
                                  }
                                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <GitCompare className="size-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 rounded-xl border border-border bg-card px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Commit · {changes.changes.filter((entry) => entry.staged).length} staged
                  </span>
                  {changes.changes.filter((entry) => entry.staged).length === 0 ? (
                    <span className="text-[0.56rem] text-muted-foreground">Stage a file first</span>
                  ) : null}
                </div>
                <input
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitStaged();
                  }}
                  placeholder="Commit message"
                  aria-label="Commit message"
                  className="h-7 w-full rounded-lg border border-border bg-background px-2 text-[0.66rem] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand-border focus-visible:ring-2 focus-visible:ring-brand-border/40"
                />
                <label className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={commitAmend}
                    onChange={(event) => setCommitAmend(event.target.checked)}
                    className="size-3 shrink-0 accent-[var(--primary)]"
                  />
                  Amend the last commit instead of adding a new one
                </label>
                {commitError ? (
                  <p role="alert" className="text-[0.62rem] text-destructive">
                    {commitError}
                  </p>
                ) : null}
                {commitNote ? (
                  <p className="text-[0.62rem] text-emerald-700 dark:text-emerald-300">
                    {commitNote}
                  </p>
                ) : null}
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    className="h-6 gap-1 px-2 text-[0.62rem]"
                    disabled={
                      committing ||
                      !commitMessage.trim() ||
                      changes.changes.filter((entry) => entry.staged).length === 0
                    }
                    onClick={() => void commitStaged()}
                  >
                    {committing ? <Loader2 className="size-3 animate-spin" /> : null}
                    {commitAmend
                      ? "Amend commit"
                      : `Commit ${changes.changes.filter((entry) => entry.staged).length} ${
                          changes.changes.filter((entry) => entry.staged).length === 1
                            ? "file"
                            : "files"
                        }`}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-6 gap-1 px-2 text-[0.62rem]"
                    disabled={pushing || projectId === null}
                    onClick={() => void pushBranch()}
                    title="Push this branch to its remote; nothing is ever forced"
                  >
                    {pushing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ArrowUpFromLine className="size-3" />
                    )}
                    Push
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    className="h-6 gap-1 px-2 text-[0.62rem]"
                    disabled={pulling || projectId === null}
                    onClick={() => void pullBranch()}
                    title="Fast-forward this branch from its remote; never merges or rebases"
                  >
                    {pulling ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ArrowDownToLine className="size-3" />
                    )}
                    Pull
                  </Button>
                </div>
                <p className="text-[0.58rem] text-muted-foreground">
                  Commits are local. Push and Pull move the branch, and neither ever forces.
                </p>
                {pushError ? (
                  <p role="alert" className="text-[0.62rem] text-destructive">
                    {pushError}
                  </p>
                ) : null}
                {pushNote ? (
                  <p className="text-[0.62rem] text-emerald-700 dark:text-emerald-300">
                    {pushNote}
                  </p>
                ) : null}
                {pullError ? (
                  <p role="alert" className="text-[0.62rem] text-destructive">
                    {pullError}
                  </p>
                ) : null}
                {pullNote ? (
                  <p className="text-[0.62rem] text-emerald-700 dark:text-emerald-300">
                    {pullNote}
                  </p>
                ) : null}
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <p className="border-b border-border/70 px-2.5 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Recent commits
                </p>
                {changes.commits.length === 0 ? (
                  <p className="px-2.5 py-2 text-[0.68rem] text-muted-foreground">
                    No commits yet — every file in this project is still untracked.
                  </p>
                ) : (
                  <ul className="py-1">
                    {changes.commits.map((commit) => (
                      <li key={commit.hash}>
                        <button
                          type="button"
                          onClick={() => void openCommit(commit.hash)}
                          aria-expanded={commitView?.hash === commit.hash}
                          title="Open this commit's files and diff"
                          className={cn(
                            "flex w-full items-center gap-2 px-2.5 py-0.5 text-left text-[0.63rem] transition-colors hover:bg-muted/50",
                            commitView?.hash === commit.hash && "bg-muted/60",
                          )}
                        >
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {commit.hash}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                          {commitViewBusy === commit.hash ? (
                            <Loader2 className="size-3 shrink-0 animate-spin" />
                          ) : (
                            <ChevronRight
                              className={cn(
                                "size-3 shrink-0 text-muted-foreground transition-transform",
                                commitView?.hash === commit.hash && "rotate-90",
                              )}
                            />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {commitViewError ? (
                  <p role="alert" className="px-2.5 pb-1.5 text-[0.62rem] text-destructive">
                    {commitViewError}
                  </p>
                ) : null}
                {commitView ? (
                  <div className="border-t border-border/70">
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold">
                        <span className="font-mono text-muted-foreground">
                          {commitView.hash}
                        </span>{" "}
                        {commitView.subject || "(no subject)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCommitView(null);
                          setCommitFile(null);
                        }}
                        className="shrink-0 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>
                    {commitView.files.length === 0 ? (
                      <p className="px-2.5 pb-2 text-[0.68rem] text-muted-foreground">
                        That commit did not touch a file this pane can show.
                      </p>
                    ) : (
                      <ul className="max-h-[11rem] overflow-y-auto pb-1">
                        {commitView.files.map((file) => (
                          <li key={`${file.status}-${file.path}`}>
                            <button
                              type="button"
                              onClick={() => void openCommitFile(commitView.hash, file.path)}
                              className={cn(
                                "flex w-full items-center gap-2 px-2.5 py-0.5 text-left font-mono text-[0.62rem] transition-colors hover:bg-muted/50",
                                commitFile?.path === file.path && "bg-muted/60",
                              )}
                            >
                              <span
                                className={cn(
                                  "w-3 shrink-0 text-center font-semibold",
                                  file.status === "A"
                                    ? "text-emerald-600 dark:text-emerald-300"
                                    : file.status === "D"
                                      ? "text-rose-600 dark:text-rose-300"
                                      : "text-amber-600 dark:text-amber-300",
                                )}
                              >
                                {file.status}
                              </span>
                              <span className="min-w-0 flex-1 truncate" title={file.path}>
                                {file.path}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="px-2.5 pb-1.5 text-[0.58rem] text-muted-foreground">
                      Pick a file to open its diff at this commit, in the file view.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "terminal" ? (
        <Terminal
          title={`${label} · project shell`}
          cwd={label}
          lines={history}
          running={running}
          onRun={(line) => void runCommand(line)}
          quick={["help", "git status", "git log", "git branch", "npm run dev"]}
          intro="Inspect the working tree, run the project's lint / typecheck / test scripts, and start a long one — a dev server, a build — in the background. Type help for the list."
          background={
            scriptRun
              ? {
                  script: scriptRun.script,
                  status: scriptRun.status,
                  exitCode: scriptRun.exitCode,
                  lines: scriptRun.lines,
                  stopping: stoppingScript,
                  onStop: () => void stopScript(),
                  onDismiss: () => void dismissScript(),
                }
              : null
          }
        />
      ) : null}

      {paletteOpen ? (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-foreground/20 p-4 pt-[12vh]"
        >
          <div
            role="dialog"
            aria-label="Go to file"
            className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.target.value);
                  setPaletteIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setPaletteOpen(false);
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setPaletteIndex((index) =>
                      Math.min(index + 1, Math.max(paletteMatches.length - 1, 0)),
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setPaletteIndex((index) => Math.max(index - 1, 0));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const pick = paletteMatches[paletteIndex] ?? paletteMatches[0];
                    if (pick) chooseFile(pick);
                  }
                }}
                placeholder="Go to file, or search its text — a name, a path or a phrase"
                aria-label="File to open"
                aria-controls="quick-open-list"
                aria-activedescendant={
                  paletteMatches.length > 0 ? `quick-open-${paletteIndex}` : undefined
                }
                className="h-6 min-w-0 flex-1 bg-transparent text-[0.72rem] outline-none placeholder:text-muted-foreground"
              />
              <span className="shrink-0 rounded border border-border px-1 text-[0.55rem] text-muted-foreground">
                esc
              </span>
            </div>
            <ul id="quick-open-list" role="listbox" className="max-h-[18rem] overflow-y-auto py-1">
              {paletteFiles === null && !paletteError ? (
                <li className="flex items-center gap-1.5 px-3 py-2 text-[0.66rem] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Listing every file…
                </li>
              ) : null}
              {paletteError ? (
                <li className="px-3 py-2 text-[0.66rem] text-destructive">{paletteError}</li>
              ) : null}
              {paletteFiles !== null && paletteMatches.length === 0 && !paletteError ? (
                <li className="px-3 py-2 text-[0.66rem] text-muted-foreground">
                  No file in this project matches that.
                </li>
              ) : null}
              {paletteMatches.map((filePath, index) => (
                <li
                  key={filePath}
                  id={`quick-open-${index}`}
                  role="option"
                  aria-selected={index === paletteIndex}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setPaletteIndex(index)}
                    onClick={() => chooseFile(filePath)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1 text-left transition-colors",
                      index === paletteIndex ? "bg-brand-soft text-brand-ink" : "hover:bg-muted/60",
                    )}
                  >
                    <TabIcon path={filePath} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.64rem]">
                      {shortName(filePath)}
                    </span>
                    <span className="max-w-[45%] shrink-0 truncate text-[0.56rem] text-muted-foreground">
                      {folderOf(filePath)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {paletteHits && paletteHits.length > 0 ? (
              <div className="border-t border-border/70">
                <p className="px-3 pb-0.5 pt-1.5 text-[0.55rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Matching text · {paletteHits.length}
                </p>
                <ul className="max-h-[12rem] overflow-y-auto pb-1">
                  {paletteHits.map((hit) => (
                    <li key={`${hit.path}-${hit.line}`}>
                      <button
                        type="button"
                        onClick={() => chooseFile(hit.path)}
                        title={`${hit.path}:${hit.line}`}
                        className="flex w-full flex-col px-3 py-0.5 text-left transition-colors hover:bg-muted/60"
                      >
                        <span className="truncate font-mono text-[0.6rem] text-foreground/90">
                          {hit.path}:{hit.line}
                        </span>
                        <span className="truncate font-mono text-[0.56rem] text-muted-foreground">
                          {hit.text}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The active file's path, one segment at a time, as an editor breadcrumb. */
function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-0.5 font-mono text-[0.58rem]">
      {parts.map((part, index) => {
        const last = index === parts.length - 1;
        return (
          <span key={`${part}-${index}`} className="flex shrink-0 items-center gap-0.5">
            {index > 0 ? (
              <ChevronRight className="size-2.5 text-muted-foreground/60" aria-hidden />
            ) : null}
            <span className={last ? "text-foreground" : "text-muted-foreground"}>{part}</span>
          </span>
        );
      })}
    </div>
  );
}

/** One level of the tree; an open folder renders its own children beneath it. */
function TreeNodes({
  entries,
  depth,
  openDirs,
  dirs,
  selected,
  onToggle,
  onOpen,
  onRename,
  onRenameFolder,
  onDeleteFolder,
  onDelete,
  statuses,
  changedDirs,
  changedOnly,
}: {
  entries: ProjectEntry[];
  depth: number;
  openDirs: string[];
  dirs: OpenDirs;
  selected: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onDelete: (path: string) => void;
  statuses: Map<string, string>;
  changedDirs: Set<string>;
  changedOnly: boolean;
}) {
  // A folder survives the filter while anything under it changed, so the shape
  // of the project is still visible, only without its untouched files.
  const rows = changedOnly
    ? entries.filter((entry) =>
        entry.type === "file" ? statuses.has(entry.path) : changedDirs.has(entry.path),
      )
    : entries;

  return (
    <>
      {rows.map((entry) => {
        const children = dirs[entry.path];
        const open = entry.type === "dir" && openDirs.includes(entry.path);

        return (
          <div key={entry.path}>
            <TreeNode
              entry={entry}
              depth={depth}
              openDirs={openDirs}
              dirs={dirs}
              selected={selected}
              onToggle={onToggle}
              onOpen={onOpen}
              onRename={onRename}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onDelete={onDelete}
              statuses={statuses}
              changedDirs={changedDirs}
            />
            {open && children === "error" ? (
              <p
                className="py-[2px] text-[0.62rem] text-destructive"
                style={{ paddingLeft: `${20 + depth * 12}px` }}
              >
                Could not read that folder.
              </p>
            ) : null}
            {open && Array.isArray(children) ? (
              <TreeNodes
                entries={children}
                depth={depth + 1}
                openDirs={openDirs}
                dirs={dirs}
                selected={selected}
                onToggle={onToggle}
                onOpen={onOpen}
                onRename={onRename}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onDelete={onDelete}
                statuses={statuses}
                changedDirs={changedDirs}
                changedOnly={changedOnly}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function TreeNode({
  entry,
  depth,
  openDirs,
  dirs,
  selected,
  onToggle,
  onOpen,
  onRename,
  onRenameFolder,
  onDeleteFolder,
  onDelete,
  statuses,
  changedDirs,
}: {
  entry: ProjectEntry;
  depth: number;
  openDirs: string[];
  dirs: OpenDirs;
  selected: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onRenameFolder: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onDelete: (path: string) => void;
  statuses: Map<string, string>;
  changedDirs: Set<string>;
}) {
  const isOpen = entry.type === "dir" && openDirs.includes(entry.path);
  const loading = entry.type === "dir" && dirs[entry.path] === "loading";
  const mark = entry.type === "file" ? statuses.get(entry.path) : undefined;
  const folderChanged = entry.type === "dir" && changedDirs.has(entry.path);

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-1 pr-1 transition-colors hover:bg-muted/60",
        selected === entry.path && "bg-brand-soft font-medium text-brand-ink",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <button
        type="button"
        onClick={() => (entry.type === "dir" ? onToggle(entry.path) : onOpen(entry.path))}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-[2px] text-left text-[0.68rem]"
        title={entry.path}
      >
        {entry.type === "dir" ? (
          <>
            <ChevronRight
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform",
                isOpen && "rotate-90",
              )}
            />
            {isOpen ? (
              <FolderOpen className="size-3 shrink-0 text-brand-ink" />
            ) : (
              <Folder className="size-3 shrink-0 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <TabIcon path={entry.path} />
          </>
        )}
        <span className="min-w-0 truncate">{entry.name}</span>
      </button>

      {mark ? (
        <span
          aria-hidden
          title={
            mark === "U"
              ? "Untracked: not in the last commit yet"
              : mark === "A"
                ? "Added to the index"
                : mark === "D"
                  ? "Deleted"
                  : "Modified since the last commit"
          }
          className={cn(
            "shrink-0 font-mono text-[0.62rem] font-semibold",
            mark === "U"
              ? "text-emerald-600 dark:text-emerald-400"
              : mark === "D"
                ? "text-rose-600 dark:text-rose-400"
                : "text-amber-600 dark:text-amber-400",
          )}
        >
          {mark}
        </span>
      ) : folderChanged ? (
        <span
          aria-hidden
          title="Something in this folder changed"
          className="size-1.5 shrink-0 rounded-full bg-amber-500/80"
        />
      ) : null}

      <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {entry.type === "dir" ? (
          <>
            <button
              type="button"
              onClick={() => onRenameFolder(entry.path)}
              aria-label={`Rename ${entry.name}`}
              title={`Rename ${entry.path}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Pencil className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteFolder(entry.path)}
              aria-label={`Delete ${entry.name}`}
              title={`Delete ${entry.path}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onRename(entry.path)}
              aria-label={`Rename ${entry.name}`}
              title={`Rename ${entry.path}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <FilePen className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry.path)}
              aria-label={`Delete ${entry.name}`}
              title={`Delete ${entry.path}`}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </button>
          </>
        )}
      </span>
      {loading ? (
        <Loader2 className="size-2.5 shrink-0 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}

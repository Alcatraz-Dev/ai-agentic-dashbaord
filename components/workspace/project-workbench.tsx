"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";

import {
  listProjectTreeAction,
  projectChangesAction,
  readProjectFileAction,
  runProjectCommandAction,
  type ProjectChangesResult,
  type ProjectEntry,
} from "@/app/actions/project";
import { useComposerIntent } from "@/components/agents/composer-intent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The repository pane for the `developer` template: a lazy folder tree, a text
 * file viewer, the working tree from git and a read-only command line.
 *
 * All four read the same project this dashboard runs from. Nothing here writes,
 * and every call is owner-checked on the server, so the pane is a reader for the
 * owner — not a remote shell.
 */

const VIEW_LINES = 400;

type OpenDirs = Record<string, ProjectEntry[] | "loading" | "error">;

function indent(path: string): number {
  return path.split("/").length - 1;
}

export function ProjectWorkbench({ tab }: { tab: string }) {
  const composer = useComposerIntent();
  const [root, setRoot] = useState<ProjectEntry[] | null>(null);
  const [dirs, setDirs] = useState<OpenDirs>({});
  const [openDirs, setOpenDirs] = useState<string[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [file, setFile] = useState<
    { path: string; content: string; lines: number; truncated: boolean } | null
  >(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [changes, setChanges] = useState<ProjectChangesResult | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [history, setHistory] = useState<{ command: string; output: string; ok: boolean }[]>([]);
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);

  const loadDir = useCallback(async (path: string) => {
    setDirs((current) => ({ ...current, [path]: "loading" }));
    const result = await listProjectTreeAction(path);
    setDirs((current) => ({
      ...current,
      [path]: result.ok ? result.entries : "error",
    }));
    if (!result.ok) setTreeError(result.error);
    return result;
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const result = await listProjectTreeAction("");
      if (!live) return;
      if (result.ok) {
        setRoot(result.entries);
        setTreeError(null);
      } else {
        setTreeError(result.error);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const loadChanges = useCallback(async () => {
    setLoadingChanges(true);
    const result = await projectChangesAction();
    setChanges(result);
    setLoadingChanges(false);
  }, []);

  useEffect(() => {
    if (tab === "changes" && !changes && !loadingChanges) void loadChanges();
  }, [tab, changes, loadingChanges, loadChanges]);

  async function toggleDir(path: string) {
    if (openDirs.includes(path)) {
      setOpenDirs((current) => current.filter((entry) => entry !== path));
      return;
    }
    setOpenDirs((current) => [...current, path]);
    if (!dirs[path] || dirs[path] === "error") await loadDir(path);
  }

  async function openFile(path: string) {
    setLoadingFile(true);
    setFileError(null);
    const result = await readProjectFileAction(path);
    setLoadingFile(false);
    if (!result.ok) {
      setFileError(result.error);
      setFile(null);
      return;
    }
    setFile(result);
  }

  async function runCommand(raw?: string) {
    const line = (raw ?? command).trim();
    if (!line || running) return;

    setRunning(true);
    const result = await runProjectCommandAction(line);
    setHistory((current) => [
      ...current,
      { command: line, output: result.output, ok: result.ok },
    ]);
    setCommand("");
    setRunning(false);
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {tab === "files" ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/70 px-2.5 py-1.5">
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Workspace files
              </span>
              <button
                type="button"
                onClick={() => {
                  setDirs({});
                  setOpenDirs([]);
                  setRoot(null);
                  setFile(null);
                  void listProjectTreeAction("").then((result) => {
                    if (result.ok) setRoot(result.entries);
                    else setTreeError(result.error);
                  });
                }}
                aria-label="Reload the file tree"
                className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className="size-3" />
              </button>
            </div>

            <div className="max-h-[19rem] overflow-y-auto py-1">
              {root === null && !treeError ? (
                <p className="px-3 py-2 text-[0.68rem] text-muted-foreground">Reading folders…</p>
              ) : null}
              {treeError ? (
                <p className="px-3 py-2 text-[0.68rem] text-destructive">{treeError}</p>
              ) : null}

              {(root ?? []).map((entry) => (
                <TreeNode
                  key={entry.path}
                  entry={entry}
                  depth={0}
                  openDirs={openDirs}
                  dirs={dirs}
                  selected={file?.path ?? null}
                  onToggle={toggleDir}
                  onOpen={openFile}
                />
              ))}

              {openDirs.map((dir) => {
                const children = dirs[dir];
                if (!children || children === "loading" || children === "error") return null;
                return children.map((child) => (
                  <TreeNode
                    key={child.path}
                    entry={child}
                    depth={indent(child.path)}
                    openDirs={openDirs}
                    dirs={dirs}
                    selected={file?.path ?? null}
                    onToggle={toggleDir}
                    onOpen={openFile}
                  />
                ));
              })}
            </div>
          </div>

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

          {file ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border/70 px-2.5 py-1.5">
                <File className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[0.66rem]" title={file.path}>
                  {file.path}
                </span>
                <span className="shrink-0 text-[0.6rem] text-muted-foreground tabular-nums">
                  {file.lines} lines
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-5 gap-1 rounded px-1.5 text-[0.6rem]"
                  onClick={() =>
                    composer?.prefill(
                      `Read \`${file.path}\` and explain what it does, what calls it, and what would break if it changed.`,
                    )
                  }
                >
                  <MessageSquarePlus className="size-3" />
                  Ask
                </Button>
              </div>
              <pre className="max-h-[22rem] overflow-auto bg-muted/30 px-0 py-2 font-mono text-[0.64rem] leading-[1.55] text-foreground">
                {file.content
                  .split("\n")
                  .slice(0, VIEW_LINES)
                  .map((text, index) => (
                    <span key={index} className="flex">
                      <span className="w-9 shrink-0 select-none pr-2 text-right text-muted-foreground/60 tabular-nums">
                        {index + 1}
                      </span>
                      <span className="whitespace-pre">{text || " "}</span>
                    </span>
                  ))}
              </pre>
              {file.truncated || file.content.split("\n").length > VIEW_LINES ? (
                <p className="border-t border-border/70 px-2.5 py-1.5 text-[0.6rem] text-muted-foreground">
                  Showing the first {VIEW_LINES} lines. Ask the agent to read the rest.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "changes" ? (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[0.62rem]">
              {changes?.ok ? changes.branch : "working tree"}
            </span>
            <button
              type="button"
              onClick={() => void loadChanges()}
              className="inline-flex items-center gap-1 text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              <RefreshCw className={cn("size-3", loadingChanges && "animate-spin")} />
              Refresh
            </button>
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
                  <ul className="max-h-[17rem] overflow-y-auto py-1">
                    {changes.changes.map((entry) => (
                      <li
                        key={`${entry.status}-${entry.path}`}
                        className="flex items-center gap-2 px-2.5 py-0.5 font-mono text-[0.63rem]"
                      >
                        <span
                          className={cn(
                            "w-4 shrink-0 text-center font-semibold",
                            entry.status === "??"
                              ? "text-amber-600 dark:text-amber-300"
                              : entry.status.startsWith("D")
                                ? "text-rose-600 dark:text-rose-300"
                                : "text-emerald-600 dark:text-emerald-300",
                          )}
                        >
                          {entry.status === "??" ? "U" : entry.status.slice(0, 1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openFile(entry.path)}
                          className="min-w-0 flex-1 truncate text-left hover:underline"
                          title={entry.path}
                        >
                          {entry.path}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
                      <li key={commit.hash} className="flex gap-2 px-2.5 py-0.5 text-[0.63rem]">
                        <span className="shrink-0 font-mono text-muted-foreground">{commit.hash}</span>
                        <span className="min-w-0 truncate">{commit.subject}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {file ? (
                <p className="text-[0.62rem] text-muted-foreground">
                  Opened <span className="font-mono">{file.path}</span> — switch to Files to read it.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "terminal" ? (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-[#0b0f14] text-[#d7e0ea]">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-2.5 py-1.5">
            <TerminalSquare className="size-3 text-emerald-300/80" />
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-white/50">
              Read-only shell
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[0.58rem] text-white/40">
              <AlertTriangle className="size-2.5" />
              no writes
            </span>
          </div>

          <div className="max-h-[20rem] min-h-[9rem] overflow-y-auto px-2.5 py-2 font-mono text-[0.64rem] leading-[1.6]">
            <p className="text-white/45">
              Type <span className="text-emerald-300">help</span> for the commands this pane allows.
            </p>
            {history.map((entry, index) => (
              <div key={index} className="mt-1.5">
                <p className="text-emerald-300">
                  <span className="text-white/40">repo $ </span>
                  {entry.command}
                </p>
                <pre
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    entry.ok ? "text-[#d7e0ea]" : "text-rose-300",
                  )}
                >
                  {entry.output || "(no output)"}
                </pre>
              </div>
            ))}
            {running ? <p className="mt-1.5 text-white/40">running…</p> : null}
          </div>

          <form
            className="flex items-center gap-1.5 border-t border-white/10 px-2.5 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void runCommand();
            }}
          >
            <span className="font-mono text-[0.64rem] text-emerald-300">repo $</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" && history.length > 0) {
                  event.preventDefault();
                  setCommand(history[history.length - 1].command);
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Read-only shell command"
              placeholder="git status"
              className="min-w-0 flex-1 bg-transparent font-mono text-[0.64rem] text-white outline-none placeholder:text-white/25"
            />
            <button
              type="submit"
              disabled={running || !command.trim()}
              className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[0.6rem] text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              run
            </button>
          </form>

          <div className="flex flex-wrap gap-1 border-t border-white/10 px-2.5 py-1.5">
            {["help", "git status", "git log", "git diff --stat", "ls"].map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => void runCommand(quick)}
                disabled={running}
                className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[0.58rem] text-white/55 transition-colors hover:bg-white/10 hover:text-white/80 disabled:opacity-40"
              >
                {quick}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
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
}: {
  entry: ProjectEntry;
  depth: number;
  openDirs: string[];
  dirs: OpenDirs;
  selected: string | null;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}) {
  const isOpen = entry.type === "dir" && openDirs.includes(entry.path);
  const loading = entry.type === "dir" && dirs[entry.path] === "loading";

  return (
    <button
      type="button"
      onClick={() => (entry.type === "dir" ? onToggle(entry.path) : onOpen(entry.path))}
      className={cn(
        "flex w-full items-center gap-1.5 py-[2px] pr-2 text-left text-[0.68rem] transition-colors hover:bg-muted/60",
        selected === entry.path && "bg-brand-soft text-brand-ink",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
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
          <File className="size-3 shrink-0 text-muted-foreground" />
        </>
      )}
      <span className="min-w-0 truncate">{entry.name}</span>
      {loading ? <Loader2 className="ml-auto size-2.5 animate-spin text-muted-foreground" /> : null}
    </button>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, FolderUp, GitBranch, Loader2, X } from "lucide-react";

import { attachGithubRepoAction, attachProjectFolderAction } from "@/app/actions/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { PROJECT_UPLOAD_LIMITS, type ProjectSummary } from "@/lib/project-types";

/**
 * Attach a project from the chat composer's plus menu or the Desk panel.
 *
 * Three ways in, all landing in the same `projects` row the reader understands:
 * a folder on this machine (inside `PROJECT_ROOTS`), a shallow clone of a public
 * https repository, or a folder uploaded from the browser.
 *
 * An upload is sent as multipart to `/api/projects/upload` instead of being read
 * into strings here: a coding project is routinely tens of megabytes and a
 * server action's body limit is far smaller. Files go up as they are, the
 * progress bar is real, and the server applies the same caps and skips.
 */

type Mode = "folder" | "repo" | "upload";

const BINARY =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|rar|7z|tar|woff2?|ttf|otf|eot|mp[34]|wav|ogg|mov|avi|mkv|webm|wasm|exe|dll|so|dylib|bin|class|jar)$/i;

type PickedFolder = {
  name: string;
  files: { file: File; path: string }[];
  bytes: number;
  skipped: number;
};

type UploadResponse = {
  ok?: boolean;
  error?: string;
  project?: ProjectSummary;
  written?: number;
  skipped?: number;
};

function megabytes(bytes: number): string {
  return `${Math.max(0.1, bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A POST with real upload progress, since `fetch` can't report it. */
function sendFolder(
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: UploadResponse | null }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/projects/upload");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      let body: UploadResponse | null = null;
      try {
        body = JSON.parse(request.responseText) as UploadResponse;
      } catch {
        body = null;
      }
      resolve({ status: request.status, body });
    };
    request.onerror = () => reject(new Error("network"));
    request.send(form);
  });
}

export function AttachProjectDialog({
  open,
  onClose,
  onAttached,
  initialMode = "folder",
}: {
  open: boolean;
  onClose: () => void;
  /** Told about the new project, so a pane can open it without a reload. */
  onAttached?: (project: ProjectSummary) => void;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [value, setValue] = useState("");
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Every open starts clean, on the mode the caller asked for.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setValue("");
    setFolder(null);
    setError(null);
    setProgress(0);
  }, [open, initialMode]);

  function reset() {
    setValue("");
    setFolder(null);
    setError(null);
    setProgress(0);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function pickFolder(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;

    const usable = picked.filter((file) => {
      const rel = file.webkitRelativePath || file.name;
      return !BINARY.test(rel) && file.size > 0 && file.size <= PROJECT_UPLOAD_LIMITS.fileBytes;
    });

    if (usable.length === 0) {
      setFolder(null);
      setError("That folder has no readable text files under 4 MB.");
      return;
    }

    const root = (usable[0]?.webkitRelativePath || usable[0]?.name || "folder").split("/")[0] ?? "folder";
    const stripRoot = usable.every((file) => (file.webkitRelativePath || "").startsWith(`${root}/`));

    setError(null);
    setFolder({
      name: root,
      files: usable.slice(0, PROJECT_UPLOAD_LIMITS.files).map((file) => {
        const rel = file.webkitRelativePath || file.name;
        return { file, path: stripRoot ? rel.slice(root.length + 1) : rel };
      }),
      bytes: usable.reduce((sum, file) => sum + file.size, 0),
      skipped: picked.length - usable.length,
    });
  }

  async function upload(picked: PickedFolder) {
    const form = new FormData();
    form.append("name", picked.name);
    for (const entry of picked.files) {
      form.append("paths", entry.path);
      form.append("files", entry.file, entry.file.name);
    }

    setProgress(0);
    const { status, body } = await sendFolder(form, setProgress);

    if (!body) {
      setError(
        status === 413
          ? "That folder is larger than the server accepts. Clone the repository or upload it in parts."
          : "That upload didn't reach the server. Please try again.",
      );
      return;
    }

    if (!body.ok || !body.project) {
      setError(body.error ?? "We couldn't save that folder.");
      return;
    }

    toast.add({
      title: "Folder uploaded",
      description: `${body.project.name} · ${body.written ?? picked.files.length} files${
        body.skipped ? `, ${body.skipped} skipped` : ""
      }. It is in the Desk panel — files, changes and terminal.`,
    });
    onAttached?.(body.project);
    reset();
    onClose();
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (mode === "upload" && !folder) return;

    setBusy(true);
    setError(null);

    try {
      if (mode === "upload" && folder) {
        await upload(folder);
        return;
      }

      const result =
        mode === "folder"
          ? await attachProjectFolderAction(value.trim())
          : await attachGithubRepoAction(value.trim());

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.add({
        title: mode === "folder" ? "Folder attached" : "Repository opened",
        description: `${result.project.name} is in the Desk panel — its files, changes and terminal are there.`,
      });
      onAttached?.(result.project);
      reset();
      onClose();
      router.refresh();
    } catch {
      setError("That project could not be opened. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const ready = mode === "upload" ? Boolean(folder) : Boolean(value.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <div className="space-y-1">
          <DialogTitle>Open a project</DialogTitle>
          <DialogDescription className="text-[0.8rem] leading-relaxed">
            The file tree, working tree and read-only terminal appear in the Desk panel. The agent
            can read the same files when you ask about them. Nothing is executed.
          </DialogDescription>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <SegmentedControl
            kind="radio"
            size="sm"
            fullWidth
            aria-label="Where the project comes from"
            value={mode}
            disabled={busy}
            onChange={(next) => {
              setMode(next as Mode);
              setError(null);
            }}
            options={[
              { value: "folder", label: "Folder", icon: <FolderOpen className="size-3.5" /> },
              { value: "repo", label: "Repository", icon: <GitBranch className="size-3.5" /> },
              { value: "upload", label: "Upload", icon: <FolderUp className="size-3.5" /> },
            ]}
          />

          {mode === "upload" ? (
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="file"
                multiple
                // The non-standard attribute is what makes the picker choose a folder.
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                className="sr-only"
                onChange={(event) => {
                  pickFolder(event.target.files);
                  event.target.value = "";
                }}
              />

              {folder ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                    <FolderUp className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8rem] font-medium">{folder.name}</span>
                    <span className="block truncate text-[0.68rem] text-muted-foreground">
                      {folder.files.length.toLocaleString()} files · {megabytes(folder.bytes)}
                      {folder.skipped > 0 ? ` · ${folder.skipped} skipped` : ""}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Choose a different folder"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Clear the chosen folder"
                    disabled={busy}
                    onClick={() => setFolder(null)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 border-dashed"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  <FolderUp className="size-4 text-muted-foreground" />
                  Choose a folder to upload
                </Button>
              )}

              {busy && folder ? (
                <div className="space-y-1">
                  <div
                    role="progressbar"
                    aria-label="Upload progress"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className="block h-full rounded-full bg-brand-ink transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[0.68rem] text-muted-foreground">
                    Uploading {progress}% of {megabytes(folder.bytes)}…
                  </p>
                </div>
              ) : (
                <p className="text-[0.68rem] leading-relaxed text-muted-foreground">
                  Up to {PROJECT_UPLOAD_LIMITS.files.toLocaleString()} files and{" "}
                  {Math.round(PROJECT_UPLOAD_LIMITS.bytes / 1024 / 1024)} MB (
                  {Math.round(PROJECT_UPLOAD_LIMITS.fileBytes / 1024 / 1024)} MB per file).
                  Binaries, environment files, key material and dependency folders are skipped,
                  and the count says how many.
                </p>
              )}
            </div>
          ) : (
            <TextField
              id="attach-project-location"
              label={mode === "folder" ? "Folder path" : "Repository URL"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                mode === "folder" ? "/Users/you/code/project" : "https://github.com/owner/repo"
              }
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              hint={
                mode === "folder"
                  ? "Absolute path inside this workspace's project roots."
                  : "HTTPS only, no credentials. Cloned shallowly; remove it at any time."
              }
            />
          )}

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-[0.76rem] text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" size="sm" disabled={busy} />}>
              Cancel
            </DialogClose>
            <Button type="submit" size="sm" disabled={busy || !ready}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {mode === "folder"
                ? "Attach folder"
                : mode === "repo"
                  ? "Clone repository"
                  : busy
                    ? "Uploading…"
                    : "Upload folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

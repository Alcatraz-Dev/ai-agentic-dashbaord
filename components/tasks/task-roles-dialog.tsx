"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Plus, Trash2, TriangleAlert, Users, X } from "lucide-react";

import {
  createTaskRoleAction,
  deleteTaskRoleAction,
  updateTaskRoleAction,
} from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_ROLE_ATTACHMENTS_MAX,
  TASK_ROLE_FILE_BYTES_MAX,
  TASK_ROLE_FILE_EXTENSIONS,
  TASK_ROLE_HINT_MAX,
  TASK_ROLE_LABEL_MAX,
  TASK_ROLE_PROMPT_MAX,
  TASK_ROLE_TONES,
  toneKeyFromClasses,
  type TaskRoleAttachment,
  type TaskRoleRecord,
  type TaskRoleTone,
} from "@/lib/task-types";
import { cn } from "@/lib/utils";

/**
 * The workspace's role library.
 *
 * A role is more than a label: its brief is what a scheduled run in that role
 * is told to do, and the files attached here travel with that brief. The seeded
 * catalog is copied into the workspace on first load, so everything here —
 * rename, rewrite, add, delete — is the owner's to change.
 */
export function TaskRolesDialog({
  roles,
  open,
  onOpenChange,
  onRolesChange,
}: {
  roles: TaskRoleRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRolesChange: (roles: TaskRoleRecord[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | "new">(roles[0]?.id ?? "new");
  const [label, setLabel] = useState("");
  const [hint, setHint] = useState("");
  const [tone, setTone] = useState<TaskRoleTone>("brand");
  /** Only send the tone when it was actually picked, so a saved tint isn't reset. */
  const [toneDirty, setToneDirty] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<TaskRoleAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => roles.find((role) => role.id === selectedId) ?? null,
    [roles, selectedId],
  );

  // The form mirrors whichever role is selected, so switching is never half-applied.
  useEffect(() => {
    if (!open) return;

    if (selectedId === "new" || !selected) {
      setLabel("");
      setHint("");
      setTone("brand");
      setPrompt("");
      setAttachments([]);
    } else {
      setLabel(selected.label);
      setHint(selected.hint);
      setTone(toneKeyFromClasses(selected.tone) ?? "neutral");
      setPrompt(selected.prompt);
      setAttachments(selected.attachments);
    }

    setToneDirty(false);
    setConfirmDelete(false);
    setError(null);
  }, [open, selectedId, selected]);

  async function attachFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const next: TaskRoleAttachment[] = [...attachments];

    for (const file of Array.from(files)) {
      if (next.length >= TASK_ROLE_ATTACHMENTS_MAX) {
        setError(`Up to ${TASK_ROLE_ATTACHMENTS_MAX} files per role.`);
        break;
      }

      const lower = file.name.toLowerCase();
      if (!TASK_ROLE_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
        setError(`${file.name} isn't a text brief. Use .md, .markdown, .txt, .csv or .json.`);
        continue;
      }

      if (file.size > TASK_ROLE_FILE_BYTES_MAX) {
        setError(`${file.name} is over ${Math.round(TASK_ROLE_FILE_BYTES_MAX / 1_000)} KB.`);
        continue;
      }

      try {
        const content = await file.text();
        next.push({ name: file.name, content: content.slice(0, TASK_ROLE_FILE_BYTES_MAX) });
      } catch (readError) {
        console.error("[tasks] role file read failed", readError);
        setError(`We couldn't read ${file.name}.`);
      }
    }

    setAttachments(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function save() {
    if (saving) return;
    if (!label.trim()) {
      setError("Give the role a name.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      label,
      hint,
      prompt,
      attachments,
      ...(toneDirty || selectedId === "new" ? { tone } : {}),
    };

    try {
      const result =
        selectedId === "new"
          ? await createTaskRoleAction(payload)
          : await updateTaskRoleAction({ id: selectedId, ...payload });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onRolesChange(result.roles);
      const savedRole =
        result.roles.find((role) => role.label === label.trim()) ?? result.roles.at(-1) ?? null;
      if (savedRole) setSelectedId(savedRole.id);
    } catch (saveError) {
      console.error("[tasks] role save failed", saveError);
      setError("We couldn't save that role. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (selectedId === "new" || saving) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await deleteTaskRoleAction({ id: selectedId });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      onRolesChange(result.roles);
      setSelectedId(result.roles[0]?.id ?? "new");
    } catch (deleteError) {
      console.error("[tasks] role delete failed", deleteError);
      setError("We couldn't delete that role. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const FIELD =
    "mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const LABEL = "text-[0.62rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            Roles
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[13rem_1fr]">
          <div className="min-w-0">
            <div className="flex items-center justify-between px-0.5">
              <span className={LABEL}>{roles.length} roles</span>
              <button
                type="button"
                onClick={() => setSelectedId("new")}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.64rem] font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
              >
                <Plus className="size-3" />
                New
              </button>
            </div>

            <div className="mt-1.5 max-h-[19rem] space-y-1 overflow-y-auto pr-0.5">
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  aria-current={role.id === selectedId}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                    role.id === selectedId
                      ? "bg-brand-soft ring-1 ring-brand-border"
                      : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold ring-1",
                      role.tone,
                    )}
                  >
                    {role.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.74rem] font-medium">{role.label}</span>
                    <span className="block truncate text-[0.6rem] text-muted-foreground">
                      {role.key}
                      {role.builtin ? " · seeded" : ""}
                      {role.attachments.length > 0 ? ` · ${role.attachments.length} file` : ""}
                    </span>
                  </span>
                </button>
              ))}

              {selectedId === "new" && (
                <div className="rounded-lg bg-brand-soft px-2 py-1.5 text-[0.72rem] font-medium text-brand-ink ring-1 ring-brand-border">
                  A new role
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2.5">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>Name</span>
                <Input
                  value={label}
                  maxLength={TASK_ROLE_LABEL_MAX}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Growth ops"
                  className="mt-1 h-9 text-[0.8rem]"
                />
              </label>

              <label className="block">
                <span className={LABEL}>Colour</span>
                <select
                  value={tone}
                  onChange={(event) => {
                    setTone(event.target.value as TaskRoleTone);
                    setToneDirty(true);
                  }}
                  className={FIELD}
                >
                  {TASK_ROLE_TONES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className={LABEL}>One line</span>
              <Input
                value={hint}
                maxLength={TASK_ROLE_HINT_MAX}
                onChange={(event) => setHint(event.target.value)}
                placeholder="Runs the experiments and reports what moved."
                className="mt-1 h-9 text-[0.8rem]"
              />
            </label>

            <label className="block">
              <span className={LABEL}>Brief — what this role does</span>
              <Textarea
                value={prompt}
                maxLength={TASK_ROLE_PROMPT_MAX}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                placeholder="What this role should do on a card, and what done looks like."
                className="mt-1 text-[0.8rem]"
              />
            </label>

            <div>
              <div className="flex items-center justify-between">
                <span className={LABEL}>Attached files</span>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={attachments.length >= TASK_ROLE_ATTACHMENTS_MAX}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.64rem] font-semibold text-brand-ink transition-colors hover:bg-brand-soft disabled:opacity-50"
                >
                  <FileText className="size-3" />
                  Attach
                </button>
              </div>

              <input
                ref={fileInput}
                type="file"
                multiple
                accept={TASK_ROLE_FILE_EXTENSIONS.join(",")}
                onChange={(event) => void attachFiles(event.target.files)}
                className="sr-only"
              />

              <div className="mt-1.5 space-y-1">
                {attachments.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-1.5 rounded-lg bg-card px-2 py-1 ring-1 ring-border/60"
                  >
                    <FileText className="size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[0.68rem]">{file.name}</span>
                    <span className="text-[0.6rem] text-muted-foreground tabular-nums">
                      {Math.ceil(file.content.length / 1000)}k
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((entry) => entry.name !== file.name),
                        )
                      }
                      aria-label={`Remove ${file.name}`}
                      className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}

                {attachments.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/80 px-2 py-2 text-center text-[0.64rem] text-muted-foreground">
                    No files. A brief travels into the run with this role.
                  </p>
                )}
              </div>
            </div>

            {error ? (
              <p className="flex items-start gap-1.5 text-[0.7rem] leading-relaxed text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void remove()}
            disabled={saving || selectedId === "new"}
            className={cn(
              "h-8 gap-1.5 px-2 text-[0.74rem]",
              confirmDelete ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <Trash2 className="size-3.5" />
            {confirmDelete ? "Confirm delete" : "Delete role"}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 px-2.5 text-[0.74rem]"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={saving || !label.trim()}
              className="h-8 gap-1.5 px-3 text-[0.74rem]"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {selectedId === "new" ? "Create role" : "Save role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

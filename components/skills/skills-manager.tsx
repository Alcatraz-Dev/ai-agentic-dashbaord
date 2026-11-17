"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  FileUp,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  createCustomSkillAction,
  deleteCustomSkillAction,
} from "@/app/actions/skills";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { SideFolder } from "@/components/aui/illustrations/side-folder";
import { Label } from "@/components/ui/label";
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
import { TextArea } from "@/components/ui/text-area";
import {
  CUSTOM_SKILL_DESCRIPTION_MAX,
  CUSTOM_SKILL_FILE_BYTES_MAX,
  CUSTOM_SKILL_INSTRUCTIONS_MAX,
  CUSTOM_SKILL_NAME_MAX,
  CUSTOM_SKILLS_MAX,
  type CustomSkillSummary,
} from "@/lib/custom-skill-types";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const FIELD_LABEL = "text-[0.72rem]";
const ACCEPT = ".md,.markdown,.txt,text/markdown,text/plain";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

/**
 * Workspace skills: written inline or uploaded as Markdown / text. Every agent
 * can list them; the runtime loads the full body through `use_skill` only when
 * the current task calls for it.
 */
export function SkillsManager({ skills }: { skills: CustomSkillSummary[] }) {
  const router = useRouter();
  const [list, setList] = useState(skills);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setList(skills);
  }, [skills]);

  function reset() {
    setMode("write");
    setName("");
    setDescription("");
    setInstructions("");
    setFile(null);
    setSaving(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);

    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, "").slice(0, CUSTOM_SKILL_NAME_MAX));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("instructions", instructions);
    if (file) formData.set("file", file);

    try {
      const result = await createCustomSkillAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setList((current) => [...current, result.skill]);
      setOpen(false);
      reset();
      router.refresh();
      toast.add({
        title: "Skill added",
        description: `${result.skill.name} is now available to every agent.`,
        type: "success",
      });
    } catch (submitError) {
      console.error("[skills] create request failed", submitError);
      setError("We couldn't save that skill. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(skill: CustomSkillSummary) {
    if (removing !== null) return;
    if (!window.confirm(`Remove "${skill.name}"? Agents will stop seeing it.`)) return;

    setRemoving(skill.id);

    try {
      const result = await deleteCustomSkillAction({ id: skill.id });

      if (!result.ok) {
        toast.add({ title: "Couldn't remove skill", description: result.error, type: "error" });
        return;
      }

      setList((current) => current.filter((entry) => entry.id !== skill.id));
      router.refresh();
      toast.add({
        title: "Skill removed",
        description: `${skill.name} is no longer available to your agents.`,
        type: "success",
      });
    } catch (removeError) {
      console.error("[skills] delete request failed", removeError);
      toast.add({
        title: "Couldn't remove skill",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="premium-panel mt-5 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm">
            <BookOpen className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold">Your skills</h2>
            <p className="mt-0.5 max-w-lg text-[0.72rem] leading-relaxed text-muted-foreground">
              Upload a playbook or write one here. Agents see the name and description, then load
              the full instructions only when a task needs them.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={list.length >= CUSTOM_SKILLS_MAX}
          className="h-8 gap-1.5 rounded-full bg-foreground px-3 text-[0.75rem] text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Add skill
        </Button>
      </div>

      {list.length === 0 ? (
        <IllustratedEmpty
          className="mt-4"
          art={<SideFolder />}
          artClassName="w-20"
          title="No skills yet"
          text="Drop in a Markdown checklist, a writing guide or a process doc. No code required."
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <Plus className="size-3.5" />
              Add skill
            </Button>
          }
        />
      ) : (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {list.map((skill) => (
            <article
              key={skill.id}
              className="group flex flex-col rounded-xl border border-border/70 bg-card p-3.5 transition-colors hover:border-brand-border"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="truncate text-[0.84rem] font-semibold">{skill.name}</h3>
                    <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.56rem] font-semibold text-brand-ink ring-1 ring-brand-border">
                      {skill.sourceName ? "Uploaded" : "Custom"}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.69rem] leading-relaxed text-muted-foreground">
                    {skill.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(skill)}
                  disabled={removing !== null}
                  aria-label={`Remove ${skill.name}`}
                  title="Remove skill"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  {removing === skill.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
              </div>

              <details className="group/details mt-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.65rem] font-medium text-brand-ink hover:text-brand-ink [&::-webkit-details-marker]:hidden">
                  <PenLine className="size-3" />
                  Preview instructions
                </summary>
                <pre className="mt-1.5 max-h-36 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[0.62rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {skill.instructions}
                </pre>
              </details>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[0.62rem] text-muted-foreground">
                <span className="truncate">
                  {skill.sourceName ??
                    `${skill.instructions.length.toLocaleString()} characters`}
                </span>
                <span className="shrink-0">On for every agent</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-3 text-[0.66rem] leading-relaxed text-muted-foreground">
        {list.length}/{CUSTOM_SKILLS_MAX} skills · Markdown and plain text, up to{" "}
        {Math.round(CUSTOM_SKILL_FILE_BYTES_MAX / 1024)} KB each. Your skills are private to this
        workspace.
      </p>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <form
            onSubmit={submit}
            noValidate
            className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    Add a skill
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    Give every agent a reusable playbook. Nothing runs until an agent needs it.
                  </DialogDescription>
                </div>
              </div>

              <SegmentedControl
                size="sm"
                fullWidth
                value={mode}
                onChange={(val) => setMode(val as "write" | "upload")}
                options={[
                  {
                    value: "write",
                    label: "Write",
                    icon: <PenLine className="size-3.5" />,
                  },
                  {
                    value: "upload",
                    label: "Upload",
                    icon: <FileUp className="size-3.5" />,
                  },
                ]}
              />

              <TextField
                id="skill-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Weekly competitor brief"
                maxLength={CUSTOM_SKILL_NAME_MAX}
                autoComplete="off"
              />

              <TextField
                id="skill-description"
                label="Description"
                hint="optional"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="One line on when an agent should use it"
                maxLength={CUSTOM_SKILL_DESCRIPTION_MAX}
                autoComplete="off"
              />

              {mode === "write" ? (
                <div className="space-y-1.5">
                  <TextArea
                    id="skill-instructions"
                    label="Instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder={"# How to write the brief\n\n1. Search the last 7 days…\n2. Compare…"}
                    maxLength={CUSTOM_SKILL_INSTRUCTIONS_MAX}
                    minRows={6}
                    className="font-mono text-[0.72rem]"
                  />
                  <p className="text-right text-[0.62rem] text-muted-foreground tabular-nums">
                    {instructions.length.toLocaleString()}/{CUSTOM_SKILL_INSTRUCTIONS_MAX.toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="skill-file" className={FIELD_LABEL}>
                    Markdown or text file
                  </Label>
                  <label
                    htmlFor="skill-file"
                    className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-brand-border hover:bg-brand-soft"
                  >
                    <FileUp className="size-5 text-brand-ink" />
                    <span className="text-[0.76rem] font-medium">
                      {file ? file.name : "Choose a .md or .txt file"}
                    </span>
                    <span className="text-[0.64rem] text-muted-foreground">
                      {file
                        ? `${formatBytes(file.size)} · click to replace`
                        : `Up to ${Math.round(CUSTOM_SKILL_FILE_BYTES_MAX / 1024)} KB`}
                    </span>
                  </label>
                  <input
                    ref={fileInput}
                    id="skill-file"
                    type="file"
                    accept={ACCEPT}
                    onChange={chooseFile}
                    className="sr-only"
                  />
                  <p className="text-[0.66rem] leading-relaxed text-muted-foreground">
                    The file body becomes the skill. The name is filled from the filename and can
                    be edited above.
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="text-[0.72rem] text-destructive">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0 flex-wrap gap-2 rounded-none border-t bg-muted/40 px-5 py-3">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto hidden rounded-xl sm:inline-flex"
                  />
                }
              >
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={saving}
                className="gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {saving ? "Saving…" : "Add skill"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

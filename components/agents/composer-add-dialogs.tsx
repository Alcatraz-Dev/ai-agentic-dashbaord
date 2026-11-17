"use client";

import { createCustomDiagramAction } from "@/app/actions/diagrams";
import { ArchifyDiagram } from "@/components/agents/archify-diagram";
import { extractArchify } from "@/lib/diagram-source";
import {
  CUSTOM_DIAGRAM_DESCRIPTION_MAX,
  CUSTOM_DIAGRAM_NAME_MAX,
  CUSTOM_DIAGRAM_SOURCE_MAX,
} from "@/lib/custom-diagram-types";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Code2,
  FileUp,
  ListTodo,
  Loader2,
  PenLine,
  Plus,
  Sparkles,
  TriangleAlert,
  Workflow,
} from "lucide-react";

import { createCustomPluginAction } from "@/app/actions/plugins";
import { createCustomSkillAction } from "@/app/actions/skills";
import { createTaskAction } from "@/app/actions/tasks";
import { attachAgentLibraryItemAction } from "@/app/actions/agents";
import { LibraryScheduleDialog } from "@/components/agents/library-schedule-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import {
  CUSTOM_PLUGIN_AUTHORIZATION_MAX,
  CUSTOM_PLUGIN_DESCRIPTION_MAX,
  CUSTOM_PLUGIN_INPUT_HINT_MAX,
  CUSTOM_PLUGIN_NAME_MAX,
  CUSTOM_PLUGIN_URL_MAX,
  customPluginToolName,
  type CustomPluginMethod,
} from "@/lib/custom-plugin-types";
import {
  CUSTOM_SKILL_DESCRIPTION_MAX,
  CUSTOM_SKILL_FILE_BYTES_MAX,
  CUSTOM_SKILL_INSTRUCTIONS_MAX,
  CUSTOM_SKILL_NAME_MAX,
} from "@/lib/custom-skill-types";
import {
  TASK_NOTES_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TITLE_MAX,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/task-types";

/**
 * The three "make something out of this message" dialogs behind the composer's
 * Add menu. Each one previews what it will create, writes only when confirmed,
 * and calls the same server action as the page that owns that record (the
 * board's composer, the Skills page, the Plugins page) — so a card, a skill or
 * a plugin created from chat is the same row as one created anywhere else.
 */

export type ComposerAddMode = "task" | "skill" | "plugin" | "diagram" | null;

export type ComposerAddAgent = { id: number; name: string };

/** What the chat shows and tells the agent after one of these wrote a row. */
export type ComposerAddNote = {
  kind: "task" | "skill" | "plugin" | "diagram";
  title: string;
  detail: string;
  href: string;
};

const DIALOG_CONTENT =
  "max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg";

/** The first meaningful line of the draft, without heading markers. */
function draftLine(draft: string): string {
  const line = draft
    .split("\n")
    .map((entry) => entry.replace(/^[#>\-*+\s]+/, "").trim())
    .find((entry) => entry.length > 0);
  return line ?? "";
}

/** Everything after that first line, which is what a card's notes should hold. */
function draftRest(draft: string): string {
  const lines = draft.split("\n");
  const index = lines.findIndex((entry) => entry.replace(/^[#>\-*+\s]+/, "").trim().length > 0);
  if (index === -1) return "";
  return lines
    .slice(index + 1)
    .join("\n")
    .trim();
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-destructive"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

function SuccessPanel({
  title,
  description,
  href,
  linkLabel,
  onSchedule,
  onClose,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  /** Present when the new record can also be scheduled for this agent. */
  onSchedule?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-start gap-3 pr-8">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-600/25">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <DialogTitle className="font-heading text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
            {description}
          </DialogDescription>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            onClose();
            router.push(href);
          }}
          className="gap-1.5 rounded-xl bg-foreground text-background hover:bg-foreground/90"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" />
        </Button>
        {onSchedule ? (
          <Button
            type="button"
            variant="outline"
            onClick={onSchedule}
            className="gap-1.5 rounded-xl"
          >
            <CalendarClock className="size-3.5" />
            Schedule a run
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="rounded-xl" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- task -- */

function TaskDraftDialog({
  draft,
  agent,
  onCreated,
  onClose,
}: {
  draft: string;
  agent: ComposerAddAgent | null;
  onCreated?: (note: ComposerAddNote) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(() => draftLine(draft).slice(0, TASK_TITLE_MAX));
  const [notes, setNotes] = useState(() => draftRest(draft).slice(0, TASK_NOTES_MAX));
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: number | null; title: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || added) return;
    if (!title.trim()) {
      setError("Give the task a name.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await createTaskAction({
        title,
        notes: notes.trim() || null,
        status,
        priority,
        sourceAgentId: agent?.id ?? null,
        // The card keeps its origin and staffs its first role with this agent.
        roles: agent ? ["lead"] : [],
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded({ id: result.task?.id ?? null, title: title.trim() });
      router.refresh();
      toast.add({
        title: "Task added",
        description: `${title.trim()} is in ${TASK_STATUS_LABELS[status]}.`,
        type: "success",
      });
      // The chat records it, and the next turn is told about it.
      onCreated?.({
        kind: "task",
        title: title.trim(),
        detail: `It sits in ${TASK_STATUS_LABELS[status]}${agent ? ` with ${agent.name} on Lead` : ""}${result.task?.id ? ` · card #${result.task.id}` : ""}.`,
        href: "/dashboard/tasks",
      });
    } catch (submitError) {
      console.error("[tasks] composer create failed", submitError);
      setError("We couldn't add that task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG_CONTENT}>
        {added ? (
          <SuccessPanel
            title={`“${added.title}” is on the board`}
            description={`${TASK_STATUS_LABELS[status]} · ${TASK_PRIORITY_LABELS[priority]} priority${
              agent ? ` · ${agent.name} is on the Lead role` : ""
            }${added.id ? ` · card #${added.id}` : ""}.`}
            href="/dashboard/tasks"
            linkLabel="Open the board"
            onClose={onClose}
          />
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
                  <ListTodo className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    Add this as a task
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    The message becomes a card on the workspace board. Nothing is scheduled — it
                    waits in {TASK_STATUS_LABELS[status].toLowerCase()} until you run it.
                  </DialogDescription>
                </div>
              </div>

              <TextField
                id="composer-task-title"
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs doing?"
                maxLength={TASK_TITLE_MAX}
                autoComplete="off"
              />

              <TextArea
                id="composer-task-notes"
                label="Notes"
                optional
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Context, links, what done looks like…"
                maxLength={TASK_NOTES_MAX}
                minRows={4}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="composer-task-status"
                    className="text-[0.72rem] font-medium text-foreground"
                  >
                    Step
                  </label>
                  <NativeSelect
                    id="composer-task-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as TaskStatus)}
                    className="w-full"
                  >
                    {TASK_STATUSES.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {TASK_STATUS_LABELS[option]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="composer-task-priority"
                    className="text-[0.72rem] font-medium text-foreground"
                  >
                    Priority
                  </label>
                  <NativeSelect
                    id="composer-task-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                    className="w-full"
                  >
                    {TASK_PRIORITIES.map((option) => (
                      <NativeSelectOption key={option} value={option}>
                        {TASK_PRIORITY_LABELS[option]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>

              <p className="rounded-lg bg-muted/50 px-3 py-2 text-[0.66rem] leading-relaxed text-muted-foreground">
                {agent
                  ? `${agent.name} is put on the Lead role, so the card shows which chat it came from. You can staff the other roles and attach a schedule from the board.`
                  : "You can staff the roles and attach a schedule from the board."}
              </p>

              {error ? <ErrorLine message={error} /> : null}
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
                disabled={saving || !title.trim()}
                className="gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ListTodo className="size-4" />
                )}
                {saving ? "Adding…" : "Add to board"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------- skill -- */

function SkillDraftDialog({
  draft,
  agent,
  onCreated,
  onClose,
}: {
  draft: string;
  agent: ComposerAddAgent | null;
  onCreated?: (note: ComposerAddNote) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const trimmed = draft.trim();
  const [name, setName] = useState(() => draftLine(draft).slice(0, CUSTOM_SKILL_NAME_MAX));
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(() =>
    trimmed.slice(0, CUSTOM_SKILL_INSTRUCTIONS_MAX),
  );
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);

    // A picked file names the skill, like the Skills page does.
    if (next && !name.trim()) {
      setName(next.name.replace(/\.[^.]+$/, "").slice(0, CUSTOM_SKILL_NAME_MAX));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || added) return;
    if (mode === "upload" && !file) {
      setError("Choose a Markdown or text file first.");
      return;
    }

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    if (mode === "upload" && file) formData.set("file", file);
    else formData.set("instructions", instructions);

    try {
      const result = await createCustomSkillAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded(result.skill.name);
      router.refresh();
      toast.add({
        title: "Skill added",
        description: `${result.skill.name} is now available to every agent.`,
        type: "success",
      });

      // Switch it on for the agent this chat belongs to, so "use it" works
      // in the next message without a trip to Configure.
      let detail = "It is in the workspace library.";
      if (agent) {
        try {
          const attached = await attachAgentLibraryItemAction({
            id: agent.id,
            kind: "skill",
            name: result.skill.name,
          });
          detail = attached.ok
            ? `${agent.name} can load it now.`
            : `Switch it on for ${agent.name} in Configure.`;
        } catch (attachError) {
          console.error("[skills] could not attach to the agent", attachError);
          detail = `Switch it on for ${agent.name} in Configure.`;
        }
      }

      onCreated?.({ kind: "skill", title: result.skill.name, detail, href: "/dashboard/skills" });
    } catch (submitError) {
      console.error("[skills] composer create failed", submitError);
      setError("We couldn't save that skill. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG_CONTENT}>
        {added ? (
          <>
            <SuccessPanel
              title={`“${added}” is saved as a skill`}
              description="Agents see its name and description in every run and load the full instructions through use_skill only when a task needs them."
              href="/dashboard/skills"
              linkLabel="Open skills"
              onSchedule={agent ? () => setScheduleOpen(true) : undefined}
              onClose={onClose}
            />
            {agent && scheduleOpen ? (
              <LibraryScheduleDialog
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                agentId={agent.id}
                agentName={agent.name}
                attach={{ kind: "skill", name: added }}
                title={`Use the ${added} skill`.slice(0, 110)}
                prompt={[
                  `Use the "${added}" skill for this run, then say what you did.`,
                  description.trim() ||
                    instructions.trim().split("\n").slice(0, 4).join("\n"),
                ]
                  .filter(Boolean)
                  .join("\n\n")
                  .slice(0, 1_200)}
              />
            ) : null}
          </>
        ) : (
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
                    Save this message as a skill
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    A skill is a reusable playbook, not a one-off prompt. The message below is
                    already in the instructions — trim it to the steps you want repeated.
                  </DialogDescription>
                </div>
              </div>

              <TextField
                id="composer-skill-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Weekly competitor brief"
                maxLength={CUSTOM_SKILL_NAME_MAX}
                autoComplete="off"
              />

              <TextField
                id="composer-skill-description"
                label="Description"
                hint="optional — defaults to the first line"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="One line on when an agent should use it"
                maxLength={CUSTOM_SKILL_DESCRIPTION_MAX}
                autoComplete="off"
              />

              <SegmentedControl
                size="sm"
                fullWidth
                value={mode}
                onChange={(value) => setMode(value === "upload" ? "upload" : "write")}
                options={[
                  { value: "write", label: "Write", icon: <PenLine className="size-3.5" /> },
                  { value: "upload", label: "Upload", icon: <FileUp className="size-3.5" /> },
                ]}
              />

              {mode === "write" ? (
                <div className="space-y-1.5">
                  <TextArea
                    id="composer-skill-instructions"
                    label="Instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    placeholder={"1. Search the last 7 days…\n2. Compare…\n3. Write the brief…"}
                    maxLength={CUSTOM_SKILL_INSTRUCTIONS_MAX}
                    minRows={7}
                    className="font-mono text-[0.72rem]"
                  />
                  <p className="text-right text-[0.62rem] text-muted-foreground tabular-nums">
                    {instructions.length.toLocaleString()}/
                    {CUSTOM_SKILL_INSTRUCTIONS_MAX.toLocaleString()}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label
                    htmlFor="composer-skill-file"
                    className="text-[0.72rem] font-medium text-foreground"
                  >
                    Markdown or text file
                  </label>
                  <label
                    htmlFor="composer-skill-file"
                    className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-brand-border hover:bg-brand-soft"
                  >
                    <FileUp className="size-5 text-brand-ink" />
                    <span className="text-[0.76rem] font-medium">
                      {file ? file.name : "Choose a .md or .txt file"}
                    </span>
                    <span className="text-[0.64rem] text-muted-foreground">
                      {file
                        ? `${Math.max(1, Math.round(file.size / 1024))} KB · click to replace`
                        : `Up to ${Math.round(CUSTOM_SKILL_FILE_BYTES_MAX / 1024)} KB`}
                    </span>
                  </label>
                  <input
                    ref={fileInput}
                    id="composer-skill-file"
                    type="file"
                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                    onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <p className="text-[0.66rem] leading-relaxed text-muted-foreground">
                    The file body becomes the skill; the name above is filled from the filename
                    and can be edited.
                  </p>
                </div>
              )}

              {error ? <ErrorLine message={error} /> : null}
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
                disabled={
                  saving || !name.trim() || (mode === "upload" ? !file : !instructions.trim())
                }
                className="gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {saving ? "Saving…" : "Save skill"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ plugin -- */

function PluginDraftDialog({
  draft,
  agent,
  onCreated,
  onClose,
}: {
  draft: string;
  agent: ComposerAddAgent | null;
  onCreated?: (note: ComposerAddNote) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(() => draftLine(draft).slice(0, CUSTOM_PLUGIN_NAME_MAX));
  const [description, setDescription] = useState(() =>
    draft.replace(/\s+/g, " ").trim().slice(0, CUSTOM_PLUGIN_DESCRIPTION_MAX),
  );
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<CustomPluginMethod>("POST");
  const [inputHint, setInputHint] = useState("");
  const [authorization, setAuthorization] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; slug: string } | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || added) return;

    setSaving(true);
    setError(null);

    try {
      const result = await createCustomPluginAction({
        name,
        description,
        url,
        method,
        authorization,
        inputHint,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded({ name: result.plugin.name, slug: result.plugin.slug });
      router.refresh();
      toast.add({
        title: "Plugin added",
        description: `${result.plugin.name} is available to every agent as ${customPluginToolName(
          result.plugin.slug,
        )}.`,
        type: "success",
      });

      // Same as a skill: the agent in this chat gets the tool right away.
      let detail = "It is in the workspace library.";
      if (agent) {
        try {
          const attached = await attachAgentLibraryItemAction({
            id: agent.id,
            kind: "plugin",
            name: result.plugin.slug,
          });
          detail = attached.ok
            ? `${agent.name} can call it now.`
            : `Switch it on for ${agent.name} in Configure.`;
        } catch (attachError) {
          console.error("[plugins] could not attach to the agent", attachError);
          detail = `Switch it on for ${agent.name} in Configure.`;
        }
      }

      onCreated?.({ kind: "plugin", title: result.plugin.name, detail, href: "/dashboard/plugins" });
    } catch (submitError) {
      console.error("[plugins] composer create failed", submitError);
      setError("We couldn't save that plugin. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG_CONTENT}>
        {added ? (
          <>
            <SuccessPanel
              title={`“${added.name}” is now a tool`}
              description={`Every agent can call ${customPluginToolName(
                added.slug,
              )}. It receives { input } (or ?input= for GET) and its response is returned as text.`}
              href="/dashboard/plugins"
              linkLabel="Open plugins"
              onSchedule={agent ? () => setScheduleOpen(true) : undefined}
              onClose={onClose}
            />
            {agent && scheduleOpen ? (
              <LibraryScheduleDialog
                open={scheduleOpen}
                onOpenChange={setScheduleOpen}
                agentId={agent.id}
                agentName={agent.name}
                attach={{ kind: "plugin", name: added.slug }}
                title={`Call ${added.name}`.slice(0, 110)}
                prompt={[
                  `Call the ${customPluginToolName(
                    added.slug,
                  )} tool with the right input for this run, then summarise what it returned.`,
                  description.trim() ? `What it does: ${description.trim()}` : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")
                  .slice(0, 1_200)}
              />
            ) : null}
          </>
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
                  <Code2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    Add an HTTP plugin
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    Point a plugin at an HTTPS endpoint and every agent gets one tool for it.
                    Unlike a skill, a plugin actually calls something when the agent uses it.
                  </DialogDescription>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                <TextField
                  id="composer-plugin-name"
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Invoice lookup"
                  maxLength={CUSTOM_PLUGIN_NAME_MAX}
                  autoComplete="off"
                />
                <div className="space-y-1.5">
                  <label
                    htmlFor="composer-plugin-method"
                    className="text-[0.72rem] font-medium text-foreground"
                  >
                    Method
                  </label>
                  <NativeSelect
                    id="composer-plugin-method"
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value === "GET" ? "GET" : "POST")
                    }
                    className="w-full"
                  >
                    <NativeSelectOption value="POST">POST · JSON body</NativeSelectOption>
                    <NativeSelectOption value="GET">GET · query string</NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>

              <TextField
                id="composer-plugin-url"
                label="Endpoint URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://api.example.com/lookup"
                inputMode="url"
                maxLength={CUSTOM_PLUGIN_URL_MAX}
                autoComplete="off"
                className="font-mono text-[0.72rem]"
              />

              <TextArea
                id="composer-plugin-description"
                label="What it does"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Looks up the latest invoice status for a customer."
                maxLength={CUSTOM_PLUGIN_DESCRIPTION_MAX}
                minRows={3}
              />

              <TextField
                id="composer-plugin-input"
                label="What goes in"
                hint="optional"
                value={inputHint}
                onChange={(event) => setInputHint(event.target.value)}
                placeholder="A customer email or invoice number"
                maxLength={CUSTOM_PLUGIN_INPUT_HINT_MAX}
                autoComplete="off"
              />

              <TextField
                id="composer-plugin-auth"
                type="password"
                label="Authorization header"
                hint="optional, encrypted at rest"
                value={authorization}
                onChange={(event) => setAuthorization(event.target.value)}
                placeholder="Bearer sk-…"
                maxLength={CUSTOM_PLUGIN_AUTHORIZATION_MAX}
                autoComplete="off"
                className="font-mono text-[0.72rem]"
              />

              <p className="rounded-lg bg-muted/50 px-3 py-2 text-[0.66rem] leading-relaxed text-muted-foreground">
                Tool name:{" "}
                <code className="font-mono text-foreground">
                  {customPluginToolName(
                    name
                      .normalize("NFKD")
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "_")
                      .replace(/^_+|_+$/g, "")
                      .slice(0, 40) || "tool",
                  )}
                </code>
                . Public HTTPS only; localhost is allowed for development.
              </p>

              {error ? <ErrorLine message={error} /> : null}
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
                disabled={saving || !name.trim() || !url.trim() || !description.trim()}
                className="gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {saving ? "Saving…" : "Add plugin"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- diagram -- */

/**
 * Saves the Archify block of a finished reply. The JSON source is editable
 * before it is stored, because a reply's diagram is often worth one cleanup
 * pass, and the preview is the real renderer the library uses.
 */
function DiagramDraftDialog({
  draft,
  agent,
  onCreated,
  onClose,
}: {
  draft: string;
  agent: ComposerAddAgent | null;
  onCreated?: (note: ComposerAddNote) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const fenced = extractArchify(draft);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState(() => {
    // A prose draft is a description, not IR: start empty instead of storing it.
    const initial = fenced || (draft.trimStart().startsWith("{") ? draft : "");
    return initial.slice(0, CUSTOM_DIAGRAM_SOURCE_MAX);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || added) return;

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("source", source);

    try {
      const result = await createCustomDiagramAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setAdded(result.diagram.name);
      router.refresh();
      toast.add({
        title: "Diagram saved",
        description: `${result.diagram.name} is in the workspace diagram library.`,
        type: "success",
      });
      // Same as a skill: switch it on for the agent in this chat, so the next
      // message can already extend the diagram that was just saved.
      let detail = "It is in the workspace diagram library.";
      if (agent) {
        try {
          const attached = await attachAgentLibraryItemAction({
            id: agent.id,
            kind: "diagram",
            name: result.diagram.name,
          });
          detail = attached.ok
            ? `${agent.name} can load it now.`
            : `Switch it on for ${agent.name} in Configure.`;
        } catch (attachError) {
          console.error("[diagrams] could not attach to the agent", attachError);
          detail = `Switch it on for ${agent.name} in Configure.`;
        }
      }

      onCreated?.({ kind: "diagram", title: result.diagram.name, detail, href: "/dashboard/diagrams" });
    } catch (submitError) {
      console.error("[diagrams] composer create failed", submitError);
      setError("We couldn't save that diagram. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={DIALOG_CONTENT}>
        {added ? (
          <SuccessPanel
            title={`“${added}” is saved`}
            description="Agents see its name and description in every run and load the real structure through use_diagram only when a task needs it."
            href="/dashboard/diagrams"
            linkLabel="Open diagrams"
            onClose={onClose}
          />
        ) : (
          <form
            onSubmit={submit}
            noValidate
            className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
                  <Workflow className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    Save this diagram
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    The Archify block in this reply becomes a workspace diagram. Editing the
                    JSON here is the last chance to name the real steps before an agent reuses
                    them.
                  </DialogDescription>
                </div>
              </div>

              <TextField
                id="composer-diagram-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Publishing flow"
                maxLength={CUSTOM_DIAGRAM_NAME_MAX}
                autoComplete="off"
              />

              <TextField
                id="composer-diagram-description"
                label="Description"
                hint="optional"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="One line on what the diagram shows"
                maxLength={CUSTOM_DIAGRAM_DESCRIPTION_MAX}
                autoComplete="off"
              />

              <div className="space-y-1.5">
                <TextArea
                  id="composer-diagram-source"
                  label="Archify JSON"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder='{\n  "diagram_type": "workflow",\n  "meta": { "title": "Publishing flow" },\n  "nodes": [{ "id": "brief", "label": "Brief" }]\n}'
                  maxLength={CUSTOM_DIAGRAM_SOURCE_MAX}
                  minRows={7}
                  className="font-mono text-[0.72rem]"
                />
                <p className="text-right text-[0.62rem] text-muted-foreground tabular-nums">
                  {source.length.toLocaleString()}/{CUSTOM_DIAGRAM_SOURCE_MAX.toLocaleString()}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-[0.72rem] font-medium text-foreground">Preview</p>
                {source.trim() ? (
                  <div className="max-h-64 overflow-auto rounded-xl border border-border/70 bg-background/60 p-2">
                    <ArchifyDiagram source={source} height={260} />
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-[0.68rem] text-muted-foreground">
                    Add Archify JSON to see it drawn.
                  </p>
                )}
              </div>

              {error ? <ErrorLine message={error} /> : null}
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
                disabled={saving || !name.trim() || !source.trim()}
                className="gap-2 rounded-xl bg-foreground text-background hover:bg-foreground/90"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Workflow className="size-4" />}
                {saving ? "Saving…" : "Save diagram"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Renders whichever Add-menu dialog is open; mounting resets its form. */
export function ComposerAddDialogs({
  mode,
  draft,
  agent,
  onCreated,
  onClose,
}: {
  mode: ComposerAddMode;
  draft: string;
  agent: ComposerAddAgent | null;
  /** Called once a row was written, so the chat can show and mention it. */
  onCreated?: (note: ComposerAddNote) => void;
  onClose: () => void;
}) {
  if (mode === "task") {
    // Remounted per open, so the draft fills the form only when it is opened.
    return (
      <TaskDraftDialog
        key={`task-${draft}`}
        draft={draft}
        agent={agent}
        onCreated={onCreated}
        onClose={onClose}
      />
    );
  }
  if (mode === "skill") {
    return (
      <SkillDraftDialog
        key={`skill-${draft}`}
        draft={draft}
        agent={agent}
        onCreated={onCreated}
        onClose={onClose}
      />
    );
  }
  if (mode === "plugin") {
    return (
      <PluginDraftDialog
        key="plugin"
        draft={draft}
        agent={agent}
        onCreated={onCreated}
        onClose={onClose}
      />
    );
  }
  if (mode === "diagram") {
    return (
      <DiagramDraftDialog
        key={`diagram-${draft}`}
        draft={draft}
        agent={agent}
        onCreated={onCreated}
        onClose={onClose}
      />
    );
  }
  return null;
}

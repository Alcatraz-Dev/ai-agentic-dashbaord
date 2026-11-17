"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Code2,
  FileUp,
  LayoutDashboard,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";

import {
  createCustomDiagramAction,
  createDiagramWidgetAction,
  deleteCustomDiagramAction,
  draftDiagramAction,
  updateCustomDiagramAction,
} from "@/app/actions/diagrams";
import { ArchifyDiagram } from "@/components/agents/archify-diagram";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import {
  ARCHIFY_DIAGRAM_TYPE_IDS,
  cleanArchifySource,
  diagramTypeLabel,
} from "@/lib/archify/types";
import {
  CUSTOM_DIAGRAM_DESCRIPTION_MAX,
  CUSTOM_DIAGRAM_FILE_BYTES_MAX,
  CUSTOM_DIAGRAM_NAME_MAX,
  CUSTOM_DIAGRAM_SOURCE_MAX,
  CUSTOM_DIAGRAMS_MAX,
  type CustomDiagramSummary,
} from "@/lib/custom-diagram-types";

const FIELD_LABEL = "text-[0.72rem]";
const ACCEPT = ".json,.archify,.md,.markdown,.txt,application/json,text/plain";
const PLACEHOLDER = `{
  "schema_version": 1,
  "diagram_type": "architecture",
  "meta": { "title": "Publishing flow" },
  "components": [
    { "id": "author", "type": "external", "label": "Author", "pos": [40, 130], "size": [120, 60] },
    { "id": "api", "type": "backend", "label": "Publishing API", "pos": [220, 130], "size": [140, 60] },
    { "id": "cms", "type": "database", "label": "Content store", "pos": [420, 130], "size": [140, 60] }
  ],
  "connections": [
    { "from": "author", "to": "api", "label": "submit" },
    { "from": "api", "to": "cms", "label": "save" }
  ]
}`;

/**
 * Workspace diagrams: Archify JSON IR saved once and rendered on demand.
 * Agents see the name and description in the prompt and load the real IR
 * through `use_diagram`, so a redraw keeps the saved structure.
 */
export function DiagramsManager({
  diagrams,
  agents = [],
}: {
  diagrams: CustomDiagramSummary[];
  /** Agents that can draft a new diagram; the first is preselected. */
  agents?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [list, setList] = useState(diagrams);
  const [open, setOpen] = useState(false);
  /** The card being edited; null means the dialog is creating a new one. */
  const [editing, setEditing] = useState<CustomDiagramSummary | null>(null);
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [widgetBusy, setWidgetBusy] = useState<number | null>(null);
  const [draftAgent, setDraftAgent] = useState(() => String(agents[0]?.id ?? ""));
  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setList(diagrams);
  }, [diagrams]);

  const preview = cleanArchifySource(mode === "upload" ? fileText : source);

  function reset() {
    setEditing(null);
    setMode("write");
    setName("");
    setDescription("");
    setSource("");
    setFile(null);
    setFileText("");
    setSaving(false);
    setError(null);
    setDraftPrompt("");
    setDraftError(null);
    setDraftAgent(String(agents[0]?.id ?? ""));
    if (fileInput.current) fileInput.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function openCreate() {
    reset();
    setOpen(true);
  }

  /** Same form, prefilled: a rename, a new description or new source. */
  function openEdit(diagram: CustomDiagramSummary) {
    setEditing(diagram);
    setMode("write");
    setName(diagram.name);
    setDescription(diagram.description);
    setSource(diagram.source);
    setFile(null);
    setFileText("");
    setError(null);
    setOpen(true);
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileText("");
    setError(null);

    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, "").slice(0, CUSTOM_DIAGRAM_NAME_MAX));
    }

    if (selected) {
      try {
        setFileText(await selected.text());
      } catch {
        setError("That file could not be read. Please pick another one.");
      }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const wasEditing = editing;

    setSaving(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("source", source);
    if (file) formData.set("file", file);
    if (wasEditing) formData.set("id", String(wasEditing.id));

    try {
      const result = wasEditing
        ? await updateCustomDiagramAction(formData)
        : await createCustomDiagramAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setList((current) =>
        wasEditing
          ? current.map((entry) => (entry.id === result.diagram.id ? result.diagram : entry))
          : [...current, result.diagram],
      );
      setOpen(false);
      reset();
      router.refresh();
      toast.add({
        title: wasEditing ? "Diagram updated" : "Diagram added",
        description: wasEditing
          ? `${result.diagram.name} keeps the same place in your library.`
          : `${result.diagram.name} is available to every agent.`,
        type: "success",
      });
    } catch (submitError) {
      console.error("[diagrams] create request failed", submitError);
      setError("We couldn't save that diagram. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  /** Asks one agent for a first draft; the result lands in the editor. */
  async function draft() {
    if (drafting) return;

    const agentId = Number(draftAgent);
    if (!Number.isInteger(agentId) || agentId <= 0) {
      setDraftError("Pick an agent first.");
      return;
    }
    if (!draftPrompt.trim()) {
      setDraftError("Describe the diagram you want.");
      return;
    }

    setDrafting(true);
    setDraftError(null);

    try {
      const result = await draftDiagramAction({ agentId, prompt: draftPrompt });

      if (!result.ok) {
        setDraftError(result.error);
        return;
      }

      setSource(result.source);
      setMode("write");
      if (!name.trim()) setName("Draft diagram");
      toast.add({
        title: "Draft ready",
        description: "Review the Archify JSON below, then save it.",
        type: "success",
      });
    } catch (draftFailure) {
      console.error("[diagrams] draft request failed", draftFailure);
      setDraftError("We couldn't draft that diagram. Please try again.");
    } finally {
      setDrafting(false);
    }
  }

  /** Puts the saved source on the dashboard as a diagram widget. */
  async function addToDashboard(diagram: CustomDiagramSummary) {
    if (widgetBusy !== null) return;

    setWidgetBusy(diagram.id);

    try {
      const result = await createDiagramWidgetAction({ id: diagram.id });

      if (!result.ok) {
        toast.add({ title: "Couldn't add the widget", description: result.error, type: "error" });
        return;
      }

      router.refresh();
      toast.add({
        title: "Widget added",
        description: `${result.title} is on your dashboard.`,
        type: "success",
      });
    } catch (widgetError) {
      console.error("[diagrams] widget request failed", widgetError);
      toast.add({
        title: "Couldn't add the widget",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setWidgetBusy(null);
    }
  }

  async function remove(diagram: CustomDiagramSummary) {
    if (removing !== null) return;
    if (!window.confirm(`Remove "${diagram.name}"? Agents will stop seeing it.`)) return;

    setRemoving(diagram.id);

    try {
      const result = await deleteCustomDiagramAction({ id: diagram.id });

      if (!result.ok) {
        toast.add({ title: "Couldn't remove diagram", description: result.error, type: "error" });
        return;
      }

      setList((current) => current.filter((entry) => entry.id !== diagram.id));
      router.refresh();
      toast.add({
        title: "Diagram removed",
        description: `${diagram.name} is no longer available to your agents.`,
        type: "success",
      });
    } catch (removeError) {
      console.error("[diagrams] delete request failed", removeError);
      toast.add({
        title: "Couldn't remove diagram",
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
            <Workflow className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold">Your diagrams</h2>
            <p className="mt-0.5 max-w-lg text-[0.72rem] leading-relaxed text-muted-foreground">
              Save Archify JSON once. Agents load the real structure by name, and each card is
              rendered into an interactive Archify diagram you can pan, zoom and export.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={list.length >= CUSTOM_DIAGRAMS_MAX}
          className="h-8 gap-1.5 rounded-full bg-foreground px-3 text-[0.75rem] text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Add diagram
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Workflow className="size-5" />
          </span>
          <p className="mt-2.5 text-[0.82rem] font-semibold">No diagrams yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[0.7rem] leading-relaxed text-muted-foreground">
            Paste Archify JSON or draft one with an agent. Saves here become readable structure for
            every future run, not a picture the model has to guess at.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={openCreate}
            className="mt-3"
          >
            <Plus className="size-3.5" />
            Add diagram
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {list.map((diagram) => (
            <article
              key={diagram.id}
              className="group flex flex-col rounded-xl border border-border/70 bg-card p-3.5 transition-colors hover:border-brand-border"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink ring-1 ring-brand-border">
                  <Workflow className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="truncate text-[0.84rem] font-semibold">{diagram.name}</h3>
                    <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.56rem] font-semibold text-brand-ink ring-1 ring-brand-border">
                      {diagramTypeLabel(diagram.source)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.69rem] leading-relaxed text-muted-foreground">
                    {diagram.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(diagram)}
                  aria-label={`Edit ${diagram.name}`}
                  title="Edit diagram"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(diagram)}
                  disabled={removing !== null}
                  aria-label={`Remove ${diagram.name}`}
                  title="Remove diagram"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  {removing === diagram.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
              </div>

              <div className="mt-2.5">
                <ArchifyDiagram source={diagram.source} height={360} />
              </div>

              <details className="group/details mt-2">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.65rem] font-medium text-brand-ink [&::-webkit-details-marker]:hidden">
                  <Code2 className="size-3" />
                  View JSON
                </summary>
                <pre className="mt-1.5 max-h-36 overflow-auto rounded-lg bg-muted/50 p-2 font-mono text-[0.62rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {diagram.source}
                </pre>
              </details>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[0.62rem] text-muted-foreground">
                <span className="truncate">
                  {diagram.sourceName ?? `${diagram.source.length.toLocaleString()} characters`}
                </span>
                <button
                  type="button"
                  onClick={() => void addToDashboard(diagram)}
                  disabled={widgetBusy !== null}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-medium text-brand-ink transition hover:bg-brand-soft disabled:opacity-50"
                >
                  {widgetBusy === diagram.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <LayoutDashboard className="size-3" />
                  )}
                  Add to dashboard
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-3 text-[0.66rem] leading-relaxed text-muted-foreground">
        {list.length}/{CUSTOM_DIAGRAMS_MAX} diagrams · Archify JSON, up to{" "}
        {Math.round(CUSTOM_DIAGRAM_FILE_BYTES_MAX / 1024)} KB each. Your diagrams are private to
        this workspace.
      </p>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <form onSubmit={submit} noValidate className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="flex items-start gap-3 pr-8">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background shadow-sm">
                  <Workflow className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    {editing ? "Edit diagram" : "Add a diagram"}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    {editing
                      ? "Rename it, rewrite the description or replace its Archify JSON. Nothing runs until an agent is asked about it."
                      : "Save Archify JSON once. Nothing runs until an agent is asked about it."}
                  </DialogDescription>
                </div>
              </div>

              <SegmentedControl
                size="sm"
                fullWidth
                value={mode}
                onChange={(val) => setMode(val as "write" | "upload")}
                options={[
                  { value: "write", label: "Write", icon: <PenLine className="size-3.5" /> },
                  { value: "upload", label: "Upload", icon: <FileUp className="size-3.5" /> },
                ]}
              />

              {editing ? null : (
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.72rem] font-medium">Draft with an agent</p>
                    <span className="text-[0.62rem] text-muted-foreground">optional</span>
                  </div>
                  {agents.length === 0 ? (
                    <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
                      Create an AI agent first; it writes the first Archify draft here.
                    </p>
                  ) : (
                    <>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <select
                          value={draftAgent}
                          onChange={(event) => setDraftAgent(event.target.value)}
                          aria-label="Agent"
                          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[0.74rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {agents.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                        <input
                          value={draftPrompt}
                          onChange={(event) => setDraftPrompt(event.target.value)}
                          placeholder="e.g. our publishing flow"
                          aria-label="What to draw"
                          className="h-8 min-w-0 flex-[2] rounded-lg border border-border bg-card px-2 text-[0.74rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void draft()}
                          disabled={drafting}
                          className="h-8 gap-1.5 px-2.5 text-[0.72rem]"
                        >
                          {drafting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                          {drafting ? "Drafting…" : "Draft"}
                        </Button>
                      </div>
                      {draftError ? (
                        <p role="alert" className="mt-1 text-[0.66rem] text-destructive">
                          {draftError}
                        </p>
                      ) : (
                        <p className="mt-1 text-[0.62rem] leading-relaxed text-muted-foreground">
                          The agent writes Archify JSON only; you review and save it.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <TextField
                id="diagram-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Publishing flow"
                maxLength={CUSTOM_DIAGRAM_NAME_MAX}
                autoComplete="off"
              />

              <TextField
                id="diagram-description"
                label="Description"
                hint="optional"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="One line on what the diagram shows"
                maxLength={CUSTOM_DIAGRAM_DESCRIPTION_MAX}
                autoComplete="off"
              />

              {mode === "write" ? (
                <div className="space-y-1.5">
                  <TextArea
                    id="diagram-source"
                    label="Archify JSON"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    placeholder={PLACEHOLDER}
                    maxLength={CUSTOM_DIAGRAM_SOURCE_MAX}
                    minRows={7}
                    className="font-mono text-[0.72rem]"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[0.62rem] text-muted-foreground">
                    <span>
                      <span className="font-mono">diagram_type</span>:{" "}
                      {ARCHIFY_DIAGRAM_TYPE_IDS.join(", ")}
                    </span>
                    <span className="tabular-nums">
                      {source.length.toLocaleString()}/
                      {CUSTOM_DIAGRAM_SOURCE_MAX.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="diagram-file" className={FIELD_LABEL}>
                    Diagram file
                  </Label>
                  <label
                    htmlFor="diagram-file"
                    className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-brand-border hover:bg-brand-soft"
                  >
                    <FileUp className="size-5 text-brand-ink" />
                    <span className="text-[0.76rem] font-medium">
                      {file ? file.name : "Choose a .json, .archify or .md file"}
                    </span>
                    <span className="text-[0.64rem] text-muted-foreground">
                      {file
                        ? "Click to replace"
                        : `Up to ${Math.round(CUSTOM_DIAGRAM_FILE_BYTES_MAX / 1024)} KB`}
                    </span>
                  </label>
                  <input
                    ref={fileInput}
                    id="diagram-file"
                    type="file"
                    accept={ACCEPT}
                    onChange={chooseFile}
                    className="sr-only"
                  />
                  <p className="text-[0.66rem] leading-relaxed text-muted-foreground">
                    The file body becomes the diagram. The name is filled from the filename and can
                    be edited above.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className={FIELD_LABEL}>Preview</p>
                {preview ? (
                  <div className="max-h-64 overflow-auto rounded-xl border border-border/70 bg-background/60 p-2">
                    <ArchifyDiagram source={preview} height={360} />
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-[0.68rem] text-muted-foreground">
                    Paste or upload Archify JSON to see it drawn.
                  </p>
                )}
              </div>

              {error ? (
                <p role="alert" className="text-[0.72rem] text-destructive">
                  {error}
                </p>
              ) : null}
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
                {saving ? "Saving…" : editing ? "Save changes" : "Add diagram"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

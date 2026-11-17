"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LayoutTemplate, Loader2, Sparkles, Trash2 } from "lucide-react";

import {
  applyDashboardTemplateAction,
  deleteDashboardAction,
  updateDashboardAction,
} from "@/app/actions/dashboards";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentAvatarPicker } from "@/components/dashboard/agent-avatar-picker";
import { TemplateArt } from "@/components/dashboard/template-art";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAgentAvatarLabel } from "@/lib/agent-options";
import {
  DASHBOARD_NAME_MAX_LENGTH,
  DASHBOARD_TEMPLATES,
  getDashboardTemplate,
} from "@/lib/dashboard-options";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";
import { cn } from "@/lib/utils";

export function DashboardSettings({
  dashboard,
  existingTitles,
}: {
  dashboard: { id: number; name: string; icon: string; color: string; template: string };
  /** Titles already on this dashboard, so a starter can show as added. */
  existingTitles: string[];
}) {
  const router = useRouter();

  const [name, setName] = useState(dashboard.name);
  const [icon, setIcon] = useState(dashboard.icon);
  const [color, setColor] = useState(dashboard.color);
  const [template, setTemplate] = useState(dashboard.template);
  // Last saved values, so the form can tell a real edit from an untouched page.
  const [baseline, setBaseline] = useState({
    name: dashboard.name,
    icon: dashboard.icon,
    color: dashboard.color,
    template: dashboard.template,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const templateMeta = getDashboardTemplate(template);
  const blueprint = getTemplateBlueprint(template);
  const presentTitles = new Set(existingTitles.map((title) => title.trim().toLowerCase()));
  const missingStarters = blueprint
    ? blueprint.widgets.filter((widget) => !presentTitles.has(widget.title.toLowerCase())).length
    : 0;
  const dirty =
    name !== baseline.name ||
    icon !== baseline.icon ||
    color !== baseline.color ||
    template !== baseline.template;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError("Give your dashboard a name.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const result = await updateDashboardAction({ name: trimmed, icon, color, template });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setName(result.dashboard.name);
      setIcon(result.dashboard.icon);
      setColor(result.dashboard.color);
      setTemplate(result.dashboard.template);
      setBaseline({
        name: result.dashboard.name,
        icon: result.dashboard.icon,
        color: result.dashboard.color,
        template: result.dashboard.template,
      });
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      console.error("[dashboards] settings save failed", saveError);
      setError("We couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDashboard() {
    if (deleting) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteDashboardAction(dashboard.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }

      setConfirmOpen(false);
      router.push(result.nextId ? "/dashboard" : "/dashboard/new");
      router.refresh();
    } catch {
      setDeleteError("We couldn't delete that dashboard. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function applyTemplate() {
    if (applying || !blueprint || missingStarters === 0) return;

    setApplying(true);
    setApplyError(null);
    setApplyNote(null);

    try {
      const result = await applyDashboardTemplateAction(template);
      if (!result.ok) {
        setApplyError(result.error);
        return;
      }

      setApplyNote(
        result.added === 0
          ? "That template's cards are already on this dashboard."
          : `${result.added} ${result.added === 1 ? "card" : "cards"} added to the dashboard.`,
      );
      router.refresh();
    } catch {
      setApplyError("We couldn't add those cards. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="premium-panel rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <AgentAvatar avatar={icon} color={color} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.98rem] font-semibold">{name.trim() || dashboard.name}</p>
            <p className="truncate text-[0.7rem] text-muted-foreground">
              {getAgentAvatarLabel(icon)} · {templateMeta.name} template
            </p>
          </div>
          <span className="aui-chip shrink-0">Active dashboard</span>
        </div>

        <div className="mt-4 space-y-1.5">
          <label htmlFor="dashboard-name" className="text-[0.72rem] font-medium">
            Dashboard name
          </label>
          <Input
            id="dashboard-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
              if (error) setError(null);
            }}
            maxLength={DASHBOARD_NAME_MAX_LENGTH}
            autoComplete="off"
            className="h-10 rounded-xl bg-background"
          />
          <p className="text-right text-[0.62rem] text-muted-foreground tabular-nums">
            {name.length}/{DASHBOARD_NAME_MAX_LENGTH}
          </p>
        </div>
      </div>

      <div className="premium-panel rounded-2xl p-4 sm:p-5">
        <AgentAvatarPicker
          avatar={icon}
          color={color}
          onAvatarChange={(next) => {
            setIcon(next);
            setSaved(false);
          }}
          onColorChange={(next) => {
            setColor(next);
            setSaved(false);
          }}
        />
      </div>

      <div className="premium-panel rounded-2xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.72rem] font-medium">
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
              Starting template
            </p>
            <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
              Switching never moves or deletes a card you already have. Add the template's starter
              cards whenever you want them.
            </p>
          </div>
          <span className="aui-chip shrink-0 tabular-nums">{DASHBOARD_TEMPLATES.length} options</span>
        </div>

        <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
          {DASHBOARD_TEMPLATES.map((option) => {
            const selected = option.id === template;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setTemplate(option.id);
                  setSaved(false);
                }}
                aria-pressed={selected}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border p-2 text-left transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-brand-border bg-brand-soft/40 shadow-sm"
                    : "border-border bg-card/60 hover:border-brand-border/60 hover:bg-card hover:shadow-sm",
                )}
              >
                {getTemplateBlueprint(option.id)?.widgets.length ? (
                  <TemplatePreview template={option.id} className="rounded-lg" />
                ) : (
                  <TemplateArt id={option.id} />
                )}

                {selected ? (
                  <span className="brand-gradient absolute top-4 right-4 grid size-5 place-items-center rounded-full text-brand-on shadow-sm">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : null}

                <span className="flex items-center justify-between gap-2 px-1.5 pt-2.5">
                  <span className="text-[0.82rem] leading-tight font-semibold">{option.name}</span>
                </span>
                <span className="mt-0.5 px-1.5 pb-1.5 text-[0.66rem] leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {blueprint && blueprint.widgets.length > 0 ? (
        <div className="premium-panel rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.72rem] font-medium">
                <Sparkles className="size-3.5 text-muted-foreground" />
                {templateMeta.name} starter cards
              </p>
              <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
                {blueprint.focus}
              </p>
            </div>
            <span className="aui-chip shrink-0 tabular-nums">
              {missingStarters} of {blueprint.widgets.length} left
            </span>
          </div>

          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {blueprint.widgets.map((widget) => {
              const present = presentTitles.has(widget.title.toLowerCase());
              return (
                <li
                  key={widget.key}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      present
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-border bg-background",
                    )}
                  >
                    {present ? <Check className="size-2.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium">
                    {widget.title}
                  </span>
                  <span className="shrink-0 text-[0.55rem] tracking-wide text-muted-foreground uppercase">
                    {widget.form}
                  </span>
                </li>
              );
            })}
          </ul>

          {applyError ? (
            <p role="alert" className="mt-2 text-[0.7rem] text-destructive">
              {applyError}
            </p>
          ) : null}
          {applyNote ? (
            <p role="status" className="mt-2 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-300">
              {applyNote}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={applying || missingStarters === 0}
              onClick={applyTemplate}
              className="h-8 gap-1.5 rounded-lg px-3 text-[0.72rem]"
            >
              {applying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LayoutTemplate className="size-3.5" />
              )}
              {applying
                ? "Adding…"
                : missingStarters === 0
                  ? "All cards added"
                  : `Add ${missingStarters} starter ${missingStarters === 1 ? "card" : "cards"}`}
            </Button>
            <span className="text-[0.62rem] text-muted-foreground">
              Existing cards stay where they are; new ones are placed around them.
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-[0.78rem] text-destructive">
          {error}
        </p>
      ) : null}

      {/* One action bar, pinned to the bottom of the settings sheet, matching
          the customize drawer instead of a loose button row mid-page. */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2.5 shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.45)] backdrop-blur">
        <Button type="submit" disabled={saving || !dirty} className="gap-2 rounded-xl">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </Button>
        <Button
          type="button"
          variant="outline"
          nativeButton={false}
          render={<Link href="/dashboard" />}
          className="rounded-xl"
        >
          Back to dashboard
        </Button>
        {dirty ? (
          <span className="rounded-full border border-brand-border bg-brand-soft/60 px-2 py-0.5 text-[0.62rem] font-medium text-brand-ink">
            Unsaved
          </span>
        ) : saved ? (
          <span role="status" className="text-[0.72rem] font-medium text-emerald-700">
            All changes saved
          </span>
        ) : null}
        <span className="ml-auto hidden text-[0.62rem] text-muted-foreground sm:block">
          Applies to this dashboard only
        </span>
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5 dark:border-rose-500/20 dark:bg-rose-500/5">
        <p className="text-[0.72rem] font-medium text-rose-700 dark:text-rose-300">
          Delete this dashboard
        </p>
        <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
          Its widgets, layout and background are removed with it. Your agents, their chat history
          and your other dashboards stay.
        </p>
        {deleteError ? (
          <p role="alert" className="mt-2 text-[0.72rem] text-destructive">
            {deleteError}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setDeleteError(null);
            setConfirmOpen(true);
          }}
          className="mt-3 gap-2 rounded-xl"
        >
          <Trash2 className="size-4" />
          Delete dashboard
        </Button>
      </div>

      <p className="text-[0.66rem] text-muted-foreground">
        Each dashboard keeps its own widgets, layout and background. Switch between them from the
        sidebar picker.
      </p>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {name.trim() || dashboard.name}
              </span>{" "}
              and every widget on it will be removed. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={removeDashboard}>
              {deleting ? "Deleting…" : "Delete dashboard"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

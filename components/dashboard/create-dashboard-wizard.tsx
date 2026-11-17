"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, LayoutGrid, Loader2, Sparkles } from "lucide-react";

import { createDashboardAction, type CreateDashboardState } from "@/app/actions/dashboards";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentAvatarPicker } from "@/components/dashboard/agent-avatar-picker";
import { TemplateArt } from "@/components/dashboard/template-art";
import { TemplatePreview } from "@/components/dashboard/template-preview";
import { getAgentAvatarLabel } from "@/lib/agent-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DASHBOARD_NAME_MAX_LENGTH,
  DASHBOARD_TEMPLATES,
  DEFAULT_DASHBOARD_COLOR,
  DEFAULT_DASHBOARD_ICON,
  DEFAULT_DASHBOARD_TEMPLATE,
  getDashboardTemplate,
} from "@/lib/dashboard-options";
import { getTemplateBlueprint, templateStarterCount } from "@/lib/dashboard-starters";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Details", body: "Name, icon and colour" },
  { id: 2, title: "Starting layout", body: "Choose a template" },
] as const;

const INITIAL_STATE: CreateDashboardState = { error: null };

export function CreateDashboardWizard() {
  const [state, formAction, isPending] = React.useActionState(createDashboardAction, INITIAL_STATE);
  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState(DEFAULT_DASHBOARD_ICON);
  const [color, setColor] = React.useState(DEFAULT_DASHBOARD_COLOR);
  const [template, setTemplate] = React.useState(DEFAULT_DASHBOARD_TEMPLATE);
  /** Once the owner picks a look, a template must not overwrite it. */
  const [lookTouched, setLookTouched] = React.useState(false);

  const templateMeta = getDashboardTemplate(template);
  const blueprint = getTemplateBlueprint(template);
  const starterCount = blueprint?.widgets.length ?? 0;
  const trimmedName = name.trim();
  const canContinue = trimmedName.length > 0;

  // A template brings its own clay portrait and colour, unless the owner has
  // already chosen one of their own.
  function chooseTemplate(next: string) {
    setTemplate(next);
    const nextBlueprint = getTemplateBlueprint(next);
    if (!lookTouched && nextBlueprint) {
      setIcon(nextBlueprint.portrait);
      setColor(nextBlueprint.color);
    }
  }

  return (
    <form action={formAction} className="space-y-7 sm:space-y-8">
      {/* Step tracker */}
      <div className="rounded-2xl border border-border/70 bg-muted/20 p-2">
        <ol className="grid gap-2 sm:grid-cols-2">
          {STEPS.map((item) => {
            const active = step === item.id;
            const complete = step > item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.id === 1) setStep(1);
                    if (item.id === 2 && canContinue) setStep(2);
                  }}
                  disabled={item.id === 2 && !canContinue}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                    active && "bg-card shadow-sm ring-1 ring-border",
                    !active && "hover:bg-card/60",
                    item.id === 2 && !canContinue && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold transition-colors",
                      active && "bg-foreground text-background",
                      complete && "bg-brand-soft text-brand-ink ring-1 ring-brand-border",
                      !active && !complete && "bg-muted text-muted-foreground ring-1 ring-border",
                    )}
                  >
                    {complete ? <Check className="size-4" /> : item.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[0.84rem] font-semibold",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="block truncate text-[0.7rem] text-muted-foreground">{item.body}</span>
                  </span>
                  {complete && (
                    <span className="hidden text-[0.66rem] font-medium text-brand-ink sm:block">Done</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Live preview */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3.5 shadow-sm sm:p-4">
        <AgentAvatar avatar={icon} color={color} className="size-12 shrink-0 sm:size-14" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.62rem] font-medium tracking-[0.12em] text-brand-ink uppercase">
            Dashboard preview
          </p>
          <p className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {trimmedName || "Your dashboard"}
          </p>
          <p className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
            {templateMeta.name} template · {getAgentAvatarLabel(icon)}
          </p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[0.66rem] font-medium text-muted-foreground md:inline-flex">
          <LayoutGrid className="size-3" />
          One per workspace
        </span>
      </div>

      {/* Step 1: details (always mounted so values survive navigation) */}
      <div className={cn("space-y-6", step !== 1 && "hidden")}>
        <div className="space-y-2">
          <Label htmlFor="dashboard-name" className="text-[0.82rem] font-medium">
            Dashboard name
          </Label>
          <Input
            id="dashboard-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (canContinue) setStep(2);
              }
            }}
            placeholder={blueprint?.namePlaceholder ?? "e.g. Product ops, Growth, Personal HQ"}
            maxLength={DASHBOARD_NAME_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            required
            className="h-12 rounded-xl border-border bg-background px-4 text-[0.95rem] shadow-sm focus-visible:border-foreground/30"
          />
          <div className="flex items-center justify-between text-[0.72rem] text-muted-foreground">
            <span>Pick something clear — you can update it anytime later.</span>
            <span className="tabular-nums">
              {name.length}/{DASHBOARD_NAME_MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className="max-w-md">
          <AgentAvatarPicker
            avatar={icon}
            color={color}
            onAvatarChange={(next) => {
              setLookTouched(true);
              setIcon(next);
            }}
            onColorChange={(next) => {
              setLookTouched(true);
              setColor(next);
            }}
          />
        </div>
      </div>

      {/* Step 2: template */}
      <div className={cn("space-y-5", step !== 2 && "hidden")}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Choose a starting layout</h2>
            <p className="mt-1 text-[0.82rem] leading-relaxed text-muted-foreground">
              Templates are just a starting point — your dashboard stays fully editable after creation.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{templateMeta.name}</span>
          </span>
        </div>

        <div role="radiogroup" aria-label="Dashboard template" className="grid gap-4 sm:grid-cols-2">
          {DASHBOARD_TEMPLATES.map((option) => {
            const selected = option.id === template;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseTemplate(option.id)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all",
                  selected
                    ? "border-foreground/30 shadow-md ring-2 ring-foreground/10"
                    : "border-border hover:border-foreground/20 hover:shadow-sm",
                )}
              >
                {templateStarterCount(option.id) > 0 ? (
                  <TemplatePreview template={option.id} className="rounded-none" />
                ) : (
                  <TemplateArt
                    id={option.id}
                    className="relative block h-36 overflow-hidden bg-gradient-to-b from-muted/30 to-muted/60"
                  />
                )}

                <div className="flex flex-1 flex-col gap-1.5 border-t border-border/70 px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.9rem] font-semibold">{option.name}</span>
                    {option.id === DEFAULT_DASHBOARD_TEMPLATE ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-semibold tracking-wide text-muted-foreground uppercase">
                        Recommended
                      </span>
                    ) : null}
                    {templateStarterCount(option.id) > 0 ? (
                      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground tabular-nums">
                        {templateStarterCount(option.id)} cards
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "ml-auto grid size-5 place-items-center rounded-full border transition-colors",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background text-transparent",
                      )}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  </div>
                  <p className="text-[0.76rem] leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {blueprint ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-brand-border bg-brand-soft text-brand-ink">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.78rem] font-semibold">
                {starterCount === 0
                  ? "Starts as an empty canvas"
                  : `Starts with ${starterCount} cards, already laid out`}
              </p>
              <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
                {blueprint.focus}
              </p>
            </div>
            <p className="shrink-0 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[0.62rem] leading-relaxed text-muted-foreground sm:max-w-[17rem]">
              &ldquo;{blueprint.firstPrompt}&rdquo;
            </p>
          </div>
        ) : null}
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[0.8rem] text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {/* Values the server needs */}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={color} />
      <input type="hidden" name="template" value={template} />

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[0.72rem] text-muted-foreground">
          <span className="inline-flex h-5 items-center rounded-full bg-muted px-2 font-medium text-foreground/70">
            Step {step} of 2
          </span>
          <span className="hidden sm:inline">
            {step === 1 ? "Choose a name and look" : "Pick a template, then create"}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Back keeps its place on both steps, so the primary button never
              shifts under the pointer while a click is landing. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep(1)}
            disabled={isPending || step !== 2}
            tabIndex={step === 2 ? 0 : -1}
            aria-hidden={step !== 2}
            className={cn(
              "h-10 flex-1 gap-1.5 rounded-xl border-border bg-card px-4 text-[0.82rem] font-medium hover:bg-muted sm:flex-none",
              step !== 2 && "invisible",
            )}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>

          {/* One element for both steps: Continue advances the wizard, Create
              submits it. Swapping two separate buttons here re-lands the click
              on the submit button that replaces Continue. */}
          <Button
            type={step === 1 ? "button" : "submit"}
            onClick={
              step === 1
                ? (event) => {
                    event.preventDefault();
                    if (canContinue) setStep(2);
                  }
                : undefined
            }
            disabled={isPending || !canContinue}
            className="h-10 w-full gap-1.5 rounded-xl bg-foreground px-5 text-[0.82rem] font-semibold text-background shadow-sm hover:bg-foreground/90 sm:w-auto"
          >
            {step === 1 ? (
              <>
                Continue
                <ArrowRight className="size-3.5" />
              </>
            ) : isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Create dashboard
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}


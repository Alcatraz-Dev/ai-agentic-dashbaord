"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Bot, Check, ChevronRight, KeyRound, Loader2, Search, Sparkles, Wand2 } from "lucide-react";

import { createAgentAction } from "@/app/actions/agents";
import { ModelLogo } from "@/components/agents/model-logo";
import { formatContextLength, modelKeyForId, type AgentModelInfo } from "@/lib/model-catalog";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentAvatarPicker } from "@/components/dashboard/agent-avatar-picker";
import { useAgents } from "@/components/dashboard/agents-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import {
  AGENT_INSTRUCTIONS_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
  DEFAULT_AGENT_AVATAR,
  DEFAULT_AGENT_COLOR,
  getAgentAvatarLabel,
  getAgentColor,
} from "@/lib/agent-options";
import { cn } from "@/lib/utils";

const INSTRUCTION_STARTERS = [
  {
    label: "Researcher",
    text: "You are a research assistant. Find reliable sources, compare viewpoints, cite what matters, and summarise findings clearly.",
  },
  {
    label: "Writer",
    text: "You are a writing assistant. Draft clear, on-brand content, improve tone and structure, and keep edits concise and purposeful.",
  },
  {
    label: "Analyst",
    text: "You are a data analyst. Explain trends, calculate when needed, highlight risks or opportunities, and present actionable takeaways.",
  },
  {
    label: "Support",
    text: "You are a helpful support agent. Answer questions patiently, ask clarifying questions when needed, and provide step-by-step guidance.",
  },
] as const;

type ModelOption = { key: string; info: AgentModelInfo; builtin: boolean };

function modelMatches(info: AgentModelInfo, needle: string) {
  if (!needle) return true;
  const haystack = [info.name, info.id, info.provider].join(" ").toLowerCase();
  return haystack.includes(needle);
}

/**
 * "Create AI agent" trigger + dialog.
 *
 * One scrollable form: identity (name, avatar, accent), model choice (built-in
 * and any connected models) and optional instructions. Submits through
 * `createAgentAction` and appends the new agent client-side.
 */
export function CreateAgentButton({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) {
  const { addAgent, models } = useAgents();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(DEFAULT_AGENT_AVATAR);
  const [color, setColor] = useState(DEFAULT_AGENT_COLOR);
  const [provider, setProvider] = useState(models.defaultKey);
  const [modelQuery, setModelQuery] = useState("");
  const [instructions, setInstructions] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modelOptions = useMemo<ModelOption[]>(
    () => [
      ...models.builtin.map((info) => ({
        key: modelKeyForId(info.id),
        info,
        builtin: true,
      })),
      ...models.custom.map((info) => ({
        key: info.id,
        info,
        builtin: false,
      })),
    ],
    [models.builtin, models.custom],
  );

  function resetForm() {
    setName("");
    setAvatar(DEFAULT_AGENT_AVATAR);
    setColor(DEFAULT_AGENT_COLOR);
    setProvider(models.defaultKey);
    setModelQuery("");
    setInstructions("");
    setNameError(null);
    setError(null);
    setIsSubmitting(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Give your agent a name.");
      return;
    }

    setNameError(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await createAgentAction({
        name: trimmedName,
        avatar,
        color,
        provider,
        instructions,
      });

      if (!result.ok) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      addAgent(result.agent);
      handleOpenChange(false);
    } catch (submitError) {
      console.error("[agents] create request failed", submitError);
      setError("We couldn't create your agent. Please try again.");
      setIsSubmitting(false);
    }
  }

  const needle = modelQuery.trim().toLowerCase();
  const visibleBuiltin = modelOptions.filter((m) => m.builtin && modelMatches(m.info, needle));
  const visibleCustom = modelOptions.filter((m) => !m.builtin && modelMatches(m.info, needle));
  const visibleCount = visibleBuiltin.length + visibleCustom.length;

  const selected =
    modelOptions.find((option) => option.key === provider) ??
    modelOptions.find((option) => option.key === models.defaultKey) ??
    modelOptions[0] ??
    null;

  const colorOption = getAgentColor(color);

  function renderModelRow(option: ModelOption) {
    const { key, info, builtin } = option;
    const isSelected = key === (selected?.key ?? provider);

    return (
      <button
        key={key}
        type="button"
        onClick={() => setProvider(key)}
        aria-pressed={isSelected}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
          isSelected
            ? "border-brand-border bg-brand-soft/70 ring-1 ring-brand-border shadow-sm"
            : "border-border bg-card hover:border-foreground/15 hover:bg-muted/50",
        )}
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg ring-1",
            builtin
              ? "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20"
              : "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20",
          )}
        >
          <ModelLogo logo={info.logo} className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.82rem] font-medium text-foreground">{info.name}</span>
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold tracking-wide uppercase",
                builtin
                  ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-violet-600/10 text-violet-700 dark:text-violet-300",
              )}
            >
              {builtin ? "Included" : "Connected"}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground">
            {[info.provider, info.id.replace(/^ai:/, "").replace(/^custom:\d+$/, info.name), formatContextLength(info.contextLength)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-transparent group-hover:border-foreground/20",
          )}
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button className={className} id={id} />}>
        <Sparkles className="size-4" />
        <span className="truncate group-data-[collapsible=icon]:hidden">Create AI agent</span>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:w-[min(52rem,calc(100vw-3rem))] sm:max-w-[52rem]">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden"
          noValidate
        >
          {/* Header + live preview */}
          <div className="relative shrink-0 overflow-hidden border-b border-border/70 bg-gradient-to-b from-muted/40 to-card px-4 py-4 sm:px-6 sm:py-5">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-12 size-48 rounded-full bg-primary/10 blur-3xl"
            />
            <div className="relative flex items-start gap-4 pr-8">
              <div className="relative shrink-0">
                <AgentAvatar
                  avatar={avatar}
                  color={color}
                  className="size-14 sm:size-16"
                />
                <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-background text-brand-ink shadow-sm ring-1 ring-border">
                  <Bot className="size-3.5" />
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="aui-eyebrow mb-1">New agent</p>
                <DialogTitle className="truncate font-heading text-[1.15rem] font-semibold tracking-tight sm:text-[1.25rem]">
                  {name.trim() || "Untitled agent"}
                </DialogTitle>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] leading-relaxed">
                  <span className="inline-flex items-center gap-1.5 text-foreground/80">
                    <ModelLogo logo={selected?.info.logo ?? "default"} className="size-3.5" />
                    {selected?.info.name ?? "Choose a model"}
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{colorOption.label}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{getAgentAvatarLabel(avatar)}</span>
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-7">
              {/* Left: identity */}
              <section className="min-w-0 space-y-5">
                <div>
                  <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    Identity
                  </h3>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    How this agent appears in your workspace.
                  </p>
                </div>

                <TextField
                  id="agent-name"
                  label="Agent name"
                  name="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (nameError) setNameError(null);
                  }}
                  maxLength={AGENT_NAME_MAX_LENGTH}
                  counter
                  error={nameError}
                  placeholder="e.g. Research Scout, Support Bot, Content Writer"
                  autoComplete="off"
                  autoFocus
                  size="lg"
                />

                <AgentAvatarPicker
                  avatar={avatar}
                  color={color}
                  onAvatarChange={setAvatar}
                  onColorChange={setColor}
                />
              </section>

              {/* Right: model */}
              <section className="min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                      Model
                    </h3>
                    <p className="mt-1 text-[0.75rem] text-muted-foreground">
                      Choose the brain this agent runs on. You can change it later.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[0.62rem] font-medium text-muted-foreground tabular-nums">
                    {modelOptions.length} total
                  </span>
                </div>

                <TextField
                  value={modelQuery}
                  onChange={(event) => setModelQuery(event.target.value)}
                  placeholder="Search by name, provider or id"
                  aria-label="Search models"
                  autoComplete="off"
                  prefix={<Search className="size-3.5" />}
                  size="md"
                  clearable
                />

                <div className="max-h-[20rem] space-y-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[22rem]">
                  {visibleCustom.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        <KeyRound className="size-3 text-violet-600" />
                        <span className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          Your connected models
                        </span>
                      </div>
                      <div className="space-y-1.5">{visibleCustom.map(renderModelRow)}</div>
                    </div>
                  )}

                  {visibleBuiltin.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 px-1">
                        <Sparkles className="size-3 text-brand-ink" />
                        <span className="text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
                          Built-in models
                        </span>
                      </div>
                      <div className="space-y-1.5">{visibleBuiltin.map(renderModelRow)}</div>
                    </div>
                  )}

                  {visibleCount === 0 && (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                      <p className="text-[0.8rem] font-medium text-foreground">No models found</p>
                      <p className="mt-1 text-[0.72rem] text-muted-foreground">
                        Try a different name, provider, or model id.
                      </p>
                    </div>
                  )}
                </div>

                {models.custom.length === 0 ? (
                  <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[0.68rem] leading-relaxed text-muted-foreground">
                    Using built-in models. You can connect your own model endpoint later from the agent
                    settings.
                  </p>
                ) : null}
              </section>
            </div>

            {/* Instructions */}
            <section className="mt-6 space-y-3 border-t border-border/70 pt-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    Instructions
                  </h3>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    Optional. Tell the agent its role, tone, and what to prioritise.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-[0.66rem] text-muted-foreground">
                    <Wand2 className="size-3" /> Starters:
                  </span>
                  {INSTRUCTION_STARTERS.map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => setInstructions(starter.text)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[0.66rem] font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
              </div>

              <TextArea
                id="agent-instructions"
                name="instructions"
                aria-label="Agent instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
                counter
                minRows={4}
                maxRows={8}
                placeholder="Describe what this agent should do, how it should behave, and any rules it must follow…"
              />
            </section>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-[0.78rem] text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 flex-col gap-3 rounded-none border-t bg-muted/30 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:px-6">
            <div className="mr-auto hidden items-center gap-3 text-[0.68rem] text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="size-3 text-brand-ink" />
                All tools enabled by default
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1">
                Configure more after creation <ChevronRight className="size-3" />
              </span>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <DialogClose
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl sm:flex-none"
                  />
                }
              >
                Cancel
              </DialogClose>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 gap-2 rounded-xl bg-foreground text-background shadow-sm hover:bg-foreground/90 sm:flex-none"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {isSubmitting ? "Creating…" : "Create agent"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

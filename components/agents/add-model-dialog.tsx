"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2, Plus, RefreshCw, Search } from "lucide-react";

import {
  createAgentModelAction,
  listCustomModelsAction,
} from "@/app/actions/agents";
import { ModelLogo } from "@/components/agents/model-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";

const API_OPTIONS = [
  {
    id: "chat_completions",
    label: "Chat completions",
    hint: "Most providers",
  },
  {
    id: "responses",
    label: "Responses",
    hint: "OpenAI-native",
  },
] as const;

const MAX_VISIBLE_MODELS = 80;

type EndpointModel = {
  id: string;
  name: string;
  ownedBy?: string;
};

/**
 * Connects any OpenAI-compatible model.
 *
 * Once the base URL and key are entered, the endpoint's `/models` is queried
 * and its models are offered as a picker. The model id field stays editable for
 * gateways that don't expose a list. The server seals the key before it reaches
 * Postgres; the parent then adds the returned row to its picker and selects it.
 */
export function AddModelDialog({
  open,
  onOpenChange,
  agentId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number;
  onAdded: (model: { id: number; label: string; model: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [api, setApi] = useState<(typeof API_OPTIONS)[number]["id"]>("chat_completions");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [models, setModels] = useState<EndpointModel[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryTick, setDiscoveryTick] = useState(0);

  function reset() {
    setLabel("");
    setBaseUrl("");
    setModel("");
    setApiKey("");
    setApi("chat_completions");
    setError(null);
    setIsSaving(false);
    setModels([]);
    setModelQuery("");
    setIsDiscovering(false);
    setDiscoveryError(null);
    setDiscoveryTick(0);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  // Ask the endpoint for its models after the URL and key settle. Changing
  // either field cancels the pending request, so a stale answer can't replace
  // the list for a different endpoint.
  useEffect(() => {
    if (!open) return;

    const base = baseUrl.trim();
    const key = apiKey.trim();

    if (!base || !key) {
      setModels([]);
      setDiscoveryError(null);
      setIsDiscovering(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsDiscovering(true);
      setDiscoveryError(null);

      listCustomModelsAction({ baseUrl: base, apiKey: key })
        .then((result) => {
          if (cancelled) return;

          if (result.ok) {
            setModels(result.models);
            setDiscoveryError(null);
          } else {
            setModels([]);
            setDiscoveryError(result.error);
          }
        })
        .catch((discoveryFailure) => {
          if (cancelled) return;
          console.error("[agents] model discovery request failed", discoveryFailure);
          setModels([]);
          setDiscoveryError(
            "Couldn't list models. Check the URL and key, or enter the model id manually.",
          );
        })
        .finally(() => {
          if (!cancelled) setIsDiscovering(false);
        });
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, baseUrl, apiKey, discoveryTick]);

  function handleBaseUrlChange(value: string) {
    setBaseUrl(value);
    // A model belongs to the endpoint it came from.
    setModel("");
    setModels([]);
    setModelQuery("");
    setDiscoveryError(null);
    if (error) setError(null);
  }

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    setDiscoveryError(null);
    if (error) setError(null);
  }

  function handleModelChange(value: string) {
    setModel(value);
    if (error) setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    if (!label.trim()) {
      setError("Give this model a name.");
      return;
    }
    if (!baseUrl.trim()) {
      setError("Enter the provider's base URL.");
      return;
    }
    if (!model.trim()) {
      setError("Choose a model from the list or enter its id.");
      return;
    }
    if (!apiKey.trim()) {
      setError("Enter the API key for this model.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const result = await createAgentModelAction({
        label,
        baseUrl,
        model,
        apiKey,
        api,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onAdded(result.model);
      reset();
      onOpenChange(false);
    } catch (submitError) {
      console.error("[agents] create model request failed", submitError);
      setError("We couldn't save that model. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const needle = modelQuery.trim().toLowerCase();
  const visibleModels = needle
    ? models.filter(
        (option) =>
          option.id.toLowerCase().includes(needle) ||
          option.name.toLowerCase().includes(needle) ||
          (option.ownedBy?.toLowerCase().includes(needle) ?? false),
      )
    : models;
  const shownModels = visibleModels.slice(0, MAX_VISIBLE_MODELS);
  const selectedId = model.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:w-[min(31rem,calc(100vw-3rem))] sm:max-w-[31rem]">
        <form
          onSubmit={handleSubmit}
          className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col overflow-hidden"
          noValidate
        >
          <div className="shrink-0 border-b border-border/60 px-5 py-4">
            <DialogTitle className="font-heading text-[1rem] font-semibold">
              Connect a custom model
            </DialogTitle>
            <DialogDescription className="mt-1 text-[0.74rem] leading-relaxed">
              Any OpenAI-compatible endpoint works — a hosted provider, a gateway or a local
              server. Enter the URL and key to see its models. The key is encrypted and used only
              for this workspace.
            </DialogDescription>
          </div>

          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
            <TextField
              label="Display name"
              id="custom-model-label"
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                if (error) setError(null);
              }}
              maxLength={100}
              placeholder="e.g. Llama 3.3 on Together"
              autoComplete="off"
              autoFocus
              size="sm"
            />

            <TextField
              label="Base URL"
              id="custom-model-base"
              value={baseUrl}
              onChange={(event) => handleBaseUrlChange(event.target.value)}
              maxLength={500}
              placeholder="https://api.provider.com/v1"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              hint="The API root, not the full chat endpoint. HTTPS is required; localhost may use HTTP."
              inputClassName="font-mono"
              size="sm"
            />

            <TextField
              label="API key"
              id="custom-model-key"
              type="password"
              value={apiKey}
              onChange={(event) => handleApiKeyChange(event.target.value)}
              maxLength={500}
              placeholder="sk-…"
              autoComplete="new-password"
              inputClassName="font-mono"
              size="sm"
            />

            <div className="space-y-1.5">
              <span className="text-[0.75rem] font-medium text-foreground">API format</span>
              <SegmentedControl
                size="sm"
                fullWidth
                variant="tray"
                value={api}
                onChange={(val) => setApi(val as (typeof API_OPTIONS)[number]["id"])}
                options={API_OPTIONS.map((opt) => ({
                  value: opt.id,
                  label: `${opt.label} (${opt.hint})`,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <TextField
                label="Model id"
                optional
                id="custom-model-id"
                value={model}
                onChange={(event) => handleModelChange(event.target.value)}
                maxLength={200}
                placeholder="Pick one below, or enter an id"
                autoComplete="off"
                spellCheck={false}
                hint={
                  models.length > 0
                    ? "Select a model below, or type a different id."
                    : "The endpoint's models appear here once the URL and key are correct. You can also type the id yourself."
                }
                suffix={
                  models.length > 0 ? (
                    <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                      {models.length} found
                    </span>
                  ) : undefined
                }
                inputClassName="font-mono"
                size="sm"
              />

              {isDiscovering ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-[0.66rem] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Looking up models…
                </div>
              ) : null}

              {discoveryError && !isDiscovering ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2">
                  <p className="text-[0.66rem] leading-relaxed text-amber-800 dark:text-amber-300">
                    {discoveryError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDiscoveryTick((value) => value + 1)}
                    className="mt-1 text-[0.64rem] font-medium text-amber-900 underline underline-offset-2 hover:no-underline dark:text-amber-200"
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {models.length > 0 && !isDiscovering ? (
                <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5">
                    <span className="text-[0.58rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      Models from endpoint
                    </span>
                    <button
                      type="button"
                      onClick={() => setDiscoveryTick((value) => value + 1)}
                      aria-label="Refresh models"
                      title="Refresh models"
                      className="grid size-5 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <RefreshCw className="size-3" />
                    </button>
                  </div>

                  {models.length > 6 ? (
                    <div className="relative border-b border-border/60 p-1.5">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-3 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={modelQuery}
                        onChange={(event) => setModelQuery(event.target.value)}
                        placeholder="Filter models"
                        aria-label="Filter models"
                        autoComplete="off"
                        className="h-7 rounded-md bg-background pl-7 text-[0.7rem]"
                      />
                    </div>
                  ) : null}

                  <div className="max-h-44 space-y-0.5 overflow-y-auto p-1">
                    {shownModels.map((option) => {
                      const selected = option.id === selectedId;
                      const detail = [
                        option.id !== option.name ? option.id : null,
                        option.ownedBy,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleModelChange(option.id)}
                          aria-pressed={selected}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition",
                            selected
                              ? "bg-brand-soft ring-1 ring-brand-border"
                              : "hover:bg-muted/60",
                          )}
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-card ring-1 ring-border/70">
                            <ModelLogo logo="generic" className="size-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.72rem] font-medium">
                              {option.name}
                            </span>
                            {detail ? (
                              <span className="mt-0.5 block truncate font-mono text-[0.58rem] text-muted-foreground">
                                {detail}
                              </span>
                            ) : null}
                          </span>
                          {selected ? (
                            <Check className="size-3 shrink-0 text-brand-ink" strokeWidth={3} />
                          ) : null}
                        </button>
                      );
                    })}

                    {shownModels.length === 0 ? (
                      <p className="px-2 py-4 text-center text-[0.66rem] text-muted-foreground">
                        No models match &ldquo;{modelQuery}&rdquo;.
                      </p>
                    ) : null}
                  </div>

                  {visibleModels.length > MAX_VISIBLE_MODELS ? (
                    <p className="border-t border-border/60 px-2 py-1.5 text-[0.6rem] text-muted-foreground">
                      Showing the first {MAX_VISIBLE_MODELS}. Filter to find more.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error ? (
              <p role="alert" className="text-[0.72rem] text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-border/60 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
              className="rounded-lg text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="gap-1.5 rounded-lg bg-foreground text-background shadow-sm hover:bg-foreground/90"
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Connect model
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

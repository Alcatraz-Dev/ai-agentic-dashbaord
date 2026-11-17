"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Code2,
  FileJson,
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  createCustomPluginAction,
  deleteCustomPluginAction,
} from "@/app/actions/plugins";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { IntegrationBeam } from "@/components/aui/illustrations/integration-beam";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { TextArea } from "@/components/ui/text-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  CUSTOM_PLUGIN_AUTHORIZATION_MAX,
  CUSTOM_PLUGIN_DESCRIPTION_MAX,
  CUSTOM_PLUGIN_INPUT_HINT_MAX,
  CUSTOM_PLUGIN_NAME_MAX,
  CUSTOM_PLUGIN_URL_MAX,
  CUSTOM_PLUGINS_MAX,
  customPluginToolName,
  type CustomPluginMethod,
  type CustomPluginSummary,
} from "@/lib/custom-plugin-types";
import { toast } from "@/components/ui/toast";

const FIELD_LABEL = "text-[0.72rem]";
const MANIFEST_BYTES_MAX = 32_000;

function hostAndPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function slugPreview(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "tool"
  );
}

/**
 * Custom HTTP plugins. Each saved endpoint becomes one tool (`plugin_<slug>`)
 * on every agent run: it receives `{ input }` and its response is returned as
 * text. The optional Authorization header is encrypted at rest.
 */
export function PluginsManager({ plugins }: { plugins: CustomPluginSummary[] }) {
  const router = useRouter();
  const [list, setList] = useState(plugins);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<CustomPluginMethod>("POST");
  const [authorization, setAuthorization] = useState("");
  const [inputHint, setInputHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manifestInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setList(plugins);
  }, [plugins]);

  function reset() {
    setName("");
    setDescription("");
    setUrl("");
    setMethod("POST");
    setAuthorization("");
    setInputHint("");
    setSaving(false);
    setError(null);
    if (manifestInput.current) manifestInput.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function importManifest(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MANIFEST_BYTES_MAX) {
      setError("Keep the manifest under 32 KB.");
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (typeof parsed.name === "string") setName(parsed.name.slice(0, CUSTOM_PLUGIN_NAME_MAX));
      if (typeof parsed.description === "string") {
        setDescription(parsed.description.slice(0, CUSTOM_PLUGIN_DESCRIPTION_MAX));
      }
      if (typeof parsed.url === "string") setUrl(parsed.url.slice(0, CUSTOM_PLUGIN_URL_MAX));
      if (parsed.method === "GET" || parsed.method === "POST") setMethod(parsed.method);
      if (typeof parsed.authorization === "string") setAuthorization(parsed.authorization);
      if (typeof parsed.inputHint === "string") setInputHint(parsed.inputHint);
      toast.add({
        title: "Manifest loaded",
        description: "Check the fields, then add the plugin.",
        type: "info",
      });
    } catch {
      setError("That file isn't a valid plugin manifest.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

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

      setList((current) => [...current, result.plugin]);
      setOpen(false);
      reset();
      router.refresh();
      toast.add({
        title: "Plugin added",
        description: `${result.plugin.name} is available to every agent as ${customPluginToolName(
          result.plugin.slug,
        )}.`,
        type: "success",
      });
    } catch (submitError) {
      console.error("[plugins] create request failed", submitError);
      setError("We couldn't save that plugin. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(plugin: CustomPluginSummary) {
    if (removing !== null) return;
    if (!window.confirm(`Remove "${plugin.name}"? Agents will lose this tool.`)) return;

    setRemoving(plugin.id);

    try {
      const result = await deleteCustomPluginAction({ id: plugin.id });

      if (!result.ok) {
        toast.add({ title: "Couldn't remove plugin", description: result.error, type: "error" });
        return;
      }

      setList((current) => current.filter((entry) => entry.id !== plugin.id));
      router.refresh();
      toast.add({
        title: "Plugin removed",
        description: `${plugin.name} is no longer available to your agents.`,
        type: "success",
      });
    } catch (removeError) {
      console.error("[plugins] delete request failed", removeError);
      toast.add({
        title: "Couldn't remove plugin",
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
            <Code2 className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold">Your plugins</h2>
            <p className="mt-0.5 max-w-lg text-[0.72rem] leading-relaxed text-muted-foreground">
              Point a plugin at an HTTPS endpoint. Every agent gets one tool that sends{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.64rem]">
                {"{ input }"}
              </code>{" "}
              and returns the response.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={list.length >= CUSTOM_PLUGINS_MAX}
          className="h-8 gap-1.5 rounded-full bg-foreground px-3 text-[0.75rem] text-background shadow-sm hover:bg-foreground/90 disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          Add plugin
        </Button>
      </div>

      {list.length === 0 ? (
        <IllustratedEmpty
          className="mt-4"
          art={<IntegrationBeam />}
          artClassName="w-48"
          title="No custom plugins yet"
          text="A lookup API, an internal webhook, a price service — anything that accepts JSON."
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
              <Plus className="size-3.5" />
              Add plugin
            </Button>
          }
        />
      ) : (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {list.map((plugin) => (
            <article
              key={plugin.id}
              className="group flex flex-col rounded-xl border border-border/70 bg-card p-3.5 transition-colors hover:border-violet-200"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                  <Globe2 className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="truncate text-[0.84rem] font-semibold">{plugin.name}</h3>
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[0.56rem] font-semibold text-violet-700 ring-1 ring-violet-600/15">
                      Custom
                    </span>
                    {plugin.hasAuthorization && (
                      <ShieldCheck
                        className="size-3 text-emerald-600"
                        aria-label="Authorization header stored"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[0.69rem] leading-relaxed text-muted-foreground">
                    {plugin.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(plugin)}
                  disabled={removing !== null}
                  aria-label={`Remove ${plugin.name}`}
                  title="Remove plugin"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  {removing === plugin.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold text-muted-foreground">
                  {plugin.method}
                </span>
                <span className="min-w-0 truncate font-mono text-[0.61rem] text-muted-foreground">
                  {hostAndPath(plugin.url)}
                </span>
              </div>

              <p className="mt-2 truncate font-mono text-[0.6rem] text-muted-foreground/80">
                tool: {customPluginToolName(plugin.slug)}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-[0.62rem] text-muted-foreground">
                <span className="truncate">
                  {plugin.inputHint ? `input: ${plugin.inputHint}` : "input: free text"}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {plugin.hasAuthorization ? (
                    <>
                      <KeyRound className="size-2.5" />
                      Auth
                    </>
                  ) : (
                    "No auth"
                  )}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-3 text-[0.66rem] leading-relaxed text-muted-foreground">
        {list.length}/{CUSTOM_PLUGINS_MAX} plugins. Public HTTPS only; localhost is allowed for
        development. Responses are capped before they reach the model.
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
                  <Code2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-heading text-base font-semibold">
                    Add a custom plugin
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                    Save an HTTP endpoint as a tool every agent can call.
                  </DialogDescription>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                <p className="text-[0.67rem] leading-relaxed text-violet-900/80">
                  Already have a manifest? Import name, URL and auth in one file.
                </p>
                <button
                  type="button"
                  onClick={() => manifestInput.current?.click()}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-1 text-[0.66rem] font-medium text-violet-700 ring-1 ring-violet-200 transition-colors hover:bg-violet-50"
                >
                  <FileJson className="size-3" />
                  Import JSON
                </button>
                <input
                  ref={manifestInput}
                  type="file"
                  accept=".json,application/json"
                  onChange={importManifest}
                  className="sr-only"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  id="plugin-name"
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Invoice lookup"
                  maxLength={CUSTOM_PLUGIN_NAME_MAX}
                  autoComplete="off"
                />
                <div className="space-y-1.5">
                  <label htmlFor="plugin-method" className="text-[0.72rem] font-medium text-foreground">
                    Method
                  </label>
                  <NativeSelect
                    id="plugin-method"
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value === "GET" ? "GET" : "POST")
                    }
                    className="w-full [&_select]:h-9 [&_select]:rounded-xl [&_select]:bg-background"
                  >
                    <NativeSelectOption value="POST">POST · JSON body</NativeSelectOption>
                    <NativeSelectOption value="GET">GET · query string</NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>

              <TextField
                id="plugin-url"
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
                id="plugin-description"
                label="What it does"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Looks up the latest invoice status for a customer."
                maxLength={CUSTOM_PLUGIN_DESCRIPTION_MAX}
                minRows={3}
              />

              <TextField
                id="plugin-input"
                label="What goes in"
                hint="optional"
                value={inputHint}
                onChange={(event) => setInputHint(event.target.value)}
                placeholder="A customer email or invoice number"
                maxLength={CUSTOM_PLUGIN_INPUT_HINT_MAX}
                autoComplete="off"
              />

              <div className="space-y-1">
                <TextField
                  id="plugin-auth"
                  type="password"
                  label="Authorization header"
                  hint="optional"
                  value={authorization}
                  onChange={(event) => setAuthorization(event.target.value)}
                  placeholder="Bearer sk-…"
                  maxLength={CUSTOM_PLUGIN_AUTHORIZATION_MAX}
                  autoComplete="off"
                  className="font-mono text-[0.72rem]"
                />
                <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                  Sent verbatim on every call and encrypted at rest. Leave empty for open
                  endpoints.
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
                  Tool name:{" "}
                  <code className="font-mono text-foreground">
                    {customPluginToolName(slugPreview(name))}
                  </code>
                  . A POST receives{" "}
                  <code className="font-mono text-foreground">{`{"input":"…"}`}</code>; a GET
                  receives <code className="font-mono text-foreground">?input=…</code>.
                </p>
              </div>

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
                {saving ? "Saving…" : "Add plugin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

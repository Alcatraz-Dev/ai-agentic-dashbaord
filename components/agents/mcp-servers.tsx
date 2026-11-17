"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plug, Plus, RefreshCw, ShieldCheck, Trash2, Wrench } from "lucide-react";

import {
  createAgentMcpServerAction,
  deleteAgentMcpServerAction,
  refreshAgentMcpServerAction,
  startMcpOAuthAction,
  updateAgentMcpToolsAction,
} from "@/app/actions/agents";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/illustrated-empty";
import { FrostCloud } from "@/components/aui/illustrations/frost-cloud";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { TreeView } from "@/components/ui/tree-view";
import {
  isKnownMcpToolKey,
  mcpToolKey,
  type AgentMcpServerSummary,
} from "@/lib/agent-mcp-types";
import { cn } from "@/lib/utils";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * MCP servers for the signed-in user plus the per-agent tool scope. Servers are
 * account-wide; which of their tools this agent may call is stored on the agent
 * (`agents.mcp_tools`), so two agents can share a server with different scopes.
 */
export function McpServersSection({
  servers,
  agentId,
  enabled,
  notice,
  returnTo = "/dashboard/settings",
}: {
  servers: AgentMcpServerSummary[];
  /** Omit on the MCPs/settings pages, where the section manages servers only. */
  agentId?: number;
  /** Stored scope: null = every MCP tool. Only meaningful with `agentId`. */
  enabled?: string[] | null;
  /** Set by the OAuth callback redirect. */
  notice?: "connected" | "error" | null;
  /** Where the OAuth callback lands; defaults to workspace settings. */
  returnTo?: string;
}) {
  const scopedToAgent = typeof agentId === "number";
  const router = useRouter();
  const [list, setList] = useState(servers);
  const [scope, setScope] = useState<string[] | null>(enabled ?? null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(servers);
  }, [servers]);

  useEffect(() => {
    if (enabled !== undefined) setScope(enabled);
  }, [enabled]);

  function isOn(key: string) {
    return scope === null ? true : scope.includes(key);
  }

  function keysForAllTools() {
    return list.flatMap((server) => server.tools.map((tool) => mcpToolKey(server.id, tool)));
  }

  async function saveScope(next: string[]) {
    if (typeof agentId !== "number") return;

    const previous = scope;
    const cleaned = [...new Set(next.filter((key) => isKnownMcpToolKey(key, list)))];

    setScope(cleaned);
    setSavingScope(true);
    setError(null);

    try {
      const result = await updateAgentMcpToolsAction({ id: agentId, tools: cleaned });

      if (!result.ok) {
        setScope(previous);
        setError(result.error);
        return;
      }

      setScope(result.agent.mcpTools);
      router.refresh();
    } catch (scopeError) {
      console.error("[agents] MCP scope update failed", scopeError);
      setScope(previous);
      setError("We couldn't save the MCP tools. Please try again.");
    } finally {
      setSavingScope(false);
    }
  }

  function toggleTool(key: string) {
    if (savingScope || !scopedToAgent) return;
    const base = scope ?? keysForAllTools();
    void saveScope(isOn(key) ? base.filter((entry) => entry !== key) : [...base, key]);
  }

  function toggleServer(server: AgentMcpServerSummary) {
    if (savingScope || !scopedToAgent) return;
    const base = scope ?? keysForAllTools();
    const keys = server.tools.map((tool) => mcpToolKey(server.id, tool));
    const allOn = keys.every((key) => base.includes(key));

    void saveScope(
      allOn ? base.filter((key) => !keys.includes(key)) : [...new Set([...base, ...keys])],
    );
  }

  async function remove(server: AgentMcpServerSummary) {
    if (removing !== null) return;
    if (!window.confirm(`Disconnect "${server.label}"? Its tools stop being available to your agents.`)) {
      return;
    }

    setRemoving(server.id);
    setError(null);

    try {
      const result = await deleteAgentMcpServerAction({ id: server.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setList((current) => current.filter((entry) => entry.id !== server.id));
      router.refresh();
    } catch (removeError) {
      console.error("[agents] MCP delete request failed", removeError);
      setError("We couldn't disconnect that server. Please try again.");
    } finally {
      setRemoving(null);
    }
  }

  async function refresh(server: AgentMcpServerSummary) {
    if (refreshing !== null) return;

    setRefreshing(server.id);
    setError(null);

    try {
      const result = await refreshAgentMcpServerAction({ id: server.id });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setList((current) =>
        current.map((entry) => (entry.id === result.server.id ? result.server : entry)),
      );
      router.refresh();
    } catch (refreshError) {
      console.error("[agents] MCP refresh request failed", refreshError);
      setError("We couldn't re-read that server's tools. Please try again.");
    } finally {
      setRefreshing(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          MCP servers
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-6 gap-1 rounded-md px-1.5 text-[0.66rem] text-muted-foreground hover:text-brand-ink"
        >
          <Plus className="size-3" />
          Add custom MCP
        </Button>
      </div>

      {notice && (
        <p
          className={cn(
            "mt-1.5 rounded-lg px-2 py-1.5 text-[0.68rem]",
            notice === "connected"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-destructive/5 text-destructive",
          )}
        >
          {notice === "connected"
            ? scopedToAgent
              ? "Server connected. Pick the tools this agent may use."
              : "Server connected. Its tools are available to every agent."
            : "We couldn't finish that sign-in. Please try again."}
        </p>
      )}

      {list.length === 0 ? (
        <IllustratedEmpty
          layout="overlay"
          className="mt-1.5 min-h-[196px]"
          art={<FrostCloud color="blue" />}
          title="No MCP servers yet"
          text="Connect a Model Context Protocol server to give every agent its tools."
        />
      ) : (
        <ul className="mt-1.5 space-y-1">
          {list.map((server) => {
            const keys = server.tools.map((tool) => mcpToolKey(server.id, tool));
            const onCount = keys.filter((key) => isOn(key)).length;
            const isExpanded = expanded === server.id;

            return (
              <li key={server.id} className="rounded-lg transition-colors hover:bg-muted/40">
                <div className="flex items-start gap-2 px-1.5 py-1.5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-foreground ring-1 ring-border">
                    <Plug className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[0.76rem] font-medium">{server.label}</span>
                      {server.auth === "oauth" && (
                        <ShieldCheck
                          className="size-3 shrink-0 text-emerald-600"
                          aria-label="Signed in with OAuth"
                        />
                      )}
                    </span>
                    <span className="block truncate text-[0.63rem] text-muted-foreground">
                      {hostOf(server.url)}
                      {server.auth === "token" ? " · token" : server.auth === "oauth" ? " · OAuth" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : server.id)}
                      className="mt-0.5 flex items-center gap-1 text-[0.62rem] text-muted-foreground transition hover:text-brand-ink"
                    >
                      <ChevronDown
                        className={cn("size-3 transition-transform", isExpanded && "rotate-180")}
                      />
                      {scopedToAgent
                        ? `${onCount} of ${server.tools.length} tools on`
                        : `${server.tools.length} ${server.tools.length === 1 ? "tool" : "tools"}`}
                    </button>
                  </span>
                  <IconButton
                    icon={
                      refreshing === server.id ? (
                        <Spinner className="size-3" />
                      ) : (
                        <RefreshCw className="size-3" />
                      )
                    }
                    label={`Re-read tools from ${server.label}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => void refresh(server)}
                    disabled={refreshing !== null || removing !== null}
                  />
                  <IconButton
                    icon={
                      removing === server.id ? (
                        <Spinner className="size-3" />
                      ) : (
                        <Trash2 className="size-3" />
                      )
                    }
                    label={`Disconnect ${server.label}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(server)}
                    disabled={removing !== null}
                  />
                </div>

                {isExpanded && (
                  <div className="mb-1.5 ml-3 space-y-0.5 border-l border-border/70 pl-2.5">
                    {scopedToAgent && (
                      <div className="flex items-center justify-between gap-2 py-0.5">
                        <span className="text-[0.66rem] font-medium">All tools</span>
                        <Switch
                          size="sm"
                          checked={onCount === server.tools.length && server.tools.length > 0}
                          disabled={savingScope || server.tools.length === 0}
                          onCheckedChange={() => toggleServer(server)}
                          aria-label={`Toggle every tool on ${server.label}`}
                        />
                      </div>
                    )}
                    {!scopedToAgent ? (
                      <TreeView
                        aria-label={`${server.label} tools`}
                        guides={false}
                        emptyText="No tools reported"
                        items={server.tools.map((tool) => ({
                          id: mcpToolKey(server.id, tool),
                          label: tool,
                          icon: <Wrench className="size-3.5" />,
                        }))}
                      />
                    ) : (
                      server.tools.map((tool) => {
                        const key = mcpToolKey(server.id, tool);

                        return (
                          <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                            <span className="min-w-0 truncate font-mono text-[0.62rem] text-muted-foreground">
                              {tool}
                            </span>
                            <Switch
                              size="sm"
                              checked={isOn(key)}
                              disabled={savingScope}
                              onCheckedChange={() => toggleTool(key)}
                              aria-label={`Allow ${tool}`}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-[0.72rem] text-destructive">
          {error}
        </p>
      )}

      <ConnectMcpDialog
        open={open}
        onOpenChange={setOpen}
        agentId={agentId}
        returnTo={returnTo}
        onConnected={(server) => {
          setList((current) => [...current, server]);
          setOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function ConnectMcpDialog({
  open,
  onOpenChange,
  agentId,
  returnTo,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: number;
  returnTo: string;
  onConnected: (server: AgentMcpServerSummary) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"token" | "oauth" | null>(null);

  function reset() {
    setLabel("");
    setUrl("");
    setApiKey("");
    setError(null);
    setSaving(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError(null);
    setSaving("token");

    try {
      const result = await createAgentMcpServerAction({ label, url, apiKey });

      if (!result.ok) {
        setError(result.error);
        setSaving(null);
        return;
      }

      onConnected(result.server);
      reset();
    } catch (submitError) {
      console.error("[agents] MCP connect request failed", submitError);
      setError("We couldn't connect that server. Please try again.");
      setSaving(null);
    }
  }

  async function handleOAuth() {
    if (saving) return;

    setError(null);
    setSaving("oauth");

    try {
      // On success this redirects the browser, so it never returns normally.
      const result = await startMcpOAuthAction({
        label,
        url,
        returnTo: agentId ? `/dashboard/agents/${agentId}` : returnTo,
      });

      if (result && !result.ok) {
        setError(result.error);
        setSaving(null);
      }
    } catch (oauthError) {
      // NEXT_REDIRECT is a thrown control-flow signal, not a failure.
      if ((oauthError as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw oauthError;

      console.error("[agents] MCP OAuth request failed", oauthError);
      setError("We couldn't start that sign-in. Please try again.");
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-md">
        <form onSubmit={handleSubmit} noValidate className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="flex items-start gap-3 pr-8">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
                <Plug className="size-4" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="font-heading text-base font-semibold">
                  Connect an MCP server
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-[0.78rem] leading-relaxed">
                  Streamable HTTP servers work. Sign in with OAuth, or paste a token.
                </DialogDescription>
              </div>
            </div>

            <TextField
              label="Name"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Linear, Notion, my-sidecar"
              autoComplete="off"
            />

            <TextField
              label="Server URL"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://mcp.example.com/mcp"
              inputMode="url"
              autoComplete="off"
            />

            <TextField
              label="Bearer token"
              optional
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Only if the server requires one"
              autoComplete="off"
              hint="Stored encrypted and sent as an Authorization header. Servers that need an account sign-in use OAuth instead."
            />

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
              type="button"
              variant="outline"
              onClick={() => void handleOAuth()}
              disabled={saving !== null}
              className="gap-2 rounded-xl"
            >
              {saving === "oauth" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Sign in with OAuth
            </Button>
            <Button type="submit" disabled={saving !== null} className="gap-2 rounded-xl">
              {saving === "token" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              {saving === "token" ? "Checking server…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

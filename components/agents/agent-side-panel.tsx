"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Monitor,
  MonitorPlay,
  Pencil,
  Plus,
  RefreshCw,
  TimerOff,
  type LucideIcon,
} from "lucide-react";

import {
  updateAgentAction,
  updateAgentApprovalModeAction,
  updateAgentProviderAction,
} from "@/app/actions/agents";
import type { AgentMcpServerSummary } from "@/lib/agent-mcp-types";
import type { CustomDiagramSummary } from "@/lib/custom-diagram-types";
import type { CustomPluginSummary } from "@/lib/custom-plugin-types";
import type { CustomSkillSummary } from "@/lib/custom-skill-types";
import { LiveBrowser } from "@/components/agents/live-browser";
import { McpServersSection } from "@/components/agents/mcp-servers";
import type { AgentMemoryNote } from "@/lib/memory-types";
import { AgentToolsSection } from "@/components/agents/agent-tools-section";
import { AgentLibrarySection } from "@/components/agents/agent-library-section";
import { AgentMemorySection } from "@/components/agents/agent-memory-section";
import { SchedulingSection } from "@/components/agents/scheduling-section";
import { ModelLogo } from "@/components/agents/model-logo";
import { ModelPicker } from "@/components/agents/model-picker";
import { AddModelDialog } from "@/components/agents/add-model-dialog";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentAvatarPicker } from "@/components/dashboard/agent-avatar-picker";
import { useAgents } from "@/components/dashboard/agents-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { TextArea } from "@/components/ui/text-area";
import {
  shortBrowserSessionId,
  type BrowserSessionSummary,
} from "@/lib/browser-session-types";
import type {
  AgentScheduleRunSummary,
  AgentScheduleSummary,
} from "@/lib/agent-schedule-options";
import type { WidgetRecord, WidgetRefreshRun } from "@/lib/widget-types";
import { findCatalogModel } from "@/lib/model-catalog";
import {
  AGENT_APPROVAL_MODES,
  AGENT_INSTRUCTIONS_MAX_LENGTH,
  AGENT_NAME_MAX_LENGTH,
  normalizeApprovalMode,
  type AgentApprovalMode,
  type AgentDetail,
  type AgentModelCatalog,
} from "@/lib/agent-options";
import { cn } from "@/lib/utils";

const SECTION_LABEL =
  "text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase";

/** How the cloud browser behaves, in three short lines. */
const BROWSER_NOTES: { icon: LucideIcon; text: string }[] = [
  {
    icon: MonitorPlay,
    text: "A session starts only when a task needs a real browser — nothing runs in the background.",
  },
  {
    icon: LockKeyhole,
    text: "Logins persist: every session reuses the same saved browser profile, so a site the agent signed into stays signed in.",
  },
  {
    icon: TimerOff,
    text: "The session is released as soon as the reply is ready, so it never keeps running or billing.",
  },
];

type Editing = "identity" | "instructions" | null;

export function AgentSidePanel({
  agent,
  catalog,
  mcpServers = [],
  mcpNotice = null,
  schedules = [],
  scheduleRuns = [],
  widgetRuns = [],
  widgets = [],
  browserSessions = [],
  browserProfile = false,
  skills = [],
  plugins = [],
  diagrams = [],
  memoryEnabled = true,
  memoryNotes = [],
}: {
  agent: AgentDetail;
  catalog: AgentModelCatalog;
  /** MCP servers the owner connected; shared by all their agents. */
  mcpServers?: AgentMcpServerSummary[];
  /** Set by the OAuth callback redirect. */
  mcpNotice?: "connected" | "error" | null;
  /** Recurring runs for this agent. */
  schedules?: AgentScheduleSummary[];
  /** Recent executions, newest first. */
  scheduleRuns?: AgentScheduleRunSummary[];
  /** Real read-only widget updates for this agent's widgets, newest first. */
  widgetRuns?: WidgetRefreshRun[];
  /** This agent's widgets, for the cadence the section states. */
  widgets?: WidgetRecord[];
  /** Cloud-browser sessions this agent opened, newest first. */
  browserSessions?: BrowserSessionSummary[];
  /** Whether this workspace has a saved Browserbase profile yet. */
  browserProfile?: boolean;
  /** Workspace skills this agent can be switched onto. */
  skills?: CustomSkillSummary[];
  /** Workspace HTTP plugins this agent can be switched onto. */
  plugins?: CustomPluginSummary[];
  /** Workspace diagrams this agent can be switched onto. */
  diagrams?: CustomDiagramSummary[];
  /** Whether this agent may keep and use memories. */
  memoryEnabled?: boolean;
  /** The newest notes this agent keeps. */
  memoryNotes?: AgentMemoryNote[];
}) {
  const router = useRouter();
  const { updateAgent } = useAgents();

  const [providerId, setProviderId] = useState(agent.provider);
  const [modelCatalog, setModelCatalog] = useState<AgentModelCatalog>(catalog);
  const [changingModel, setChangingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [addModelOpen, setAddModelOpen] = useState(false);

  // The server catalog grows after a saved model is added and the page
  // refreshes; keep the optimistic catalog in sync with it.
  useEffect(() => {
    setModelCatalog(catalog);
  }, [catalog]);

  const currentModel = findCatalogModel(modelCatalog, providerId);

  const [name, setName] = useState(agent.name);
  const [avatar, setAvatar] = useState(agent.avatar);
  const [color, setColor] = useState(agent.color);
  const [instructions, setInstructions] = useState(agent.instructions ?? "");

  const [editing, setEditing] = useState<Editing>(null);
  const [draftName, setDraftName] = useState(agent.name);
  const [draftAvatar, setDraftAvatar] = useState(agent.avatar);
  const [draftColor, setDraftColor] = useState(agent.color);
  const [draftInstructions, setDraftInstructions] = useState(agent.instructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [approvalMode, setApprovalMode] = useState<AgentApprovalMode>(
    normalizeApprovalMode(agent.approvalMode),
  );
  const [savingApprovalMode, setSavingApprovalMode] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  /** Saves how this agent approves data-changing app actions. */
  async function changeApprovalMode(next: AgentApprovalMode) {
    if (savingApprovalMode || next === approvalMode) return;

    const previous = approvalMode;
    setApprovalMode(next);
    setSavingApprovalMode(true);
    setApprovalError(null);

    try {
      const result = await updateAgentApprovalModeAction({ id: agent.id, mode: next });

      if (!result.ok) {
        setApprovalMode(previous);
        setApprovalError(result.error);
        return;
      }

      setApprovalMode(normalizeApprovalMode(result.agent.approvalMode));
      router.refresh();
    } catch (modeError) {
      console.error("[agents] approval mode failed", modeError);
      setApprovalMode(previous);
      setApprovalError("We couldn't change how actions are approved.");
    } finally {
      setSavingApprovalMode(false);
    }
  }

  function startIdentityEdit() {
    setDraftName(name);
    setDraftAvatar(avatar);
    setDraftColor(color);
    setError(null);
    setEditing("identity");
  }

  function startInstructionsEdit() {
    setDraftInstructions(instructions);
    setError(null);
    setEditing("instructions");
  }

  function cancelEdit() {
    setEditing(null);
    setError(null);
  }

  /** Switches the agent's model; the picker's key is the stored `provider` value. */
  async function changeModel(next: string) {
    if (changingModel || next === providerId) return;

    setChangingModel(true);
    setModelError(null);

    try {
      const result = await updateAgentProviderAction({ id: agent.id, provider: next });

      if (!result.ok) {
        setModelError(result.error);
        return;
      }

      setProviderId(result.agent.provider);
      // Re-render so the chat header and sidebar show the new model.
      router.refresh();
    } catch (changeError) {
      console.error("[agents] model change failed", changeError);
      setModelError("We couldn't change the model. Please try again.");
    } finally {
      setChangingModel(false);
    }
  }

  /** Adds the just-saved model to the picker, then selects it for this agent. */
  function handleModelAdded(model: { id: number; label: string; model: string }) {
    const key = `custom:${model.id}`;

    setModelCatalog((previous) => ({
      ...previous,
      custom: [
        ...previous.custom.filter((entry) => entry.id !== key),
        {
          id: key,
          modelId: model.model,
          name: model.label,
          provider: "Your models",
          logo: "generic",
        },
      ],
    }));
    setModelError(null);
    void changeModel(key);
  }

  async function save(values: {
    name: string;
    avatar: string;
    color: string;
    instructions: string;
  }) {
    if (isSaving) return;

    const trimmedName = values.name.replace(/\s+/g, " ").trim();
    if (!trimmedName) {
      setError("Give your agent a name.");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const result = await updateAgentAction({
        id: agent.id,
        name: trimmedName,
        avatar: values.avatar,
        color: values.color,
        instructions: values.instructions,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setName(result.agent.name);
      setAvatar(result.agent.avatar);
      setColor(result.agent.color);
      setProviderId(result.agent.provider);
      setInstructions(result.agent.instructions ?? "");
      setEditing(null);
      // Push the edit into the client agent list so the sidebar avatar and name
      // change immediately, then refresh for the rest of the shell.
      updateAgent(result.agent);
      router.refresh();
    } catch (saveError) {
      console.error("[agents] update request failed", saveError);
      setError("We couldn't save your changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleIdentitySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ name: draftName, avatar: draftAvatar, color: draftColor, instructions });
  }

  function handleInstructionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ name, avatar, color, instructions: draftInstructions });
  }

  return (
    <aside className="min-h-0 lg:overflow-y-auto lg:pr-1">
      <div className="premium-panel divide-y divide-border/60 overflow-hidden rounded-2xl">
        {/* Agent configuration */}
        <section className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className={SECTION_LABEL}>Agent</p>
            {editing === null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Edit agent details"
                onClick={startIdentityEdit}
                className="text-muted-foreground"
              >
                <Pencil className="size-3" />
              </Button>
            )}
          </div>

          {editing === "identity" ? (
            <form onSubmit={handleIdentitySubmit} className="mt-3 space-y-3" noValidate>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.7rem] font-medium">Name</span>
                  <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                    {draftName.length}/{AGENT_NAME_MAX_LENGTH}
                  </span>
                </div>
                <Input
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    if (error) setError(null);
                  }}
                  maxLength={AGENT_NAME_MAX_LENGTH}
                  autoFocus
                  autoComplete="off"
                  aria-label="Agent name"
                  className="h-8 rounded-lg bg-background text-[0.82rem]"
                />
              </div>

              <AgentAvatarPicker
                avatar={draftAvatar}
                color={draftColor}
                onAvatarChange={setDraftAvatar}
                onColorChange={setDraftColor}
                compact
              />

              {error && (
                <p role="alert" className="text-[0.72rem] text-destructive">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-1.5">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="gap-1.5 rounded-lg bg-foreground text-background shadow-sm hover:bg-foreground/90"
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEdit}
                  disabled={isSaving}
                  className="rounded-lg text-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <AgentAvatar avatar={avatar} color={color} className="size-8" />
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={startIdentityEdit}
                  title="Edit agent details"
                  className="block max-w-full truncate rounded-sm text-left text-[0.9rem] font-semibold hover:text-brand-ink hover:underline hover:underline-offset-2"
                >
                  {name}
                </button>
                <p className="flex items-center gap-1 text-[0.68rem] text-muted-foreground">
                  <ModelLogo logo={currentModel.logo} className="size-3" />
                  {currentModel.name}
                </p>
              </div>
            </div>
          )}

          <Separator className="my-3.5 bg-border/60" />

          <div className="space-y-1.5">
            <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              AI Model
            </p>
            <ModelPicker
              catalog={modelCatalog}
              value={providerId}
              onSelect={changeModel}
              disabled={changingModel}
              matchTriggerWidth
              className="mt-1.5 text-[0.7rem]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddModelOpen(true)}
              disabled={changingModel}
              className="mt-1.5 h-8 w-full justify-center gap-1.5 rounded-lg border-dashed text-[0.7rem] font-medium"
            >
              <Plus className="size-3" />
              Add custom model
            </Button>
            {modelError ? (
              <p role="alert" className="text-[0.66rem] text-destructive">
                {modelError}
              </p>
            ) : null}

            <AddModelDialog
              agentId={agent.id}
              open={addModelOpen}
              onOpenChange={setAddModelOpen}
              onAdded={handleModelAdded}
            />
          </div>

          <Separator className="my-3.5 bg-border/60" />

          <AgentToolsSection agentId={agent.id} enabledTools={agent.enabledTools} />

          <Separator className="my-3.5 bg-border/60" />

          <AgentLibrarySection
            agentId={agent.id}
            enabledSkills={agent.enabledSkills}
            enabledPlugins={agent.enabledPlugins}
            enabledDiagrams={agent.enabledDiagrams}
            skills={skills}
            plugins={plugins}
            diagrams={diagrams}
          />

          <Separator className="my-3.5 bg-border/60" />

          <AgentMemorySection
            agentId={agent.id}
            agentName={agent.name}
            agentColor={agent.color}
            enabled={memoryEnabled}
            notes={memoryNotes}
          />

          <Separator className="my-3.5 bg-border/60" />

          {/* App approvals: the same rule the chat composer shows. */}
          <div className="flex items-center justify-between gap-2">
            <p className={SECTION_LABEL}>Approvals</p>
            <span className="text-[0.65rem] text-muted-foreground">
              {savingApprovalMode ? "Saving…" : "App actions"}
            </span>
          </div>

          <div className="mt-2 space-y-1">
            {AGENT_APPROVAL_MODES.map((mode) => {
              const selected = approvalMode === mode.id;

              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={savingApprovalMode}
                  onClick={() => void changeApprovalMode(mode.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-70",
                    selected
                      ? "border-brand-border bg-brand-soft"
                      : "border-border bg-card hover:bg-muted/60",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full ring-2",
                      selected
                        ? "bg-brand-ink ring-brand-ink/25"
                        : mode.id === "full"
                          ? "bg-rose-400 ring-rose-400/20"
                          : "bg-muted-foreground/40 ring-transparent",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.72rem] font-medium">{mode.label}</span>
                    <span className="mt-0.5 block text-[0.64rem] leading-relaxed text-muted-foreground">
                      {mode.note}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {approvalError ? (
            <p role="alert" className="mt-1.5 text-[0.66rem] text-destructive">
              {approvalError}
            </p>
          ) : null}

          <Separator className="my-3.5 bg-border/60" />

          <McpServersSection
            servers={mcpServers}
            agentId={agent.id}
            enabled={agent.mcpTools}
            notice={mcpNotice}
          />

          <Separator className="my-3.5 bg-border/60" />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Instructions
            </p>
            {editing === null && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Edit instructions"
                onClick={startInstructionsEdit}
                className="text-muted-foreground"
              >
                <Pencil className="size-3" />
              </Button>
            )}
          </div>

          {editing === "instructions" ? (
            <form onSubmit={handleInstructionsSubmit} className="mt-2 space-y-2" noValidate>
              <TextArea
                value={draftInstructions}
                onChange={(event) => {
                  setDraftInstructions(event.target.value);
                  if (error) setError(null);
                }}
                maxLength={AGENT_INSTRUCTIONS_MAX_LENGTH}
                minRows={5}
                maxRows={9}
                counter
                autoFocus
                aria-label="Agent instructions"
                placeholder="You are a research assistant that summarises sources and keeps notes tidy…"
              />
              <div className="flex items-center justify-end gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
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
                      <Check className="size-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
              {error && (
                <p role="alert" className="text-[0.72rem] text-destructive">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={startInstructionsEdit}
              aria-label="Edit instructions"
              className="mt-1.5 block max-h-40 w-full overflow-y-auto rounded-xl bg-muted/50 p-3 text-left text-[0.78rem] leading-relaxed whitespace-pre-wrap text-muted-foreground transition hover:bg-muted/70"
            >
              {instructions || "No instructions yet. Add some to shape how this agent behaves."}
            </button>
          )}
        </section>

        {/* Cloud browser */}
        <section className="p-4">
          <div className="flex items-center justify-between">
            <p className={SECTION_LABEL}>Cloud browser</p>
            <span className="flex items-center gap-1 text-[0.65rem] text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Starts on demand
            </span>
          </div>

          {/* Live frames of the session a running reply opened. */}
          <LiveBrowser variant="panel" />

          <ul className="mt-2.5 space-y-1.5">
            {BROWSER_NOTES.map((note) => {
              const Icon = note.icon;
              return (
                <li key={note.text} className="flex items-start gap-2">
                  <span className="mt-px grid size-6 shrink-0 place-items-center rounded-md bg-muted text-foreground ring-1 ring-border">
                    <Icon className="size-3" />
                  </span>
                  <span className="text-[0.68rem] leading-snug text-muted-foreground">
                    {note.text}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              Recent sessions
            </p>
            {browserSessions.length > 0 && (
              <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                {browserSessions.length}
              </span>
            )}
          </div>

          {browserSessions.length === 0 ? (
            <p className="mt-1.5 text-[0.66rem] text-muted-foreground">
              Nothing yet — ask the agent to open or fill in a page and the session is listed here.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {browserSessions.map((session) => (
                <li key={session.id}>
                  <a
                    href={session.replayUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open this session in Browserbase"
                    className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-md ring-1",
                        session.status === "failed"
                          ? "bg-rose-50 text-rose-600 ring-rose-100"
                          : "bg-card text-muted-foreground ring-border/60",
                      )}
                    >
                      <Monitor className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[0.7rem]">
                        #{shortBrowserSessionId(session.sessionId)}
                      </span>
                      <span className="block truncate text-[0.62rem] text-muted-foreground">
                        {session.actions} {session.actions === 1 ? "action" : "actions"} ·{" "}
                        <span suppressHydrationWarning>
                          {new Date(session.endedAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </span>
                    {session.status === "failed" && (
                      <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.58rem] font-medium text-rose-700">
                        failed
                      </span>
                    )}
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground/60 group-hover:text-brand-ink" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {browserProfile ? (
            <p className="mt-2.5 text-[0.64rem] text-muted-foreground">
              <Link
                href="/dashboard/settings"
                className="font-medium text-brand-ink hover:underline"
              >
                Manage or reset the shared browser profile
              </Link>
            </p>
          ) : (
            <p className="mt-2.5 text-[0.64rem] text-muted-foreground">
              No saved browser profile yet — one is created the first time the agent opens a page.
            </p>
          )}
        </section>

        <SchedulingSection
          agentId={agent.id}
          schedules={schedules}
          scheduleRuns={scheduleRuns}
          widgets={widgets}
          widgetRuns={widgetRuns}
        />
      </div>
    </aside>
  );
}

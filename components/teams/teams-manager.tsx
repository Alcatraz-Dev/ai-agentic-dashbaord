"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessagesSquare, Pencil, Plus, Trash2, UsersRound } from "lucide-react";

import {
  createTeamAction,
  deleteTeamAction,
  updateTeamAction,
} from "@/app/actions/teams";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { AgentAvatarPicker } from "@/components/dashboard/agent-avatar-picker";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AgentSummary } from "@/lib/agent-options";
import {
  DEFAULT_TEAM_AVATAR,
  DEFAULT_TEAM_COLOR,
  TEAM_MEMBERS_MAX,
  TEAM_NAME_MAX_LENGTH,
  TEAM_OBJECTIVE_MAX_LENGTH,
  teamLead,
  teamReadiness,
  type TeamSummary,
} from "@/lib/team-types";
import { cn } from "@/lib/utils";

type Draft = {
  id: number | null;
  name: string;
  objective: string;
  avatar: string;
  color: string;
  leadAgentId: number | null;
  memberIds: number[];
};

const EMPTY_DRAFT: Draft = {
  id: null,
  name: "",
  objective: "",
  avatar: DEFAULT_TEAM_AVATAR,
  color: DEFAULT_TEAM_COLOR,
  leadAgentId: null,
  memberIds: [],
};

const LINK_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.72rem] font-medium text-foreground transition-colors hover:border-brand-border hover:text-brand-ink";

const FIELD = "h-9 text-[0.8rem]";

/**
 * The Teams page body: every team on this board as a card, plus one dialog that
 * creates and edits them. A team is a name, a portrait, a lead and a roster; the
 * roster is written onto `agents.team_id`, so an agent is only ever on one team.
 */
export function TeamsManager({
  teams,
  agents,
}: {
  teams: TeamSummary[];
  agents: AgentSummary[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The avatar studio is tall; opening it on demand keeps the dialog inside a
  // laptop viewport. The preview and the pick stay visible either way.
  const [showPortrait, setShowPortrait] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TeamSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const picked = draft ? agents.filter((agent) => draft.memberIds.includes(agent.id)) : [];

  function openCreate() {
    setFormError(null);
    setShowPortrait(false);
    setDraft({ ...EMPTY_DRAFT, memberIds: [] });
  }

  function openEdit(team: TeamSummary) {
    setFormError(null);
    setShowPortrait(false);
    setDraft({
      id: team.id,
      name: team.name,
      objective: team.objective ?? "",
      avatar: team.avatar,
      color: team.color,
      leadAgentId: team.leadAgentId,
      memberIds: team.members.map((member) => member.id),
    });
  }

  function toggleMember(id: number) {
    setDraft((current) => {
      if (!current) return current;
      const on = current.memberIds.includes(id);
      if (!on && current.memberIds.length >= TEAM_MEMBERS_MAX) return current;

      return {
        ...current,
        memberIds: on
          ? current.memberIds.filter((entry) => entry !== id)
          : [...current.memberIds, id],
        leadAgentId: on && current.leadAgentId === id ? null : current.leadAgentId,
      };
    });
  }

  async function save() {
    if (!draft || saving) return;

    if (!draft.name.trim()) {
      setFormError("Give this team a name.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: draft.name,
      objective: draft.objective,
      avatar: draft.avatar,
      color: draft.color,
      leadAgentId: draft.leadAgentId,
      memberIds: draft.memberIds,
    };
    const result =
      draft.id === null
        ? await createTeamAction(payload)
        : await updateTeamAction({ id: draft.id, ...payload });

    setSaving(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }

    setDraft(null);
    router.refresh();
  }

  async function remove() {
    if (!pendingDelete || deleting) return;

    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTeamAction({ id: pendingDelete.id });
    setDeleting(false);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setPendingDelete(null);
    router.refresh();
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.74rem] text-muted-foreground">
          A team is a lead agent plus the teammates it may hand work to. Members are this board&apos;s
          agents, and an agent belongs to one team at a time.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          className="h-8 gap-1.5 px-2.5 text-[0.72rem]"
        >
          <Plus className="size-3.5" />
          New team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-6">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand-ink">
            <UsersRound className="size-4" aria-hidden="true" />
          </span>
          <p className="text-[0.85rem] font-medium">No teams yet</p>
          <p className="max-w-lg text-[0.72rem] leading-relaxed text-muted-foreground">
            Group the agents that work together, pick the one that answers, and open a team chat.
            The lead can hand a self-contained part of the work to any teammate; you still see their
            answer in the conversation.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={openCreate}
            className="mt-1 h-8 gap-1.5 px-2.5 text-[0.72rem]"
          >
            <Plus className="size-3.5" />
            Create the first team
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const lead = teamLead(team);
            const missing = teamReadiness(team);
            const others = team.members.filter((member) => member.id !== team.leadAgentId);

            return (
              <li
                key={team.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar avatar={team.avatar} color={team.color} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9rem] font-semibold">{team.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[0.7rem] leading-relaxed text-muted-foreground">
                      {team.objective || "No objective yet — say what this team is for."}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {lead ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-soft px-2 py-0.5 text-[0.64rem] font-medium text-brand-ink">
                      <AgentAvatar
                        avatar={lead.avatar}
                        color={lead.color}
                        className="size-4"
                      />
                      Lead · {lead.name}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.64rem] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
                      No lead yet
                    </span>
                  )}
                  <span className="text-[0.64rem] text-muted-foreground tabular-nums">
                    {team.members.length} {team.members.length === 1 ? "agent" : "agents"}
                  </span>
                </div>

                {others.length > 0 && (
                  <ul className="mt-2.5 flex flex-wrap items-center gap-1">
                    {others.map((member) => (
                      <li key={member.id}>
                        <Link
                          href={`/dashboard/agents/${member.id}`}
                          title={member.objective ?? member.name}
                          className="inline-flex items-center gap-1 rounded-full bg-muted/60 py-0.5 pr-2 pl-0.5 text-[0.62rem] font-medium text-foreground/80 transition-colors hover:bg-muted"
                        >
                          <AgentAvatar
                            avatar={member.avatar}
                            color={member.color}
                            className="size-4"
                          />
                          {member.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {missing && (
                  <p className="mt-2.5 text-[0.66rem] leading-relaxed text-amber-700 dark:text-amber-300">
                    {missing}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-1.5 pt-3">
                  <Link href={`/dashboard/teams/${team.id}`} className={LINK_BUTTON}>
                    <MessagesSquare className="size-3.5" aria-hidden="true" />
                    Team chat
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(team)}
                    className="h-8 gap-1 px-2 text-[0.7rem] text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(team);
                    }}
                    aria-label={`Delete ${team.name}`}
                    className="ml-auto h-8 px-2 text-muted-foreground hover:text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[min(92dvh,50rem)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="gap-1 border-b border-border/70 px-4 pt-4 pr-12 pb-3">
            <DialogTitle>{draft?.id === null ? "New team" : "Edit team"}</DialogTitle>
            <DialogDescription className="text-[0.74rem] leading-relaxed">
              The lead runs the team chat. The rest of the roster is who it can hand work to.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
            {draft && (
              <div className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-medium text-muted-foreground">
                    Team name
                  </span>
                  <Input
                    value={draft.name}
                    maxLength={TEAM_NAME_MAX_LENGTH}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    placeholder="Publishing desk"
                    className={FIELD}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-medium text-muted-foreground">
                    Lead agent
                  </span>
                  <select
                    value={draft.leadAgentId === null ? "" : String(draft.leadAgentId)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              leadAgentId:
                                event.target.value === "" ? null : Number(event.target.value),
                            }
                          : current,
                      )
                    }
                    disabled={picked.length === 0}
                    className={cn(
                      "h-9 w-full rounded-lg border border-border bg-background px-2 text-[0.8rem]",
                      picked.length === 0 && "text-muted-foreground",
                    )}
                  >
                    <option value="">No lead yet</option>
                    {picked.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[0.68rem] font-medium text-muted-foreground">
                  Objective
                </span>
                <Textarea
                  value={draft.objective}
                  maxLength={TEAM_OBJECTIVE_MAX_LENGTH}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, objective: event.target.value } : current,
                    )
                  }
                  placeholder="What this team is responsible for, in one line."
                  className="min-h-16 text-[0.8rem]"
                />
              </label>

              <div className="rounded-xl border border-border/70 p-2.5">
                <div className="flex items-center gap-2.5">
                  <AgentAvatar avatar={draft.avatar} color={draft.color} className="size-10 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.68rem] font-medium">Portrait</p>
                    <p className="truncate text-[0.62rem] text-muted-foreground">
                      The clay look this team wears.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPortrait((open) => !open)}
                    aria-expanded={showPortrait}
                    className="h-7 shrink-0 px-2 text-[0.66rem]"
                  >
                    {showPortrait ? "Hide" : "Change"}
                  </Button>
                </div>
                {showPortrait ? (
                  <div className="mt-2.5 border-t border-border/60 pt-2.5">
                    <AgentAvatarPicker
                      avatar={draft.avatar}
                      color={draft.color}
                      onAvatarChange={(avatar) =>
                        setDraft((current) => (current ? { ...current, avatar } : current))
                      }
                      onColorChange={(color) =>
                        setDraft((current) => (current ? { ...current, color } : current))
                      }
                      compact
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[0.68rem] font-medium text-muted-foreground">
                    Members
                  </span>
                  <span className="text-[0.64rem] text-muted-foreground tabular-nums">
                    {draft.memberIds.length}/{TEAM_MEMBERS_MAX}
                  </span>
                </div>

                {agents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[0.7rem] text-muted-foreground">
                    This board has no agents yet. Create one first, then add it here.
                  </p>
                ) : (
                  <ul className="max-h-[min(14rem,32dvh)] space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                    {agents.map((agent) => {
                      const on = draft.memberIds.includes(agent.id);
                      const full = !on && draft.memberIds.length >= TEAM_MEMBERS_MAX;

                      return (
                        <li key={agent.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60",
                              full && "cursor-not-allowed opacity-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={full}
                              onChange={() => toggleMember(agent.id)}
                              className="size-3.5 accent-[var(--brand-ink,#1d4ed8)]"
                            />
                            <AgentAvatar
                              avatar={agent.avatar}
                              color={agent.color}
                              className="size-6"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.74rem] font-medium">
                                {agent.name}
                              </span>
                              <span className="block truncate text-[0.62rem] text-muted-foreground">
                                {agent.objective || "No objective"}
                              </span>
                            </span>
                            {agent.teamId !== null && agent.teamId !== draft.id && (
                              <span className="shrink-0 text-[0.6rem] text-amber-700 dark:text-amber-300">
                                on a team
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="mt-1 text-[0.62rem] leading-relaxed text-muted-foreground">
                  Joining this team moves an agent off whichever team it is on now — one team per
                  agent. The lead must be a member; removing it leaves the team without a lead.
                </p>
              </div>

              </div>
            )}
          </div>

          {formError && (
            <p
              role="alert"
              className="mx-4 mb-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[0.72rem] text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
            >
              {formError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="h-8 px-2.5 text-[0.72rem]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void save()}
              disabled={saving}
              className="h-8 px-3 text-[0.72rem]"
            >
              {saving ? "Saving…" : draft?.id === null ? "Create team" : "Save team"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The team goes away. Its {pendingDelete?.members.length ?? 0} agents stay in the
              workspace and keep their own chats, tools and schedules — they simply work alone
              again. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="text-[0.75rem] text-rose-600 dark:text-rose-400">{deleteError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep team</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {deleting ? "Deleting…" : "Delete team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

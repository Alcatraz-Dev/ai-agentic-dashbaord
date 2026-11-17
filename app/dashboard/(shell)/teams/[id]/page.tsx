import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";

import { AgentChat } from "@/components/agents/agent-chat";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { getAgentModelCatalog } from "@/lib/agent-model-catalog";
import { listAgentMessagePage } from "@/lib/agent-messages";
import { getAgentForUser } from "@/lib/agents";
import { getIntegrationsOverview } from "@/lib/composio/connections";
import { memoryPanelForAgent } from "@/lib/memories";
import type { ChatMessage } from "@/lib/agent-demo";
import { requireUser } from "@/lib/session";
import { getTeamForUser } from "@/lib/teams";
import { teamLead, teamReadiness } from "@/lib/team-types";
import { ensureUserRecord } from "@/lib/users";
import { listWidgetsForAgent } from "@/lib/widgets";

export const metadata: Metadata = { title: "Team chat" };

/**
 * A team chat is the lead's chat, opened under the team.
 *
 * There is deliberately no second transcript table: messages already belong to
 * an agent, so a team that ran with a copy of the lead would show two histories
 * of the same work. The roster above the chat is the team boundary — the lead's
 * hand-offs reach exactly those agents, not the whole board.
 *
 * The page is a bounded column from `lg`: `AgentChat` is built to fill its
 * parent (`h-full` with the transcript scrolling inside), so without a height it
 * collapsed and the composer floated over the page. On phones the chat keeps a
 * real 70dvh viewport and the page scrolls around it.
 */
export default async function TeamChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const profile = await ensureUserRecord(user);

  const team = await getTeamForUser(profile.id, Number(id));
  if (!team) notFound();

  const lead = teamLead(team);
  const readiness = teamReadiness(team);
  const agent = lead ? await getAgentForUser(profile.id, lead.id) : null;

  const [catalog, messagePage, overview, widgets, memoryPanel] = await Promise.all([
    getAgentModelCatalog(profile.id),
    agent ? listAgentMessagePage(agent.id) : Promise.resolve(null),
    getIntegrationsOverview(profile.id),
    agent ? listWidgetsForAgent(profile.id, agent.id) : Promise.resolve([]),
    agent
      ? memoryPanelForAgent(profile.id, agent.id, 40)
      : Promise.resolve({ enabled: false, notes: [] }),
  ]);

  const initialMessages: ChatMessage[] = (messagePage?.messages ?? []).map((message) => ({
    id: `msg-${message.id}`,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    steps: message.steps,
    sources: message.sources,
    cards: message.cards,
    handoffs: message.handoffs,
  }));

  const teammates = lead ? team.members.filter((member) => member.id !== lead.id) : team.members;
  // NULL means "every built-in tool" on agents created before the switch list
  // existed, so the lead only lacks hand-offs when the list says so.
  const handoffsEnabled = agent
    ? !agent.enabledTools || agent.enabledTools.includes("ask_teammate")
    : false;

  return (
    <div className="aui-page flex max-w-6xl flex-col lg:h-[calc(100dvh-8rem)] lg:min-h-0">
      <div className="shrink-0">
        <Link
          href="/dashboard/teams"
          className="inline-flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:text-brand-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Teams
        </Link>

        <div className="mt-3 flex flex-wrap items-start gap-3">
          <AgentAvatar avatar={team.avatar} color={team.color} className="size-12" />
          <div className="min-w-0 flex-1">
            <h1 className="aui-title text-[1.45rem]">{team.name}</h1>
            <p className="aui-subtitle mt-1.5">
              {team.objective ||
                "No objective yet. Say what this team is for and the lead's prompt will carry it."}
            </p>
          </div>
          <span className="aui-chip text-[0.7rem]">
            <UsersRound className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="font-semibold text-foreground tabular-nums">
              {team.members.length}
            </span>{" "}
            {team.members.length === 1 ? "agent" : "agents"}
          </span>
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-card/60 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {team.members.length === 0 ? (
              <p className="text-[0.72rem] text-muted-foreground">No agents on this team yet.</p>
            ) : (
              team.members.map((member) => {
                const isLead = member.id === team.leadAgentId;
                const chipClass = isLead
                  ? "inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-soft py-0.5 pr-2.5 pl-0.5 text-[0.7rem] font-medium text-brand-ink"
                  : "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 py-0.5 pr-2.5 pl-0.5 text-[0.7rem] font-medium text-foreground/80 transition-colors hover:border-brand-border hover:text-brand-ink";

                // The lead is who this chat already runs with — a link away
                // would drop the team context for no reason. Teammates keep a
                // link to their own chat, which is a different surface.
                return isLead ? (
                  <span
                    key={member.id}
                    className={chipClass}
                    title={`${member.name} answers this team chat`}
                  >
                    <AgentAvatar avatar={member.avatar} color={member.color} className="size-5" />
                    {member.name}
                    <span className="text-[0.56rem] font-semibold tracking-[0.08em] uppercase">
                      Lead
                    </span>
                  </span>
                ) : (
                  <Link
                    key={member.id}
                    href={`/dashboard/agents/${member.id}`}
                    title={`${member.objective ?? member.name} — open their own chat`}
                    className={chipClass}
                  >
                    <AgentAvatar avatar={member.avatar} color={member.color} className="size-5" />
                    {member.name}
                  </Link>
                );
              })
            )}
          </div>

          {lead && agent ? (
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
              {teammates.length > 0
                ? `This chat runs with ${lead.name}, the team lead. Ask a teammate by name — ${
                    lead.name
                  } can hand them one self-contained piece of the work and their answer appears with the reply.`
                : `${lead.name} leads, but there is no teammate yet. Add one to the roster and it can share the work.`}
            </p>
          ) : (
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-muted-foreground">
              A team chat needs a lead agent. Pick one on the Teams page, then come back.
            </p>
          )}

          {lead && agent && teammates.length > 0 && !handoffsEnabled ? (
            <p className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[0.66rem] leading-relaxed text-amber-800 dark:text-amber-200">
              Hand-offs are switched off for {lead.name}, so it can&apos;t delegate from this chat.{" "}
              <Link
                href={`/dashboard/agents/${lead.id}`}
                className="font-medium underline underline-offset-2"
              >
                Turn on Ask a teammate
              </Link>
              .
            </p>
          ) : null}
        </div>

        {readiness ? (
          <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-5">
            <p className="text-[0.85rem] font-medium">This team can&apos;t chat yet</p>
            <p className="mt-1 max-w-lg text-[0.72rem] leading-relaxed text-muted-foreground">
              {readiness} You can fix the roster without starting over:
            </p>
            <Link
              href="/dashboard/teams"
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.72rem] font-medium transition-colors hover:border-brand-border hover:text-brand-ink"
            >
              <UsersRound className="size-3.5" aria-hidden="true" />
              Edit the team
            </Link>
          </div>
        ) : null}
      </div>

      {!readiness && agent ? (
        <div className="mt-3 h-[70dvh] min-h-[24rem] lg:h-auto lg:min-h-0 lg:flex-1">
          <AgentChat
            agent={agent}
            catalog={catalog}
            initialMessages={initialMessages}
            messageCursor={messagePage?.nextCursor ?? null}
            messageHasMore={messagePage?.hasMore ?? false}
            initialWidgets={widgets}
            memoryEnabled={memoryPanel.enabled}
            memoryNotes={memoryPanel.notes}
            contextLabel={`${team.name} · team chat`}
            team={{
              name: team.name,
              avatar: team.avatar,
              color: team.color,
              leadAgentId: team.leadAgentId,
              members: team.members.map(({ id, name, avatar, color }) => ({
                id,
                name,
                avatar,
                color,
              })),
            }}
            apps={overview.apps.map((app) => ({
              slug: app.slug,
              name: app.name,
              connected: app.status === "active",
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

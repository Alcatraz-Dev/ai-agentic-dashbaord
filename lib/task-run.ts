import "server-only";

import { and, eq } from "drizzle-orm";

import { agents, db } from "@/db";
import { appendAgentMessage } from "@/lib/agent-messages";
import { normalizeApprovalMode } from "@/lib/agent-options";
import { streamAgentReply } from "@/lib/agent-runtime";
import { listTasksForUser, recordTaskRunForUser } from "@/lib/tasks";
import { taskRunPrompt } from "@/lib/task-types";

/**
 * "Run now" on a board card.
 *
 * A card does not need a schedule to be run: this takes the role's brief plus
 * the card's steps and picked tools, runs one normal agent turn, and writes the
 * exchange into that agent's transcript so it shows up in chat like any other
 * turn. The card's tool list is enforced, not just described.
 */

const runningCards = new Set<number>();

export type TaskRunNowResult =
  | { ok: true; reply: string; browserUsed: boolean; agentName: string; roleLabel: string }
  | { ok: false; error: string };

export async function runTaskCardNowForUser(
  profileId: number,
  taskId: number,
  options: { roleKey?: string | null } = {},
): Promise<TaskRunNowResult> {
  if (!Number.isInteger(taskId)) return { ok: false, error: "That card could not be found." };
  if (runningCards.has(taskId)) return { ok: false, error: "That card is already running." };

  const card = (await listTasksForUser(profileId)).find((task) => task.id === taskId);
  if (!card) return { ok: false, error: "That card could not be found." };

  const wanted = options.roleKey ?? null;
  const person =
    (wanted ? card.assignees.find((entry) => entry.role.key === wanted) : null) ??
    card.assignees.find((entry) => entry.agent) ??
    null;

  if (!person?.agent) {
    return {
      ok: false,
      error: "Put an agent on at least one role before running this card.",
    };
  }

  const [agent] = await db
    .select({
      id: agents.id,
      ownerId: agents.ownerId,
      name: agents.name,
      provider: agents.provider,
      objective: agents.objective,
      instructions: agents.instructions,
      approvalMode: agents.approvalMode,
      enabledTools: agents.enabledTools,
      mcpTools: agents.mcpTools,
      enabledSkills: agents.enabledSkills,
      enabledPlugins: agents.enabledPlugins,
      enabledDiagrams: agents.enabledDiagrams,
    })
    .from(agents)
    .where(and(eq(agents.id, person.agent.id), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!agent) return { ok: false, error: "That agent could not be found." };

  const prompt = taskRunPrompt(card, {
    key: person.role.key,
    label: person.role.label,
    prompt: person.role.prompt,
  });

  runningCards.add(taskId);
  const startedAt = Date.now();

  try {
    let reply = "";
    let failure: string | null = null;
    let browserUsed = false;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    /** Memories the agent looked up while working the card. */
    const recalled: { id: number; content: string }[] = [];

    for await (const event of streamAgentReply(
      {
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        objective: agent.objective,
        instructions: agent.instructions,
        approvalMode: normalizeApprovalMode(agent.approvalMode),
        enabledTools: agent.enabledTools,
        mcpTools: agent.mcpTools,
        enabledSkills: agent.enabledSkills,
        enabledPlugins: agent.enabledPlugins,
        enabledDiagrams: agent.enabledDiagrams,
        ownerId: agent.ownerId,
      },
      [{ role: "user", content: prompt }],
      undefined,
      {
        onBrowser: (session) => {
          browserUsed = session.actions > 0;
        },
        onUsage: (usage) => {
          promptTokens = usage.inputTokens;
          completionTokens = usage.outputTokens;
        },
        onRecalled: (memories) => {
          recalled.splice(0, recalled.length, ...memories);
        },
        // The card's own picks are the ceiling for this run. `cardToolScope`
        // decides whether that means anything: an empty pick narrows nothing,
        // while a card that named tools keeps only those.
        cardTools: card.tools,
      },
    )) {
      if (event.type === "text") reply += event.delta;
      else if (event.type === "error") failure = event.message;
    }

    if (failure) {
      await recordTaskRunForUser(profileId, {
        taskId,
        agentId: agent.id,
        role: person.role.key,
        trigger: "manual",
        status: "error",
        reply: failure,
        browserUsed,
        durationMs: Date.now() - startedAt,
        promptTokens,
        completionTokens,
        recalled,
      }).catch((error) => console.error("[tasks] could not save the failed run", error));

      return { ok: false, error: failure };
    }

    const text = reply.trim();
    if (text) {
      await appendAgentMessage({ agentId: agent.id, role: "user", content: prompt }).catch(
        (error) => console.error("[tasks] could not save the run prompt", error),
      );
      await appendAgentMessage({ agentId: agent.id, role: "assistant", content: text }).catch(
        (error) => console.error("[tasks] could not save the run reply", error),
      );
    }

    // Recorded before returning, so the card's history is true the moment the
    // owner sees the reply.
    await recordTaskRunForUser(profileId, {
      taskId,
      agentId: agent.id,
      role: person.role.key,
      trigger: "manual",
      status: "ok",
      reply: text || "Finished with no reply.",
      result: text,
      browserUsed,
      durationMs: Date.now() - startedAt,
      promptTokens,
      completionTokens,
      recalled,
    }).catch((error) => console.error("[tasks] could not save the run", error));

    return {
      ok: true,
      reply: text,
      browserUsed,
      agentName: agent.name,
      roleLabel: person.role.label,
    };
  } catch (error) {
    console.error("[tasks] run now failed", error);
    return { ok: false, error: "The agent couldn't finish that run. Please try again." };
  } finally {
    runningCards.delete(taskId);
  }
}

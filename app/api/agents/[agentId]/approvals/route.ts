import { z } from "zod";

import { appendAgentMessage } from "@/lib/agent-messages";
import { getAgentForUser } from "@/lib/agents";
import { ApprovalError, consumeApproval } from "@/lib/agents/approvals";
import { buildResultCard, humanizeKey } from "@/lib/apps/results";
import { executeToolkitAction } from "@/lib/composio/client";
import { composioUserId, isComposioConfigured } from "@/lib/composio/config";
import { getIntegration } from "@/lib/apps/catalog";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Approve or cancel a sealed app action.
 *
 * This is the only place a mutating action runs, and the model is not involved:
 * the browser sends the single-use token, the server opens it, checks it was
 * issued to this owner and agent, consumes it, and executes the exact action
 * and arguments the user saw. Replays and cross-agent tokens are rejected.
 */

const bodySchema = z.object({
  token: z.string().min(20).max(200_000),
  decision: z.enum(["approve", "deny"]),
});

function humanizeAction(slug: string): string {
  const parts = slug.toLowerCase().split("_").filter(Boolean);
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to approve an action." }, { status: 401 });
  }

  const { agentId } = await params;
  const profile = await ensureUserRecord(user);
  const agent = await getAgentForUser(profile.id, Number(agentId));

  if (!agent) {
    return Response.json({ error: "That agent could not be found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send the approval as JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "That approval couldn't be read." }, { status: 400 });
  }

  if (parsed.data.decision === "approve" && !isComposioConfigured()) {
    return Response.json(
      { error: "External apps aren't configured on this workspace." },
      { status: 503 },
    );
  }

  let approval;
  try {
    approval = await consumeApproval(parsed.data.token, {
      ownerId: profile.id,
      agentId: agent.id,
      decision: parsed.data.decision,
    });
  } catch (error) {
    if (error instanceof ApprovalError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[agents] approval could not be opened", error);
    return Response.json({ error: "That approval isn't valid any more." }, { status: 400 });
  }

  const definition = getIntegration(approval.toolkit);
  const appName = definition?.name ?? approval.toolkit;

  if (parsed.data.decision === "deny") {
    await appendAgentMessage({
      agentId: agent.id,
      role: "assistant",
      content: `Cancelled: ${approval.summary}. Nothing was changed in ${appName}.`,
    }).catch((error) => console.error("[agents] could not save the cancellation", error));

    return Response.json({ ok: true, decision: "deny" });
  }

  try {
    const result = await executeToolkitAction({
      action: approval.action,
      userId: composioUserId(profile.id),
      args: approval.args,
    });

    if (result.error) {
      const message = `${humanizeAction(approval.action)} ran but ${appName} reported a failure.`;
      await appendAgentMessage({
        agentId: agent.id,
        role: "assistant",
        content: message,
      }).catch(() => undefined);
      return Response.json({ error: message }, { status: 502 });
    }

    const card = buildResultCard(`${appName} · ${humanizeKey(approval.action)}`, result.data);

    await appendAgentMessage({
      agentId: agent.id,
      role: "assistant",
      content: `Approved and ran ${approval.summary}.`,
      cards: [card],
    }).catch((error) => console.error("[agents] could not save the approval result", error));

    return Response.json({ ok: true, decision: "approve", card });
  } catch (error) {
    console.error("[agents] approved action failed", error);
    return Response.json(
      { error: `${appName} didn't respond. The action may not have run; check the app before trying again.` },
      { status: 502 },
    );
  }
}

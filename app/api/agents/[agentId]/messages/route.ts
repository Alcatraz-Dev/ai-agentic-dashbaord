import { AGENT_MESSAGE_PAGE_SIZE, listAgentMessagePage } from "@/lib/agent-messages";
import { getAgentForUser } from "@/lib/agents";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Older turns of this agent's transcript.
 *
 * The page already ships the newest {@link AGENT_MESSAGE_PAGE_SIZE} messages;
 * `GET ?before=<oldest id>&limit=10` returns the page in front of them, oldest
 * first, plus `nextCursor` for the one before that. Owner-only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to sign in to read this chat." }, { status: 401 });
  }

  const { agentId } = await params;
  const profile = await ensureUserRecord(user);
  const agent = await getAgentForUser(profile.id, Number(agentId));

  if (!agent) {
    return Response.json({ error: "That agent could not be found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const beforeParam = url.searchParams.get("before");
  const limitParam = url.searchParams.get("limit");

  const before = beforeParam === null ? null : Number(beforeParam);
  const limit = limitParam === null ? AGENT_MESSAGE_PAGE_SIZE : Number(limitParam);

  if (beforeParam !== null && (!Number.isFinite(before) || (before ?? 0) <= 0)) {
    return Response.json({ error: "That page could not be read." }, { status: 400 });
  }

  try {
    const page = await listAgentMessagePage(agent.id, {
      before,
      limit: Number.isFinite(limit) ? limit : AGENT_MESSAGE_PAGE_SIZE,
    });

    return Response.json(page, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[agents] could not read the transcript", error);
    return Response.json({ error: "We couldn't load earlier messages." }, { status: 500 });
  }
}

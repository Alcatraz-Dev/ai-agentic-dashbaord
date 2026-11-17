import { getAgentForUser } from "@/lib/agents";
import { captureLiveFrame, hasLiveBrowser } from "@/lib/browserbase/live";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * One frame of the cloud browser an agent is driving right now.
 *
 * The chat and the config panel poll this while a reply streams, so the user
 * can watch what the agent sees. Nothing is stored and nothing is started: if
 * the agent has no browser open, the answer is simply `{ live: false }`.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to sign in." }, { status: 401 });
  }

  const { agentId } = await params;
  const profile = await ensureUserRecord(user);
  const agent = await getAgentForUser(profile.id, Number(agentId));

  if (!agent) {
    return Response.json({ error: "That agent could not be found." }, { status: 404 });
  }

  if (!hasLiveBrowser(agent.id, profile.id)) {
    return Response.json({ live: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const frame = await captureLiveFrame(agent.id, profile.id);
  if (!frame) {
    return Response.json({ live: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return Response.json(
    { live: true, ...frame },
    { headers: { "Cache-Control": "no-store" } },
  );
}

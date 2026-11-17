import { z } from "zod";

import {
  COMPOSIO_NOT_CONFIGURED,
  composioErrorMessage,
  composioErrorStatus,
  isComposioConfigured,
} from "@/lib/composio/config";
import { disconnectIntegration } from "@/lib/composio/connections";
import { forgetComposioSession } from "@/lib/composio/session";
import { resolveIntegrationSlug } from "@/lib/integrations/catalog";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/** Revokes an app at Composio and forgets it here. */

const bodySchema = z.object({
  toolkit: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to disconnect an app." }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return Response.json({ error: COMPOSIO_NOT_CONFIGURED }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send the app as JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "Pick an app to disconnect." }, { status: 400 });
  }

  const slug = resolveIntegrationSlug(parsed.data.toolkit);
  if (!slug) {
    return Response.json({ error: "That app isn't in the catalog." }, { status: 404 });
  }

  const profile = await ensureUserRecord(user);

  try {
    await disconnectIntegration(profile.id, slug);
    // The cached MCP endpoint still lists this toolkit: drop it so the next
    // message opens a session without it.
    forgetComposioSession(profile.id);
    return Response.json({ toolkit: slug, status: "disconnected" });
  } catch (error) {
    console.error(`[composio] disconnect ${slug} failed`, error);
    return Response.json(
      { error: composioErrorMessage(error) },
      { status: composioErrorStatus(error) },
    );
  }
}

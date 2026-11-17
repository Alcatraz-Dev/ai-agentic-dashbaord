import { z } from "zod";

import { connectIntegration } from "@/lib/composio/connections";
import {
  COMPOSIO_NOT_CONFIGURED,
  composioErrorMessage,
  composioErrorStatus,
  isComposioConfigured,
} from "@/lib/composio/config";
import { resolveIntegrationSlug } from "@/lib/integrations/catalog";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Starts the hosted Composio connect flow for one app.
 *
 * Returns the Connect Link URL; the browser opens it in a new tab and the user
 * signs in there. Credentials never touch this app, and nothing becomes usable
 * until the status route reports the account ACTIVE.
 */

const bodySchema = z.object({
  toolkit: z.string().trim().min(1).max(64),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to connect an app." }, { status: 401 });
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
    return Response.json({ error: "Pick an app to connect." }, { status: 400 });
  }

  const slug = resolveIntegrationSlug(parsed.data.toolkit);
  if (!slug) {
    return Response.json({ error: "That app isn't in the catalog." }, { status: 404 });
  }

  const profile = await ensureUserRecord(user);

  try {
    const link = await connectIntegration(profile.id, slug);
    return Response.json({ toolkit: slug, redirectUrl: link.redirectUrl });
  } catch (error) {
    console.error(`[composio] connect ${slug} failed`, error);
    return Response.json(
      { error: composioErrorMessage(error) },
      { status: composioErrorStatus(error) },
    );
  }
}

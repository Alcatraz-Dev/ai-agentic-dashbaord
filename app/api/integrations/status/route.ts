import {
  COMPOSIO_NOT_CONFIGURED,
  composioErrorMessage,
  composioErrorStatus,
  isComposioConfigured,
} from "@/lib/composio/config";
import { verifyIntegration } from "@/lib/composio/connections";
import { resolveIntegrationSlug } from "@/lib/integrations/catalog";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

/**
 * Live connection status for one app.
 *
 * The chat's connect card polls this after opening the hosted flow; the Apps
 * page reads the stored mirror instead, so this endpoint is the only place
 * that has to be exact at a moment in time.
 */

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to check an app." }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return Response.json({ error: COMPOSIO_NOT_CONFIGURED }, { status: 503 });
  }

  const requested = new URL(request.url).searchParams.get("toolkit")?.trim() ?? "";
  const slug = resolveIntegrationSlug(requested);
  if (!slug) {
    return Response.json({ error: "That app isn't in the catalog." }, { status: 404 });
  }

  const profile = await ensureUserRecord(user);

  try {
    const result = await verifyIntegration(profile.id, slug);
    return Response.json(
      { toolkit: slug, status: result.status, accountLabel: result.accountLabel },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(`[composio] status ${slug} failed`, error);
    return Response.json(
      { error: composioErrorMessage(error) },
      { status: composioErrorStatus(error) },
    );
  }
}

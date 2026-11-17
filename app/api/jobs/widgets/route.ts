import { verifyJobsSignature } from "@/lib/jobs";
import { refreshWidgetById } from "@/lib/widget-refresh-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CloudHike Jobs worker: runs one widget's read-only update outside the cron
 * request. It replaces only the widget's data, so a retry is safe, but the
 * failure is reported as 5xx all the same so Jobs records it.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  if (!verifyJobsSignature(raw, request.headers.get("x-cloudhike-signature"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { widgetId?: unknown };
  try {
    payload = JSON.parse(raw) as { widgetId?: unknown };
  } catch {
    return Response.json({ error: "Send the run as JSON." }, { status: 400 });
  }

  const widgetId = Number(payload.widgetId);
  if (!Number.isInteger(widgetId) || widgetId <= 0) {
    return Response.json({ error: "widgetId is required." }, { status: 400 });
  }

  const result = await refreshWidgetById(widgetId);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

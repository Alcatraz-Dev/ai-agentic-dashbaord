import { runAgentSchedule } from "@/lib/agent-schedules";
import { verifyJobsSignature } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CloudHike Jobs worker: runs one due agent schedule outside the cron request.
 *
 * CloudHike signs every call with `x-cloudhike-signature`, so only its worker
 * can start a run. A failed run answers 5xx on purpose — the run is not retried
 * (a second run would append a second reply), but CloudHike records it failed.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  if (!verifyJobsSignature(raw, request.headers.get("x-cloudhike-signature"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { scheduleId?: unknown };
  try {
    payload = JSON.parse(raw) as { scheduleId?: unknown };
  } catch {
    return Response.json({ error: "Send the run as JSON." }, { status: 400 });
  }

  const scheduleId = Number(payload.scheduleId);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return Response.json({ error: "scheduleId is required." }, { status: 400 });
  }

  const result = await runAgentSchedule(scheduleId, "jobs");
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

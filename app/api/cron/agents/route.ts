import {
  listDueSchedules,
  reserveScheduleRun,
  runAgentSchedule,
  sendDailyScheduleDigests,
} from "@/lib/agent-schedules";
import { jobsConfig, publicAppOrigin, startJobsRun } from "@/lib/jobs";
import { listDueWidgetRefreshes, reserveWidgetRefresh } from "@/lib/widgets";
import { refreshWidgetById } from "@/lib/widget-refresh-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs every agent schedule that is due. Point a scheduler (Vercel Cron, GitHub
 * Actions, any timer) at this route with `Authorization: Bearer $CRON_SECRET`.
 *
 * When CloudHike Jobs is configured and the app has a public HTTPS origin, each
 * due run is handed to Jobs instead of running here: a scheduled run can drive
 * the cloud browser and outlive this request. The worker is
 * `/api/jobs/schedules`; without Jobs the run happens inline as before.
 *
 * The same tick also refreshes due widgets (each widget owns its own hourly
 * schedule) and sends each user's daily digest (at most once per 24h), so a
 * single timer covers runs, widgets and email.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  }

  const header = request.headers.get("authorization");
  const query = new URL(request.url).searchParams.get("key");
  const provided = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : (query ?? "").trim();

  if (provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offload = jobsConfig() !== null && publicAppOrigin() !== null;
  // Jobs owns the clock once a schedule is synced remotely; the local cron
  // must not run it a second time. Un-synced rows remain the fallback.
  const due = await listDueSchedules(5, { excludeJobs: offload });
  const results: { id: number; ok: boolean; queued?: boolean }[] = [];

  for (const schedule of due) {
    if (offload) {
      const queued = await startJobsRun({
        path: "/api/jobs/schedules",
        payload: { scheduleId: schedule.id },
        timeoutSeconds: 300,
      });

      if (queued.ok) {
        // Claim the slot so the next tick doesn't queue it again.
        await reserveScheduleRun(schedule.id);
        results.push({ id: schedule.id, ok: true, queued: true });
        continue;
      }
    }

    const result = await runAgentSchedule(schedule.id, "cron");
    results.push({ id: schedule.id, ok: result.ok });
  }

  const dueWidgets = await listDueWidgetRefreshes(3);
  const widgets: { id: number; ok: boolean; queued?: boolean }[] = [];

  for (const widget of dueWidgets) {
    if (offload) {
      const queued = await startJobsRun({
        path: "/api/jobs/widgets",
        payload: { widgetId: widget.id },
        timeoutSeconds: 300,
      });

      if (queued.ok && (await reserveWidgetRefresh(widget.id))) {
        widgets.push({ id: widget.id, ok: true, queued: true });
        continue;
      }
    }

    // Claim the slot first, so a second tick can't run the same widget.
    if (!(await reserveWidgetRefresh(widget.id))) continue;

    const result = await refreshWidgetById(widget.id);
    widgets.push({ id: widget.id, ok: result.ok });
  }

  const digests = await sendDailyScheduleDigests().catch((error) => {
    console.error("[agents] digests failed", error);
    return 0;
  });

  return Response.json({
    ran: results.length,
    results,
    widgets,
    digests,
  });
}

import { listRecentScheduleRuns } from "@/lib/agent-schedules";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

function cell(value: string | null): string {
  const text = value ?? "";
  return `"${text.replace(/"/g, '""')}"`;
}

/** CSV of the workspace's schedule runs, newest first. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to export." }, { status: 401 });
  }

  const profile = await ensureUserRecord(user);
  const runs = await listRecentScheduleRuns(profile.id, MAX_ROWS);

  const header = ["run_id", "ran_at", "agent", "schedule", "status", "reply"];
  const lines = [
    header.join(","),
    ...runs.map((run) =>
      [
        String(run.id),
        cell(run.createdAt),
        cell(run.agentName),
        cell(run.scheduleTitle),
        cell(run.status),
        cell(run.reply),
      ].join(","),
    ),
  ];

  // A BOM keeps Excel from mangling non-ASCII replies.
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="schedule-runs-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import { listOwnerBrowserSessions } from "@/lib/browser-sessions";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** CSV of every recorded cloud-browser session, newest first. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to export." }, { status: 401 });
  }

  const profile = await ensureUserRecord(user);
  const sessions = await listOwnerBrowserSessions(profile.id, MAX_ROWS);

  const header = [
    "session_id",
    "agent",
    "actions",
    "status",
    "started_at",
    "ended_at",
    "replay_url",
  ];

  const lines = [
    header.join(","),
    ...sessions.map((session) =>
      [
        cell(session.sessionId),
        cell(session.agentName),
        String(session.actions),
        cell(session.status),
        cell(session.startedAt),
        cell(session.endedAt),
        cell(session.replayUrl),
      ].join(","),
    ),
  ];

  // A BOM keeps Excel from mangling anything non-ASCII.
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="browser-sessions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

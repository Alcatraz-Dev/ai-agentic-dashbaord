import "server-only";

import { eq } from "drizzle-orm";

import { db, users } from "@/db";

/**
 * Email for schedules, sent through Resend's HTTP API with a plain fetch (no
 * SDK). Everything is optional: without RESEND_API_KEY nothing leaves the
 * server, and the in-app bell still records failures.
 */

const API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.SCHEDULE_ALERT_FROM ?? "Alcatraz dev <onboarding@resend.dev>";

export type EmailResult = { ok: true } | { ok: false; error: string };

export function scheduleAlertsConfigured(): boolean {
  return Boolean(API_KEY);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function emailShell(body: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#0f172a">
      ${body}
      <p style="margin:16px 0 0;color:#64748b;font-size:12px">
        You can change these emails in workspace settings.
      </p>
    </div>
  `;
}

/** Low-level send. Returns a result instead of throwing so callers can report. */
export async function sendScheduleEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailResult> {
  if (!API_KEY) return { ok: false, error: "Email is not configured on this server." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[agents] email rejected", response.status, detail.slice(0, 300));
      return { ok: false, error: "The email service rejected the message." };
    }

    return { ok: true };
  } catch (error) {
    console.error("[agents] email could not be sent", error);
    return { ok: false, error: "The email service could not be reached." };
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyScheduleFailure({
  ownerId,
  agentName,
  scheduleTitle,
  error,
}: {
  ownerId: number;
  agentName: string;
  scheduleTitle: string;
  error: string;
}): Promise<void> {
  if (!API_KEY) return;

  const [owner] = await db
    .select({ email: users.email, alerts: users.scheduleAlerts })
    .from(users)
    .where(eq(users.id, ownerId))
    .limit(1);

  if (!owner?.alerts || !owner.email) return;

  const link = appUrl() ? `${appUrl()}/dashboard/settings` : "";
  const subject = `Scheduled run failed: ${scheduleTitle}`;

  const text = [
    `The schedule "${scheduleTitle}" on agent "${agentName}" failed.`,
    "",
    error,
    "",
    link ? `Run history: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailShell(`
    <p style="margin:0 0 4px"><strong>${escapeHtml(scheduleTitle)}</strong> failed on
      <strong>${escapeHtml(agentName)}</strong>.</p>
    <p style="margin:12px 0;padding:12px;border-radius:8px;background:#fff1f2;color:#9f1239">
      ${escapeHtml(error)}
    </p>
    ${
      link
        ? `<p style="margin:12px 0 0"><a href="${escapeHtml(link)}" style="color:#1d4ed8">Open run history</a></p>`
        : ""
    }
  `);

  await sendScheduleEmail({ to: owner.email, subject, text, html });
}

/** One-off message so the owner can confirm delivery without waiting for a failure. */
export async function sendScheduleTestEmail({
  to,
  name,
}: {
  to: string;
  name: string | null;
}): Promise<EmailResult> {
  const link = appUrl() ? `${appUrl()}/dashboard/settings` : "";
  const greeting = name ? `Hi ${name},` : "Hi,";

  const text = [
    greeting,
    "",
    "This is a test of your Alcatraz schedule emails. Scheduled runs that fail will send a message like this.",
    "",
    "If you can read this, email delivery is working.",
    link ? `\nRun history: ${link}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailShell(`
    <p style="margin:0 0 10px">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 10px">This is a test of your Alcatraz schedule emails. Scheduled runs
      that fail will send a message like this.</p>
    <p style="margin:0">If you can read this, email delivery is working.</p>
    ${
      link
        ? `<p style="margin:12px 0 0"><a href="${escapeHtml(link)}" style="color:#1d4ed8">Open workspace settings</a></p>`
        : ""
    }
  `);

  return sendScheduleEmail({ to, subject: "Test: Alcatraz schedule alerts", text, html });
}

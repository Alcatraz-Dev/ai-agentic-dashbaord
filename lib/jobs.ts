import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * CloudHike Background Jobs.
 *
 * A scheduled agent run can include cloud-browser work, which easily outlives a
 * single request. Jobs calls an endpoint of ours back with a much longer
 * timeout, so the work happens off the cron request.
 *
 * Everything here is optional: with no `JOBS_API_URL` / `JOBS_API_KEY`, or when
 * the app has no public HTTPS origin, the caller falls back to running inline.
 */

export type JobsConfig = { apiUrl: string; apiKey: string };

export function jobsConfig(): JobsConfig | null {
  const apiUrl = process.env.JOBS_API_URL?.trim();
  const apiKey = process.env.JOBS_API_KEY?.trim();
  if (!apiUrl || !apiKey) return null;
  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey };
}

/**
 * Where Jobs can reach us. It refuses localhost and private addresses, so a
 * local dev origin means "run inline".
 */
export function publicAppOrigin(): string | null {
  // A server-only override is useful when the browser origin is localhost but
  // the deployed app is reachable at a public HTTPS URL.
  const raw = process.env.JOBS_APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export type JobsScheduleInput = {
  name: string;
  cron: string;
  timezone: string;
  path: string;
  payload: unknown;
  enabled?: boolean;
  timeoutSeconds?: number;
};

export type JobsScheduleResult =
  | { ok: true; id: string; nextRunAt: string | null }
  | { ok: false; error: string; notFound?: boolean };

/**
 * Creates (or updates) one recurring CloudHike Jobs schedule that calls back
 * into this app. Jobs owns the clock; the app owns the task and its history.
 */
async function upsertJobsSchedule(
  input: JobsScheduleInput,
  existingId: string | null,
): Promise<JobsScheduleResult> {
  const config = jobsConfig();
  const origin = publicAppOrigin();

  if (!config) return { ok: false, error: "CloudHike Jobs is not configured." };
  if (!origin) {
    return {
      ok: false,
      error: "CloudHike Jobs needs a public HTTPS app URL. Set NEXT_PUBLIC_APP_URL to the deployed origin.",
    };
  }

  const body = {
    name: input.name.slice(0, 100),
    cron: input.cron,
    timezone: input.timezone || "UTC",
    enabled: input.enabled ?? true,
    url: `${origin}${input.path}`,
    method: "POST",
    body: input.payload,
    timeoutSeconds: input.timeoutSeconds ?? 300,
    retries: 0,
  };

  try {
    const response = await fetch(
      existingId
        ? `${config.apiUrl}/schedules/${encodeURIComponent(existingId)}`
        : `${config.apiUrl}/schedules`,
      {
        method: existingId ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[jobs] schedule sync failed", response.status, text.slice(0, 300));
      return {
        ok: false,
        error:
          response.status === 429
            ? "CloudHike Jobs is over its schedule limit. Manage schedules in the Jobs dashboard."
            : `CloudHike Jobs answered ${response.status}.`,
        notFound: response.status === 404,
      };
    }

    const data = (await response.json().catch(() => null)) as
      | { id?: unknown; nextRunAt?: unknown }
      | null;

    const id = existingId ?? (typeof data?.id === "string" ? data.id : null);
    if (!id) return { ok: false, error: "CloudHike Jobs returned no schedule id." };

    return {
      ok: true,
      id,
      nextRunAt: typeof data?.nextRunAt === "string" ? data.nextRunAt : null,
    };
  } catch (error) {
    console.error("[jobs] schedule sync failed", error);
    return { ok: false, error: "CloudHike Jobs could not be reached." };
  }
}

export async function createJobsSchedule(
  input: JobsScheduleInput,
): Promise<JobsScheduleResult> {
  return upsertJobsSchedule(input, null);
}

/**
 * Updates an existing Jobs schedule. A 404 means it was deleted in the Jobs
 * dashboard, so the caller can recreate it instead of failing forever.
 */
export async function updateJobsSchedule(
  id: string,
  input: JobsScheduleInput,
): Promise<JobsScheduleResult> {
  return upsertJobsSchedule(input, id);
}

export async function deleteJobsSchedule(id: string): Promise<boolean> {
  const config = jobsConfig();
  if (!config || !id) return false;

  try {
    const response = await fetch(`${config.apiUrl}/schedules/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "x-api-key": config.apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok || response.status === 404;
  } catch (error) {
    console.error("[jobs] schedule delete failed", error);
    return false;
  }
}

export type StartJobsRunResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Queues one call back into this app. */
export async function startJobsRun(input: {
  path: string;
  payload: unknown;
  timeoutSeconds?: number;
}): Promise<StartJobsRunResult> {
  const config = jobsConfig();
  const origin = publicAppOrigin();

  if (!config) return { ok: false, error: "CloudHike Jobs is not configured." };
  if (!origin) return { ok: false, error: "The app has no public HTTPS origin for Jobs to call." };

  try {
    const response = await fetch(`${config.apiUrl}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        url: `${origin}${input.path}`,
        method: "POST",
        body: input.payload,
        timeoutSeconds: input.timeoutSeconds ?? 300,
        // An agent run is not safe to repeat: a retry would append a second
        // reply to the transcript.
        retries: 0,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error("[jobs] starting a run failed", response.status);
      return { ok: false, error: `Jobs answered ${response.status}.` };
    }

    const data = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id ?? "" };
  } catch (error) {
    console.error("[jobs] starting a run failed", error);
    return { ok: false, error: "Jobs could not be reached." };
  }
}

/**
 * Checks the `x-cloudhike-signature` header (`t=<unix seconds>,v1=<hex>`) that
 * CloudHike sends with every call, so nobody else can trigger a worker run.
 */
export function verifyJobsSignature(rawBody: string, header: string | null): boolean {
  const apiKey = process.env.JOBS_API_KEY?.trim();
  if (!apiKey || !header) return false;

  const parts = Object.fromEntries(
    header
      .split(",")
      .map((part) => part.split("="))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac("sha256", apiKey).update(`${timestamp}.${rawBody}`).digest("hex");
  const provided = parts.v1 ?? "";

  return (
    expected.length === provided.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  );
}

import { NextResponse } from "next/server";

import { renderArchify } from "@/lib/archify/render";
import { ARCHIFY_SOURCE_MAX } from "@/lib/archify/types";
import { getCurrentUser } from "@/lib/session";

/**
 * Draws one Archify IR and returns the standalone HTML artifact.
 *
 * The renderer is a CPU-bound child process, so this endpoint is authenticated
 * and size-capped. The artifact is self-contained; the browser shows it in a
 * sandboxed iframe and never trusts it with the app origin.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BODY_LIMIT = ARCHIFY_SOURCE_MAX + 2_000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to draw a diagram." }, { status: 401 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > BODY_LIMIT) {
    return NextResponse.json(
      { ok: false, error: "That diagram is too large." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }

  const source =
    body && typeof body === "object" && typeof (body as { source?: unknown }).source === "string"
      ? (body as { source: string }).source
      : "";

  if (!source.trim()) {
    return NextResponse.json({ ok: false, error: "Paste Archify JSON first." }, { status: 400 });
  }
  if (source.length > ARCHIFY_SOURCE_MAX) {
    return NextResponse.json(
      {
        ok: false,
        error: `Keep the diagram under ${ARCHIFY_SOURCE_MAX.toLocaleString()} characters.`,
      },
      { status: 413 },
    );
  }

  const rendered = await renderArchify(source);
  if (!rendered.ok) {
    return NextResponse.json({ ok: false, error: rendered.error }, { status: 422 });
  }

  return new NextResponse(rendered.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The HTML is immutable for one IR; the module cache also holds it.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // The artifact is shown in a sandboxed iframe; the header keeps a direct
      // navigation to this URL on an opaque origin too.
      "Content-Security-Policy": "sandbox allow-scripts allow-downloads",
    },
  });
}

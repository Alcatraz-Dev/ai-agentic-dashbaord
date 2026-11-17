import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { finishMcpOAuth } from "@/lib/agent-mcp";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const dynamic = "force-dynamic";

const PENDING_COOKIE = "mcp_oauth_pending";
const RETURN_COOKIE = "mcp_oauth_return";

function withResult(returnTo: string, value: "connected" | "error") {
  return `${returnTo}${returnTo.includes("?") ? "&" : "?"}mcp=${value}`;
}

/** Where the MCP server sends the browser back after the user approves. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const pending = jar.get(PENDING_COOKIE)?.value ?? null;
  const returnTo = jar.get(RETURN_COOKIE)?.value ?? "/dashboard";

  function fail(reason: string): never {
    console.error("[agents] MCP OAuth callback failed:", reason);
    redirect(withResult(returnTo, "error"));
  }

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const oauthError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (oauthError) fail(`provider returned ${oauthError}`);
  if (!code || !state || !pending) fail("missing code, state or pending flow");

  const profile = await ensureUserRecord(user);

  try {
    await finishMcpOAuth({ pendingCookie: pending, state, code, profileId: profile.id });
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown error");
  }

  jar.set(PENDING_COOKIE, "", { maxAge: 0, path: "/api/mcp/oauth" });
  jar.set(RETURN_COOKIE, "", { maxAge: 0, path: "/api/mcp/oauth" });

  redirect(withResult(returnTo, "connected"));
}

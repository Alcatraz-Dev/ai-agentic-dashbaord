import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Cable, KeyRound, ShieldCheck, Wrench } from "lucide-react";

import { McpServersSection } from "@/components/agents/mcp-servers";
import { listAgentMcpServers } from "@/lib/agent-mcp";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "MCPs" };

/**
 * Account-wide Model Context Protocol servers. One connection gives every
 * agent the server's tools; each agent then chooses which tools it may call
 * from its own config rail.
 */
export default async function McpsPage({
  searchParams,
}: {
  searchParams: Promise<{ mcp?: string }>;
}) {
  const user = await requireUser();
  const { mcp } = await searchParams;
  const notice = mcp === "connected" ? "connected" : mcp === "error" ? "error" : null;

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const servers = await listAgentMcpServers(profile.id);
  const toolCount = servers.reduce((total, server) => total + server.tools.length, 0);

  return (
    <div className="aui-page max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">
            Model Context Protocol
          </p>
          <h1 className="aui-title mt-2">MCPs</h1>
          <p className="aui-subtitle mt-2">
            Add any remote MCP server — token or OAuth — and every agent can use its tools. Each
            agent still decides which tools it may call.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <Cable className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{servers.length}</span>{" "}
          {servers.length === 1 ? "server" : "servers"} ·{" "}
          <span className="font-semibold text-foreground tabular-nums">{toolCount}</span> tools
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
            <Cable className="size-4" />
          </span>
          <p className="mt-2.5 text-[0.82rem] font-semibold">Any remote server</p>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            Streamable HTTP endpoints work. Bring your own sidecar or a hosted service.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
            <KeyRound className="size-4" />
          </span>
          <p className="mt-2.5 text-[0.82rem] font-semibold">Token or OAuth</p>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            Paste a bearer token, or let the server sign the workspace in with OAuth.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground ring-1 ring-border">
            <Wrench className="size-4" />
          </span>
          <p className="mt-2.5 text-[0.82rem] font-semibold">Scoped per agent</p>
          <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted-foreground">
            Servers are account-wide; open an agent&apos;s config to choose its tools.
          </p>
        </div>
      </div>

      <section className="premium-panel mt-5 rounded-2xl px-5 py-4">
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 ring-1 ring-border">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-ink" />
          <p className="text-[0.72rem] leading-relaxed text-muted-foreground">
            Tokens are stored encrypted and sent only to that server. A server you add here appears
            in every agent&apos;s config, so nobody has to reconnect it.
          </p>
        </div>
        <McpServersSection
          servers={servers}
          notice={notice}
          returnTo="/dashboard/mcps"
        />
      </section>

      <p className="pt-3 text-[0.68rem] leading-relaxed text-muted-foreground">
        Need an app rather than a raw server? The{" "}
        <Link href="/dashboard/apps" className="underline underline-offset-2 hover:text-foreground">
          Apps catalog
        </Link>{" "}
        connects 1,700+ services without any setup.{" "}
        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
        >
          About MCP
          <ArrowUpRight className="size-3" />
        </a>
      </p>
    </div>
  );
}

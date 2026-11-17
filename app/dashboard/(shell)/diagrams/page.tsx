import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Workflow } from "lucide-react";

import { DiagramsManager } from "@/components/diagrams/diagrams-manager";
import { listAgentsForUser } from "@/lib/agents";
import { listCustomDiagramsForUser } from "@/lib/custom-diagrams";
import { getDashboardForUser } from "@/lib/dashboards";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export const metadata: Metadata = { title: "Diagrams" };

/**
 * The workspace diagram library. A diagram is Archify JSON IR saved once; every
 * agent can list it and load the real structure through `use_diagram`, and the
 * chat draws whatever the agent writes back with Archify's own renderers.
 */
export default async function DiagramsPage() {
  const user = await requireUser();

  const dashboard = await getDashboardForUser(user.id);
  if (!dashboard) redirect("/dashboard/new");

  const profile = await ensureUserRecord(user);
  const [diagrams, agents] = await Promise.all([
    listCustomDiagramsForUser(profile.id),
    listAgentsForUser(profile.id),
  ]);

  return (
    <div className="aui-page max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="aui-eyebrow">Workspace library</p>
          <h1 className="aui-title mt-2">Diagrams</h1>
          <p className="aui-subtitle mt-2">
            Save the diagrams your work keeps coming back to. Agents list them by name, load the
            exact structure when a task refers to one, and draw the result in chat.
          </p>
        </div>

        <span className="aui-chip text-[0.72rem]">
          <Workflow className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{diagrams.length}</span>{" "}
          saved
        </span>
      </div>

      <DiagramsManager
        diagrams={diagrams}
        agents={agents.map((agent) => ({ id: agent.id, name: agent.name }))}
      />

      <div className="mt-5 flex flex-wrap items-start gap-3 rounded-2xl border border-brand-border bg-brand-soft px-4 py-3">
        <Workflow className="mt-0.5 size-4 shrink-0 text-brand-ink" />
        <p className="max-w-3xl text-[0.74rem] leading-relaxed text-muted-foreground">
          A one-off drawing needs nothing saved: pick <span className="font-medium text-foreground">Draw a diagram</span>{" "}
          in the chat&apos;s Add menu and the turn is asked for an Archify block, which the reply
          renders. Save it here when the next version should start from the same nodes. Which agents
          may load a diagram is switched on their{" "}
          <Link href="/dashboard/agents" className="font-medium text-brand-ink hover:underline">
            agent panel
          </Link>
          .
          <Link
            href="/dashboard/skills"
            className="ml-2 inline-flex items-center gap-1 font-medium text-brand-ink hover:underline"
          >
            Browse skills
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </div>
  );
}

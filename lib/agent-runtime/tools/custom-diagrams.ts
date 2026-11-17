import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import { cardToolAllows, cardToolRefusal } from "@/lib/agent-runtime/card-tools";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import type { CustomDiagramSummary } from "@/lib/custom-diagram-types";

const parameters = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("The exact diagram name shown in the owner diagrams list."),
});

/**
 * One tool for the workspace's saved diagrams. Only names and descriptions are
 * in the prompt; this returns the real Archify JSON IR of the one the task
 * refers to, so the model extends the saved structure instead of inventing a
 * new one.
 */
export function createUseDiagramTool(
  diagrams: CustomDiagramSummary[],
): Tool<AgentToolRunState> {
  const byName = new Map(diagrams.map((diagram) => [diagram.name.toLowerCase(), diagram]));

  return tool<typeof parameters, AgentToolRunState>({
    name: "use_diagram",
    description:
      "Load the Archify JSON IR of one of the owner's saved diagrams. Call this before redrawing, extending or describing a diagram listed under Owner diagrams.",
    parameters,
    execute: async ({ name }, context) => {
      const diagram = byName.get(name.trim().toLowerCase());

      if (!diagram) {
        return `No diagram named "${name}". Available diagrams: ${diagrams
          .map((entry) => entry.name)
          .join(", ")}.`;
      }

      // A board card narrows the run; a tool that reached the model by any
      // route still cannot read a diagram the card did not pick.
      const policy = context?.context?.cardTools ?? null;
      if (!cardToolAllows(policy, "diagram", diagram.name)) {
        return cardToolRefusal("diagram", diagram.name);
      }

      return [
        `Diagram: ${diagram.name}`,
        diagram.description ? `What it shows: ${diagram.description}` : "",
        "",
        "Archify JSON IR — keep these ids and the diagram_type when you redraw or extend it, and put your own version in a fenced ```archify block:",
        diagram.source,
      ]
        .filter((line) => line !== "")
        .join("\n");
    },
  });
}

/** Prompt entry for the diagram list. */
export function listCustomDiagramSummaries(
  diagrams: CustomDiagramSummary[],
): { name: string; description: string }[] {
  return diagrams.map((diagram) => ({
    name: diagram.name,
    description: diagram.description,
  }));
}

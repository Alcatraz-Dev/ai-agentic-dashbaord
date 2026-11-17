import "server-only";

import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import { cardToolAllows, cardToolRefusal } from "@/lib/agent-runtime/card-tools";
import type { CustomSkillSummary } from "@/lib/custom-skill-types";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";

const parameters = z.object({
  name: z
    .string()
    .min(1)
    .max(120)
    .describe("The exact skill name shown in the owner skills list."),
});

/**
 * One tool for the workspace's custom skills. Only names and descriptions are
 * in the prompt; this loads the full body of the one the task needs.
 */
export function createUseSkillTool(skills: CustomSkillSummary[]): Tool<AgentToolRunState> {
  const byName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));

  return tool<typeof parameters, AgentToolRunState>({
    name: "use_skill",
    description:
      "Load the complete instructions for one of the owner's saved skills. Call this before applying a skill listed under Owner skills.",
    parameters,
    execute: async ({ name }, context) => {
      const skill = byName.get(name.trim().toLowerCase());

      if (!skill) {
        return `No skill named "${name}". Available skills: ${skills
          .map((entry) => entry.name)
          .join(", ")}.`;
      }

      // A board card's list is a hard ceiling, not just a hint.
      if (!cardToolAllows(context?.context?.cardTools ?? null, "skill", skill.name)) {
        return cardToolRefusal("skill", skill.name);
      }

      return [
        `Skill: ${skill.name}`,
        skill.description ? `When to use it: ${skill.description}` : "",
        "",
        skill.instructions,
      ]
        .filter((line) => line !== "")
        .join("\n");
    },
  });
}

/** Prompt entry for the skill list. */
export function listCustomSkillSummaries(
  skills: CustomSkillSummary[],
): { name: string; description: string }[] {
  return skills.map((skill) => ({ name: skill.name, description: skill.description }));
}

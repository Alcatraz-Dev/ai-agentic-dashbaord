"use server";

import {
  CUSTOM_SKILL_DESCRIPTION_MAX,
  CUSTOM_SKILL_FILE_BYTES_MAX,
  CUSTOM_SKILL_FILE_EXTENSIONS,
  CUSTOM_SKILL_INSTRUCTIONS_MAX,
  CUSTOM_SKILL_NAME_MAX,
  CUSTOM_SKILLS_MAX,
  type CustomSkillSummary,
} from "@/lib/custom-skill-types";
import {
  countCustomSkillsForUser,
  createCustomSkillForUser,
  customSkillNameExists,
  deleteCustomSkillForUser,
} from "@/lib/custom-skills";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export type CreateCustomSkillResult =
  | { ok: true; skill: CustomSkillSummary }
  | { ok: false; error: string };

export type DeleteCustomSkillResult = { ok: true } | { ok: false; error: string };

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  return CUSTOM_SKILL_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Rejects binaries that survived the extension check. */
function hasBinaryControls(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function cleanContent(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function fallbackDescription(instructions: string): string {
  const line = instructions
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry.length > 0);

  return (line ?? "Reusable instructions for your agents.").slice(
    0,
    CUSTOM_SKILL_DESCRIPTION_MAX,
  );
}

/**
 * Adds a workspace skill from either the textarea or an uploaded `.md` / `.txt`
 * file. A file wins when both are present. The full body is stored and loaded
 * by `use_skill` on demand, so a large playbook never bloats every prompt.
 */
export async function createCustomSkillAction(
  formData: FormData,
): Promise<CreateCustomSkillResult> {
  const user = await requireUser();

  const fileEntry = formData.get("file");
  const file =
    fileEntry && typeof fileEntry !== "string" && fileEntry.size > 0 ? fileEntry : null;

  if (file) {
    if (!isTextFile(file.name)) {
      return { ok: false, error: "Upload a Markdown (.md) or plain text (.txt) file." };
    }
    if (file.size > CUSTOM_SKILL_FILE_BYTES_MAX) {
      return {
        ok: false,
        error: `Keep the file under ${Math.round(CUSTOM_SKILL_FILE_BYTES_MAX / 1024)} KB.`,
      };
    }
  }

  let instructions = cleanContent(formText(formData, "instructions"));

  if (file) {
    try {
      instructions = cleanContent(await file.text());
    } catch {
      return { ok: false, error: "That file could not be read. Please try another one." };
    }
  }

  if (!instructions) {
    return { ok: false, error: "Write the skill or upload a Markdown / text file." };
  }
  if (instructions.length > CUSTOM_SKILL_INSTRUCTIONS_MAX) {
    return {
      ok: false,
      error: `Keep the skill under ${CUSTOM_SKILL_INSTRUCTIONS_MAX.toLocaleString()} characters.`,
    };
  }
  if (hasBinaryControls(instructions)) {
    return { ok: false, error: "That file doesn't look like plain text." };
  }

  const fileStem = file?.name.replace(/\.[^.]+$/, "") ?? "";
  const name = (formText(formData, "name") || fileStem)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_SKILL_NAME_MAX);

  if (!name) {
    return { ok: false, error: "Give the skill a name." };
  }

  const description =
    formText(formData, "description").replace(/\s+/g, " ").trim().slice(
      0,
      CUSTOM_SKILL_DESCRIPTION_MAX,
    ) || fallbackDescription(instructions);

  try {
    const profile = await ensureUserRecord(user);

    if ((await countCustomSkillsForUser(profile.id)) >= CUSTOM_SKILLS_MAX) {
      return {
        ok: false,
        error: `This workspace already has ${CUSTOM_SKILLS_MAX} skills. Remove one first.`,
      };
    }
    if (await customSkillNameExists(profile.id, name)) {
      return { ok: false, error: `A skill named "${name}" already exists.` };
    }

    const skill = await createCustomSkillForUser(profile.id, {
      name,
      description,
      instructions,
      sourceName: file?.name ? file.name.slice(0, 180) : null,
    });

    return { ok: true, skill };
  } catch (error) {
    console.error("[skills] create failed", error);
    return { ok: false, error: "We couldn't save that skill. Please try again." };
  }
}

export async function deleteCustomSkillAction(input: {
  id: number;
}): Promise<DeleteCustomSkillResult> {
  const user = await requireUser();

  const skillId = Number(input.id);
  if (!Number.isInteger(skillId) || skillId <= 0) {
    return { ok: false, error: "That skill could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteCustomSkillForUser(profile.id, skillId);
    if (!deleted) return { ok: false, error: "That skill could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[skills] delete failed", error);
    return { ok: false, error: "We couldn't remove that skill. Please try again." };
  }
}

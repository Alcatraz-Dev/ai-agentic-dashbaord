"use server";

import { cleanArchifySource, normalizeArchifySource } from "@/lib/archify/types";
import { renderArchify } from "@/lib/archify/render";
import {
  CUSTOM_DIAGRAM_DESCRIPTION_MAX,
  CUSTOM_DIAGRAM_FILE_BYTES_MAX,
  CUSTOM_DIAGRAM_FILE_EXTENSIONS,
  CUSTOM_DIAGRAM_NAME_MAX,
  CUSTOM_DIAGRAM_SOURCE_MAX,
  CUSTOM_DIAGRAMS_MAX,
  type CustomDiagramSummary,
} from "@/lib/custom-diagram-types";
import {
  countCustomDiagramsForUser,
  createCustomDiagramForUser,
  customDiagramNameExists,
  deleteCustomDiagramForUser,
  getCustomDiagramForUser,
  updateCustomDiagramForUser,
} from "@/lib/custom-diagrams";
import { listAgentsForUser } from "@/lib/agents";
import { getDashboardForUser } from "@/lib/dashboards";
import { draftDiagramForUser, type DiagramDraftResult } from "@/lib/diagram-draft";
import { widgetLimitError } from "@/lib/plan-usage";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { createDiagramWidgetForUser } from "@/lib/widgets";

export type CreateCustomDiagramResult =
  | { ok: true; diagram: CustomDiagramSummary }
  | { ok: false; error: string };

export type DeleteCustomDiagramResult = { ok: true } | { ok: false; error: string };

export type UpdateCustomDiagramResult =
  | { ok: true; diagram: CustomDiagramSummary }
  | { ok: false; error: string };

const FALLBACK_DESCRIPTION = "Archify diagram saved to this workspace.";

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isDiagramFile(name: string): boolean {
  const lower = name.toLowerCase();
  return CUSTOM_DIAGRAM_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Rejects binaries that survived the extension check. */
function hasBinaryControls(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

/**
 * Saves a workspace diagram from the textarea or an uploaded `.json` / `.md` /
 * `.txt` file. Only the Archify JSON IR is stored, never the rendered artifact:
 * the diagram stays editable, and every surface draws it on demand.
 *
 * The source is rendered once before saving, so a schema mistake fails in the
 * dialog instead of becoming a card that cannot draw.
 */
export async function createCustomDiagramAction(
  formData: FormData,
): Promise<CreateCustomDiagramResult> {
  const user = await requireUser();

  const fileEntry = formData.get("file");
  const file =
    fileEntry && typeof fileEntry !== "string" && fileEntry.size > 0 ? fileEntry : null;

  if (file) {
    if (!isDiagramFile(file.name)) {
      return { ok: false, error: "Upload a .json, .archify, .md or .txt file." };
    }
    if (file.size > CUSTOM_DIAGRAM_FILE_BYTES_MAX) {
      return {
        ok: false,
        error: `Keep the file under ${Math.round(CUSTOM_DIAGRAM_FILE_BYTES_MAX / 1024)} KB.`,
      };
    }
  }

  let source = cleanArchifySource(formText(formData, "source"));

  if (file) {
    try {
      source = cleanArchifySource(await file.text());
    } catch {
      return { ok: false, error: "That file could not be read. Please try another one." };
    }
  }

  if (!source) {
    return { ok: false, error: "Paste Archify JSON or upload a diagram file." };
  }
  if (source.length > CUSTOM_DIAGRAM_SOURCE_MAX) {
    return {
      ok: false,
      error: `Keep the diagram under ${CUSTOM_DIAGRAM_SOURCE_MAX.toLocaleString()} characters.`,
    };
  }
  if (hasBinaryControls(source)) {
    return { ok: false, error: "That file doesn't look like plain Archify JSON." };
  }

  const normalized = normalizeArchifySource(source);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  source = normalized.source;

  const rendered = await renderArchify(source);
  if (!rendered.ok) return { ok: false, error: rendered.error };

  const fileStem = file?.name.replace(/\.[^.]+$/, "") ?? "";
  const name = (formText(formData, "name") || fileStem)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_DIAGRAM_NAME_MAX);

  if (!name) {
    return { ok: false, error: "Give the diagram a name." };
  }

  const description =
    formText(formData, "description")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CUSTOM_DIAGRAM_DESCRIPTION_MAX) || FALLBACK_DESCRIPTION;

  try {
    const profile = await ensureUserRecord(user);

    if ((await countCustomDiagramsForUser(profile.id)) >= CUSTOM_DIAGRAMS_MAX) {
      return {
        ok: false,
        error: `This workspace already has ${CUSTOM_DIAGRAMS_MAX} diagrams. Remove one first.`,
      };
    }
    if (await customDiagramNameExists(profile.id, name)) {
      return { ok: false, error: `A diagram named "${name}" already exists.` };
    }

    const diagram = await createCustomDiagramForUser(profile.id, {
      name,
      description,
      source,
      sourceName: file?.name ? file.name.slice(0, 180) : null,
    });

    return { ok: true, diagram };
  } catch (error) {
    console.error("[diagrams] create failed", error);
    return { ok: false, error: "We couldn't save that diagram. Please try again." };
  }
}

/**
 * Renames, re-describes or replaces the source of a saved diagram. Owner-scoped
 * through the lib call, and a rename is only checked against the *other*
 * diagrams, so saving a card without touching its name always works.
 */
export async function updateCustomDiagramAction(
  formData: FormData,
): Promise<UpdateCustomDiagramResult> {
  const user = await requireUser();

  const diagramId = Number(formText(formData, "id"));
  if (!Number.isInteger(diagramId) || diagramId <= 0) {
    return { ok: false, error: "That diagram could not be found." };
  }

  const fileEntry = formData.get("file");
  const file =
    fileEntry && typeof fileEntry !== "string" && fileEntry.size > 0 ? fileEntry : null;

  if (file) {
    if (!isDiagramFile(file.name)) {
      return { ok: false, error: "Upload a .json, .archify, .md or .txt file." };
    }
    if (file.size > CUSTOM_DIAGRAM_FILE_BYTES_MAX) {
      return {
        ok: false,
        error: `Keep the file under ${Math.round(CUSTOM_DIAGRAM_FILE_BYTES_MAX / 1024)} KB.`,
      };
    }
  }

  let source = cleanArchifySource(formText(formData, "source"));

  if (file) {
    try {
      source = cleanArchifySource(await file.text());
    } catch {
      return { ok: false, error: "That file could not be read. Please try another one." };
    }
  }

  if (!source) {
    return { ok: false, error: "Paste Archify JSON or upload a diagram file." };
  }
  if (source.length > CUSTOM_DIAGRAM_SOURCE_MAX) {
    return {
      ok: false,
      error: `Keep the diagram under ${CUSTOM_DIAGRAM_SOURCE_MAX.toLocaleString()} characters.`,
    };
  }
  if (hasBinaryControls(source)) {
    return { ok: false, error: "That file doesn't look like plain Archify JSON." };
  }

  const normalized = normalizeArchifySource(source);
  if (!normalized.ok) return { ok: false, error: normalized.error };
  source = normalized.source;

  const rendered = await renderArchify(source);
  if (!rendered.ok) return { ok: false, error: rendered.error };

  const name = formText(formData, "name")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_DIAGRAM_NAME_MAX);

  if (!name) return { ok: false, error: "Give the diagram a name." };

  const description =
    formText(formData, "description")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CUSTOM_DIAGRAM_DESCRIPTION_MAX) || FALLBACK_DESCRIPTION;

  try {
    const profile = await ensureUserRecord(user);
    const existing = await getCustomDiagramForUser(profile.id, diagramId);
    if (!existing) return { ok: false, error: "That diagram could not be found." };

    if (
      name.toLowerCase() !== existing.name.toLowerCase() &&
      (await customDiagramNameExists(profile.id, name))
    ) {
      return { ok: false, error: `A diagram named "${name}" already exists.` };
    }

    const diagram = await updateCustomDiagramForUser(profile.id, diagramId, {
      name,
      description,
      source,
      ...(file ? { sourceName: file.name.slice(0, 180) } : {}),
    });

    if (!diagram) return { ok: false, error: "That diagram could not be found." };
    return { ok: true, diagram };
  } catch (error) {
    console.error("[diagrams] update failed", error);
    return { ok: false, error: "We couldn't save that diagram. Please try again." };
  }
}

export type CreateDiagramWidgetResult =
  | { ok: true; title: string }
  | { ok: false; error: string };

/**
 * Puts a saved diagram on the workspace's active dashboard as a widget. Every
 * widget belongs to an agent, so this uses the oldest one; with no agent there
 * is nothing to own the card and the button explains that instead.
 */
export async function createDiagramWidgetAction(input: {
  id: number;
}): Promise<CreateDiagramWidgetResult> {
  const user = await requireUser();

  const diagramId = Number(input.id);
  if (!Number.isInteger(diagramId) || diagramId <= 0) {
    return { ok: false, error: "That diagram could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);

    // A diagram widget is still a widget, so the plan's cap applies here too.
    const limit = await widgetLimitError(profile.id);
    if (limit) return { ok: false, error: limit };

    const dashboard = await getDashboardForUser(user.id);
    if (!dashboard) return { ok: false, error: "Create a dashboard first." };

    const diagram = await getCustomDiagramForUser(profile.id, diagramId);
    if (!diagram) return { ok: false, error: "That diagram could not be found." };

    const agents = await listAgentsForUser(profile.id);
    const agent = agents[0];
    if (!agent) {
      return { ok: false, error: "Create an AI agent first — every widget belongs to one." };
    }

    const widget = await createDiagramWidgetForUser({
      profileId: profile.id,
      dashboardId: dashboard.id,
      agentId: agent.id,
      title: diagram.name,
      diagramName: diagram.name,
      source: diagram.source,
      footnote: diagram.description,
    });

    if (!widget) return { ok: false, error: "We couldn't add that widget." };
    return { ok: true, title: widget.title };
  } catch (error) {
    console.error("[diagrams] widget create failed", error);
    return { ok: false, error: "We couldn't add that widget. Please try again." };
  }
}

/** One focused model call for a first Archify draft; nothing is written yet. */
export async function draftDiagramAction(input: {
  agentId: number;
  prompt: string;
}): Promise<DiagramDraftResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    return await draftDiagramForUser(
      profile.id,
      Number(input.agentId),
      typeof input.prompt === "string" ? input.prompt : "",
    );
  } catch (error) {
    console.error("[diagrams] draft action failed", error);
    return { ok: false, error: "We couldn't draft that diagram. Please try again." };
  }
}

export async function deleteCustomDiagramAction(input: {
  id: number;
}): Promise<DeleteCustomDiagramResult> {
  const user = await requireUser();

  const diagramId = Number(input.id);
  if (!Number.isInteger(diagramId) || diagramId <= 0) {
    return { ok: false, error: "That diagram could not be found." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const deleted = await deleteCustomDiagramForUser(profile.id, diagramId);
    if (!deleted) return { ok: false, error: "That diagram could not be found." };
    return { ok: true };
  } catch (error) {
    console.error("[diagrams] delete failed", error);
    return { ok: false, error: "We couldn't remove that diagram. Please try again." };
  }
}

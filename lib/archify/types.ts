/**
 * Client-safe Archify helpers.
 *
 * A workspace diagram is Archify's typed JSON IR, not an image and not Mermaid:
 * the JSON names a `diagram_type`, the renderer turns it into a standalone
 * interactive HTML artifact on the server, and the real source stays editable.
 *
 * This module must stay free of Node imports so the library UI can use the same
 * type catalog and validation the renderer does.
 */

export type ArchifyDiagramType =
  | "architecture"
  | "workflow"
  | "sequence"
  | "dataflow"
  | "lifecycle"
  | "erd"
  | "class"
  | "tree"
  | "timeline"
  | "waterfall";

export const ARCHIFY_DIAGRAM_TYPES: {
  id: ArchifyDiagramType;
  label: string;
  hint: string;
}[] = [
  { id: "architecture", label: "Architecture", hint: "System map: services, stores and the links between them" },
  { id: "workflow", label: "Workflow", hint: "Process with lanes, phases and ordered steps" },
  { id: "sequence", label: "Sequence", hint: "Request / response exchange between participants" },
  { id: "dataflow", label: "Data flow", hint: "Stages, producers and consumers of data" },
  { id: "lifecycle", label: "Lifecycle", hint: "States and the transitions between them" },
  { id: "erd", label: "Entity relationship", hint: "Tables, columns and relationships" },
  { id: "class", label: "Class", hint: "Classes, fields and inheritance" },
  { id: "tree", label: "Tree", hint: "Hierarchy: file trees, categories, org charts" },
  { id: "timeline", label: "Timeline", hint: "Chronology of events" },
  { id: "waterfall", label: "Waterfall", hint: "Timing of requests and spans" },
];

export const ARCHIFY_DIAGRAM_TYPE_IDS = ARCHIFY_DIAGRAM_TYPES.map((entry) => entry.id);

const TYPE_SET = new Set<string>(ARCHIFY_DIAGRAM_TYPE_IDS);

/** Stored IR is text; 60k leaves room for a real architecture map. */
export const ARCHIFY_SOURCE_MAX = 60_000;

export type ArchifyParseResult =
  | { ok: true; type: ArchifyDiagramType; title: string; json: Record<string, unknown> }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** True when the text is Archify JSON rather than a legacy Mermaid diagram. */
export function isArchifySource(source: string): boolean {
  return source.trimStart().startsWith("{");
}

/**
 * Removes one surrounding fence or the prose around a JSON object, so pasting
 * an agent reply or a `.json` file body just works. It never rewrites the JSON
 * itself; `normalizeArchifySource` does that.
 */
export function cleanArchifySource(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";

  const fenced = normalized.match(/```(?:archify|json)[^\n]*\n([\s\S]*?)```/i);
  let body = fenced?.[1]?.trim() ?? normalized;

  // A reply often wraps the block in a sentence; keep only the object.
  if (!body.startsWith("{")) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) body = body.slice(start, end + 1);
  }

  return body.trim();
}

/** Parses and identifies an Archify IR without changing it. */
export function parseArchifySource(source: string): ArchifyParseResult {
  const body = cleanArchifySource(source);
  if (!body) return { ok: false, error: "Paste Archify JSON first." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: "That isn't valid JSON. Check the braces and commas." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "Archify expects a JSON object at the top level." };
  }

  const type = parsed.diagram_type;
  if (typeof type !== "string" || !TYPE_SET.has(type)) {
    return {
      ok: false,
      error: `Set "diagram_type" to one of: ${ARCHIFY_DIAGRAM_TYPE_IDS.join(", ")}.`,
    };
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : {};
  const title = typeof meta.title === "string" ? meta.title : "";

  return { ok: true, type: type as ArchifyDiagramType, title, json: parsed };
}

/**
 * Produces the text the renderer accepts. Archify requires `meta.title` and
 * `meta.output`; we fill sensible defaults instead of making the owner (or the
 * model) author bookkeeping fields that the app decides anyway.
 */
export function normalizeArchifySource(
  source: string,
): { ok: true; source: string; type: ArchifyDiagramType } | { ok: false; error: string } {
  const parsed = parseArchifySource(source);
  if (!parsed.ok) return parsed;

  const json = { ...parsed.json };
  const meta = isRecord(json.meta) ? { ...json.meta } : {};
  if (typeof meta.title !== "string" || !meta.title.trim()) meta.title = "Diagram";
  if (typeof meta.output !== "string" || !meta.output.trim()) meta.output = "diagram.html";
  json.meta = meta;

  return {
    ok: true,
    source: JSON.stringify(json, null, 2),
    type: parsed.type,
  };
}

/** The stored type, or null for a legacy Mermaid row. */
export function archifyTypeOf(source: string): ArchifyDiagramType | null {
  if (!isArchifySource(source)) return null;
  const parsed = parseArchifySource(source);
  return parsed.ok ? parsed.type : null;
}

/** Human label for a stored diagram, e.g. "Architecture" or "Legacy Mermaid". */
export function diagramTypeLabel(source: string): string {
  const type = archifyTypeOf(source);
  if (!type) return "Legacy Mermaid";
  return ARCHIFY_DIAGRAM_TYPES.find((entry) => entry.id === type)?.label ?? "Archify";
}

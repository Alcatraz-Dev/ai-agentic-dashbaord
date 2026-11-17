/**
 * Client-safe diagram source extraction, shared by the reply actions and the
 * Add dialogs.
 *
 * New diagrams are Archify JSON IR. A reply only offers "Save as diagram" when
 * it actually contains an Archify fence with a recognised diagram_type, so the
 * prose around it is never stored. The Mermaid extractor remains for legacy
 * saved rows and old transcripts.
 */

import { parseArchifySource } from "@/lib/archify/types";

const ARCHIFY_FENCE = /```archify(?::[\w-]+)?[^\n]*\n([\s\S]*?)```/i;
const MERMAID_FENCE = /```(?:mermaid|mmd)[^\n]*\n([\s\S]*?)```/i;

/** The first valid ```archify block in the text, trimmed; "" when there is none. */
export function extractArchify(text: string): string {
  const match = text.match(ARCHIFY_FENCE);
  const body = match?.[1]?.trim() ?? "";
  if (!body) return "";
  return parseArchifySource(body).ok ? body : "";
}

/** Legacy Mermaid extraction; new diagrams never use this path. */
export function extractMermaid(text: string): string {
  const match = text.match(MERMAID_FENCE);
  return match?.[1] ? match[1].trim() : "";
}

/**
 * Client-safe shapes and limits for workspace diagrams.
 *
 * A diagram is Archify's typed JSON IR, not an image: it is stored once, drawn
 * by Archify's renderer into a self-contained HTML artifact, and loaded by an
 * agent through `use_diagram` so it can redraw or extend the real structure
 * instead of guessing. Very old rows still hold Mermaid source and keep
 * rendering through the legacy viewer.
 */

import { ARCHIFY_SOURCE_MAX } from "@/lib/archify/types";

export type CustomDiagramSummary = {
  id: number;
  name: string;
  description: string;
  /** Archify JSON IR (or legacy Mermaid), exactly as the owner saved it. */
  source: string;
  /** Original uploaded filename, or null for an inline diagram. */
  sourceName: string | null;
  /** ISO timestamp; RSC payloads stay plain strings. */
  createdAt: string;
};

export const CUSTOM_DIAGRAM_NAME_MAX = 80;
export const CUSTOM_DIAGRAM_DESCRIPTION_MAX = 280;
export const CUSTOM_DIAGRAM_SOURCE_MAX = ARCHIFY_SOURCE_MAX;
export const CUSTOM_DIAGRAMS_MAX = 50;
export const CUSTOM_DIAGRAM_FILE_BYTES_MAX = ARCHIFY_SOURCE_MAX;

export const CUSTOM_DIAGRAM_FILE_EXTENSIONS = [".json", ".archify", ".md", ".markdown", ".txt"] as const;

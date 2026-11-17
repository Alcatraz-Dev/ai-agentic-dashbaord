/**
 * Turns the composer's attachment chips into text the agent actually receives.
 *
 * The chips alone were only a label: the files never left the browser. This
 * module reads the text files behind them (a folder contributes its text files,
 * capped) and formats one block that rides along with the message. Anything
 * binary is named but not sent, and every cap is explicit in the block so the
 * agent — and the owner reading the transcript — can see what was left out.
 */

const TEXT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".mdx",
  ".txt",
  ".text",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".env",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".php",
  ".sh",
  ".bash",
  ".sql",
  ".graphql",
  ".archify",
  ".mermaid",
  ".diff",
  ".patch",
] as const;

/** Per file, per folder read and overall, so a big folder cannot flood a turn. */
export const ATTACHMENT_FILE_CHARS = 12_000;
export const ATTACHMENT_TOTAL_CHARS = 30_000;
export const ATTACHMENT_FOLDER_FILES = 8;

export type ComposerAttachmentGroup = {
  name: string;
  kind: "file" | "folder";
  files: File[];
};

function isTextFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension))) return true;
  return file.type.startsWith("text/") || file.type === "application/json";
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 24)).trimEnd()}\n… (truncated)`;
}

/** One block of attachment text, or "" when nothing usable was attached. */
export async function attachmentContextFor(
  groups: ComposerAttachmentGroup[],
): Promise<string> {
  if (groups.length === 0) return "";

  let budget = ATTACHMENT_TOTAL_CHARS;
  const blocks: string[] = [];
  const skipped: string[] = [];

  for (const group of groups) {
    const files =
      group.kind === "folder" ? group.files.slice(0, ATTACHMENT_FOLDER_FILES) : group.files;
    const header =
      group.kind === "folder"
        ? files.length < group.files.length
          ? `Folder "${group.name}" — first ${files.length} of ${group.files.length} files.`
          : `Folder "${group.name}" — ${files.length} file${files.length === 1 ? "" : "s"}.`
        : `File "${group.name}".`;

    const parts: string[] = [header];

    for (const file of files) {
      if (budget <= 0) break;

      const label = file.webkitRelativePath || file.name;

      if (!isTextFile(file)) {
        skipped.push(label);
        continue;
      }

      try {
        const text = await file.text();
        const allowed = Math.min(ATTACHMENT_FILE_CHARS, budget);
        const clipped = clip(text.replace(/\r\n/g, "\n"), allowed);
        parts.push(`--- ${label} ---\n${clipped}`);
        budget -= Math.min(clipped.length, allowed);
      } catch {
        skipped.push(label);
      }
    }

    blocks.push(parts.join("\n\n"));
  }

  if (skipped.length > 0) {
    blocks.push(`Not included (binary or unreadable): ${skipped.join(", ")}.`);
  }

  const body = blocks.join("\n\n").slice(0, ATTACHMENT_TOTAL_CHARS).trim();
  if (!body) return "";

  return `Attached from the composer:\n\n${body}`;
}

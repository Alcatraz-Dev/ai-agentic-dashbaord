/**
 * A patch the agent proposes for an attached project.
 *
 * Client-safe: the review card renders the diff from these two strings, and the
 * server re-hashes `before` to make sure the file has not changed since the
 * proposal was made. Nothing here writes.
 */

/** How much text one proposal may carry. */
export const PROJECT_PATCH_MAX_CHARS = 300_000;

export type ProjectPatchProposal = {
  id: string;
  /** The attached project the patch belongs to (this app's repo is read-only). */
  projectId: number;
  projectName: string;
  /** Path inside the project, forward slashes. */
  path: string;
  /** One line from the model: what this changes and why. */
  summary: string;
  before: string;
  after: string;
  /** SHA-256 of `before`; the server refuses the write when it no longer matches. */
  beforeHash: string;
  additions: number;
  removals: number;
  newFile: boolean;
};

export type ProjectPatchLine = { type: "same" | "add" | "remove"; text: string };

/** Three lines of context around each hunk, with a gap marker between hunks. */
function condense(lines: ProjectPatchLine[], context = 3, maxLines = 400): ProjectPatchLine[] {
  const keep = new Set<number>();

  lines.forEach((line, index) => {
    if (line.type === "same") return;
    for (let offset = index - context; offset <= index + context; offset += 1) {
      if (offset >= 0 && offset < lines.length) keep.add(offset);
    }
  });

  const out: ProjectPatchLine[] = [];
  let gap = false;

  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (gap) {
        out.push({ type: "same", text: "…" });
        gap = false;
      }
      out.push(line);
    } else if (!gap && out.length > 0) {
      gap = true;
    }
  });

  if (out.length > maxLines) {
    return [...out.slice(0, maxLines), { type: "same", text: "… diff truncated" }];
  }
  return out;
}

/**
 * A line diff with no dependency: trim the common head and tail, run a small
 * LCS on what is left (the middle of two real files is short), then keep only
 * the hunks. A pair too large for the table falls back to the whole before as
 * removed and the whole after as added, which is still honest.
 */
export function buildLineDiff(
  before: string,
  after: string,
): { lines: ProjectPatchLine[]; truncated: boolean } {
  const a = before.length > 0 ? before.replace(/\n$/, "").split("\n") : [];
  const b = after.length > 0 ? after.replace(/\n$/, "").split("\n") : [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const prefix = a.slice(0, start);

  if (midA.length * midB.length > 250_000) {
    const lines: ProjectPatchLine[] = [
      ...prefix.map((text) => ({ type: "same" as const, text })),
      ...midA.map((text) => ({ type: "remove" as const, text })),
      ...midB.map((text) => ({ type: "add" as const, text })),
    ];
    return { lines: condense(lines), truncated: true };
  }

  const table: number[][] = Array.from({ length: midA.length + 1 }, () =>
    new Array<number>(midB.length + 1).fill(0),
  );

  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      const row = table[i]!;
      row[j] =
        midA[i] === midB[j]
          ? (table[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(table[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const lines: ProjectPatchLine[] = prefix.map((text) => ({ type: "same", text }));
  let i = 0;
  let j = 0;

  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      lines.push({ type: "same", text: midA[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      lines.push({ type: "remove", text: midA[i] ?? "" });
      i += 1;
    } else {
      lines.push({ type: "add", text: midB[j] ?? "" });
      j += 1;
    }
  }

  while (i < midA.length) {
    lines.push({ type: "remove", text: midA[i] ?? "" });
    i += 1;
  }
  while (j < midB.length) {
    lines.push({ type: "add", text: midB[j] ?? "" });
    j += 1;
  }

  lines.push(...a.slice(endA).map((text) => ({ type: "same" as const, text })));

  return { lines: condense(lines), truncated: false };
}

/** How many lines the patch adds and removes, for the card's header. */
export function patchStats(before: string, after: string): { additions: number; removals: number } {
  const { lines } = buildLineDiff(before, after);
  return {
    additions: lines.filter((line) => line.type === "add").length,
    removals: lines.filter((line) => line.type === "remove").length,
  };
}

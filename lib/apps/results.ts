/**
 * Result cards for app actions.
 *
 * Composio returns arbitrary JSON per action, and the chat has to show it
 * without trusting it as markup. These builders turn a response into one of
 * four plain-data shapes the React components render as text: a list, a set of
 * fields, a table or a block of text. Nothing here emits HTML, and every string
 * is stripped of tags and bounded before it reaches the DOM.
 */

export type AgentResultCard =
  | {
      kind: "list";
      title: string;
      items: { title: string; subtitle?: string; meta?: string }[];
    }
  | { kind: "fields"; title: string; fields: { label: string; value: string }[] }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "text"; title: string; text: string };

const MAX_ITEMS = 20;
const MAX_FIELDS = 14;
const MAX_COLUMNS = 6;
const MAX_CELL = 140;
const MAX_TEXT = 4000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Tags out, entities decoded, whitespace collapsed. Never trusted as HTML. */
export function plainText(value: unknown): string {
  if (value === null || value === undefined) return "";

  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : safeJson(value);

  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function clip(value: unknown, max = MAX_CELL): string {
  const text = plainText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** Column list from a set of records, capped and ordered by first appearance. */
function columnsOf(records: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!scalar(value)) continue;
      if (!columns.includes(key)) columns.push(key);
      if (columns.length >= MAX_COLUMNS) return columns;
    }
  }
  return columns;
}

function tableFrom(records: Record<string, unknown>[], title: string): AgentResultCard {
  const columns = columnsOf(records);
  return {
    kind: "table",
    title,
    columns: columns.map(humanizeKey),
    rows: records.slice(0, MAX_ITEMS).map((record) => columns.map((key) => clip(record[key]))),
  };
}

/** Arrays of records that name a thing read better as a list than a table. */
function listFrom(records: Record<string, unknown>[], title: string): AgentResultCard | null {
  const items: { title: string; subtitle?: string; meta?: string }[] = [];

  for (const record of records.slice(0, MAX_ITEMS)) {
    const keys = Object.keys(record);
    const titleKey =
      ["title", "name", "subject", "summary", "label", "id"].find(
        (key) => typeof record[key] === "string" && (record[key] as string).trim(),
      ) ??
      // Records with no named title (a chat message, a plain row) still name
      // themselves with their first usable string.
      keys.find((key) => typeof record[key] === "string" && (record[key] as string).trim());
    if (!titleKey) return null;

    const subtitleKey = ["description", "snippet", "body", "content", "text"].find(
      (key) => key !== titleKey && typeof record[key] === "string" && (record[key] as string).trim(),
    );
    const metaKey = ["date", "created_at", "updated_at", "from", "author", "status", "type"].find(
      (key) => {
        if (key === titleKey || key === subtitleKey) return false;
        const value = record[key];
        return scalar(value) && plainText(value).length > 0;
      },
    );
    if (!subtitleKey && keys.length > 3) return null;

    items.push({
      title: clip(record[titleKey] as string, 120),
      subtitle: subtitleKey ? clip(record[subtitleKey], 220) : undefined,
      meta: metaKey ? clip(record[metaKey], 60) : undefined,
    });
  }

  return { kind: "list", title, items };
}

function fieldsFrom(record: Record<string, unknown>, title: string): AgentResultCard {
  const fields: { label: string; value: string }[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (fields.length >= MAX_FIELDS) break;
    if (scalar(value)) {
      const text = clip(value, 300);
      if (text) fields.push({ label: humanizeKey(key), value: text });
      continue;
    }
    if (Array.isArray(value) && value.every(scalar)) {
      const text = clip(value.map((entry) => plainText(entry)).filter(Boolean).join(", "), 300);
      if (text) fields.push({ label: humanizeKey(key), value: text });
    }
  }

  if (fields.length > 0) return { kind: "fields", title, fields };

  return { kind: "text", title, text: clip(safeJson(record), MAX_TEXT) || "No result." };
}

/**
 * The one entry point: response data in, a safe card out. `title` is what the
 * action did ("Gmail · fetch emails"), not markup.
 */
export function buildResultCard(title: string, data: unknown): AgentResultCard {
  const cleanTitle = plainText(title) || "App result";

  if (typeof data === "string") {
    const text = clip(data, MAX_TEXT);
    return text ? { kind: "text", title: cleanTitle, text } : { kind: "text", title: cleanTitle, text: "No result." };
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { kind: "text", title: cleanTitle, text: "No results." };

    if (data.every(scalar)) {
      return {
        kind: "list",
        title: cleanTitle,
        items: data.slice(0, MAX_ITEMS).map((entry) => ({ title: clip(entry, 200) })),
      };
    }

    const records = data.filter(isRecord);
    if (records.length === data.length) {
      const listed = listFrom(records, cleanTitle);
      if (listed) return listed;
      const columns = columnsOf(records);
      if (columns.length >= 2) return tableFrom(records, cleanTitle);
      return {
        kind: "list",
        title: cleanTitle,
        items: records.slice(0, MAX_ITEMS).map((record, index) => ({
          title: actorTitle(record) || `Result ${index + 1}`,
        })),
      };
    }

    return { kind: "text", title: cleanTitle, text: clip(safeJson(data), MAX_TEXT) };
  }

  if (isRecord(data)) {
    // Envelopes like `{ messages: [...] }` should show the collection, not
    // eight fields whose values are all "20 items".
    for (const key of ["items", "results", "data", "rows", "messages", "files", "events", "records"]) {
      const value = data[key];
      if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) {
        const listed = listFrom(value, cleanTitle);
        if (listed) return listed;
        if (columnsOf(value).length >= 2) return tableFrom(value, cleanTitle);
      }
    }

    const textKey = ["text", "content", "body", "answer", "summary"].find(
      (key) => typeof data[key] === "string" && (data[key] as string).trim().length > 40,
    );
    if (textKey && Object.keys(data).length <= 3) {
      return { kind: "text", title: cleanTitle, text: clip(data[textKey], MAX_TEXT) };
    }

    return fieldsFrom(data, cleanTitle);
  }

  return { kind: "text", title: cleanTitle, text: clip(data, MAX_TEXT) || "No result." };
}

function actorTitle(record: Record<string, unknown>): string | null {
  for (const key of ["title", "name", "subject", "summary", "label", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return clip(value, 120);
    if (typeof value === "number") return String(value);
  }
  return null;
}

/** What the approval card shows above the buttons: label/value pairs. */
export function approvalPreview(args: Record<string, unknown>): { label: string; value: string }[] {
  const preview: { label: string; value: string }[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (preview.length >= 8) break;
    if (scalar(value)) {
      const text = clip(value, 220);
      if (text) preview.push({ label: humanizeKey(key), value: text });
      continue;
    }
    if (Array.isArray(value) && value.every(scalar)) {
      const text = clip(value.map((entry) => plainText(entry)).join(", "), 220);
      if (text) preview.push({ label: humanizeKey(key), value: text });
      continue;
    }
    const text = clip(safeJson(value), 220);
    if (text) preview.push({ label: humanizeKey(key), value: text });
  }

  return preview;
}

import "server-only";

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ARCHIFY_SOURCE_MAX,
  normalizeArchifySource,
  type ArchifyDiagramType,
} from "@/lib/archify/types";

/**
 * Server-side Archify rendering.
 *
 * Archify's renderers are Node CLIs that validate a typed JSON IR and write one
 * self-contained HTML artifact. They are vendored under `lib/archify/vendor`
 * and run in a child process: the renderer calls `process.exit()` and owns a
 * large module graph, so importing it into the Next server would be fragile.
 *
 * The artifact is never stored in Postgres (it is ~800 KB of inline viewer);
 * only the JSON IR is stored, and rendered HTML is kept in a small LRU cache.
 */

const VENDOR_ROOT = path.join(process.cwd(), "lib", "archify", "vendor");
const RENDER_TIMEOUT_MS = 20_000;
const CACHE_LIMIT = 10;

const cache = new Map<string, string>();

export type ArchifyRenderResult =
  | { ok: true; html: string; type: ArchifyDiagramType; cached: boolean }
  | { ok: false; error: string };

/**
 * The artifact is a full page; this bridge reports its height so the iframe can
 * grow with the diagram instead of adding a second scrollbar.
 */
const RESIZE_BRIDGE = `<script>
(function () {
  function report() {
    try {
      var doc = document.documentElement;
      var body = document.body;
      var height = Math.max(
        doc ? doc.scrollHeight : 0,
        body ? body.scrollHeight : 0,
        doc ? doc.offsetHeight : 0
      );
      if (height > 0) parent.postMessage({ type: "archify:height", height: height }, "*");
    } catch (_) {}
  }
  window.addEventListener("load", report);
  document.addEventListener("DOMContentLoaded", report);
  if (typeof ResizeObserver === "function" && document.documentElement) {
    new ResizeObserver(report).observe(document.documentElement);
  }
  report();
  setTimeout(report, 400);
  setTimeout(report, 1500);
})();
</script>`;

function scriptFor(type: ArchifyDiagramType): string {
  return path.join(VENDOR_ROOT, "renderers", type, `render-${type}.mjs`);
}

function cacheGet(key: string): string | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, html: string) {
  cache.set(key, html);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function injectResizeBridge(html: string): string {
  if (html.includes('"archify:height"')) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${RESIZE_BRIDGE}\n</body>`);
  return `${html}\n${RESIZE_BRIDGE}`;
}

function cleanMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 400);
}

/** Turns the renderer's JSON diagnostics into one sentence the owner can act on. */
function diagnosticFrom(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "Archify couldn't draw this diagram.";

  const candidates = [trimmed, ...trimmed.split("\n").reverse()];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        error?: unknown;
        diagnostics?: { message?: unknown; supportedFixes?: unknown }[];
      };
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          return cleanMessage(parsed.error);
        }
        const first = parsed.diagnostics?.[0];
        if (first && typeof first.message === "string") {
          const fix = Array.isArray(first.supportedFixes)
            ? first.supportedFixes.find((entry) => typeof entry === "string")
            : null;
          return cleanMessage(fix ? `${first.message} — ${fix}` : first.message);
        }
      }
    } catch {
      // Warnings can precede the JSON receipt; try the next line.
    }
  }

  return cleanMessage(trimmed);
}

function runRenderer(script: string, inputPath: string, outputPath: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, inputPath, outputPath], {
      cwd: VENDOR_ROOT,
      env: {
        ...process.env,
        ARCHIFY_DIAGNOSTIC_FORMAT: "json",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ ok: false, error: "Archify took too long to draw this diagram." });
    }, RENDER_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer) => {
      // The receipt is small; the cap only guards a runaway renderer.
      if (stderr.length < 64_000) stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error("[archify] could not start the renderer", error);
      resolve({ ok: false, error: "Archify's renderer could not start." });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: diagnosticFrom(stderr) });
    });
  });
}

/** Renders one IR to a standalone HTML artifact, with a small immutable cache. */
export async function renderArchify(source: string): Promise<ArchifyRenderResult> {
  if (typeof source !== "string" || !source.trim()) {
    return { ok: false, error: "Paste Archify JSON first." };
  }
  if (source.length > ARCHIFY_SOURCE_MAX) {
    return {
      ok: false,
      error: `Keep the diagram under ${ARCHIFY_SOURCE_MAX.toLocaleString()} characters.`,
    };
  }

  const normalized = normalizeArchifySource(source);
  if (!normalized.ok) return normalized;

  const key = createHash("sha256")
    .update(`${normalized.type}\n${normalized.source}`)
    .digest("hex");

  const hit = cacheGet(key);
  if (hit) return { ok: true, html: hit, type: normalized.type, cached: true };

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "archify-"));
  try {
    const inputPath = path.join(dir, "diagram.json");
    const outputPath = path.join(dir, "diagram.html");
    await fs.writeFile(inputPath, normalized.source, "utf8");

    const rendered = await runRenderer(scriptFor(normalized.type), inputPath, outputPath);
    if (!rendered.ok) return rendered;

    let html = "";
    try {
      html = await fs.readFile(outputPath, "utf8");
    } catch (error) {
      console.error("[archify] renderer produced no artifact", error);
      return { ok: false, error: "Archify finished without writing the diagram." };
    }

    if (!html.trim()) {
      return { ok: false, error: "Archify finished without writing the diagram." };
    }

    const artifact = injectResizeBridge(html);
    cacheSet(key, artifact);
    return { ok: true, html: artifact, type: normalized.type, cached: false };
  } catch (error) {
    console.error("[archify] render failed", error);
    return { ok: false, error: "Archify couldn't draw this diagram. Please try again." };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

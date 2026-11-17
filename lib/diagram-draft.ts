import "server-only";

import { Agent, OpenAIProvider, run, setTracingDisabled } from "@openai/agents";

import { getAgentForUser } from "@/lib/agents";
import { normalizeArchifySource } from "@/lib/archify/types";
import { renderArchify } from "@/lib/archify/render";
import { resolveAgentConnection } from "@/lib/agent-runtime/models";
import { readRunUsage } from "@/lib/agent-runtime/usage";
import { CUSTOM_DIAGRAM_SOURCE_MAX } from "@/lib/custom-diagram-types";
import { recordAgentUsage } from "@/lib/plan-usage";

/**
 * "Draft with an agent": one focused, read-only model call that returns Archify
 * JSON IR for the diagram library.
 *
 * It is deliberately not a chat turn — no tools, no app access, no writes — so a
 * first draft is cheap and cannot act on the workspace. The result lands in the
 * dialog's editor, where the owner reviews and saves it like any other diagram.
 *
 * A draft is validated the same way a saved one is: the JSON is normalized, then
 * Archify's own renderer draws it once. A schema or layout rejection is fed back
 * to the model for one repair pass, so the editor never receives IR that cannot
 * be drawn.
 */

setTracingDisabled(true);

const MAX_REQUEST_CHARS = 600;
const TIMEOUT_MS = 35_000;
const MAX_ATTEMPTS = 3;

const INSTRUCTIONS = `You draw exactly one Archify diagram as JSON IR.

Output format:
- Reply with one fenced \`\`\`archify block holding only the JSON object. No prose before or after it.
- Every object has "schema_version", "diagram_type", a "meta" object with "title", and the arrays its type requires.
- Do not add properties that are not in the skeleton for that type: Archify rejects unknown keys.
- Node ids must match ^[a-zA-Z][a-zA-Z0-9_-]*$.

Pick the diagram_type that fits the request:
- architecture: services, stores, infrastructure and the links between them.
- workflow: an ordered process, optionally split into lanes and columns 0-5.
- sequence: a request/response exchange over time.
- dataflow: data moving through stages.
- lifecycle: states and transitions.
- erd: database tables, columns and relationships.
- class: code types, fields, methods and inheritance.
- tree: containment hierarchy (files, categories, org chart).
- timeline: dated events on a clock.
- waterfall: request timings in milliseconds.

Verified skeletons (use the matching one as the shape; replace every id and label):

architecture
{"schema_version":1,"diagram_type":"architecture","meta":{"title":"Title"},"components":[{"id":"web","type":"frontend","label":"Web","pos":[40,40],"size":[120,60]},{"id":"api","type":"backend","label":"API","pos":[240,40],"size":[120,60]}],"connections":[{"from":"web","to":"api","label":"HTTPS"}]}
component type: frontend | backend | database | cloud | security | messagebus | external. Lay components out on a non-overlapping grid (x + 200, y + 120 steps).

workflow
{"schema_version":2,"diagram_type":"workflow","meta":{"title":"Title"},"lanes":[{"id":"a","label":"Team A"},{"id":"b","label":"Team B"}],"nodes":[{"id":"start","lane":"a","col":0,"type":"external","label":"Start"},{"id":"work","lane":"b","col":1,"type":"backend","label":"Work"},{"id":"done","lane":"b","col":2,"type":"backend","label":"Done"}],"edges":[{"from":"start","to":"work"},{"from":"work","to":"done"}]}
Columns are 0-5. Put at most one node per lane + column.

sequence
{"schema_version":1,"diagram_type":"sequence","meta":{"title":"Title"},"participants":[{"id":"c","type":"external","label":"Client"},{"id":"s","type":"backend","label":"API"}],"messages":[{"from":"c","to":"s","y":160,"label":"request"},{"from":"s","to":"c","y":220,"label":"response","variant":"return"}]}
Message y starts at 160 and each next message adds at least 60. variant: default | emphasis | security | dashed | return.

dataflow
{"schema_version":1,"diagram_type":"dataflow","meta":{"title":"Title"},"stages":[{"label":"Source"},{"label":"Store"}],"nodes":[{"id":"app","type":"frontend","label":"App","stage":0,"row":0},{"id":"db","type":"database","label":"DB","stage":1,"row":1}],"flows":[{"from":"app","to":"db","label":"writes"}]}
stage is the index of the stage it sits in; row is the row inside that stage (0-2).

lifecycle
{"schema_version":3,"diagram_type":"lifecycle","meta":{"title":"Title"},"mainPath":["new","active","done"],"states":[{"id":"new","type":"start","label":"New"},{"id":"active","type":"active","label":"Active"},{"id":"done","type":"success","label":"Done"}],"transitions":[{"from":"new","to":"active"},{"from":"active","to":"done"}]}
state type: start | active | waiting | decision | success | failure | neutral | external. mainPath lists the happy path in order.

erd
{"schema_version":1,"diagram_type":"erd","meta":{"title":"Title"},"layout":{"mode":"grid","gapX":72,"gapY":38},"entities":[{"id":"user","label":"user","row":0,"col":0,"attributes":[{"name":"id","type":"bigint","key":"pk"}]},{"id":"post","label":"post","row":0,"col":1,"attributes":[{"name":"id","type":"bigint","key":"pk"},{"name":"user_id","type":"bigint","key":"fk","references":"user.id"}]}],"relationships":[{"from":"user","to":"post","fromCardinality":"one","toCardinality":"many"}]}
Every entity needs row + col. An attribute with key "fk" also needs "references": "entity.column". Cardinality: one | many.

class
{"schema_version":1,"diagram_type":"class","meta":{"title":"Title"},"types":[{"id":"svc","label":"Service","kind":"class","row":0,"col":0,"attributes":[{"name":"repo","type":"Repo"}],"methods":[{"name":"run","returns":"void"}]},{"id":"repo","label":"Repo","kind":"interface","row":0,"col":1}],"relationships":[{"from":"svc","to":"repo","kind":"dependency"}]}
kind: class | abstract | interface | enum | record. Every type needs row + col. Relationship kind: dependency | association | inheritance | realization | composition | aggregation.

tree
{"schema_version":1,"diagram_type":"tree","meta":{"title":"Title"},"nodes":[{"id":"root","label":"Root"},{"id":"a","label":"A","parent":"root"},{"id":"b","label":"B","parent":"root"}]}
Exactly one node without a parent.

timeline
{"schema_version":1,"diagram_type":"timeline","meta":{"title":"Title","evidence":"illustrative"},"lanes":[{"id":"main","label":"Main"}],"events":[{"id":"e1","at":"2026-11-01T10:00:00Z","title":"Start","lane":"main"},{"id":"e2","at":"2026-11-01T10:10:00Z","title":"Done","lane":"main","kind":"recovery"}]}
meta.evidence is required: "observed" only when the request supplies real timestamps, otherwise "illustrative". kind: default | change | alert | action | recovery.

waterfall
{"schema_version":1,"diagram_type":"waterfall","meta":{"title":"Title","unit":"ms","evidence":"illustrative"},"spans":[{"id":"req","name":"GET /x","start":0,"end":300},{"id":"db","name":"Query","start":40,"duration":120,"parent":"req"}]}
Meta needs unit (us | ms | s) and evidence (measured only for real numbers, otherwise illustrative). A span has either end or duration, and a child's start is inside its parent.

Rules:
- Keep it to the request: no invented metrics, dates or endpoints.
- Stay at or below 24 nodes; labels short enough to read (one or two words plus an optional sublabel).
- If the request is ambiguous, draw the most conventional version for a software/product workflow instead of asking a question.
- Reply with the JSON only. Never use Mermaid syntax.`;

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:archify|json)?[^\n]*\n([\s\S]*?)```/i);
  let body = (fenced?.[1] ?? trimmed).trim();

  if (!body.startsWith("{")) {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) body = body.slice(start, end + 1);
  }

  return body.trim();
}

export type DiagramDraftResult = { ok: true; source: string } | { ok: false; error: string };

export async function draftDiagramForUser(
  profileId: number,
  agentId: number,
  request: string,
): Promise<DiagramDraftResult> {
  const clean = request.trim().slice(0, MAX_REQUEST_CHARS);
  if (!clean) return { ok: false, error: "Say what the diagram should show first." };
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return { ok: false, error: "Pick an agent to draft it." };
  }

  const agent = await getAgentForUser(profileId, agentId);
  if (!agent) return { ok: false, error: "That agent could not be found." };

  const connection = await resolveAgentConnection(agent.provider, profileId);
  if (!connection.apiKey) {
    return { ok: false, error: "That agent has no model connection yet." };
  }

  const startedAt = new Date();
  let inputTokens = 0;
  let outputTokens = 0;

  const provider = new OpenAIProvider({
    apiKey: connection.apiKey,
    baseURL: connection.baseURL ?? undefined,
    useResponses: connection.useResponses,
  });
  const model = await provider.getModel(connection.model ?? undefined);
  const drafter = new Agent({
    name: "Diagram drafter",
    instructions: INSTRUCTIONS,
    model,
  });

  const ask = async (prompt: string): Promise<string> => {
    const result = await run(drafter, prompt, {
      maxTurns: 2,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const usage = readRunUsage(result);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    return typeof result.finalOutput === "string" ? result.finalOutput : "";
  };

  try {
    let prompt = `Draw this diagram: ${clean}`;
    let lastError = "";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let text = "";
      try {
        text = await ask(prompt);
      } catch (error) {
        console.error("[diagrams] draft attempt failed", error);
        lastError = "The agent couldn't finish the draft.";
        continue;
      }

      const candidate = extractJson(text);
      if (!candidate) {
        lastError = "The agent returned no JSON.";
        prompt = [
          `Draw this diagram: ${clean}`,
          "Your previous reply had no JSON object. Reply with the fenced ```archify JSON IR only.",
        ].join("\n\n");
        continue;
      }

      const normalized = normalizeArchifySource(candidate);
      if (!normalized.ok) {
        lastError = normalized.error;
        prompt = [
          `Draw this diagram: ${clean}`,
          "Your previous reply was rejected before rendering:",
          normalized.error,
          "Previous JSON (may be truncated):",
          candidate.slice(0, 6_000),
          "Fix it and reply with the corrected ```archify JSON IR only.",
        ].join("\n\n");
        continue;
      }

      if (normalized.source.length > CUSTOM_DIAGRAM_SOURCE_MAX) {
        lastError = `That diagram was ${normalized.source.length.toLocaleString()} characters, over the ${CUSTOM_DIAGRAM_SOURCE_MAX.toLocaleString()} limit.`;
        prompt = [
          `Draw this diagram: ${clean}`,
          "Your previous JSON was too long to save. Use fewer nodes and shorter labels, and reply with the corrected ```archify JSON IR only.",
        ].join("\n\n");
        continue;
      }

      const source = normalized.source;
      const rendered = await renderArchify(source);
      if (!rendered.ok) {
        lastError = rendered.error;
        prompt = [
          `Draw this diagram: ${clean}`,
          "Archify's renderer rejected your previous JSON:",
          rendered.error,
          "Previous JSON (may be truncated):",
          source.slice(0, 6_000),
          "Fix it and reply with the corrected ```archify JSON IR only.",
        ].join("\n\n");
        continue;
      }

      return { ok: true, source };
    }

    return {
      ok: false,
      error: lastError
        ? `The agent couldn't produce a drawable diagram: ${lastError}`
        : "The agent couldn't draft that diagram. Try a shorter description.",
    };
  } finally {
    try {
      if (inputTokens + outputTokens > 0) {
        await recordAgentUsage({
          ownerId: profileId,
          model: connection.model ?? null,
          inputTokens,
          outputTokens,
          startedAt,
          endedAt: new Date(),
        });
      }
    } catch (error) {
      // Usage accounting must never fail a draft the owner is waiting for.
      console.error("[diagrams] could not record draft usage", error);
    }
  }
}

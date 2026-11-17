import "server-only";

import { randomUUID } from "node:crypto";

import {
  Agent,
  MaxTurnsExceededError,
  OpenAIProvider,
  run,
  setTracingDisabled,
  tool,
} from "@openai/agents";

import { calculate } from "@/lib/agent-runtime/tools/calculator";
import { readWebPage } from "@/lib/agent-runtime/tools/read-page";
import { webSearch } from "@/lib/agent-runtime/tools/web-search";
import { widgetEditParameters } from "@/lib/agent-runtime/tools/widgets";
import { resolveAgentConnection } from "@/lib/agent-runtime/models";
import { readRunUsage } from "@/lib/agent-runtime/usage";
import { resolveAgentToolIds } from "@/lib/agent-tool-options";
import { recordAgentUsage } from "@/lib/plan-usage";
import {
  normalizeWidgetEdit,
  WIDGET_DESIGNS,
  WIDGET_FORMS,
  WIDGET_ILLUSTRATION_LABELS,
  WIDGET_REFRESH_OPTIONS,
  describeWidgetRefresh,
  type WidgetEdit,
  type WidgetEditProposal,
} from "@/lib/widget-types";
import { getWidgetForUser, getWidgetRefreshTargetForUser } from "@/lib/widgets";

/**
 * The dashboard's "Edit with AI" run.
 *
 * It is a focused, read-only proposal: the model can inspect the widget and
 * optionally read sources, but its only write-like action is to hand back an
 * edit object. Nothing in the database changes until the owner clicks Apply.
 * Chat follows the same contract through `propose_widget_edit`.
 */

setTracingDisabled(true);

const MAX_TURNS = 6;
const TIMEOUT_MS = 60_000;
const MAX_REQUEST_CHARS = 800;

const READ_ONLY_TOOLS = {
  web_search: webSearch,
  read_webpage: readWebPage,
  calculate,
} as const;

function instructions(): string {
  const styles = WIDGET_DESIGNS.map(
    (design) => `- ${design.key}: ${design.name} — ${design.description}`,
  ).join("\n");
  const forms = WIDGET_FORMS.map(
    (form) => `- ${form.key}: ${form.name} — ${form.description}`,
  ).join("\n");
  const illustrations = Object.entries(WIDGET_ILLUSTRATION_LABELS)
    .map(([key, label]) => `${key} (${label})`)
    .join(", ");
  const schedules = WIDGET_REFRESH_OPTIONS.map(
    (minutes) => `${minutes} (${describeWidgetRefresh(minutes)})`,
  ).join(", ");

  return `You are editing one dashboard widget for its owner. The widget holds plain data only: metrics, a real series and list rows. Never propose markup, images or links.

Widget forms (only choose one the data supports; charts need at least three real points):
${forms}

Widget styles:
${styles}

Illustration keys: ${illustrations}
Refresh cadences (minutes): ${schedules}

Rules:
- Change only what the request needs. Leave every other field untouched.
- Never invent a number. If the request changes data and the current data or a read-only tool does not support a value, say what is missing instead of guessing.
- If data changes, send the complete new data object, not a fragment.
- You may use web_search, read_webpage and calculate when they genuinely help. Do not try to sign in, fill forms or change anything.
- Call propose_widget_edit exactly once with a one-sentence summary and the changed fields. Do not answer in prose.
- The owner must review and click Apply. You cannot change the widget yourself.`;
}

function prompt(widget: Awaited<ReturnType<typeof getWidgetForUser>>, request: string): string {
  return [
    "Current widget:",
    JSON.stringify(
      widget
        ? {
            id: widget.id,
            title: widget.title,
            icon: widget.icon,
            illustration: widget.illustration,
            design: widget.design,
            form: widget.form,
            data: widget.data,
            sourcePrompt: widget.sourcePrompt,
            refreshMinutes: widget.refreshMinutes,
          }
        : null,
    ),
    "",
    `Owner's request: ${request}`,
    "",
    "Propose the change for review.",
  ].join("\n");
}

export type WidgetEditRequestResult =
  | { ok: true; proposal: WidgetEditProposal }
  | { ok: false; error: string };

export async function proposeWidgetEditForUser(
  profileId: number,
  widgetId: number,
  request: string,
): Promise<WidgetEditRequestResult> {
  const cleanRequest = request.trim().slice(0, MAX_REQUEST_CHARS);
  if (!cleanRequest) return { ok: false, error: "Describe the change you want first." };

  const widget = await getWidgetForUser(profileId, widgetId);
  if (!widget) return { ok: false, error: "That widget could not be found." };

  const target = await getWidgetRefreshTargetForUser(profileId, widgetId);
  if (!target) return { ok: false, error: "That widget could not be found." };

  const connection = await resolveAgentConnection(target.provider, target.ownerId);
  if (!connection.apiKey) {
    return { ok: false, error: "This widget's agent has no model connection." };
  }

  const startedAt = new Date();
  let inputTokens = 0;
  let outputTokens = 0;
  const addUsage = (result: unknown) => {
    const usage = readRunUsage(result);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
  };

  let captured: WidgetEdit | null = null;

  const proposeTool = tool({
    name: "propose_widget_edit",
    description:
      "Propose the reviewed change. Call exactly once with a summary and the fields that change. This never writes the widget.",
    parameters: widgetEditParameters,
    execute: async (input) => {
      const edit = normalizeWidgetEdit(input, widget);
      if (!edit) {
        return "That proposal had no real change or invalid values. Compare with the current widget and propose at least one actual change.";
      }
      captured = edit;
      return "The review card is ready. Stop here; the owner decides whether to apply it.";
    },
  });

  const enabled = new Set(resolveAgentToolIds(target.enabledTools));
  const readTools = Object.entries(READ_ONLY_TOOLS)
    .filter(([id]) => enabled.has(id as keyof typeof READ_ONLY_TOOLS))
    .map(([, definition]) => definition);

  const provider = new OpenAIProvider({
    apiKey: connection.apiKey,
    baseURL: connection.baseURL ?? undefined,
    useResponses: connection.useResponses,
  });
  const model = await provider.getModel(connection.model ?? undefined);

  const agent = new Agent({
    name: "Widget editor",
    instructions: instructions(),
    model,
    tools: [...readTools, proposeTool],
  });

  try {
    const result = await run(agent, prompt(widget, cleanRequest), {
      maxTurns: MAX_TURNS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    addUsage(result);
  } catch (error) {
    if (error instanceof MaxTurnsExceededError) addUsage({ state: error.state });
    // A slow gateway can spend the turn limit on the same step that proposed
    // the edit; the proposal already exists, so keep it.
    if (!(error instanceof MaxTurnsExceededError) || !captured) {
      console.error("[widgets] edit proposal failed", error);
      if (!captured) {
        return {
          ok: false,
          error: "The agent couldn't prepare that change. Try rephrasing it.",
        };
      }
    }
  }

  try {
    if (inputTokens + outputTokens > 0) {
      await recordAgentUsage({
        ownerId: target.ownerId,
        model: connection.model ?? null,
        inputTokens,
        outputTokens,
        startedAt,
        endedAt: new Date(),
        activity: "widget_edit",
      });
    }
  } catch (error) {
    // Usage accounting must never fail a proposal the owner is about to see.
    console.error("[widgets] could not record edit usage", error);
  }

  if (!captured) {
    return {
      ok: false,
      error: "The agent didn't propose a concrete change. Try saying which part should change.",
    };
  }

  return {
    ok: true,
    proposal: { id: randomUUID(), widget, edit: captured },
  };
}

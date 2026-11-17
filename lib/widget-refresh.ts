import "server-only";

import {
  Agent,
  MaxTurnsExceededError,
  OpenAIProvider,
  run,
  setTracingDisabled,
  tool,
  type AgentInputItem,
} from "@openai/agents";

import { calculate } from "@/lib/agent-runtime/tools/calculator";
import { widgetDataParameters } from "@/lib/agent-runtime/tools/widgets";
import { readWebPage } from "@/lib/agent-runtime/tools/read-page";
import { webSearch } from "@/lib/agent-runtime/tools/web-search";
import { resolveAgentConnection } from "@/lib/agent-runtime/models";
import { readRunUsage } from "@/lib/agent-runtime/usage";
import { resolveAgentToolIds } from "@/lib/agent-tool-options";
import { recordAgentUsage } from "@/lib/plan-usage";
import { normalizeWidgetData, type WidgetPayload } from "@/lib/widget-types";
import type { WidgetRefreshOutcome, WidgetRefreshTarget } from "@/lib/widgets";

/**
 * The read-only update behind every widget's cron.
 *
 * It is deliberately not the chat runtime: no approvals, no app mutations, no
 * cloud browser, no transcript. The agent gets only the reading tools it
 * already had switched on, plus one capture tool whose payload is normalized
 * before it is stored. That makes "only replaces its data" a property of the
 * code rather than a promise in a prompt.
 */

setTracingDisabled(true);

const MAX_TURNS = 6;
const UPDATE_TIMEOUT_MS = 90_000;
const MAX_SOURCE_PROMPT_CHARS = 800;

/** The only tools a refresh may use: they read, they don't change anything. */
const READ_ONLY_TOOLS = {
  web_search: webSearch,
  read_webpage: readWebPage,
  calculate,
} as const;

function updateInstructions(target: WidgetRefreshTarget): string {
  return `You maintain one dashboard widget. The widget holds data only: numbers, a short series and a few list rows. It never contains markup, images or links.

Widget: “${target.title}”
It tracks: ${(target.sourcePrompt ?? target.title).slice(0, MAX_SOURCE_PROMPT_CHARS)}

Re-read what the widget tracks using the read-only tools you have, then update the widget's data. Fields you leave out keep their current values.
Rules:
- Use only facts you actually read now, or values the current data already states. Never invent, estimate or extrapolate a number.
- Keep labels short; put the most important number first.
- Send only the fields the sources actually cover. Leave a field empty when you have nothing real for it: an empty metrics / series / items list keeps what the widget already shows. Never pad a chart or a list to fill the layout — one honest point beats five made-up ones.
- You may use web_search and read_webpage when they help. Do not try to sign in, fill forms or change anything anywhere.
- This run can only replace the data. Never change the title, icon, design, form, size or schedule.
- Call save_widget_data exactly once with everything the sources cover. Do not answer in prose.
- If nothing readable has changed, don't call the tool; reply exactly “No new data”.`;
}

function updatePrompt(target: WidgetRefreshTarget): string {
  return [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    `Dashboard widget: “${target.title}”`,
    "",
    "Current widget data (JSON):",
    JSON.stringify(target.data),
    "",
    "Re-check what it tracks and save whatever the sources now support.",
  ].join("\n");
}

/** Read tools that actually ran during a turn, by name. */
function readToolCalls(items: unknown[]): number {
  return items.filter((item) => {
    const entry = item as { type?: string; name?: string; rawItem?: { name?: string } };
    const name = entry.name ?? entry.rawItem?.name;
    return (
      (entry.type === "function_call" || entry.type === "tool_call_item") &&
      typeof name === "string" &&
      name in READ_ONLY_TOOLS
    );
  }).length;
}

/**
 * A read-only turn can gather everything and still stop before writing it down
 * (a truncated answer, a turn budget spent on reading). One more turn with the
 * save tool alone turns what it already read into stored data: the reading
 * tools are gone, so it cannot fetch more or wander off.
 */
function saveOnlyInstructions(): string {
  return `You are finishing an update to one dashboard widget. You already read the sources earlier in this conversation — do not read anything else.

Save the numbers, chart points and list rows you found.
- Use only facts already in this conversation or the widget's current data. Never invent or extrapolate a number.
- Send only the fields the sources covered. Leave metrics, series or items empty when you have nothing real for them: those fields keep what the widget already shows. Never pad a chart or a list.
- Call save_widget_data exactly once. Do not reply in prose.`;
}

function noteFor(data: WidgetPayload): string {
  const parts: string[] = [];
  if (data.metrics.length > 0) {
    parts.push(`${data.metrics.length} metric${data.metrics.length === 1 ? "" : "s"}`);
  }
  if (data.series.length > 0) {
    parts.push(`${data.series.length} point${data.series.length === 1 ? "" : "s"}`);
  }
  if (data.items.length > 0) {
    parts.push(`${data.items.length} row${data.items.length === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? `Updated ${parts.join(", ")}` : "Updated the data";
}

/**
 * Runs the update and returns what to store. Throws when the model endpoint is
 * unusable, so the caller records an error run and keeps the old data.
 */
export async function runReadOnlyWidgetUpdate(
  target: WidgetRefreshTarget,
): Promise<WidgetRefreshOutcome> {
  const connection = await resolveAgentConnection(target.provider, target.ownerId);
  if (!connection.apiKey) throw new Error("This agent has no model connection.");
  if (!connection.baseURL && connection.model?.includes("/")) {
    throw new Error("This agent's model runs through a gateway that isn't configured.");
  }

  const enabled = new Set(resolveAgentToolIds(target.enabledTools));
  const readTools = Object.entries(READ_ONLY_TOOLS)
    .filter(([id]) => enabled.has(id as keyof typeof READ_ONLY_TOOLS))
    .map(([, definition]) => definition);

  if (readTools.length === 0) {
    // Without a reading tool there is nothing this run could refresh. Saying so
    // is cheaper and more honest than a model call that can only repeat itself.
    return { status: "ok", note: "No reading tools enabled; kept the current data." };
  }

  const startedAt = new Date();
  let inputTokens = 0;
  let outputTokens = 0;
  const addUsage = (result: unknown) => {
    const usage = readRunUsage(result);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
  };
  const flushUsage = async () => {
    if (inputTokens + outputTokens === 0) return;
    try {
      await recordAgentUsage({
        ownerId: target.ownerId,
        model: connection.model ?? null,
        inputTokens,
        outputTokens,
        startedAt,
        endedAt: new Date(),
        activity: "widget_refresh",
      });
    } catch (error) {
      // Usage accounting must never fail a refresh whose data already landed.
      console.error("[widgets] could not record refresh usage", error);
    }
  };

  let captured: WidgetPayload | null = null;

  const saveTool = tool({
    name: "save_widget_data",
    description:
      "Save the refreshed widget data. Call this exactly once. Only the fields you send are replaced; empty or omitted fields keep the widget's current values.",
    parameters: widgetDataParameters,
    execute: async (input) => {
      const data = normalizeWidgetData(input);
      if (!data) {
        return "That data was empty. Send metrics, series or items and call again.";
      }
      captured = data;
      return "Saved. The dashboard picks up the merged data automatically.";
    },
  });

  const provider = new OpenAIProvider({
    apiKey: connection.apiKey,
    baseURL: connection.baseURL ?? undefined,
    useResponses: connection.useResponses,
  });
  const model = await provider.getModel(connection.model ?? undefined);

  const agent = new Agent({
    name: "Widget update",
    instructions: updateInstructions(target),
    model,
    tools: [...readTools, saveTool],
  });

  // The SDK throws when it reaches the turn limit, and on a slow gateway that
  // can happen in the same step that called the save tool. The call already
  // happened, so the data is captured: a turn-limit error must not throw it
  // away. Any other error is re-thrown unless the save already landed.
  let firstHistory: AgentInputItem[] = [];
  try {
    const first = await run(agent, updatePrompt(target), {
      maxTurns: MAX_TURNS,
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
    });
    addUsage(first);
    firstHistory = first.history;
  } catch (error) {
    if (error instanceof MaxTurnsExceededError) {
      addUsage({ state: error.state });
      firstHistory = error.state?.history ?? [];
    } else if (!captured) {
      throw error;
    }
  }

  if (!captured && readToolCalls(firstHistory) > 0) {
    // It read something but never wrote it down. Ask once more, with only the
    // save tool, continuing the same conversation so the facts are still there.
    const saver = new Agent({
      name: "Widget save",
      instructions: saveOnlyInstructions(),
      model,
      tools: [saveTool],
    });

    const retryPrompt =
      "You ended the last turn without saving. Call save_widget_data now with what you found, then stop.";
    const retryInput: AgentInputItem[] | string =
      firstHistory.length > 0
        ? [...firstHistory, { role: "user", content: retryPrompt }]
        : `${updatePrompt(target)}\n\n${retryPrompt}`;

    try {
      const retry = await run(saver, retryInput, {
        maxTurns: 2,
        signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
      });
      addUsage(retry);
    } catch (error) {
      // The first turn's data (if any) still counts; a failed retry just means
      // the card keeps its numbers.
      console.error("[widgets] save retry failed", error);
    }
  }

  await flushUsage();

  if (!captured) {
    return { status: "ok", note: "No new data; kept the current values." };
  }

  return { status: "ok", note: noteFor(captured), data: captured };
}

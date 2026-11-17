import "server-only";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import { approvalPreview, buildResultCard, plainText } from "@/lib/apps/results";
import {
  executeToolkitAction,
  listToolkitActions,
  type ComposioAction,
} from "@/lib/composio/client";
import { composioUserId, isComposioConfigured } from "@/lib/composio/config";
import { verifyIntegration } from "@/lib/composio/connections";
import {
  createApproval,
  hasRememberedApproval,
  recordAutoApproval,
} from "@/lib/agents/approvals";
import { guardScheduledActionArgs } from "@/lib/schedule-action";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import {
  INTEGRATIONS,
  INTEGRATION_SLUGS,
  getIntegration,
  resolveIntegrationSlug,
} from "@/lib/apps/catalog";

/**
 * The bridge between the agent and the apps the user connects through
 * Composio.
 *
 * Three tools, each with one job:
 * - `check_app_connection` verifies an app and, when it isn't usable, makes the
 *   chat show a connect card.
 * - `app_find_actions` discovers the actions an app exposes.
 * - `app_run_action` runs one. Read-only actions run immediately; anything that
 *   changes data is sealed into an approval token and the model is told to stop
 *   and wait for the card. The model never runs a mutating action itself.
 */

const APP_NAMES = INTEGRATIONS.map((integration) => integration.name).join(", ");

const NO_OWNER =
  "This chat has no signed-in owner, so external apps can't be used. Ask the user to reload and try again.";

const NOT_CONFIGURED =
  "External apps aren't configured on this workspace, so no app can be connected. Tell the user an admin needs to add COMPOSIO_API_KEY.";

const MAX_ACTIONS_SHOWN = 25;
const MAX_RESULT_CHARS = 6000;

function connectedRequest(state: AgentToolRunState, toolkit: string, reason: string) {
  if (!state.connectionRequests.some((request) => request.toolkit === toolkit)) {
    state.connectionRequests.push({ toolkit, reason: reason.slice(0, 160) });
  }
}

/**
 * Verifies an app live. On anything other than ACTIVE it also queues the
 * connect card, because that is the only way the user can fix the gap.
 */
async function requireConnection(
  state: AgentToolRunState,
  toolkit: string,
  reason: string,
): Promise<{ definition: NonNullable<ReturnType<typeof getIntegration>> } | { message: string }> {
  if (!state.ownerId) return { message: NO_OWNER };
  if (!isComposioConfigured()) return { message: NOT_CONFIGURED };

  const definition = getIntegration(toolkit);
  if (!definition) {
    return { message: `Unknown app "${toolkit}". Use a Composio toolkit slug. Common apps: ${APP_NAMES}.` };
  }

  try {
    const { status, accountLabel } = await verifyIntegration(state.ownerId, definition.slug);

    if (status === "active") return { definition };

    connectedRequest(state, definition.slug, reason);

    if (status === "pending") {
      return {
        message: `${definition.name} is still waiting for the user to finish connecting. A connect card is showing in the chat; ask them to complete it, then call check_app_connection again.`,
      };
    }
    if (status === "error") {
      return {
        message: `${definition.name} could not connect. A reconnect card is showing in the chat; ask the user to reconnect it, then check again.`,
      };
    }

    return {
      message: `${definition.name} is not connected${accountLabel ? ` (${accountLabel})` : ""}. A connect card is showing in the chat. Tell the user in one sentence that you need ${definition.name}, then stop and wait.`,
    };
  } catch (error) {
    console.error("[composio] connection check failed", error);
    return {
      message: "Couldn't reach Composio to check that app. Tell the user the connection status is unavailable right now.",
    };
  }
}

/** Argument names, so the model can build a usable JSON object. */
function argumentHint(action: ComposioAction): string {
  const properties = action.parameters?.properties;
  if (!properties || typeof properties !== "object") return "";

  const names = Object.keys(properties as Record<string, unknown>).slice(0, 10);
  if (names.length === 0) return " args: none";

  const required = Array.isArray(action.parameters?.required)
    ? (action.parameters.required as unknown[]).filter((name): name is string => typeof name === "string")
    : [];

  return ` args: ${names
    .map((name) => (required.includes(name) ? `${name}*` : name))
    .join(", ")}`;
}

function actionLine(action: ComposioAction): string {
  const access = action.readOnly ? "read-only, runs directly" : "changes data, needs approval";
  const description = plainText(action.description);
  return `- ${action.slug} — ${action.name} [${access}]${argumentHint(action)}${
    description ? `: ${description.slice(0, 140)}` : ""
  }`;
}

function summarizeAction(definitionName: string, action: ComposioAction, args: Record<string, unknown>): string {
  const preview = approvalPreview(args)
    .slice(0, 2)
    .map((field) => `${field.label}: ${field.value}`)
    .join(" · ");
  return `${definitionName} · ${action.name}${preview ? ` — ${preview}` : ""}`.slice(0, 200);
}

/* ------------------------------------------------------------------ */
/* Scheduled-run guard                                                 */
/* ------------------------------------------------------------------ */

/**
 * One schedule may send or post exactly once, to exactly one destination.
 *
 * A scheduled run has no owner at the keyboard, so an approval card would leave
 * the action forever pending. The owner confirms the action on the schedule
 * form instead; from then on this guard is the whole permission model:
 *
 * - the action must be the confirmed slug (anything else is refused),
 * - the destination field is overwritten with the form's value,
 * - an argument that would reach any other recipient is refused,
 * - the same send cannot repeat, and the per-run cap is enforced.
 */

function scheduledSendRefusal(policy: { actionLabel: string; destination: string; maxPerRun: number }): string {
  return `This scheduled run may only run ${policy.actionLabel} to ${policy.destination}, at most ${policy.maxPerRun} time${
    policy.maxPerRun === 1 ? "" : "s"
  }, and it already did. Do not retry; tell the owner what was sent.`;
}

/* ------------------------------------------------------------------ */
/* check_app_connection                                                */
/* ------------------------------------------------------------------ */

const checkParameters = z.object({
  toolkit: z
    .string()
    .describe(`Any Composio toolkit slug that matches the app. Common: ${INTEGRATION_SLUGS.join(", ")}.`),
  reason: z
    .string()
    .max(160)
    .describe(
      'Why you need it, in the user\'s words, e.g. "to find the invoice from Acme". Shown on the connect card. Use an empty string when there is no reason to show.',
    ),
});

export const checkAppConnection: Tool<AgentToolRunState> = tool<
  typeof checkParameters,
  AgentToolRunState
>({
  name: "check_app_connection",
  description:
    "Check whether an external app (Gmail, Slack, Notion, GitHub, …) is connected, and show a Connect card when it isn't. Call this before using an app the user says they just connected.",
  parameters: checkParameters,
  execute: async ({ toolkit, reason }, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return NO_OWNER;
    if (!isComposioConfigured()) return NOT_CONFIGURED;

    const slug = resolveIntegrationSlug(toolkit);
    if (!slug) return `Unknown app "${toolkit}". Use a Composio toolkit slug. Common apps: ${APP_NAMES}.`;

    const definition = getIntegration(slug)!;
    const result = await requireConnection(state, slug, reason?.trim() || `to finish this request`);

    if ("message" in result) return result.message;

    return `${definition.name} is connected and ready. Call app_find_actions with toolkit "${slug}" to see what it can do, then app_run_action.`;
  },
});

/* ------------------------------------------------------------------ */
/* app_find_actions                                                    */
/* ------------------------------------------------------------------ */

const findParameters = z.object({
  toolkit: z
    .string()
    .describe(`Composio toolkit slug, e.g. "gmail" or "notion". Common: ${INTEGRATION_SLUGS.join(", ")}.`),
  query: z
    .string()
    .max(80)
    .describe('Words to filter actions, e.g. "send email". Use an empty string to list everything.'),
});

export const appFindActions: Tool<AgentToolRunState> = tool<
  typeof findParameters,
  AgentToolRunState
>({
  name: "app_find_actions",
  description:
    "List the actions an app offers, with their slugs and whether each one is read-only or needs the user's approval. Always do this before app_run_action.",
  parameters: findParameters,
  execute: async ({ toolkit, query }, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return NO_OWNER;
    if (!isComposioConfigured()) return NOT_CONFIGURED;

    const slug = resolveIntegrationSlug(toolkit);
    if (!slug) return `Unknown app "${toolkit}". Use a Composio toolkit slug. Common apps: ${APP_NAMES}.`;

    const definition = getIntegration(slug)!;
    const connection = await requireConnection(state, slug, `to look up its actions`);
    if ("message" in connection) return connection.message;

    const actions = await listToolkitActions(slug, query);
    if (actions.length === 0) {
      return `Composio returned no actions for ${definition.name}${query ? ` matching "${query}"` : ""}. Try a different word, or check the connection.`;
    }

    const shown = actions.slice(0, MAX_ACTIONS_SHOWN);
    const hidden = actions.length - shown.length;

    return [
      `${definition.name} actions${query ? ` matching "${query}"` : ""}:`,
      ...shown.map(actionLine),
      hidden > 0 ? `…and ${hidden} more. Add a query to narrow the list.` : "",
      "Call app_run_action with the exact slug and an arguments object. Read-only actions run now; anything that changes data shows an approval card and you must stop.",
    ]
      .filter(Boolean)
      .join("\n");
  },
});

/* ------------------------------------------------------------------ */
/* app_run_action                                                      */
/* ------------------------------------------------------------------ */

const runParameters = z.object({
  toolkit: z.string().describe(`App slug, e.g. "gmail".`),
  action: z.string().describe("Action slug from app_find_actions, e.g. GMAIL_FETCH_EMAILS."),
  arguments: z
    .string()
    .describe(
      'The action arguments as a JSON object string, e.g. \'{"query":"invoices"}\'. Use "{}" when the action takes no arguments.',
    ),
  reason: z
    .string()
    .max(160)
    .describe(
      "One short sentence for the approval card explaining why this change is needed. Use an empty string when there is nothing to add.",
    ),
});

export const appRunAction: Tool<AgentToolRunState> = tool<typeof runParameters, AgentToolRunState>({
  name: "app_run_action",
  description:
    "Run one app action. Read-only actions (get, list, search, fetch, load, or a slug ending in _DETAILS) run immediately and return a result card. Actions that change data (send, create, update, delete) never run here: they show an approval card the user must approve.",
  parameters: runParameters,
  execute: async ({ toolkit, action, arguments: argsJson, reason }, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state?.ownerId) return NO_OWNER;
    if (!state.agentId) return "This run has no agent, so approvals can't be bound to it.";
    if (!isComposioConfigured()) return NOT_CONFIGURED;

    const slug = resolveIntegrationSlug(toolkit);
    if (!slug) return `Unknown app "${toolkit}". Use a Composio toolkit slug. Common apps: ${APP_NAMES}.`;

    const definition = getIntegration(slug)!;
    const connection = await requireConnection(state, slug, reason?.trim() || `to run ${action}`);
    if ("message" in connection) return connection.message;

    const actions = await listToolkitActions(slug);
    const match = actions.find((entry) => entry.slug.toLowerCase() === action.trim().toLowerCase());

    if (!match) {
      return `"${action}" isn't an action of ${definition.name}. Call app_find_actions with toolkit "${slug}" and use one of the slugs it returns.`;
    }

    let cleanArgs: Record<string, unknown> = {};
    try {
      const parsedArgs = JSON.parse(argsJson || "{}") as unknown;
      if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
        return "The arguments must be a JSON object, for example {\"query\":\"invoices\"}.";
      }
      cleanArgs = parsedArgs as Record<string, unknown>;
    } catch {
      return "The arguments weren't valid JSON. Send a JSON object string, for example {\"query\":\"invoices\"}.";
    }

    if (match.readOnly) {
      try {
        const result = await executeToolkitAction({
          action: match.slug,
          userId: composioUserId(state.ownerId),
          args: cleanArgs,
        });

        if (result.error) {
          return `${definition.name} ran ${match.name} but it failed. Tell the user it didn't work; don't invent a result.`;
        }

        const card = buildResultCard(`${definition.name} · ${match.name}`, result.data);
        state.results.push(card);

        const serialized = JSON.stringify(result.data);
        const trimmed =
          serialized && serialized.length > MAX_RESULT_CHARS
            ? `${serialized.slice(0, MAX_RESULT_CHARS)}…`
            : serialized;

        return [
          `${definition.name} · ${match.name} returned:`,
          trimmed || "No data.",
          "A result card is showing in the chat. Answer from this data only.",
          "Private-data guard is active: this belongs to the owner. Quote only what the request needs, never copy full records, and never send this data to another app, page or person unless the owner asked for that exact transfer.",
        ].join("\n");
      } catch (error) {
        console.error(`[composio] ${match.slug} failed`, error);
        return `Couldn't run ${match.name} on ${definition.name}. Tell the user the app didn't respond and to try again.`;
      }
    }

    // A scheduled run has a confirmed action instead of an owner at the
    // keyboard: run exactly that one, once, to the destination on the form.
    const policy = state.scheduledAction;
    if (policy) {
      if (match.slug.toUpperCase() !== policy.action.toUpperCase()) {
        return `This scheduled run may only run ${policy.actionLabel} (${policy.action}). ${match.name} changes data, so it was not run. Do the task with reads and, if needed, the confirmed action.`;
      }

      if (state.sentActions.length >= policy.maxPerRun) {
        return scheduledSendRefusal(policy);
      }

      if (
        state.sentActions.some(
          (entry) =>
            entry.action.toUpperCase() === match.slug.toUpperCase() &&
            entry.destination.toLowerCase() === policy.destination.toLowerCase(),
        )
      ) {
        return scheduledSendRefusal(policy);
      }

      const guard = guardScheduledActionArgs(cleanArgs, policy);
      if (!guard.ok) return guard.message;

      try {
        const result = await executeToolkitAction({
          action: match.slug,
          userId: composioUserId(state.ownerId),
          args: guard.args,
        });

        if (result.error) {
          return `${definition.name} ran ${match.name} but it failed. Tell the owner it didn't send; don't invent a result.`;
        }

        const card = buildResultCard(`${definition.name} · ${match.name}`, result.data);
        state.results.push(card);

        const summary = summarizeAction(definition.name, match, guard.args);
        state.sentActions.push({
          toolkit: slug,
          action: match.slug,
          actionLabel: match.name,
          destinationField: policy.destinationField,
          destination: policy.destination,
          summary,
          at: new Date().toISOString(),
        });

        return [
          `${match.name} ran and delivered to ${policy.destination}.`,
          "The schedule confirmed this action, so it did not need an approval card.",
          `That was the one change allowed in this run${policy.maxPerRun === 1 ? "" : "s"} — do not call it again.`,
          "A result card and the sent details are saved to the schedule's history.",
        ].join(" ");
      } catch (error) {
        console.error(`[composio] scheduled ${match.slug} failed`, error);
        return `Couldn't run ${match.name} on ${definition.name}. Tell the owner it didn't send and to check the app connection.`;
      }
    }

    // The agent's saved rule. "auto" only repeats an action the owner already
    // approved for this agent; "full" runs every change. Both still write an
    // `agent_approvals` audit row instead of a card.
    const mode = state.approvalMode;
    const autoRun =
      mode === "full" ||
      (mode === "auto" &&
        (await hasRememberedApproval({
          ownerId: state.ownerId,
          agentId: state.agentId,
          toolkit: slug,
          action: match.slug,
        }).catch(() => false)));

    if (autoRun) {
      const summary = summarizeAction(definition.name, match, cleanArgs);

      try {
        const result = await executeToolkitAction({
          action: match.slug,
          userId: composioUserId(state.ownerId),
          args: cleanArgs,
        });

        if (result.error) {
          return `${definition.name} ran ${match.name} but it failed. Tell the owner it didn't go through; don't invent a result.`;
        }

        const card = buildResultCard(`${definition.name} · ${match.name}`, result.data);
        state.results.push(card);

        state.sentActions.push({
          toolkit: slug,
          action: match.slug,
          actionLabel: match.name,
          destinationField: "auto",
          destination: mode === "full" ? "Full access" : "Previously approved",
          summary,
          at: new Date().toISOString(),
        });

        await recordAutoApproval({
          ownerId: state.ownerId,
          agentId: state.agentId,
          toolkit: slug,
          action: match.slug,
          args: cleanArgs,
          summary,
          mode: mode === "full" ? "full access" : "remembered",
        }).catch((error) => console.error("[approvals] audit row failed", error));

        return [
          `${definition.name} · ${match.name} ran without an approval card because this agent is set to ${mode === "full" ? "full access" : "approve previously approved actions"}.`,
          "A result card is showing in the chat. Report what happened, then stop — do not call it again.",
          "The run was written to the approval log.",
        ].join(" ");
      } catch (error) {
        console.error(`[composio] auto-approved ${match.slug} failed`, error);
        return `Couldn't run ${match.name} on ${definition.name}. Tell the owner it didn't go through and to check the app connection.`;
      }
    }

    // Mutating: seal the exact action and arguments into a single-use token,
    // show the card, and stop. Nothing is executed until the owner approves.
    try {
      const summary = summarizeAction(definition.name, match, cleanArgs);
      const { token } = await createApproval({
        ownerId: state.ownerId,
        agentId: state.agentId,
        toolkit: slug,
        action: match.slug,
        args: cleanArgs,
        summary,
      });

      state.approvals.push({
        token,
        toolkit: slug,
        name: definition.name,
        action: match.slug,
        actionLabel: match.name,
        summary,
        preview: approvalPreview(cleanArgs),
      });

      return [
        `${match.name} changes data in ${definition.name}, so it did NOT run.`,
        "An approval card is now showing with the exact action and arguments. Ask the user to approve or cancel it in one short sentence, then stop.",
        "Do not call this action again and do not claim it happened; the card runs it after approval without asking you.",
      ].join(" ");
    } catch (error) {
      console.error("[composio] could not create an approval", error);
      return "Couldn't prepare the approval card for that action. Tell the user it can't run right now.";
    }
  },
});

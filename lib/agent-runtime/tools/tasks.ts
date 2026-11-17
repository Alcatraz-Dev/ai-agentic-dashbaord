import "server-only";

import { randomUUID } from "node:crypto";

import { tool, type RunContext, type Tool } from "@openai/agents";
import { z } from "zod";

import { listAgentsForUser } from "@/lib/agents";
import { AGENT_TOOL_OPTIONS, type AgentToolId } from "@/lib/agent-tool-options";
import type { AgentToolRunState } from "@/lib/agent-runtime/tools/context";
import {
  deleteTaskForUser,
  listTaskRolesForUser,
  listTasksForUser,
  moveTaskForUser,
  setTaskAssigneesForUser,
  setTaskToolsForUser,
  updateTaskForUser,
} from "@/lib/tasks";
import {
  EMPTY_TASK_TOOLS,
  TASK_ASSIGNEES_MAX,
  TASK_NOTES_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_ROLE_OPTIONS,
  TASK_ROLE_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_TITLE_MAX,
  dueLabel,
  getTaskRole,
  isTaskPriority,
  isTaskRoleKey,
  isTaskStatus,
  normalizeDueDate,
  taskToolCount,
  todayKey,
  type TaskPriority,
  type TaskProposal,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/task-types";

/**
 * The agent's task-board tools.
 *
 * Reading and changing existing cards is a direct write — it stays inside the
 * workspace, and the owner sees it on /dashboard/tasks immediately. Adding a
 * card is not: `propose_task` streams an editable card and only the owner's
 * "Add to board" click creates the row, exactly like a schedule proposal. That
 * way the model can never quietly fill the board with work nobody agreed to.
 *
 * A card can be staffed: `propose_task` suggests the roles the work needs and
 * `assign_task_agent` puts a named agent on one of them later.
 */

const statusEnum = z.enum(TASK_STATUSES);
const priorityEnum = z.enum(TASK_PRIORITIES);
/** Roles are the workspace's own records, so the tools take a free key. */
const roleParam = z.string().min(1).max(40);

function ownerOf(context?: RunContext<AgentToolRunState>): number | null {
  return context?.context?.ownerId ?? null;
}

function describe(task: TaskSummary): string {
  const due = dueLabel(task.dueDate, todayKey());
  const bits = [
    TASK_STATUS_LABELS[task.status],
    TASK_PRIORITY_LABELS[task.priority].toLowerCase(),
    due ? `due ${due.toLowerCase()}` : "",
  ].filter(Boolean);

  const people =
    task.assignees.length > 0
      ? ` · ${task.assignees
          .map(
            (person) =>
              `${person.role.label}: ${person.agent?.name ?? "open"} [${TASK_ROLE_STATUS_LABELS[person.status]}]`,
          )
          .join(", ")}`
      : "";

  const doneSteps = task.steps.filter((step) => step.done).length;
  const steps =
    task.steps.length > 0
      ? ` · steps ${doneSteps}/${task.steps.length}${
          doneSteps < task.steps.length
            ? `, next “${task.steps.find((step) => !step.done)?.title ?? ""}”`
            : ""
        }`
      : "";
  const picked =
    taskToolCount(task.tools) > 0 ? ` · ${taskToolCount(task.tools)} tools picked` : "";

  const origin = task.sourceAgent ? ` · from ${task.sourceAgent.name}'s chat` : "";
  const scheduled = task.schedule ? " · scheduled" : "";

  return `#${task.id} ${task.title} (${bits.join(", ")})${people}${steps}${picked}${origin}${scheduled}`;
}

export type TaskProposalInput = {
  title: string;
  notes?: string | null;
  status?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  summary?: string | null;
  roles?: unknown;
};

/**
 * Normalizes one proposal. Pure and exported so the same shape is used by the
 * tool and by the tests that exercise the accept path.
 */
export function buildTaskProposal(input: TaskProposalInput): TaskProposal | null {
  const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, TASK_TITLE_MAX);
  if (!title) return null;

  const notes = input.notes ? input.notes.trim().slice(0, TASK_NOTES_MAX) || null : null;
  const status: TaskStatus = isTaskStatus(input.status) ? input.status : "todo";
  const priority: TaskPriority = isTaskPriority(input.priority) ? input.priority : "normal";

  const roles: string[] = Array.isArray(input.roles)
    ? [
        ...new Set(
          input.roles
            .filter((role): role is string => typeof role === "string")
            .map((role) => role.trim().toLowerCase())
            .filter(isTaskRoleKey),
        ),
      ].slice(0, TASK_ASSIGNEES_MAX)
    : [];

  return {
    id: randomUUID(),
    title,
    notes,
    status,
    priority,
    dueDate: normalizeDueDate(input.dueDate),
    summary:
      (input.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 160) ||
      "Check the title, step, priority and due date, then add it to the board.",
    roles,
  };
}

/**
 * The proposal tool's body, separated from the SDK wrapper so the exact same
 * code can be exercised without a model turn.
 */
export function applyTaskProposal(
  state: AgentToolRunState,
  input: TaskProposalInput,
): { ok: true; proposal: TaskProposal } | { ok: false; message: string } {
  if (!state.ownerId) {
    return { ok: false, message: "This chat has no signed-in owner, so the task board isn't available." };
  }

  const proposal = buildTaskProposal(input);
  if (!proposal) {
    return {
      ok: false,
      message: "The card needs a title. Give it a short one and call propose_task again.",
    };
  }

  state.taskProposals.push(proposal);

  return {
    ok: true,
    proposal,
  };
}

const listParameters = z.object({
  status: statusEnum.optional().describe("Only cards in this step."),
  limit: z.number().int().min(1).max(40).optional().describe("How many cards to return (default 25)."),
});

const listTasks = tool<typeof listParameters, AgentToolRunState>({
  name: "list_tasks",
  description:
    "Read the workspace task board: ids, titles, step, priority, due date, the agents staffed on each card and where it came from. Call it before answering what is planned, in flight or blocked.",
  parameters: listParameters,
  execute: async ({ status, limit }, context) => {
    const ownerId = ownerOf(context);
    if (ownerId === null) return "The task board isn't available in this session.";

    const board = await listTasksForUser(ownerId);
    const filtered = status ? board.filter((task) => task.status === status) : board;

    if (filtered.length === 0) {
      return status
        ? `No cards in ${TASK_STATUS_LABELS[status]}.`
        : "The task board is empty.";
    }

    const shown = filtered.slice(0, limit ?? 25);
    const more =
      filtered.length > shown.length ? `\n…and ${filtered.length - shown.length} more.` : "";

    return `${shown.map(describe).join("\n")}${more}`;
  },
});

const proposeParameters = z.object({
  title: z.string().min(1).max(TASK_TITLE_MAX).describe("Short, concrete card title."),
  notes: z
    .string()
    .max(TASK_NOTES_MAX)
    .optional()
    .describe("Context, links or what done looks like. Leave out when there is nothing real to add."),
  status: statusEnum
    .optional()
    .describe("Starting step; defaults to todo (Backlog). Use doing only when work is already underway."),
  priority: priorityEnum.optional().describe("low | normal | high; defaults to normal."),
  dueDate: z
    .string()
    .max(10)
    .optional()
    .describe("YYYY-MM-DD, only when the owner actually gave a date."),
  summary: z
    .string()
    .max(160)
    .optional()
    .describe("One sentence on why this card is worth doing, shown above the form."),
  roles: z
    .array(roleParam)
    .max(TASK_ASSIGNEES_MAX)
    .optional()
    .describe(
      "Role keys this card needs, from the workspace's roles (list_tasks shows them on existing cards; the board's Roles dialog shows the full set). The owner can change them and staff each role with a different agent.",
    ),
});

const proposeTask = tool<typeof proposeParameters, AgentToolRunState>({
  name: "propose_task",
  description:
    "Open an editable task card for the owner to accept. Use this whenever the owner asks to add, track or remember work — including turning the current conversation into a task. Suggest the roles the work needs (designer, frontend, backend, reviewer, writer, …). Never say a card was added before the owner clicks Add to board.",
  parameters: proposeParameters,
  execute: async (input, context?: RunContext<AgentToolRunState>) => {
    const state = context?.context;
    if (!state) return "This chat has no signed-in owner, so the task board isn't available.";

    const result = applyTaskProposal(state, input);
    if (!result.ok) return result.message;

    const { proposal } = result;
    const roles =
      proposal.roles.length > 0
        ? ` It suggests the roles ${proposal.roles.map((role) => getTaskRole(role).label).join(", ")}, which the owner can staff with different agents on the board.`
        : "";

    return `The editable task card is on screen: “${proposal.title}” in ${TASK_STATUS_LABELS[proposal.status]}.${roles} Tell the owner in one sentence to check the title, step, priority, due date and roles, then click Add to board. Nothing has been created yet.`;
  },
});

const updateParameters = z.object({
  id: z.number().int().positive().describe("Task id from list_tasks."),
  title: z.string().min(1).max(TASK_TITLE_MAX).optional(),
  notes: z.string().max(TASK_NOTES_MAX).optional().describe("Empty string clears the notes."),
  priority: priorityEnum.optional(),
  dueDate: z.string().max(10).optional().describe("YYYY-MM-DD, or an empty string to clear it."),
  builtinTools: z
    .array(
      z.enum(AGENT_TOOL_OPTIONS.map((option) => option.id) as [AgentToolId, ...AgentToolId[]]),
    )
    .max(AGENT_TOOL_OPTIONS.length)
    .optional()
    .describe(
      "Built-in tools this card may use, by id (web_search, read_webpage, browser_open, browser_act, browser_extract, browser_request_login, calculate, current_time). Replaces the card's list; an empty array clears it so the agent's own switches apply.",
    ),
});

const updateTask = tool<typeof updateParameters, AgentToolRunState>({
  name: "update_task",
  description:
    "Edit a card's title, notes, priority, due date or the built-in tools it may use. Use move_task to change its step and assign_task_agent to change who is on it.",
  parameters: updateParameters,
  execute: async ({ id, title, notes, priority, dueDate, builtinTools }, context) => {
    const ownerId = ownerOf(context);
    if (ownerId === null) return "The task board isn't available in this session.";

    const board = await updateTaskForUser(ownerId, id, {
      ...(title === undefined ? {} : { title }),
      ...(notes === undefined ? {} : { notes }),
      ...(priority === undefined ? {} : { priority }),
      ...(dueDate === undefined ? {} : { dueDate }),
    });

    const current = board?.find((task) => task.id === id);
    if (!current) return `No card with id #${id} on this board.`;

    // Built-in picks replace only that group; the card's skills, plugins, MCP
    // servers and apps stay exactly as the owner set them.
    const withTools =
      builtinTools === undefined
        ? board
        : await setTaskToolsForUser(ownerId, id, {
            ...(current.tools ?? EMPTY_TASK_TOOLS),
            builtin: builtinTools,
          });

    const updated = withTools?.find((task) => task.id === id);
    if (!updated) return `No card with id #${id} on this board.`;

    const builtinNote =
      builtinTools === undefined
        ? ""
        : builtinTools.length === 0
          ? " Its built-in tools are back to the agent's own switches."
          : ` It may now use the built-in tools ${builtinTools.join(", ")}.`;

    return `Updated ${describe(updated)}.${builtinNote}`;
  },
});

const moveParameters = z.object({
  id: z.number().int().positive().describe("Task id from list_tasks."),
  status: statusEnum.describe("The step to move the card to."),
});

const moveTask = tool<typeof moveParameters, AgentToolRunState>({
  name: "move_task",
  description:
    "Move a card to another step: todo (Backlog), doing (In progress), review (In review) or done.",
  parameters: moveParameters,
  execute: async ({ id, status }, context) => {
    const ownerId = ownerOf(context);
    if (ownerId === null) return "The task board isn't available in this session.";

    const board = await moveTaskForUser(ownerId, id, status, Number.MAX_SAFE_INTEGER);
    const moved = board?.find((task) => task.id === id);
    if (!moved) return `No card with id #${id} on this board.`;
    return `Moved ${describe(moved)}.`;
  },
});

const assignParameters = z.object({
  id: z.number().int().positive().describe("Task id from list_tasks."),
  agent: z
    .string()
    .min(1)
    .max(80)
    .describe("Name of one of the workspace's agents, or \"me\" for the agent running this chat."),
  role: roleParam.describe(
    "The role key or label this agent takes on, e.g. designer, frontend, reviewer — any role in the workspace.",
  ),
});

const assignTaskAgent = tool<typeof assignParameters, AgentToolRunState>({
  name: "assign_task_agent",
  description:
    "Staff a card with one workspace agent in one role. Use it when the owner says who should do a part of a task, or asks to change the agent on a card. An agent can hold one role per card; calling it again for the same agent replaces that role.",
  parameters: assignParameters,
  execute: async ({ id, agent, role }, context) => {
    const state = context?.context;
    const ownerId = ownerOf(context);
    if (!state || ownerId === null) return "The task board isn't available in this session.";

    const board = await listTasksForUser(ownerId);
    const task = board.find((entry) => entry.id === id);
    if (!task) return `No card with id #${id} on this board.`;

    const roster = await listAgentsForUser(ownerId);
    const wanted = agent.replace(/^@/, "").toLowerCase().trim();
    const self =
      wanted === "me" || wanted === "you" || wanted === "this agent"
        ? (roster.find((entry) => entry.id === state.agentId) ?? null)
        : null;
    const match =
      self ??
      roster.find((entry) => entry.name.toLowerCase() === wanted) ??
      roster.find((entry) => entry.name.toLowerCase().startsWith(wanted)) ??
      roster.find((entry) => entry.name.toLowerCase().includes(wanted)) ??
      null;

    if (!match) {
      return roster.length === 0
        ? "This workspace has no agents yet, so nobody can be assigned."
        : `No agent called “${agent}”. The workspace has: ${roster.map((entry) => entry.name).join(", ")}.`;
    }

    const workspaceRoles = await listTaskRolesForUser(ownerId);
    const wantedRole = role.toLowerCase().trim();
    const chosenRole =
      workspaceRoles.find((entry) => entry.key === wantedRole) ??
      workspaceRoles.find((entry) => entry.label.toLowerCase() === wantedRole);

    if (!chosenRole) {
      return workspaceRoles.length === 0
        ? "This workspace has no roles yet — add one from the board's Roles dialog first."
        : `No role called “${role}”. This workspace has: ${workspaceRoles
            .map((entry) => `${entry.label} (${entry.key})`)
            .join(", ")}.`;
    }

    const people = task.assignees.map((person) => ({
      role: person.role.key,
      agentId: person.agent?.id ?? null,
      status: person.status,
    }));

    const existing = people.find((entry) => entry.role === chosenRole.key);
    if (existing) existing.agentId = match.id;
    else people.push({ role: chosenRole.key, agentId: match.id, status: "todo" });

    const updated = await setTaskAssigneesForUser(ownerId, id, people);
    if (!updated) return `No card with id #${id} on this board.`;

    const saved = updated.find((entry) => entry.id === id);
    return `Staffed card #${id}: ${chosenRole.label} is now ${match.name}. ${saved ? describe(saved) : ""}`.trim();
  },
});

const deleteParameters = z.object({
  id: z.number().int().positive().describe("Task id from list_tasks."),
});

const deleteTask = tool<typeof deleteParameters, AgentToolRunState>({
  name: "delete_task",
  description:
    "Delete one card from the board. Only when the owner asks to remove it — moving it to done is usually enough.",
  parameters: deleteParameters,
  execute: async ({ id }, context) => {
    const ownerId = ownerOf(context);
    if (ownerId === null) return "The task board isn't available in this session.";

    const board = await deleteTaskForUser(ownerId, id);
    if (!board) return `No card with id #${id} on this board.`;
    return `Deleted card #${id}.`;
  },
});

export const TASK_TOOLS: Tool<AgentToolRunState>[] = [
  listTasks,
  proposeTask,
  updateTask,
  moveTask,
  assignTaskAgent,
  deleteTask,
];

export const TASK_TOOL_LABELS: Record<string, string> = {
  list_tasks: "Reading the task board",
  propose_task: "Drafting a task card",
  update_task: "Updating a task",
  move_task: "Moving a task",
  assign_task_agent: "Staffing a task",
  delete_task: "Deleting a task",
};

export const TASK_TOOL_SUMMARIES: { name: string; summary: string }[] = [
  {
    name: "list_tasks",
    summary:
      "Read the task board: ids, titles, step, priority, due date, the agents staffed on each card and where it came from. Call it before answering what is planned or in flight.",
  },
  {
    name: "propose_task",
    summary:
      "Open an editable card in the chat, with the roles the work needs; the owner's Add to board click creates the task. Use it to turn the conversation into a task.",
  },
  {
    name: "update_task",
    summary:
      "Edit a card's title, notes, priority, due date or the built-in tools it may use (web_search, read_webpage, browser_open, browser_act, browser_extract, browser_request_login, calculate, current_time).",
  },
  {
    name: "move_task",
    summary: "Move a card between Backlog, In progress, In review and Done.",
  },
  {
    name: "assign_task_agent",
    summary: `Staff a card with one workspace agent in one role (${TASK_ROLE_OPTIONS.map(
      (option) => option.id,
    ).join(", ")}), e.g. “make Kai the reviewer” or “Bella does the design”.`,
  },
  {
    name: "delete_task",
    summary: "Delete a card, only when the owner asks to remove it.",
  },
];

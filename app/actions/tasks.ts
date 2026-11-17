"use server";

import { revalidatePath } from "next/cache";

import { getAgentForUser } from "@/lib/agents";
import { runTaskCardNowForUser } from "@/lib/task-run";
import {
  addTaskStepForUser,
  countTasksForUser,
  createTaskForUser,
  createTaskRoleForUser,
  deleteTaskForUser,
  deleteTaskRoleForUser,
  deleteTaskStepForUser,
  getTaskRunForUser,
  linkTaskScheduleForUser,
  listTaskRunsForUser,
  listTasksForUser,
  moveTaskForUser,
  setTaskAssigneesForUser,
  setTaskRoleStatusForUser,
  setTaskToolsForUser,
  updateTaskForUser,
  updateTaskRoleForUser,
  updateTaskStepForUser,
} from "@/lib/tasks";
import {
  TASKS_MAX,
  TASK_TITLE_MAX,
  isTaskPriority,
  isTaskRoleKey,
  isTaskStatus,
  type TaskRoleRecord,
  type TaskRunRecord,
  type TaskSummary,
} from "@/lib/task-types";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

export type TaskActionResult =
  | { ok: true; tasks: TaskSummary[]; /** The row just created, when there is one. */ task?: TaskSummary }
  | { ok: false; error: string };

export type TaskRoleActionResult =
  | { ok: true; roles: TaskRoleRecord[] }
  | { ok: false; error: string };

function fail(error: string): TaskActionResult {
  return { ok: false, error };
}

/** One board refresh for every mutation, so the shell count and the page agree. */
function done(tasks: TaskSummary[], task?: TaskSummary): TaskActionResult {
  revalidatePath("/dashboard/tasks");
  return task ? { ok: true, tasks, task } : { ok: true, tasks };
}

export async function createTaskAction(input: {
  title: string;
  notes?: string | null;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  /** The chat agent whose card this is, when the owner accepted a proposal. */
  sourceAgentId?: number | null;
  /** Roles the proposal suggested, all staffed by that same agent. */
  roles?: string[];
  /** Explicit roles for a manual card, each optionally staffed. */
  assignees?: { role: string; agentId?: number | null; status?: string }[];
}): Promise<TaskActionResult> {
  const title = (input.title ?? "").trim().slice(0, TASK_TITLE_MAX);
  if (!title) return fail("Give the task a name.");

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);

    if ((await countTasksForUser(profile.id)) >= TASKS_MAX) {
      return fail(`This workspace already has ${TASKS_MAX} tasks. Clear some first.`);
    }

    // A card accepted in chat keeps its origin: the agent that proposed it.
    const sourceAgent = input.sourceAgentId
      ? await getAgentForUser(profile.id, Number(input.sourceAgentId))
      : null;

    const created = await createTaskForUser(profile.id, {
      title,
      notes: input.notes ?? null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      sourceAgentId: sourceAgent?.id ?? null,
      roles: input.roles,
      assignees: input.assignees,
    });

    if (!created) return fail("We couldn't add that task. Please try again.");
    return done(await listTasksForUser(profile.id), created);
  } catch (error) {
    console.error("[tasks] create failed", error);
    return fail("We couldn't add that task. Please try again.");
  }
}

export async function moveTaskAction(input: {
  id: number;
  status: string;
  index: number;
}): Promise<TaskActionResult> {
  if (!isTaskStatus(input.status)) return fail("That column doesn't exist.");

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await moveTaskForUser(profile.id, Number(input.id), input.status, input.index);
    if (!tasks) return fail("That task could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] move failed", error);
    return fail("We couldn't move that task. Please try again.");
  }
}

export async function updateTaskAction(input: {
  id: number;
  title?: string;
  notes?: string | null;
  priority?: string;
  dueDate?: string | null;
}): Promise<TaskActionResult> {
  if (input.title !== undefined && !input.title.trim()) return fail("Give the task a name.");
  if (input.priority !== undefined && !isTaskPriority(input.priority)) {
    return fail("Pick a priority.");
  }

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);

    const tasks = await updateTaskForUser(profile.id, Number(input.id), {
      title: input.title,
      notes: input.notes,
      priority: input.priority,
      dueDate: input.dueDate,
    });

    if (!tasks) return fail("That task could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] update failed", error);
    return fail("We couldn't save that task. Please try again.");
  }
}

export async function setTaskAssigneesAction(input: {
  id: number;
  assignees: { role: string; agentId?: number | null; status?: string }[];
}): Promise<TaskActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await setTaskAssigneesForUser(
      profile.id,
      Number(input.id),
      Array.isArray(input.assignees) ? input.assignees : [],
    );
    if (!tasks) return fail("That task could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] assignees failed", error);
    return fail("We couldn't save the roles on that card. Please try again.");
  }
}

/** One role's own progress on a card — the column and the other roles stay put. */
export async function setTaskRoleStatusAction(input: {
  id: number;
  role: string;
  status: string;
}): Promise<TaskActionResult> {
  if (!isTaskRoleKey(input.role) || !isTaskStatus(input.status)) {
    return fail("That role or step doesn't exist.");
  }

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await setTaskRoleStatusForUser(
      profile.id,
      Number(input.id),
      input.role,
      input.status,
    );
    if (!tasks) return fail("That role is no longer on this card.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] role status failed", error);
    return fail("We couldn't update that role. Please try again.");
  }
}

export async function addTaskStepAction(input: {
  id: number;
  title: string;
}): Promise<TaskActionResult> {
  if (!(input.title ?? "").trim()) return fail("Give the step a name.");

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await addTaskStepForUser(profile.id, Number(input.id), input.title);
    if (!tasks) return fail("That card is full or no longer exists.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] add step failed", error);
    return fail("We couldn't add that step. Please try again.");
  }
}

export async function updateTaskStepAction(input: {
  stepId: number;
  title?: string;
  done?: boolean;
}): Promise<TaskActionResult> {
  if (input.title !== undefined && !input.title.trim()) return fail("Give the step a name.");

  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await updateTaskStepForUser(profile.id, Number(input.stepId), {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.done === undefined ? {} : { done: input.done }),
    });
    if (!tasks) return fail("That step could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] update step failed", error);
    return fail("We couldn't save that step. Please try again.");
  }
}

export async function deleteTaskStepAction(input: { stepId: number }): Promise<TaskActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await deleteTaskStepForUser(profile.id, Number(input.stepId));
    if (!tasks) return fail("That step could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] delete step failed", error);
    return fail("We couldn't delete that step. Please try again.");
  }
}

export async function setTaskToolsAction(input: {
  id: number;
  builtin: string[];
  skills: string[];
  diagrams: string[];
  plugins: string[];
  mcpServers: number[];
  apps: string[];
}): Promise<TaskActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await setTaskToolsForUser(profile.id, Number(input.id), {
      builtin: input.builtin,
      skills: input.skills,
      diagrams: input.diagrams,
      plugins: input.plugins,
      mcpServers: input.mcpServers,
      apps: input.apps,
    });
    if (!tasks) return fail("That task could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] tools failed", error);
    return fail("We couldn't save the tools on that card. Please try again.");
  }
}

/** Records the schedule the owner just created from a card. */
export async function linkTaskScheduleAction(input: {
  id: number;
  scheduleId: number;
}): Promise<TaskActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await linkTaskScheduleForUser(
      profile.id,
      Number(input.id),
      Number(input.scheduleId),
    );
    if (!tasks) return fail("That task or schedule could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] schedule link failed", error);
    return fail("The schedule was saved, but the card wasn't linked to it.");
  }
}

export async function deleteTaskAction(input: { id: number }): Promise<TaskActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const tasks = await deleteTaskForUser(profile.id, Number(input.id));
    if (!tasks) return fail("That task could not be found.");
    return done(tasks);
  } catch (error) {
    console.error("[tasks] delete failed", error);
    return fail("We couldn't delete that task. Please try again.");
  }
}

/* ------------------------------------------------------------------ roles -- */

export async function createTaskRoleAction(input: {
  label: string;
  prompt?: string;
  hint?: string;
  tone?: string;
  attachments?: { name: string; content: string }[];
}): Promise<TaskRoleActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const result = await createTaskRoleForUser(profile.id, input);
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/tasks");
    return { ok: true, roles: result.roles };
  } catch (error) {
    console.error("[tasks] create role failed", error);
    return { ok: false, error: "We couldn't save that role. Please try again." };
  }
}

export async function updateTaskRoleAction(input: {
  id: number;
  label?: string;
  prompt?: string;
  hint?: string;
  tone?: string;
  attachments?: { name: string; content: string }[];
}): Promise<TaskRoleActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const result = await updateTaskRoleForUser(profile.id, Number(input.id), input);
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/tasks");
    return { ok: true, roles: result.roles };
  } catch (error) {
    console.error("[tasks] update role failed", error);
    return { ok: false, error: "We couldn't save that role. Please try again." };
  }
}

export async function deleteTaskRoleAction(input: { id: number }): Promise<TaskRoleActionResult> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const result = await deleteTaskRoleForUser(profile.id, Number(input.id));
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/dashboard/tasks");
    return { ok: true, roles: result.roles };
  } catch (error) {
    console.error("[tasks] delete role failed", error);
    return { ok: false, error: "We couldn't delete that role. Please try again." };
  }
}

/* ---------------------------------------------------------------- running -- */

/**
 * Runs one card right now with its role's brief. No schedule needed: the turn
 * is written into the agent's transcript, and the card's tool pick is enforced.
 */
export async function runTaskNowAction(input: {
  id: number;
  role?: string | null;
}): Promise<
  | {
      ok: true;
      reply: string;
      agentName: string;
      roleLabel: string;
      browserUsed: boolean;
      /** The refreshed board, so the run history appears immediately. */
      tasks?: TaskSummary[];
    }
  | { ok: false; error: string }
> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const result = await runTaskCardNowForUser(profile.id, Number(input.id), {
      roleKey: input.role ?? null,
    });

    if (result.ok) {
      revalidatePath("/dashboard/tasks");
      return { ...result, tasks: await listTasksForUser(profile.id) };
    }

    return result;
  } catch (error) {
    console.error("[tasks] run now failed", error);
    return { ok: false, error: "The agent couldn't finish that run. Please try again." };
  }
}

/** A card's whole run history, with each full reply and its token cost. */
export async function taskRunsAction(input: {
  id: number;
}): Promise<{ ok: true; runs: TaskRunRecord[] } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    return { ok: true, runs: await listTaskRunsForUser(profile.id, Number(input.id)) };
  } catch (error) {
    console.error("[tasks] run history failed", error);
    return { ok: false, error: "We couldn't load that run history. Please try again." };
  }
}

/** One run's whole reply, loaded only when the owner expands it. */
export async function taskRunReplyAction(input: {
  runId: number;
}): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    const profile = await ensureUserRecord(user);
    const run = await getTaskRunForUser(profile.id, Number(input.runId));
    if (!run) return { ok: false, error: "That run could not be found." };
    return { ok: true, result: run.result };
  } catch (error) {
    console.error("[tasks] run reply failed", error);
    return { ok: false, error: "We couldn't load that reply. Please try again." };
  }
}

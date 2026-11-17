import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  agentSchedules,
  agents,
  db,
  taskAssignees,
  taskEvents,
  taskRoles,
  taskRuns,
  taskSteps,
  tasks,
} from "@/db";
import {
  TASK_ASSIGNEES_MAX,
  TASK_NOTES_MAX,
  TASK_ROLE_ATTACHMENTS_MAX,
  TASK_ROLE_FILE_BYTES_MAX,
  TASK_ROLE_HINT_MAX,
  TASK_ROLE_LABEL_MAX,
  TASK_ROLE_OPTIONS,
  TASK_ROLE_PROMPT_MAX,
  TASK_ROLE_STATUS_LABELS,
  TASK_ROLE_TONE_CLASSES,
  TASK_ROLES_MAX,
  TASK_STATUS_LABELS,
  TASK_STEPS_MAX,
  TASK_STEP_TITLE_MAX,
  TASK_TITLE_MAX,
  getTaskRole,
  getTaskRoleTone,
  isTaskPriority,
  isTaskRoleKey,
  isTaskStatus,
  normalizeDueDate,
  normalizeTaskTools,
  roleLabelFromKey,
  runTokenTotal,
  taskToolCount,
  type TaskActivityEntry,
  type TaskAgentRef,
  type TaskAssigneeSummary,
  type TaskPriority,
  type TaskRoleAttachment,
  type TaskRoleRecord,
  type TaskRoleTone,
  type TaskRunRecord,
  type TaskRunSummary,
  type TaskRunTrigger,
  type TaskScheduleRef,
  type TaskSource,
  type TaskStatus,
  type TaskStep,
  type TaskSummary,
  type TaskToolSelection,
} from "@/lib/task-types";

const columns = {
  id: tasks.id,
  title: tasks.title,
  notes: tasks.notes,
  status: tasks.status,
  priority: tasks.priority,
  position: tasks.position,
  dueDate: tasks.dueDate,
  source: tasks.source,
  sourceAgentId: tasks.sourceAgentId,
  tools: tasks.tools,
  scheduleId: tasks.scheduleId,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
};

type TaskRow = {
  id: number;
  title: string;
  notes: string | null;
  status: string;
  priority: string;
  position: number;
  dueDate: string | null;
  source: string;
  sourceAgentId: number | null;
  tools: TaskToolSelection | null;
  scheduleId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const agentColumns = {
  id: agents.id,
  name: agents.name,
  avatar: agents.avatar,
  color: agents.color,
};

/** Everything a card needs besides its own row: roles, people, steps, schedule. */
type TaskRelated = {
  assignees: Map<number, TaskAssigneeSummary[]>;
  steps: Map<number, TaskStep[]>;
  runs: Map<number, TaskRunSummary[]>;
  events: Map<number, TaskActivityEntry[]>;
  runCounts: Map<number, number>;
  sourceAgents: Map<number, TaskAgentRef>;
  schedules: Map<number, TaskScheduleRef>;
  roles: Map<string, TaskRoleRecord>;
};

const emptyRelated = (roles: Map<string, TaskRoleRecord> = new Map()): TaskRelated => ({
  assignees: new Map(),
  steps: new Map(),
  runs: new Map(),
  events: new Map(),
  runCounts: new Map(),
  sourceAgents: new Map(),
  schedules: new Map(),
  roles,
});

/** Stored text is narrowed here, so an old or hand-edited row still renders. */
function toSummary(row: TaskRow, related: TaskRelated): TaskSummary {
  const runs = related.runs.get(row.id) ?? [];
  // One merged timeline: role/step events written by the server, plus the runs
  // this card kept. Newest first, capped so a busy card cannot bloat the board.
  const activity: TaskActivityEntry[] = [
    ...(related.events.get(row.id) ?? []),
    ...runs.map((run): TaskActivityEntry => ({
      kind: "run",
      id: `run:${run.id}`,
      at: run.createdAt,
      run,
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);

  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: isTaskStatus(row.status) ? row.status : "todo",
    priority: isTaskPriority(row.priority) ? row.priority : "normal",
    position: row.position,
    dueDate: row.dueDate,
    source: (row.source === "agent" ? "agent" : "manual") as TaskSource,
    sourceAgent: row.sourceAgentId ? (related.sourceAgents.get(row.sourceAgentId) ?? null) : null,
    assignees: related.assignees.get(row.id) ?? [],
    steps: related.steps.get(row.id) ?? [],
    runs,
    runCount: related.runCounts.get(row.id) ?? 0,
    activity,
    tools: normalizeTaskTools(row.tools),
    schedule: row.scheduleId ? (related.schedules.get(row.scheduleId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function cleanText(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Appends one line to a card's timeline. A failed write never breaks the edit. */
async function recordTaskEvent(
  taskId: number,
  kind: "role" | "step" | "card",
  detail: string,
): Promise<void> {
  await db
    .insert(taskEvents)
    .values({ taskId, kind, detail: detail.slice(0, 200) })
    .catch((error) => console.error("[tasks] could not record activity", error));
}

function toneKeyFor(classes: string): TaskRoleTone {
  const found = (Object.keys(TASK_ROLE_TONE_CLASSES) as TaskRoleTone[]).find(
    (key) => TASK_ROLE_TONE_CLASSES[key] === classes,
  );

  return found ?? "neutral";
}

function toRoleRecord(row: {
  id: number;
  key: string;
  label: string;
  tone: string;
  prompt: string;
  hint: string;
  builtin: boolean;
  attachments: TaskRoleAttachment[] | null;
}): TaskRoleRecord {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    tone: TASK_ROLE_TONE_CLASSES[getTaskRoleTone(row.tone)],
    prompt: row.prompt,
    hint: row.hint,
    builtin: row.builtin,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

/* ------------------------------------------------------------- role store -- */

/**
 * The seed happens once, on the first board load. After that the owner's roles
 * are the truth — renaming or deleting a seeded role is not undone on reload.
 */
export async function ensureTaskRolesForUser(profileId: number): Promise<TaskRoleRecord[]> {
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(taskRoles)
    .where(eq(taskRoles.ownerId, profileId));

  if (Number(count?.total ?? 0) === 0) {
    await db
      .insert(taskRoles)
      .values(
        TASK_ROLE_OPTIONS.map((option) => ({
          ownerId: profileId,
          key: option.id,
          label: option.label,
          tone: toneKeyFor(option.tone),
          prompt: option.focus,
          hint: option.hint,
          builtin: true,
        })),
      )
      .onConflictDoNothing();
  }

  return listTaskRolesForUser(profileId);
}

export async function listTaskRolesForUser(profileId: number): Promise<TaskRoleRecord[]> {
  const rows = await db
    .select({
      id: taskRoles.id,
      key: taskRoles.key,
      label: taskRoles.label,
      tone: taskRoles.tone,
      prompt: taskRoles.prompt,
      hint: taskRoles.hint,
      builtin: taskRoles.builtin,
      attachments: taskRoles.attachments,
    })
    .from(taskRoles)
    .where(eq(taskRoles.ownerId, profileId))
    .orderBy(desc(taskRoles.builtin), asc(taskRoles.id));

  return rows.map(toRoleRecord);
}

export type TaskRoleResult =
  | { ok: true; roles: TaskRoleRecord[]; role: TaskRoleRecord }
  | { ok: false; error: string };

function cleanAttachments(value: unknown): TaskRoleAttachment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const name = typeof record.name === "string" ? cleanText(record.name, 120) : "";
      const content = typeof record.content === "string" ? record.content : "";
      if (!name || !content.trim()) return null;
      return { name, content: content.slice(0, TASK_ROLE_FILE_BYTES_MAX) };
    })
    .filter((entry): entry is TaskRoleAttachment => entry !== null)
    .slice(0, TASK_ROLE_ATTACHMENTS_MAX);
}

function roleKeyFromLabel(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "role";

  const safe = /^[a-z]/.test(base) ? base : `role-${base}`.slice(0, 38);
  if (!taken.has(safe)) return safe;

  for (let n = 2; n < 40; n += 1) {
    const next = `${safe}-${n}`.slice(0, 38);
    if (!taken.has(next)) return next;
  }

  return `${safe.slice(0, 34)}-${Date.now().toString(36).slice(-3)}`;
}

export async function createTaskRoleForUser(
  profileId: number,
  input: {
    label: unknown;
    prompt?: unknown;
    hint?: unknown;
    tone?: unknown;
    attachments?: unknown;
  },
): Promise<TaskRoleResult> {
  const roles = await listTaskRolesForUser(profileId);
  if (roles.length >= TASK_ROLES_MAX) {
    return { ok: false, error: `This workspace already has ${TASK_ROLES_MAX} roles.` };
  }

  const label = typeof input.label === "string" ? cleanText(input.label, TASK_ROLE_LABEL_MAX) : "";
  if (!label) return { ok: false, error: "Give the role a name." };

  const key = roleKeyFromLabel(label, new Set(roles.map((role) => role.key)));

  const [row] = await db
    .insert(taskRoles)
    .values({
      ownerId: profileId,
      key,
      label,
      tone: getTaskRoleTone(input.tone) === "neutral" ? "brand" : getTaskRoleTone(input.tone),
      prompt:
        typeof input.prompt === "string" ? input.prompt.trim().slice(0, TASK_ROLE_PROMPT_MAX) : "",
      hint: typeof input.hint === "string" ? cleanText(input.hint, TASK_ROLE_HINT_MAX) : "",
      builtin: false,
      attachments: cleanAttachments(input.attachments),
    })
    .returning({
      id: taskRoles.id,
      key: taskRoles.key,
      label: taskRoles.label,
      tone: taskRoles.tone,
      prompt: taskRoles.prompt,
      hint: taskRoles.hint,
      builtin: taskRoles.builtin,
      attachments: taskRoles.attachments,
    });

  if (!row) return { ok: false, error: "We couldn't save that role. Please try again." };

  return {
    ok: true,
    role: toRoleRecord(row),
    roles: await listTaskRolesForUser(profileId),
  };
}

export async function updateTaskRoleForUser(
  profileId: number,
  roleId: number,
  patch: {
    label?: unknown;
    prompt?: unknown;
    hint?: unknown;
    tone?: unknown;
    attachments?: unknown;
  },
): Promise<TaskRoleResult> {
  if (!Number.isInteger(roleId)) return { ok: false, error: "That role could not be found." };

  const values: Partial<{
    label: string;
    prompt: string;
    hint: string;
    tone: TaskRoleTone;
    attachments: TaskRoleAttachment[];
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (patch.label !== undefined) {
    const label =
      typeof patch.label === "string" ? cleanText(patch.label, TASK_ROLE_LABEL_MAX) : "";
    if (!label) return { ok: false, error: "Give the role a name." };
    values.label = label;
  }
  if (patch.prompt !== undefined) {
    values.prompt =
      typeof patch.prompt === "string" ? patch.prompt.trim().slice(0, TASK_ROLE_PROMPT_MAX) : "";
  }
  if (patch.hint !== undefined) {
    values.hint = typeof patch.hint === "string" ? cleanText(patch.hint, TASK_ROLE_HINT_MAX) : "";
  }
  if (patch.tone !== undefined) values.tone = getTaskRoleTone(patch.tone);
  if (patch.attachments !== undefined) values.attachments = cleanAttachments(patch.attachments);

  const [row] = await db
    .update(taskRoles)
    .set(values)
    .where(and(eq(taskRoles.id, roleId), eq(taskRoles.ownerId, profileId)))
    .returning({
      id: taskRoles.id,
      key: taskRoles.key,
      label: taskRoles.label,
      tone: taskRoles.tone,
      prompt: taskRoles.prompt,
      hint: taskRoles.hint,
      builtin: taskRoles.builtin,
      attachments: taskRoles.attachments,
    });

  if (!row) return { ok: false, error: "That role could not be found." };

  return {
    ok: true,
    role: toRoleRecord(row),
    roles: await listTaskRolesForUser(profileId),
  };
}

/**
 * Deleting a role takes it off every card in this workspace (the cards stay),
 * so a typo never leaves a role nobody can see or staff.
 */
export async function deleteTaskRoleForUser(
  profileId: number,
  roleId: number,
): Promise<{ ok: true; roles: TaskRoleRecord[] } | { ok: false; error: string }> {
  if (!Number.isInteger(roleId)) return { ok: false, error: "That role could not be found." };

  const [role] = await db
    .select({ id: taskRoles.id, key: taskRoles.key })
    .from(taskRoles)
    .where(and(eq(taskRoles.id, roleId), eq(taskRoles.ownerId, profileId)))
    .limit(1);

  if (!role) return { ok: false, error: "That role could not be found." };

  const ownedTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.ownerId, profileId));

  await db
    .delete(taskAssignees)
    .where(and(eq(taskAssignees.role, role.key), inArray(taskAssignees.taskId, ownedTaskIds)));

  await db.delete(taskRoles).where(and(eq(taskRoles.id, roleId), eq(taskRoles.ownerId, profileId)));

  return { ok: true, roles: await listTaskRolesForUser(profileId) };
}

/* ---------------------------------------------------------------- reading -- */

/** One owner-scoped query per relation, then maps the summaries read. */
async function relatedFor(
  profileId: number,
  rows: TaskRow[],
  roles: Map<string, TaskRoleRecord>,
): Promise<TaskRelated> {
  const related = emptyRelated(roles);
  if (rows.length === 0) return related;

  const taskIds = rows.map((row) => row.id);
  const agentIds = [
    ...new Set(
      rows
        .map((row) => row.sourceAgentId)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];
  const scheduleIds = [
    ...new Set(
      rows
        .map((row) => row.scheduleId)
        .filter((id): id is number => typeof id === "number" && id > 0),
    ),
  ];

  // A role can be open: left join, so a card that asks for a designer before
  // anyone is on it still shows the role. A foreign agent never resolves.
  const people = await db
    .select({
      taskId: taskAssignees.taskId,
      role: taskAssignees.role,
      status: taskAssignees.status,
      agentId: agents.id,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
    })
    .from(taskAssignees)
    .leftJoin(
      agents,
      and(eq(agents.id, taskAssignees.agentId), eq(agents.ownerId, profileId)),
    )
    .where(inArray(taskAssignees.taskId, taskIds))
    .orderBy(asc(taskAssignees.id));

  for (const person of people) {
    const list = related.assignees.get(person.taskId) ?? [];
    const stored = related.roles.get(person.role);

    list.push({
      role: stored
        ? {
            key: stored.key,
            label: stored.label,
            tone: stored.tone,
            prompt: stored.prompt,
            hint: stored.hint,
            builtin: stored.builtin,
          }
        : getTaskRole(person.role),
      agent:
        person.agentId && person.agentName
          ? {
              id: person.agentId,
              name: person.agentName,
              avatar: person.agentAvatar ?? "circle:happy",
              color: person.agentColor ?? "blue",
            }
          : null,
      status: isTaskStatus(person.status) ? person.status : "todo",
    });
    related.assignees.set(person.taskId, list);
  }

  const steps = await db
    .select({
      id: taskSteps.id,
      taskId: taskSteps.taskId,
      title: taskSteps.title,
      done: taskSteps.done,
    })
    .from(taskSteps)
    .where(inArray(taskSteps.taskId, taskIds))
    .orderBy(asc(taskSteps.position), asc(taskSteps.id));

  for (const step of steps) {
    const list = related.steps.get(step.taskId) ?? [];
    list.push({ id: step.id, title: step.title, done: step.done });
    related.steps.set(step.taskId, list);
  }

  // Timeline events are plain lines written when a role or step changes; runs
  // are merged in `toSummary`, not stored twice.
  const events = await db
    .select({
      id: taskEvents.id,
      taskId: taskEvents.taskId,
      kind: taskEvents.kind,
      detail: taskEvents.detail,
      createdAt: taskEvents.createdAt,
    })
    .from(taskEvents)
    .where(inArray(taskEvents.taskId, taskIds))
    .orderBy(desc(taskEvents.id))
    .limit(250);

  for (const event of events) {
    const list = related.events.get(event.taskId) ?? [];
    if (list.length >= 10) continue;

    list.push({
      kind: event.kind === "role" ? "role" : event.kind === "card" ? "card" : "step",
      id: `event:${event.id}`,
      detail: event.detail,
      at: event.createdAt.toISOString(),
    });
    related.events.set(event.taskId, list);
  }

  // Run history is capped on the card face: newest three per card, plus a
  // total, so a long-running card cannot bloat the board payload.
  const runs = await db
    .select({
      id: taskRuns.id,
      taskId: taskRuns.taskId,
      role: taskRuns.role,
      trigger: taskRuns.trigger,
      status: taskRuns.status,
      reply: taskRuns.reply,
      browserUsed: taskRuns.browserUsed,
      promptTokens: taskRuns.promptTokens,
      completionTokens: taskRuns.completionTokens,
      recalled: taskRuns.recalled,
      createdAt: taskRuns.createdAt,
      agentId: agents.id,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
    })
    .from(taskRuns)
    .leftJoin(
      agents,
      and(eq(agents.id, taskRuns.agentId), eq(agents.ownerId, profileId)),
    )
    .where(inArray(taskRuns.taskId, taskIds))
    .orderBy(desc(taskRuns.id))
    .limit(120);

  for (const run of runs) {
    const list = related.runs.get(run.taskId) ?? [];
    if (list.length >= 3) continue;

    const stored = related.roles.get(run.role);
    list.push({
      id: run.id,
      roleKey: run.role,
      roleLabel: stored?.label ?? getTaskRole(run.role).label,
      agent:
        run.agentId && run.agentName
          ? {
              id: run.agentId,
              name: run.agentName,
              avatar: run.agentAvatar ?? "circle:happy",
              color: run.agentColor ?? "blue",
            }
          : null,
      trigger: (run.trigger === "schedule" ? "schedule" : "manual") as TaskRunTrigger,
      status: run.status === "error" ? "error" : "ok",
      reply: run.reply ?? "",
      browserUsed: run.browserUsed,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      recalled: run.recalled ?? [],
      createdAt: run.createdAt.toISOString(),
    });
    related.runs.set(run.taskId, list);
  }

  const counts = await db
    .select({ taskId: taskRuns.taskId, total: sql<number>`count(*)` })
    .from(taskRuns)
    .where(inArray(taskRuns.taskId, taskIds))
    .groupBy(taskRuns.taskId);

  for (const row of counts) related.runCounts.set(row.taskId, Number(row.total));

  if (agentIds.length > 0) {
    const found = await db
      .select(agentColumns)
      .from(agents)
      .where(and(eq(agents.ownerId, profileId), inArray(agents.id, agentIds)));

    for (const agent of found) related.sourceAgents.set(agent.id, agent);
  }

  if (scheduleIds.length > 0) {
    const found = await db
      .select({
        id: agentSchedules.id,
        title: agentSchedules.title,
        agentId: agentSchedules.agentId,
        nextRunAt: agentSchedules.nextRunAt,
      })
      .from(agentSchedules)
      .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
      .where(and(eq(agents.ownerId, profileId), inArray(agentSchedules.id, scheduleIds)));

    for (const schedule of found) {
      related.schedules.set(schedule.id, {
        id: schedule.id,
        title: schedule.title,
        agentId: schedule.agentId,
        nextRunAt: schedule.nextRunAt ? schedule.nextRunAt.toISOString() : null,
      });
    }
  }

  return related;
}

async function roleMapFor(profileId: number): Promise<Map<string, TaskRoleRecord>> {
  const roles = await listTaskRolesForUser(profileId);
  return new Map(roles.map((role) => [role.key, role]));
}

/** Every card on this owner's board, in column order then position. */
export async function listTasksForUser(profileId: number): Promise<TaskSummary[]> {
  const rows = await db
    .select(columns)
    .from(tasks)
    .where(eq(tasks.ownerId, profileId))
    .orderBy(asc(tasks.status), asc(tasks.position), asc(tasks.id));

  const related = await relatedFor(profileId, rows, await roleMapFor(profileId));
  return rows.map((row) => toSummary(row, related));
}

/**
 * The tools picked on the card that owns a schedule, so a scheduled run honours
 * the same list the owner sees on the board. Null means "no card, no limit".
 */
export async function taskToolsForSchedule(
  scheduleId: number,
): Promise<TaskToolSelection | null> {
  if (!Number.isInteger(scheduleId)) return null;

  const [row] = await db
    .select({ tools: tasks.tools })
    .from(tasks)
    .where(eq(tasks.scheduleId, scheduleId))
    .limit(1);

  const tools = normalizeTaskTools(row?.tools);
  return taskToolCount(tools) > 0 ? tools : null;
}

/**
 * One run against a card, so the board can show what each role has actually
 * produced. The card must belong to this owner; anything else is a no-op.
 */
export async function recordTaskRunForUser(
  profileId: number,
  input: {
    taskId: number;
    agentId?: number | null;
    role?: string | null;
    trigger: TaskRunTrigger;
    status: "ok" | "error";
    reply?: string | null;
    result?: string | null;
    browserUsed?: boolean;
    durationMs?: number | null;
    promptTokens?: number | null;
    completionTokens?: number | null;
    /** Notes `recall_memory` returned; kept so the card can show them. */
    recalled?: { id: number; content: string }[] | null;
  },
): Promise<void> {
  if (!Number.isInteger(input.taskId)) return;

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, input.taskId), eq(tasks.ownerId, profileId)))
    .limit(1);

  if (!task) return;

  await db.insert(taskRuns).values({
    taskId: task.id,
    agentId: Number.isInteger(input.agentId) ? Number(input.agentId) : null,
    role: typeof input.role === "string" ? input.role.slice(0, 40) : "",
    trigger: input.trigger === "schedule" ? "schedule" : "manual",
    status: input.status === "error" ? "error" : "ok",
    reply: input.reply ? input.reply.slice(0, 400) : null,
    result: input.result ? input.result.slice(0, 12_000) : null,
    browserUsed: Boolean(input.browserUsed),
    durationMs: Number.isInteger(input.durationMs) ? Number(input.durationMs) : null,
    promptTokens: Number.isInteger(input.promptTokens) ? Number(input.promptTokens) : null,
    completionTokens: Number.isInteger(input.completionTokens)
      ? Number(input.completionTokens)
      : null,
    recalled:
      Array.isArray(input.recalled) && input.recalled.length > 0
        ? input.recalled.map((note) => ({ id: note.id, content: note.content.slice(0, 400) }))
        : null,
  });
}

/** The card's whole run history, newest first, with each full reply. */
export async function listTaskRunsForUser(
  profileId: number,
  taskId: number,
  limit = 50,
): Promise<TaskRunRecord[]> {
  if (!Number.isInteger(taskId)) return [];

  const rows = await db
    .select({
      id: taskRuns.id,
      role: taskRuns.role,
      trigger: taskRuns.trigger,
      status: taskRuns.status,
      reply: taskRuns.reply,
      result: taskRuns.result,
      browserUsed: taskRuns.browserUsed,
      promptTokens: taskRuns.promptTokens,
      completionTokens: taskRuns.completionTokens,
      recalled: taskRuns.recalled,
      createdAt: taskRuns.createdAt,
      agentId: agents.id,
      agentName: agents.name,
      agentAvatar: agents.avatar,
      agentColor: agents.color,
    })
    .from(taskRuns)
    .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
    .leftJoin(
      agents,
      and(eq(agents.id, taskRuns.agentId), eq(agents.ownerId, profileId)),
    )
    .where(and(eq(taskRuns.taskId, taskId), eq(tasks.ownerId, profileId)))
    .orderBy(desc(taskRuns.id))
    .limit(Math.max(1, Math.min(100, limit)));

  const labels = new Map(
    (await listTaskRolesForUser(profileId)).map((role) => [role.key, role.label]),
  );

  return rows.map((run) => ({
    id: run.id,
    roleKey: run.role,
    roleLabel: labels.get(run.role) ?? getTaskRole(run.role).label,
    agent:
      run.agentId && run.agentName
        ? {
            id: run.agentId,
            name: run.agentName,
            avatar: run.agentAvatar ?? "circle:happy",
            color: run.agentColor ?? "blue",
          }
        : null,
    trigger: (run.trigger === "schedule" ? "schedule" : "manual") as TaskRunTrigger,
    status: run.status === "error" ? "error" : "ok",
    reply: run.reply ?? "",
    browserUsed: run.browserUsed,
    promptTokens: run.promptTokens,
    completionTokens: run.completionTokens,
    recalled: run.recalled ?? [],
    createdAt: run.createdAt.toISOString(),
    result: run.result ?? run.reply ?? "",
  }));
}

/** One run's whole reply, for the timeline's expansion. Owner-scoped. */
export async function getTaskRunForUser(
  profileId: number,
  runId: number,
): Promise<{ id: number; result: string } | null> {
  if (!Number.isInteger(runId)) return null;

  const [row] = await db
    .select({ id: taskRuns.id, result: taskRuns.result, reply: taskRuns.reply })
    .from(taskRuns)
    .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
    .where(and(eq(taskRuns.id, runId), eq(tasks.ownerId, profileId)))
    .limit(1);

  if (!row) return null;
  return { id: row.id, result: row.result ?? row.reply ?? "" };
}

/** One timeline line across every card, for the workspace-wide feed. */
export type WorkspaceTaskActivity =
  | {
      kind: "role" | "step" | "card";
      id: string;
      taskId: number;
      taskTitle: string;
      detail: string;
      at: string;
    }
  | {
      kind: "run";
      id: string;
      taskId: number;
      taskTitle: string;
      at: string;
      roleLabel: string;
      status: "ok" | "error";
      trigger: TaskRunTrigger;
      agentName: string | null;
      reply: string;
      tokens: number | null;
    };

/**
 * Everything that happened across this owner's cards, newest first: the role,
 * step and move lines from `task_events`, merged with the newest runs from
 * `task_runs`. Both sides stop at the same limit, so the feed stays a real
 * mixture instead of one busy card crowding out every other.
 */
export async function listTaskActivityForUser(
  profileId: number,
  limit = 20,
): Promise<WorkspaceTaskActivity[]> {
  const take = Math.max(1, Math.min(50, limit));

  const [events, runs, roles] = await Promise.all([
    db
      .select({
        id: taskEvents.id,
        taskId: taskEvents.taskId,
        taskTitle: tasks.title,
        kind: taskEvents.kind,
        detail: taskEvents.detail,
        createdAt: taskEvents.createdAt,
      })
      .from(taskEvents)
      .innerJoin(tasks, eq(tasks.id, taskEvents.taskId))
      .where(eq(tasks.ownerId, profileId))
      .orderBy(desc(taskEvents.id))
      .limit(take),
    db
      .select({
        id: taskRuns.id,
        taskId: taskRuns.taskId,
        taskTitle: tasks.title,
        role: taskRuns.role,
        trigger: taskRuns.trigger,
        status: taskRuns.status,
        reply: taskRuns.reply,
        promptTokens: taskRuns.promptTokens,
        completionTokens: taskRuns.completionTokens,
        createdAt: taskRuns.createdAt,
        agentName: agents.name,
      })
      .from(taskRuns)
      .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
      .leftJoin(agents, and(eq(agents.id, taskRuns.agentId), eq(agents.ownerId, profileId)))
      .where(eq(tasks.ownerId, profileId))
      .orderBy(desc(taskRuns.id))
      .limit(take),
    listTaskRolesForUser(profileId),
  ]);

  const labels = new Map(roles.map((role) => [role.key, role.label]));

  const merged: WorkspaceTaskActivity[] = [
    ...events.map(
      (row): WorkspaceTaskActivity => ({
        kind: row.kind === "role" ? "role" : row.kind === "card" ? "card" : "step",
        id: `event:${row.id}`,
        taskId: row.taskId,
        taskTitle: row.taskTitle,
        detail: row.detail,
        at: row.createdAt.toISOString(),
      }),
    ),
    ...runs.map(
      (run): WorkspaceTaskActivity => ({
        kind: "run",
        id: `run:${run.id}`,
        taskId: run.taskId,
        taskTitle: run.taskTitle,
        at: run.createdAt.toISOString(),
        roleLabel: labels.get(run.role) ?? getTaskRole(run.role).label,
        status: run.status === "error" ? "error" : "ok",
        trigger: run.trigger === "schedule" ? "schedule" : "manual",
        agentName: run.agentName ?? null,
        reply: run.reply ?? "",
        tokens: runTokenTotal({
          promptTokens: run.promptTokens,
          completionTokens: run.completionTokens,
        }),
      }),
    ),
  ];

  return merged.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, take);
}

/**
 * The card behind a schedule, plus the role that schedule's agent holds on it.
 * Used so a scheduled run lands in that card's history.
 */
export async function taskCardForSchedule(
  scheduleId: number,
  agentId: number,
): Promise<{ taskId: number; role: string } | null> {
  if (!Number.isInteger(scheduleId)) return null;

  const [row] = await db
    .select({ taskId: tasks.id })
    .from(tasks)
    .where(eq(tasks.scheduleId, scheduleId))
    .limit(1);

  if (!row) return null;

  const people = await db
    .select({ role: taskAssignees.role, agentId: taskAssignees.agentId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, row.taskId))
    .orderBy(asc(taskAssignees.id));

  const mine = people.find((person) => person.agentId === agentId) ?? people[0];
  return { taskId: row.taskId, role: mine?.role ?? "" };
}

export async function countTasksForUser(profileId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.ownerId, profileId));

  return Number(row?.total ?? 0);
}

/* --------------------------------------------------------------- creating -- */

export type TaskAssigneeInput = {
  role?: unknown;
  agentId?: unknown;
  status?: unknown;
};

export type NewTaskInput = {
  title: string;
  notes?: string | null;
  status?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  /** Set by the chat card: the agent whose conversation proposed the card. */
  sourceAgentId?: number | null;
  /** Role keys to staff, all with `sourceAgentId` (the proposing agent). */
  roles?: unknown[];
  /** Explicit roles for a manual card, each optionally staffed. */
  assignees?: TaskAssigneeInput[];
  /** Picked skills / plugins / MCP servers / apps for the run. */
  tools?: unknown;
};

/** The agents this owner actually has, so a foreign id is never stored. */
async function ownedAgents(profileId: number): Promise<Set<number>> {
  const rows = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.ownerId, profileId));

  return new Set(rows.map((row) => row.id));
}

/**
 * Drops unknown roles and agents, dedupes by role and caps the list. A role
 * with no agent (or an agent from another workspace) stays open. Roles are the
 * workspace's own, so a key that no longer exists is dropped.
 */
function normalizeAssignees(
  raw: TaskAssigneeInput[],
  owned: Set<number>,
  validRoles: Set<string>,
): { role: string; agentId: number | null; status: TaskStatus }[] {
  const seen = new Set<string>();
  const result: { role: string; agentId: number | null; status: TaskStatus }[] = [];

  for (const entry of raw) {
    const role = typeof entry.role === "string" ? entry.role.trim() : "";
    if (!isTaskRoleKey(role) || !validRoles.has(role) || seen.has(role)) continue;

    const agentId = Number(entry.agentId);
    seen.add(role);
    result.push({
      role,
      agentId: Number.isInteger(agentId) && owned.has(agentId) ? agentId : null,
      status: isTaskStatus(entry.status) ? entry.status : "todo",
    });
    if (result.length >= TASK_ASSIGNEES_MAX) break;
  }

  return result;
}

async function validRolesFor(profileId: number): Promise<Set<string>> {
  // Seed the built-in roles on the first card even if the board was never
  // opened — a task created from chat must still be staffable by its agent.
  const roles = await ensureTaskRolesForUser(profileId);
  return new Set(roles.map((role) => role.key));
}

/** Adds a card to the bottom of its column and returns it. */
export async function createTaskForUser(
  profileId: number,
  input: NewTaskInput,
): Promise<TaskSummary | null> {
  const title = cleanText(input.title ?? "", TASK_TITLE_MAX);
  if (!title) return null;

  const status: TaskStatus = isTaskStatus(input.status) ? input.status : "todo";
  const priority: TaskPriority = isTaskPriority(input.priority) ? input.priority : "normal";
  const notes = input.notes ? input.notes.trim().slice(0, TASK_NOTES_MAX) || null : null;

  const owned = await ownedAgents(profileId);
  const sourceAgentId =
    input.sourceAgentId && owned.has(Number(input.sourceAgentId))
      ? Number(input.sourceAgentId)
      : null;

  const validRoles = await validRolesFor(profileId);
  const requested: TaskAssigneeInput[] = [
    ...(input.assignees ?? []),
    ...(sourceAgentId
      ? (input.roles ?? [])
          .map((role) => (typeof role === "string" ? role : ""))
          .filter((role) => validRoles.has(role))
          .map((role) => ({ agentId: sourceAgentId, role }))
      : []),
  ];
  const assignees = normalizeAssignees(requested, owned, validRoles);

  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${tasks.position}), -1)` })
    .from(tasks)
    .where(and(eq(tasks.ownerId, profileId), eq(tasks.status, status)));

  const [row] = await db
    .insert(tasks)
    .values({
      ownerId: profileId,
      title,
      notes,
      status,
      priority,
      position: Number(last?.position ?? -1) + 1,
      dueDate: normalizeDueDate(input.dueDate),
      source: sourceAgentId ? "agent" : "manual",
      sourceAgentId,
      tools: normalizeTaskTools(input.tools),
    })
    .returning(columns);

  if (!row) return null;

  if (assignees.length > 0) {
    await db.insert(taskAssignees).values(
      assignees.map((entry) => ({
        taskId: row.id,
        agentId: entry.agentId,
        role: entry.role,
        status: entry.status,
      })),
    );
  }

  await recordTaskEvent(
    row.id,
    "card",
    sourceAgentId ? "Created from a chat card" : "Created on the board",
  );

  if (assignees.length > 0) {
    const labels = new Map(
      (await listTaskRolesForUser(profileId)).map((role) => [role.key, role.label]),
    );
    for (const entry of assignees) {
      await recordTaskEvent(
        row.id,
        "role",
        `Added ${labels.get(entry.role) ?? getTaskRole(entry.role).label}`,
      );
    }
  }

  const board = await listTasksForUser(profileId);
  return board.find((task) => task.id === row.id) ?? null;
}

/* ---------------------------------------------------------------- moving -- */

/**
 * Moves one card to `status` at `index` and re-indexes both the column it left
 * and the one it entered, so positions stay 0..n-1 with no holes. Returning the
 * whole board keeps the client and the database in the same order.
 */
export async function moveTaskForUser(
  profileId: number,
  taskId: number,
  status: unknown,
  index: unknown,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId) || !isTaskStatus(status)) return null;

  const board = await listTasksForUser(profileId);
  const task = board.find((entry) => entry.id === taskId);
  if (!task) return null;

  const from = task.status;
  const target = board.filter((entry) => entry.status === status && entry.id !== taskId);
  const at = Math.max(
    0,
    Math.min(Number.isInteger(index) ? Number(index) : target.length, target.length),
  );
  const reordered: TaskSummary[] = [
    ...target.slice(0, at),
    { ...task, status },
    ...target.slice(at),
  ];

  const leaving =
    from === status ? [] : board.filter((entry) => entry.status === from && entry.id !== taskId);

  await db.transaction(async (tx) => {
    if (from !== status) {
      await tx
        .update(tasks)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)));
    }

    const reindex = async (column: TaskSummary[]) => {
      for (const [position, entry] of column.entries()) {
        if (entry.position === position) continue;

        await tx
          .update(tasks)
          .set({ position })
          .where(and(eq(tasks.id, entry.id), eq(tasks.ownerId, profileId)));
      }
    };

    await reindex(leaving);
    await reindex(reordered);
  });

  if (from !== status) {
    await recordTaskEvent(taskId, "card", `Moved to ${TASK_STATUS_LABELS[status]}`);
  }

  return listTasksForUser(profileId);
}

/* ---------------------------------------------------------------- editing -- */

export type TaskPatch = {
  title?: string;
  notes?: string | null;
  priority?: unknown;
  dueDate?: unknown;
};

/** Edits the card's own fields. Moving between columns goes through moveTaskForUser. */
export async function updateTaskForUser(
  profileId: number,
  taskId: number,
  patch: TaskPatch,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId)) return null;

  const values: Partial<{
    title: string;
    notes: string | null;
    priority: TaskPriority;
    dueDate: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (patch.title !== undefined) {
    const title = cleanText(patch.title, TASK_TITLE_MAX);
    if (!title) return null;
    values.title = title;
  }
  if (patch.notes !== undefined) {
    values.notes = patch.notes ? patch.notes.trim().slice(0, TASK_NOTES_MAX) || null : null;
  }
  if (patch.priority !== undefined) {
    values.priority = isTaskPriority(patch.priority) ? patch.priority : "normal";
  }
  if (patch.dueDate !== undefined) {
    values.dueDate = normalizeDueDate(patch.dueDate);
  }

  const rows = await db
    .update(tasks)
    .set(values)
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .returning({ id: tasks.id });

  if (rows.length === 0) return null;
  return listTasksForUser(profileId);
}

/**
 * Replaces the roles on one card. Every agent must belong to the owner, so an
 * id from another workspace matches nothing and is dropped. Each role keeps its
 * own progress; a role with no agent is still a role on the card.
 */
export async function setTaskAssigneesForUser(
  profileId: number,
  taskId: number,
  assignees: TaskAssigneeInput[],
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId)) return null;

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .limit(1);

  if (!task) return null;

  const owned = await ownedAgents(profileId);
  const roleRecords = await listTaskRolesForUser(profileId);
  const roleLabels = new Map(roleRecords.map((role) => [role.key, role.label]));
  const people = normalizeAssignees(assignees, owned, new Set(roleLabels.keys()));

  // Who was on the card before, so the timeline can say what actually moved.
  const before = await db
    .select({
      role: taskAssignees.role,
      agentId: taskAssignees.agentId,
      agentName: agents.name,
    })
    .from(taskAssignees)
    .leftJoin(
      agents,
      and(eq(agents.id, taskAssignees.agentId), eq(agents.ownerId, profileId)),
    )
    .where(eq(taskAssignees.taskId, taskId));

  await db.transaction(async (tx) => {
    await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));

    if (people.length > 0) {
      await tx.insert(taskAssignees).values(
        people.map((entry) => ({
          taskId,
          agentId: entry.agentId,
          role: entry.role,
          status: entry.status,
        })),
      );
    }

    await tx
      .update(tasks)
      .set({ updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)));
  });

  const beforeByRole = new Map(before.map((person) => [person.role, person]));
  const afterRoles = new Set(people.map((person) => person.role));
  const newAgentIds = people
    .filter(
      (person) => person.agentId && beforeByRole.get(person.role)?.agentId !== person.agentId,
    )
    .map((person) => person.agentId as number);

  const agentNames = new Map<number, string>();
  if (newAgentIds.length > 0) {
    const found = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(eq(agents.ownerId, profileId), inArray(agents.id, newAgentIds)));
    for (const agent of found) agentNames.set(agent.id, agent.name);
  }

  const events: string[] = [];
  for (const person of people) {
    const label = roleLabels.get(person.role) ?? getTaskRole(person.role).label;
    const prior = beforeByRole.get(person.role);

    if (!prior) events.push(`Added ${label}`);
    else if ((prior.agentId ?? null) !== (person.agentId ?? null)) {
      events.push(
        person.agentId
          ? `Assigned ${agentNames.get(person.agentId) ?? "an agent"} to ${label}`
          : `Unassigned ${label}`,
      );
    }
  }

  for (const prior of before) {
    if (afterRoles.has(prior.role)) continue;
    events.push(`Removed ${roleLabels.get(prior.role) ?? getTaskRole(prior.role).label}`);
  }

  for (const detail of events) await recordTaskEvent(taskId, "role", detail);

  return listTasksForUser(profileId);
}

/** One role's own progress, without touching the other roles or the column. */
export async function setTaskRoleStatusForUser(
  profileId: number,
  taskId: number,
  role: string,
  status: unknown,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId) || !isTaskRoleKey(role) || !isTaskStatus(status)) return null;

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .limit(1);

  if (!task) return null;

  const rows = await db
    .update(taskAssignees)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.role, role)))
    .returning({ id: taskAssignees.id });

  if (rows.length === 0) return null;

  const stored = (await listTaskRolesForUser(profileId)).find((entry) => entry.key === role);
  await recordTaskEvent(
    taskId,
    "role",
    `${stored?.label ?? getTaskRole(role).label} → ${TASK_ROLE_STATUS_LABELS[status]}`,
  );

  return listTasksForUser(profileId);
}

/** Adds one progress step to the bottom of the card's list. */
export async function addTaskStepForUser(
  profileId: number,
  taskId: number,
  title: unknown,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId)) return null;
  const clean = typeof title === "string" ? cleanText(title, TASK_STEP_TITLE_MAX) : "";
  if (!clean) return null;

  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .limit(1);

  if (!task) return null;

  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(taskSteps)
    .where(eq(taskSteps.taskId, taskId));

  if (Number(count?.total ?? 0) >= TASK_STEPS_MAX) return null;

  await db.insert(taskSteps).values({
    taskId,
    title: clean,
    position: Number(count?.total ?? 0),
  });

  await recordTaskEvent(taskId, "step", `Added step “${clean}”`);

  await db
    .update(tasks)
    .set({ updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)));

  return listTasksForUser(profileId);
}

/** Edits a step's words or ticks it off. Owner-scoped through the card. */
export async function updateTaskStepForUser(
  profileId: number,
  stepId: number,
  patch: { title?: unknown; done?: unknown },
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(stepId)) return null;

  const ownedTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.ownerId, profileId));

  const [existing] = await db
    .select({ taskId: taskSteps.taskId, title: taskSteps.title, done: taskSteps.done })
    .from(taskSteps)
    .where(and(eq(taskSteps.id, stepId), inArray(taskSteps.taskId, ownedTaskIds)))
    .limit(1);

  if (!existing) return null;

  const values: Partial<{ title: string; done: boolean; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  if (patch.title !== undefined) {
    const title = typeof patch.title === "string" ? cleanText(patch.title, TASK_STEP_TITLE_MAX) : "";
    if (!title) return null;
    values.title = title;
  }
  if (patch.done !== undefined) values.done = Boolean(patch.done);

  await db
    .update(taskSteps)
    .set(values)
    .where(and(eq(taskSteps.id, stepId), inArray(taskSteps.taskId, ownedTaskIds)));

  if (values.title !== undefined && values.title !== existing.title) {
    await recordTaskEvent(
      existing.taskId,
      "step",
      `Renamed step “${existing.title}” → “${values.title}”`,
    );
  }

  if (values.done !== undefined && values.done !== existing.done) {
    await recordTaskEvent(
      existing.taskId,
      "step",
      `${values.done ? "Ticked" : "Reopened"} “${values.title ?? existing.title}”`,
    );
  }

  return listTasksForUser(profileId);
}

export async function deleteTaskStepForUser(
  profileId: number,
  stepId: number,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(stepId)) return null;

  const ownedTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.ownerId, profileId));

  const [existing] = await db
    .select({ taskId: taskSteps.taskId, title: taskSteps.title })
    .from(taskSteps)
    .where(and(eq(taskSteps.id, stepId), inArray(taskSteps.taskId, ownedTaskIds)))
    .limit(1);

  if (!existing) return null;

  await db.delete(taskSteps).where(eq(taskSteps.id, stepId));
  await recordTaskEvent(existing.taskId, "step", `Deleted “${existing.title}”`);

  return listTasksForUser(profileId);
}

/** Replaces the tools the owner picked for this card. */
export async function setTaskToolsForUser(
  profileId: number,
  taskId: number,
  tools: unknown,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId)) return null;

  const rows = await db
    .update(tasks)
    .set({ tools: normalizeTaskTools(tools), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .returning({ id: tasks.id });

  if (rows.length === 0) return null;
  return listTasksForUser(profileId);
}

/* -------------------------------------------------------------- scheduling -- */

/**
 * Links the agent schedule created from a card, so the board can show that the
 * card runs on its own. Both rows must belong to the owner.
 */
export async function linkTaskScheduleForUser(
  profileId: number,
  taskId: number,
  scheduleId: number,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId) || !Number.isInteger(scheduleId)) return null;

  const [schedule] = await db
    .select({ id: agentSchedules.id })
    .from(agentSchedules)
    .innerJoin(agents, eq(agents.id, agentSchedules.agentId))
    .where(and(eq(agentSchedules.id, scheduleId), eq(agents.ownerId, profileId)))
    .limit(1);

  if (!schedule) return null;

  const rows = await db
    .update(tasks)
    .set({ scheduleId, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)))
    .returning({ id: tasks.id });

  if (rows.length === 0) return null;
  return listTasksForUser(profileId);
}

/** Owner-scoped delete, then the column closes the gap the card left. */
export async function deleteTaskForUser(
  profileId: number,
  taskId: number,
): Promise<TaskSummary[] | null> {
  if (!Number.isInteger(taskId)) return null;

  const board = await listTasksForUser(profileId);
  const task = board.find((entry) => entry.id === taskId);
  if (!task) return null;

  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.ownerId, profileId)));

  await db.transaction(async (tx) => {
    const remaining = board.filter(
      (entry) => entry.status === task.status && entry.id !== taskId,
    );

    for (const [position, entry] of remaining.entries()) {
      if (entry.position === position) continue;
      await tx
        .update(tasks)
        .set({ position })
        .where(and(eq(tasks.id, entry.id), eq(tasks.ownerId, profileId)));
    }
  });

  return listTasksForUser(profileId);
}

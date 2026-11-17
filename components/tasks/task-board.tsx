"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  History,
  ListTodo,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  X,
} from "lucide-react";

import {
  addTaskStepAction,
  createTaskAction,
  deleteTaskAction,
  deleteTaskStepAction,
  moveTaskAction,
  runTaskNowAction,
  setTaskAssigneesAction,
  setTaskRoleStatusAction,
  setTaskToolsAction,
  updateTaskAction,
  updateTaskStepAction,
} from "@/app/actions/tasks";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { TaskActivity } from "@/components/tasks/task-activity";
import { TaskRolesDialog } from "@/components/tasks/task-roles-dialog";
import { TaskScheduleDialog } from "@/components/tasks/task-schedule-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_TASK_TOOLS,
  TASK_ASSIGNEES_MAX,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_ROLE_STATUS_LABELS,
  TASK_STEPS_MAX,
  TASK_STATUSES,
  TASK_STATUS_HINTS,
  TASK_STATUS_LABELS,
  TASK_STEP_TITLE_MAX,
  TASK_WIP_LIMIT,
  dueLabel,
  stepTaskStatus,
  taskToolCount,
  todayKey,
  type TaskAgentRef,
  type TaskAssigneeSummary,
  type TaskPriority,
  type TaskRoleRecord,
  type TaskStatus,
  type TaskStep,
  type TaskSummary,
  type TaskToolSelection,
} from "@/lib/task-types";
import { AGENT_TOOL_OPTIONS } from "@/lib/agent-tool-options";
import { cn } from "@/lib/utils";

/**
 * The workspace task board. Cards move through four steps — Backlog, In
 * progress, In review, Done — by dragging, by the arrows on a card, or by the
 * column field in the edit dialog (the touch path). Every move is applied
 * locally first with exactly the same re-indexing the server does, then
 * confirmed by the action; a rejected write restores the previous board and
 * shows the reason inline.
 *
 * A card carries where it came from (a chat card keeps a link to that agent),
 * its roles — each with its own agent, its own progress and its own brief — its
 * progress steps, and the tools the owner picked for it.
 */

/** What the workspace can put on a card, resolved on the server. */
export type TaskLibrary = {
  skills: string[];
  diagrams: string[];
  plugins: { slug: string; name: string }[];
  mcpServers: { id: number; label: string }[];
  apps: { slug: string; name: string }[];
};

type DropTarget = { status: TaskStatus; index: number };

/** Same maths as lib/tasks.ts: the card leaves its column, then lands at `index`. */
function reorder(
  list: TaskSummary[],
  id: number,
  status: TaskStatus,
  index: number,
): TaskSummary[] {
  const task = list.find((entry) => entry.id === id);
  if (!task) return list;

  const rest = list.filter((entry) => entry.id !== id);
  const column = rest
    .filter((entry) => entry.status === status)
    .sort((a, b) => a.position - b.position);
  const at = Math.max(0, Math.min(index, column.length));

  const next = [...column.slice(0, at), { ...task, status }, ...column.slice(at)].map(
    (entry, position) => ({ ...entry, position }),
  );

  return [...rest.filter((entry) => entry.status !== status), ...next];
}

function byPosition(a: TaskSummary, b: TaskSummary) {
  return a.position - b.position || a.id - b.id;
}

/** Order-insensitive signature, so an untouched staffing writes nothing. */
function staffSignature(people: TaskAssigneeSummary[]) {
  return people
    .map((person) => `${person.role.key}:${person.agent?.id ?? 0}:${person.status}`)
    .sort()
    .join("|");
}

function toolsSignature(tools: TaskToolSelection) {
  return [
    [...tools.builtin].sort().join(","),
    [...tools.skills].sort().join(","),
    [...tools.diagrams].sort().join(","),
    [...tools.plugins].sort().join(","),
    [...tools.mcpServers].sort((a, b) => a - b).join(","),
    [...tools.apps].sort().join(","),
  ].join("|");
}

function nextRoleStatus(status: TaskStatus): TaskStatus {
  const index = TASK_STATUSES.indexOf(status);
  return TASK_STATUSES[(index + 1) % TASK_STATUSES.length] ?? "todo";
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  high: "bg-rose-50 text-rose-700 ring-rose-600/15",
  normal: "bg-muted text-muted-foreground ring-border",
  low: "bg-sky-50 text-sky-700 ring-sky-600/15",
};

const COLUMN_TONE: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/40",
  doing: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

/** The little dot that says how far one role has got. */
const ROLE_STATUS_TONE: Record<TaskStatus, string> = {
  todo: "bg-muted-foreground/30",
  doing: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

const FIELD =
  "mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[0.8rem] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL = "text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase";
const SMALL_SELECT =
  "h-7 min-w-0 rounded-md border border-border bg-card px-1 text-[0.68rem] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function TaskBoard({
  initialTasks,
  agents = [],
  roles,
  library,
}: {
  initialTasks: TaskSummary[];
  /** Every agent in the workspace, for staffing a role. */
  agents?: TaskAgentRef[];
  /** The workspace's roles, including any the owner wrote. */
  roles: TaskRoleRecord[];
  /** Skills, plugins, MCP servers and apps this workspace can put on a card. */
  library: TaskLibrary;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [workspaceRoles, setWorkspaceRoles] = useState(roles);
  const [drafts, setDrafts] = useState<Partial<Record<TaskStatus, string>>>({});
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TaskSummary | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    notes: "",
    status: "todo" as TaskStatus,
    priority: "normal" as TaskPriority,
    dueDate: "",
  });
  const [people, setPeople] = useState<TaskAssigneeSummary[]>([]);
  const [personRole, setPersonRole] = useState("");
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [stepDraft, setStepDraft] = useState("");
  const [tools, setTools] = useState<TaskToolSelection>(EMPTY_TASK_TOOLS);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [scheduling, setScheduling] = useState<TaskSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runReply, setRunReply] = useState<string | null>(null);
  const stepDraftRef = useRef<HTMLInputElement>(null);

  const today = todayKey();
  const columns = TASK_STATUSES.map((status) => ({
    status,
    cards: tasks.filter((task) => task.status === status).sort(byPosition),
  }));
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const openCount = tasks.length - doneCount;
  const percent = tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100);
  const roleRows = useMemo(
    () => new Set(tasks.flatMap((task) => task.assignees.map((person) => person.role.key))).size,
    [tasks],
  );

  /** Cards hold a copy of their roles, so a rename lands on them without a reload. */
  function applyRoles(next: TaskRoleRecord[]) {
    setWorkspaceRoles(next);
    const map = new Map(next.map((role) => [role.key, role]));

    setTasks((current) =>
      current.map((task) => ({
        ...task,
        assignees: task.assignees.flatMap((person) => {
          const role = map.get(person.role.key);
          if (!role) return [];
          return [
            {
              ...person,
              role: {
                key: role.key,
                label: role.label,
                tone: role.tone,
                prompt: role.prompt,
                hint: role.hint,
                builtin: role.builtin,
              },
            },
          ];
        }),
      })),
    );

    setPeople((current) =>
      current.flatMap((person) => {
        const role = map.get(person.role.key);
        if (!role) return [];
        return [
          {
            ...person,
            role: {
              key: role.key,
              label: role.label,
              tone: role.tone,
              prompt: role.prompt,
              hint: role.hint,
              builtin: role.builtin,
            },
          },
        ];
      }),
    );
  }

  function accept(result: Awaited<ReturnType<typeof moveTaskAction>>, before: TaskSummary[]) {
    if (result.ok) {
      setTasks(result.tasks);
      return true;
    }

    setTasks(before);
    setError(result.error);
    return false;
  }

  function move(id: number, status: TaskStatus, index: number) {
    const before = tasks;
    setError(null);
    setDragId(null);
    setDrop(null);
    setTasks(reorder(before, id, status, index));

    void moveTaskAction({ id, status, index }).then((result) => accept(result, before));
  }

  /** One step left or right; a card at either end stays put. */
  function step(task: TaskSummary, direction: -1 | 1) {
    const status = stepTaskStatus(task.status, direction);
    if (!status) return;
    move(task.id, status, tasks.filter((entry) => entry.status === status).length);
  }

  function dropOn(status: TaskStatus, index: number) {
    if (dragId === null) return;
    move(dragId, status, index);
  }

  async function add(status: TaskStatus) {
    const title = (drafts[status] ?? "").trim();
    if (!title) return;

    setError(null);
    setDrafts((current) => ({ ...current, [status]: "" }));

    const result = await createTaskAction({ title, status });
    if (result.ok) setTasks(result.tasks);
    else setError(result.error);
  }

  /** A role's own progress, cycled from the card: queued → working → review → done. */
  async function cycleRole(task: TaskSummary, roleKey: string) {
    const person = task.assignees.find((entry) => entry.role.key === roleKey);
    if (!person) return;

    setError(null);
    const next = nextRoleStatus(person.status);
    const result = await setTaskRoleStatusAction({ id: task.id, role: roleKey, status: next });
    if (result.ok) setTasks(result.tasks);
    else setError(result.error);
  }

  function openEdit(task: TaskSummary) {
    setEditing(task);
    setConfirmDelete(false);
    setRunReply(null);
    setPeople(task.assignees);
    setSteps(task.steps);
    setTools(task.tools);
    setStepDraft("");
    setPersonRole(
      workspaceRoles.find(
        (role) => !task.assignees.some((person) => person.role.key === role.key),
      )?.key ??
        workspaceRoles[0]?.key ??
        "",
    );
    setEditForm({
      title: task.title,
      notes: task.notes ?? "",
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ?? "",
    });
  }

  function addRole() {
    if (!personRole || people.length >= TASK_ASSIGNEES_MAX) return;
    if (people.some((person) => person.role.key === personRole)) return;

    const role = workspaceRoles.find((entry) => entry.key === personRole);
    if (!role) return;

    setPeople((current) => [
      ...current,
      {
        role: {
          key: role.key,
          label: role.label,
          tone: role.tone,
          prompt: role.prompt,
          hint: role.hint,
          builtin: role.builtin,
        },
        agent: null,
        status: "todo",
      },
    ]);
    setPersonRole(
      workspaceRoles.find(
        (entry) =>
          entry.key !== personRole &&
          !people.some((person) => person.role.key === entry.key),
      )?.key ?? personRole,
    );
  }

  function removeRole(roleKey: string) {
    setPeople((current) => current.filter((person) => person.role.key !== roleKey));
  }

  function changePersonAgent(roleKey: string, agentId: string) {
    const agent = agents.find((entry) => entry.id === Number(agentId)) ?? null;
    setPeople((current) =>
      current.map((person) => (person.role.key === roleKey ? { ...person, agent } : person)),
    );
  }

  function changePersonStatus(roleKey: string, status: TaskStatus) {
    setPeople((current) =>
      current.map((person) => (person.role.key === roleKey ? { ...person, status } : person)),
    );
  }

  /* ---- steps: each one is written immediately, so the dialog is never a draft ---- */

  function syncSteps(board: TaskSummary[]) {
    setTasks(board);
    if (!editing) return;
    const fresh = board.find((task) => task.id === editing.id);
    if (fresh) {
      setSteps(fresh.steps);
      setEditing(fresh);
    }
  }

  async function addStep() {
    const title = stepDraft.trim();
    if (!editing || !title) return;

    setError(null);
    const result = await addTaskStepAction({ id: editing.id, title });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setStepDraft("");
    syncSteps(result.tasks);
    stepDraftRef.current?.focus();
  }

  async function toggleStep(stepEntry: TaskStep) {
    const result = await updateTaskStepAction({ stepId: stepEntry.id, done: !stepEntry.done });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    syncSteps(result.tasks);
  }

  async function renameStep(stepEntry: TaskStep, title: string) {
    const clean = title.trim();
    if (!clean || clean === stepEntry.title) return;

    const result = await updateTaskStepAction({ stepId: stepEntry.id, title: clean });
    if (result.ok) syncSteps(result.tasks);
    else setError(result.error);
  }

  async function removeStep(stepEntry: TaskStep) {
    const result = await deleteTaskStepAction({ stepId: stepEntry.id });
    if (result.ok) syncSteps(result.tasks);
    else setError(result.error);
  }

  function toggleTool(group: keyof TaskToolSelection, value: string | number) {
    setTools((current) => {
      const list = current[group] as (string | number)[];
      const has = list.includes(value);
      const next = has ? list.filter((entry) => entry !== value) : [...list, value];

      return {
        ...current,
        [group]: group === "mcpServers" ? (next as number[]) : (next as string[]),
      } as TaskToolSelection;
    });
  }

  async function saveEdit() {
    if (!editing || saving) return;

    setSaving(true);
    setError(null);

    const result = await updateTaskAction({
      id: editing.id,
      title: editForm.title,
      notes: editForm.notes,
      priority: editForm.priority,
      dueDate: editForm.dueDate || null,
    });

    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }

    setTasks(result.tasks);
    let board = result.tasks;

    if (editForm.status !== editing.status) {
      const moved = await moveTaskAction({
        id: editing.id,
        status: editForm.status,
        index: board.filter((task) => task.status === editForm.status).length,
      });

      if (!moved.ok) {
        setSaving(false);
        setError(moved.error);
        return;
      }

      board = moved.tasks;
      setTasks(board);
    }

    if (staffSignature(people) !== staffSignature(editing.assignees)) {
      const assigned = await setTaskAssigneesAction({
        id: editing.id,
        assignees: people.map((person) => ({
          role: person.role.key,
          agentId: person.agent?.id ?? null,
          status: person.status,
        })),
      });

      if (!assigned.ok) {
        setSaving(false);
        setError(assigned.error);
        return;
      }

      board = assigned.tasks;
      setTasks(board);
    }

    if (toolsSignature(tools) !== toolsSignature(editing.tools)) {
      const savedTools = await setTaskToolsAction({
        id: editing.id,
        builtin: tools.builtin,
        skills: tools.skills,
        diagrams: tools.diagrams,
        plugins: tools.plugins,
        mcpServers: tools.mcpServers,
        apps: tools.apps,
      });

      if (!savedTools.ok) {
        setSaving(false);
        setError(savedTools.error);
        return;
      }

      board = savedTools.tasks;
      setTasks(board);
    }

    setSaving(false);
    setEditing(null);
  }

  /** One agent turn on this card, right now, with its role's brief. */
  async function runNow() {
    if (!editing || running) return;

    setRunning(true);
    setRunReply(null);
    setError(null);

    try {
      const result = await runTaskNowAction({
        id: editing.id,
        role: editing.assignees.find((person) => person.agent)?.role.key ?? null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.tasks) {
        setTasks(result.tasks);
        const fresh = result.tasks.find((task) => task.id === editing.id);
        if (fresh) setEditing(fresh);
      }

      setRunReply(
        `${result.agentName} · ${result.roleLabel}: ${result.reply || "Finished with no reply."}`,
      );
    } catch (runError) {
      console.error("[tasks] run now failed", runError);
      setError("The agent couldn't finish that run. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  async function removeEdit() {
    if (!editing || saving) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    setError(null);

    const result = await deleteTaskAction({ id: editing.id });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTasks(result.tasks);
    setEditing(null);
  }

  const availableRoles = workspaceRoles.filter(
    (role) => !people.some((person) => person.role.key === role.key),
  );
  const stepsDone = steps.filter((stepEntry) => stepEntry.done).length;

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="aui-chip text-[0.7rem]">
            <span className="font-semibold text-foreground tabular-nums">{openCount}</span> open ·{" "}
            <span className="tabular-nums">{doneCount}</span> done
          </span>
          <div
            className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Tasks completed"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[0.66rem] text-muted-foreground tabular-nums">{percent}%</span>
        </div>

        <span className="aui-chip text-[0.68rem]">
          <UserPlus className="size-3 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-foreground tabular-nums">{roleRows}</span> roles in play
        </span>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setRolesOpen(true)}
          className="h-7 gap-1.5 px-2 text-[0.7rem]"
        >
          <Users className="size-3.5" />
          Roles
          <span className="text-muted-foreground tabular-nums">{workspaceRoles.length}</span>
        </Button>

        <span className="text-[0.68rem] text-muted-foreground">
          Drag a card, use its arrows, or open it to change its step, roles, steps or tools.
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[0.72rem] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map(({ status, cards }) => {
          const label = TASK_STATUS_LABELS[status];
          const full = status === "doing" && cards.length >= TASK_WIP_LIMIT;
          const isDropColumn = drop?.status === status;

          return (
            <section
              key={status}
              aria-label={label}
              onDragOver={(event) => {
                if (dragId === null) return;
                event.preventDefault();
                if (event.target === event.currentTarget) {
                  setDrop({ status, index: cards.length });
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOn(status, drop?.index ?? cards.length);
              }}
              className={cn(
                "flex min-h-[18rem] flex-col rounded-2xl border border-border bg-card/60 p-2.5 transition-colors",
                isDropColumn && "border-brand-border bg-brand-soft/40",
              )}
            >
              <header className="flex items-start justify-between gap-2 px-0.5 pb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn("size-1.5 rounded-full", COLUMN_TONE[status])}
                      aria-hidden="true"
                    />
                    <h2 className="truncate text-[0.78rem] font-semibold">{label}</h2>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.58rem] font-semibold text-muted-foreground tabular-nums">
                      {cards.length}
                      {status === "doing" ? `/${TASK_WIP_LIMIT}` : ""}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[0.62rem] text-muted-foreground">
                    {full
                      ? "Over the soft WIP limit — finish something before adding more."
                      : TASK_STATUS_HINTS[status]}
                  </p>
                </div>
              </header>

              <form
                className="flex gap-1.5 pb-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void add(status);
                }}
              >
                <Input
                  value={drafts[status] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [status]: event.target.value }))
                  }
                  placeholder={`Add to ${label.toLowerCase()}…`}
                  aria-label={`New task in ${label}`}
                  className="h-8 text-[0.76rem]"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  aria-label={`Add task to ${label}`}
                  className="h-8 shrink-0 px-2"
                >
                  <Plus className="size-3.5" />
                </Button>
              </form>

              <div className="flex flex-1 flex-col gap-1.5">
                {cards.length === 0 && !isDropColumn && (
                  <p className="rounded-xl border border-dashed border-border/80 px-3 py-6 text-center text-[0.68rem] text-muted-foreground">
                    {status === "todo" ? "No cards yet — add the first one above." : "Nothing here."}
                  </p>
                )}

                {cards.map((task, index) => {
                  const due = dueLabel(task.dueDate, today);
                  const overdue = Boolean(
                    task.dueDate && task.dueDate < today && task.status !== "done",
                  );
                  const left = stepTaskStatus(task.status, -1);
                  const right = stepTaskStatus(task.status, 1);
                  const openStep = task.steps.find((entry) => !entry.done) ?? null;
                  const toolsUsed = taskToolCount(task.tools);

                  return (
                    <div key={task.id}>
                      {isDropColumn && drop?.index === index && <DropLine />}

                      <article
                        draggable
                        onDragStart={(event) => {
                          setDragId(task.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", String(task.id));
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDrop(null);
                        }}
                        onDragOver={(event) => {
                          if (dragId === null) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const before = event.clientY < rect.top + rect.height / 2;
                          setDrop({ status, index: before ? index : index + 1 });
                        }}
                        className={cn(
                          "group rounded-xl border border-border bg-card p-2.5 shadow-sm transition-[box-shadow,opacity] hover:shadow-md",
                          dragId === task.id && "opacity-40",
                        )}
                      >
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(task)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowLeft" && left) {
                                event.preventDefault();
                                step(task, -1);
                              }
                              if (event.key === "ArrowRight" && right) {
                                event.preventDefault();
                                step(task, 1);
                              }
                            }}
                            aria-label={`${task.title} — open, or use the arrow keys to change step`}
                            className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block text-[0.78rem] leading-snug font-medium break-words">
                              {task.title}
                            </span>
                            {task.notes && (
                              <span className="mt-1 line-clamp-2 block text-[0.66rem] leading-relaxed text-muted-foreground">
                                {task.notes}
                              </span>
                            )}
                          </button>
                          <GripVertical
                            className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </div>

                        {task.assignees.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5">
                            {task.assignees.map((person) => (
                              <li key={person.role.key} className="flex items-center gap-1.5">
                                {person.agent ? (
                                  <AgentAvatar
                                    avatar={person.agent.avatar}
                                    color={person.agent.color}
                                    className="size-4 shrink-0"
                                  />
                                ) : (
                                  <span className="grid size-4 shrink-0 place-items-center rounded-full border border-dashed border-border text-[0.5rem] text-muted-foreground">
                                    +
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    "min-w-0 truncate rounded-full px-1.5 py-0.5 text-[0.56rem] font-medium ring-1",
                                    person.role.tone,
                                  )}
                                  title={person.role.prompt || person.role.hint}
                                >
                                  {person.role.label}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[0.58rem] text-muted-foreground">
                                  {person.agent?.name ?? "open"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void cycleRole(task, person.role.key);
                                  }}
                                  draggable={false}
                                  aria-label={`${person.role.label} on ${task.title} is ${TASK_ROLE_STATUS_LABELS[person.status]} — click to move it forward`}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/70 px-1.5 py-0.5 text-[0.54rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <span
                                    className={cn(
                                      "size-1.5 rounded-full",
                                      ROLE_STATUS_TONE[person.status],
                                    )}
                                    aria-hidden="true"
                                  />
                                  {TASK_ROLE_STATUS_LABELS[person.status]}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        {task.steps.length > 0 && (
                          <div className="mt-1.5">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-label={`Steps done on ${task.title}`}
                                aria-valuemin={0}
                                aria-valuemax={task.steps.length}
                                aria-valuenow={task.steps.filter((s) => s.done).length}
                              >
                                <div
                                  className="h-full rounded-full bg-brand-ink transition-[width] duration-300"
                                  style={{
                                    width: `${Math.round(
                                      (task.steps.filter((s) => s.done).length /
                                        task.steps.length) *
                                        100,
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[0.56rem] text-muted-foreground tabular-nums">
                                {task.steps.filter((s) => s.done).length}/{task.steps.length}
                              </span>
                            </div>
                            {openStep && (
                              <p className="mt-0.5 truncate text-[0.58rem] text-muted-foreground">
                                Next · {openStep.title}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[0.56rem] font-semibold ring-1",
                              PRIORITY_TONE[task.priority],
                            )}
                          >
                            {TASK_PRIORITY_LABELS[task.priority]}
                          </span>
                          {due && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.56rem] font-medium",
                                overdue
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              <CalendarDays className="size-2.5" aria-hidden="true" />
                              {due}
                            </span>
                          )}
                          {toolsUsed > 0 && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.56rem] font-medium text-muted-foreground"
                              title={`${task.tools.skills.length} skills · ${task.tools.plugins.length} plugins · ${task.tools.mcpServers.length} MCP · ${task.tools.apps.length} apps`}
                            >
                              <Wrench className="size-2.5" aria-hidden="true" />
                              {toolsUsed} tools
                            </span>
                          )}
                          {task.activity.length > 0 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEdit(task);
                              }}
                              title={`Open this card's activity timeline · ${task.activity.length} entries`}
                              aria-label={`Activity for ${task.title}`}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.56rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ListTodo className="size-2.5" aria-hidden="true" />
                              {task.activity.length}
                            </button>
                          )}
                          {task.runCount > 0 && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.56rem] font-medium",
                                task.runs[0]?.status === "error"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-muted text-muted-foreground",
                              )}
                              title={
                                task.runs[0]
                                  ? `Last run: ${task.runs[0].roleLabel} · ${task.runs[0].reply}`
                                  : "No runs yet"
                              }
                            >
                              <History className="size-2.5" aria-hidden="true" />
                              {task.runCount} run{task.runCount === 1 ? "" : "s"}
                            </span>
                          )}
                          {task.schedule && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.56rem] font-medium text-brand-ink"
                              title={`Runs ${task.schedule.title}`}
                            >
                              <CalendarClock className="size-2.5" aria-hidden="true" />
                              Scheduled
                            </span>
                          )}
                          {task.source === "agent" && task.sourceAgent && (
                            <Link
                              href={`/dashboard/agents/${task.sourceAgent.id}`}
                              onClick={(event) => event.stopPropagation()}
                              title={`Proposed in ${task.sourceAgent.name}'s chat`}
                              className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-1 py-0.5 text-[0.56rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <AgentAvatar
                                avatar={task.sourceAgent.avatar}
                                color={task.sourceAgent.color}
                                className="size-3"
                              />
                              <Sparkles className="size-2.5" aria-hidden="true" />
                              <span className="max-w-[5rem] truncate">{task.sourceAgent.name}</span>
                            </Link>
                          )}

                          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => step(task, -1)}
                              disabled={!left}
                              aria-label={`Move ${task.title} to ${left ? TASK_STATUS_LABELS[left] : "an earlier step"}`}
                              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronLeft className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => step(task, 1)}
                              disabled={!right}
                              aria-label={`Move ${task.title} to ${right ? TASK_STATUS_LABELS[right] : "a later step"}`}
                              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronRight className="size-3.5" />
                            </button>
                          </span>
                        </div>
                      </article>
                    </div>
                  );
                })}

                {isDropColumn && drop?.index === cards.length && <DropLine />}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <label className="block">
              <span className={LABEL}>Title</span>
              <Input
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-1 h-9 text-[0.82rem]"
              />
            </label>

            <label className="block">
              <span className={LABEL}>Notes</span>
              <Textarea
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={3}
                placeholder="Context, links, what done looks like…"
                className="mt-1 text-[0.8rem]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={LABEL}>Step</span>
                <select
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as TaskStatus,
                    }))
                  }
                  className={FIELD}
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {TASK_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={LABEL}>Priority</span>
                <select
                  value={editForm.priority}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))
                  }
                  className={FIELD}
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {TASK_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={LABEL}>Due date</span>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  className={FIELD}
                />
              </label>
            </div>

            {/* ---------------------------------------------------- roles -- */}
            <div className="rounded-xl border border-border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Roles &amp; progress</span>
                <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                  {people.length}/{TASK_ASSIGNEES_MAX}
                </span>
              </div>
              <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
                One agent per role, and each role has its own progress. A role can stay open until
                someone picks it up.
              </p>

              <div className="mt-2 space-y-1.5">
                {people.map((person) => (
                  <div
                    key={person.role.key}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg bg-card px-2 py-1.5 ring-1 ring-border/60"
                  >
                    {person.agent ? (
                      <AgentAvatar
                        avatar={person.agent.avatar}
                        color={person.agent.color}
                        className="size-5"
                      />
                    ) : (
                      <span className="grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-border text-[0.6rem] text-muted-foreground">
                        +
                      </span>
                    )}
                    <span
                      title={person.role.prompt || person.role.hint}
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold ring-1",
                        person.role.tone,
                      )}
                    >
                      {person.role.label}
                    </span>
                    <select
                      value={person.agent ? String(person.agent.id) : ""}
                      aria-label={`Agent for the ${person.role.label} role`}
                      onChange={(event) => changePersonAgent(person.role.key, event.target.value)}
                      disabled={agents.length === 0}
                      className={cn(SMALL_SELECT, "flex-1")}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={person.status}
                      aria-label={`Progress of the ${person.role.label} role`}
                      onChange={(event) =>
                        changePersonStatus(person.role.key, event.target.value as TaskStatus)
                      }
                      className={SMALL_SELECT}
                    >
                      {TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {TASK_ROLE_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeRole(person.role.key)}
                      aria-label={`Remove the ${person.role.label} role`}
                      className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}

                {people.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/80 px-2 py-2 text-center text-[0.66rem] text-muted-foreground">
                    No roles yet — pick one below.
                  </p>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select
                  value={personRole}
                  aria-label="Role to add"
                  onChange={(event) => setPersonRole(event.target.value)}
                  className="h-8 max-w-[10rem] rounded-lg border border-border bg-card px-2 text-[0.72rem] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {availableRoles.length === 0 && <option value="">No roles left</option>}
                  {availableRoles.map((role) => (
                    <option key={role.key} value={role.key} title={role.hint}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addRole}
                  disabled={
                    !personRole ||
                    people.length >= TASK_ASSIGNEES_MAX ||
                    availableRoles.length === 0
                  }
                  className="h-8 gap-1 px-2 text-[0.72rem]"
                >
                  <UserPlus className="size-3.5" />
                  Add role
                </Button>
                <button
                  type="button"
                  onClick={() => setRolesOpen(true)}
                  className="text-[0.68rem] font-medium text-brand-ink underline-offset-4 hover:underline"
                >
                  Manage roles
                </button>
                {agents.length === 0 && (
                  <p className="text-[0.64rem] text-muted-foreground">
                    Create an agent from the sidebar to staff a role.
                  </p>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------- steps -- */}
            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Progress steps</span>
                <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                  {stepsDone}/{steps.length}
                </span>
              </div>
              <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
                A card&apos;s own checklist. Toggle, rename or delete a step — each change is saved
                immediately and the card shows the next open one.
              </p>

              <div className="mt-2 space-y-1">
                {steps.map((stepEntry) => (
                  <div
                    key={stepEntry.id}
                    className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-1.5 py-1 ring-1 ring-border/50"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleStep(stepEntry)}
                      aria-pressed={stepEntry.done}
                      aria-label={`${stepEntry.done ? "Reopen" : "Complete"} ${stepEntry.title}`}
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border transition-colors",
                        stepEntry.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-card text-transparent hover:border-muted-foreground/50",
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3} />
                    </button>
                    <input
                      defaultValue={stepEntry.title}
                      maxLength={TASK_STEP_TITLE_MAX}
                      aria-label={`Step: ${stepEntry.title}`}
                      onBlur={(event) => void renameStep(stepEntry, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      className={cn(
                        "h-6 min-w-0 flex-1 rounded border-0 bg-transparent px-1 text-[0.72rem] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        stepEntry.done && "text-muted-foreground line-through",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => void removeStep(stepEntry)}
                      aria-label={`Delete the step ${stepEntry.title}`}
                      className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}

                {steps.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/80 px-2 py-2 text-center text-[0.64rem] text-muted-foreground">
                    No steps yet — add the first one below.
                  </p>
                )}
              </div>

              <form
                className="mt-1.5 flex items-center gap-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addStep();
                }}
              >
                <Input
                  ref={stepDraftRef}
                  value={stepDraft}
                  onChange={(event) => setStepDraft(event.target.value)}
                  maxLength={TASK_STEP_TITLE_MAX}
                  placeholder="Add a step…"
                  aria-label="New step"
                  disabled={steps.length >= TASK_STEPS_MAX}
                  className="h-8 text-[0.74rem]"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!stepDraft.trim() || steps.length >= TASK_STEPS_MAX}
                  className="h-8 shrink-0 gap-1 px-2 text-[0.72rem]"
                >
                  <ListTodo className="size-3.5" />
                  Add
                </Button>
              </form>
            </div>

            {/* ------------------------------------------------- activity -- */}
            {editing && <TaskActivity key={editing.id} task={editing} />}

            {/* ---------------------------------------------------- tools -- */}
            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex items-center justify-between">
                <span className={LABEL}>Tools for this card</span>
                <span className="text-[0.62rem] text-muted-foreground tabular-nums">
                  {taskToolCount(tools)} picked
                </span>
              </div>
              <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
                Pick what the agent running this card should reach for. Built-in tools narrow the
                agent&apos;s own switches; skills, diagrams, plugins, MCP servers and apps are
                enforced on the run, so once this card picks one only the picks are attached.
              </p>

              <div className="mt-2 space-y-2">
                {(
                  [
                    [
                      "builtin",
                      "Built-in tools",
                      AGENT_TOOL_OPTIONS.map((option) => ({ value: option.id, label: option.name })),
                    ],
                    ["skills", "Skills", library.skills.map((skill) => ({ value: skill, label: skill }))],
                    [
                      "diagrams",
                      "Diagrams",
                      library.diagrams.map((diagram) => ({ value: diagram, label: diagram })),
                    ],
                    [
                      "plugins",
                      "Plugins",
                      library.plugins.map((plugin) => ({ value: plugin.slug, label: plugin.name })),
                    ],
                    [
                      "apps",
                      "Connected apps",
                      library.apps.map((app) => ({ value: app.slug, label: app.name })),
                    ],
                    [
                      "mcpServers",
                      "MCP servers",
                      library.mcpServers.map((server) => ({
                        value: server.id,
                        label: server.label,
                      })),
                    ],
                  ] as const
                ).map(([group, title, options]) => (
                  <div key={group}>
                    <p className="text-[0.6rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {title}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {options.length === 0 && (
                        <span className="text-[0.62rem] text-muted-foreground">
                          Nothing in this workspace yet.
                        </span>
                      )}
                      {options.map((option) => {
                        const active = (tools[group] as (string | number)[]).includes(option.value);
                        return (
                          <button
                            key={`${group}-${option.value}`}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleTool(group, option.value)}
                            className={cn(
                              "max-w-full truncate rounded-full px-2 py-0.5 text-[0.64rem] font-medium ring-1 transition-colors",
                              active
                                ? "bg-brand-soft text-brand-ink ring-brand-border"
                                : "bg-card text-muted-foreground ring-border hover:text-foreground",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.72rem] font-semibold">Run this card on a schedule</p>
                  <p className="mt-0.5 text-[0.64rem] leading-relaxed text-muted-foreground">
                    {editing?.schedule
                      ? "This card already has a schedule. Another run can be added if you need a different agent or time."
                      : "Turns the card into a recurring task for one of its agents, with the role's brief as the instruction."}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void runNow()}
                    disabled={
                      running || !editing?.assignees.some((person) => person.agent)
                    }
                    className="h-8 gap-1.5 px-2.5 text-[0.72rem]"
                  >
                    {running ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {running ? "Running…" : "Run now"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const task = editing;
                      if (!task) return;
                      setEditing(null);
                      setScheduling(task);
                    }}
                    className="h-8 gap-1.5 px-2.5 text-[0.72rem]"
                  >
                    <CalendarClock className="size-3.5" />
                    {editing?.schedule ? "Schedule another run" : "Schedule a run"}
                  </Button>
                </div>
              </div>
              {editing?.schedule && (
                <p className="mt-1.5 text-[0.64rem] text-muted-foreground">
                  Runs “{editing.schedule.title}” for{" "}
                  {editing.schedule.nextRunAt
                    ? `next on ${new Date(editing.schedule.nextRunAt).toLocaleString()}`
                    : "a paused or finished rule"}
                  .
                </p>
              )}
              {runReply && (
                <p className="mt-1.5 max-h-24 overflow-y-auto rounded-lg bg-muted/50 px-2 py-1.5 text-[0.66rem] leading-relaxed text-muted-foreground">
                  {runReply}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void removeEdit()}
              disabled={saving}
              className={cn(
                "h-8 gap-1.5 px-2 text-[0.74rem]",
                confirmDelete ? "text-destructive" : "text-muted-foreground",
              )}
            >
              <Trash2 className="size-3.5" />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEditing(null)}
                className="h-8 px-2.5 text-[0.74rem]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void saveEdit()}
                disabled={saving || !editForm.title.trim()}
                className="h-8 px-3 text-[0.74rem]"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TaskRolesDialog
        roles={workspaceRoles}
        open={rolesOpen}
        onOpenChange={setRolesOpen}
        onRolesChange={applyRoles}
      />

      <TaskScheduleDialog
        task={scheduling}
        agents={agents}
        roles={workspaceRoles}
        library={library}
        open={scheduling !== null}
        onOpenChange={(open) => {
          if (!open) setScheduling(null);
        }}
        onScheduled={(next) => {
          setTasks(next);
          setScheduling(null);
        }}
      />
    </>
  );
}

/** The 2px insertion line shown where a dragged card would land. */
function DropLine() {
  return <div className="mb-1.5 h-0.5 rounded-full bg-brand-ink" aria-hidden="true" />;
}

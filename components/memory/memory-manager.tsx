"use client";

import { useMemo, useState } from "react";
import { Brain, Check, Download, PencilLine, Plus, Search, Trash2 } from "lucide-react";

import {
  createMemoryAction,
  deleteMemoriesAction,
  deleteMemoryAction,
  setAgentMemoryEnabledAction,
  updateMemoryAction,
} from "@/app/actions/memory";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { MemoryGraphView } from "@/components/memory/memory-graph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  MEMORY_CONTENT_MAX,
  MEMORY_TAGS_MAX,
  MEMORY_TAG_SUGGESTIONS,
  buildMemoryGraph,
  normalizeMemoryTags,
  type MemoryAgent,
  type MemoryRecord,
} from "@/lib/memory-types";
import { cn } from "@/lib/utils";

/**
 * The Memory board: the graph, one switch per agent, the hand-written note form
 * and the list of every saved note. Writes go through the server actions, and
 * the graph is rebuilt from local state so adding or deleting a note reshapes
 * it at once instead of waiting for a refresh.
 */
export function MemoryManager({
  memories: initialMemories,
  agents: initialAgents,
}: {
  memories: MemoryRecord[];
  agents: MemoryAgent[];
}) {
  const [memories, setMemories] = useState(initialMemories);
  const [agents, setAgents] = useState(initialAgents);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");
  const [draftAgent, setDraftAgent] = useState<number | null>(
    initialAgents.find((agent) => agent.enabled)?.id ?? initialAgents[0]?.id ?? null,
  );
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const graph = useMemo(() => buildMemoryGraph(memories, agents), [memories, agents]);

  /** Every tag in use, most common first, for the filter row. */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memory of memories) {
      for (const tag of memory.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [memories]);

  const needle = query.trim().toLowerCase();
  const visible = memories.filter((memory) => {
    if (filter !== "all" && memory.agentId !== filter) return false;
    if (tagFilter && !memory.tags.includes(tagFilter)) return false;
    if (!needle) return true;
    return `${memory.content} ${memory.tags.join(" ")} ${memory.agentName}`
      .toLowerCase()
      .includes(needle);
  });
  const parsedTags = normalizeMemoryTags(tags);
  const canSave = Boolean(draftAgent) && content.trim().length >= 4 && !saving;

  function bumpCount(agentId: number, delta: number) {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, count: Math.max(0, agent.count + delta) } : agent,
      ),
    );
  }

  async function save() {
    if (!draftAgent) {
      setError("Create an agent first — memory belongs to one agent.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const result = await createMemoryAction({
        agentId: draftAgent,
        content,
        tags: parsedTags,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMemories((prev) => [result.memory, ...prev]);
      bumpCount(result.memory.agentId, 1);
      setContent("");
      setTags("");
      setSelectedId(result.memory.id);
      setNotice("Saved. The agent can use it from its next message.");
    } catch {
      setError("We couldn't save that memory. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    setError(null);
    setNotice(null);

    try {
      const result = await deleteMemoryAction({ id });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const removed = memories.find((memory) => memory.id === id);
      setMemories((prev) => prev.filter((memory) => memory.id !== id));
      if (removed) bumpCount(removed.agentId, -1);
      if (selectedId === id) setSelectedId(null);
      setSelectedIds((current) => current.filter((entry) => entry !== id));
      setPendingDelete(null);
    } catch {
      setError("We couldn't remove that memory. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(memory: MemoryRecord) {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditTags(memory.tags.join(", "));
    setPendingDelete(null);
    setError(null);
    setNotice(null);
  }

  async function saveEdit(id: number) {
    if (savingEdit) return;
    setSavingEdit(true);
    setError(null);
    setNotice(null);

    try {
      const result = await updateMemoryAction({
        id,
        content: editContent,
        tags: normalizeMemoryTags(editTags),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMemories((prev) =>
        prev.map((memory) => (memory.id === id ? result.memory : memory)),
      );
      setEditingId(null);
      setNotice("Updated. The agent uses the new wording from its next message.");
    } catch {
      setError("We couldn't update that memory. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  /** One statement for every selected note, then the same local bookkeeping. */
  async function removeSelected() {
    if (bulkBusy || selectedIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await deleteMemoriesAction({ ids: selectedIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const removed = memories.filter((memory) => selectedIds.includes(memory.id));
      setMemories((prev) => prev.filter((memory) => !selectedIds.includes(memory.id)));
      for (const memory of removed) bumpCount(memory.agentId, -1);
      if (selectedId !== null && selectedIds.includes(selectedId)) setSelectedId(null);
      if (editingId !== null && selectedIds.includes(editingId)) setEditingId(null);
      setSelectedIds([]);
      setPendingBulkDelete(false);
      setNotice(`Removed ${result.removed} ${result.removed === 1 ? "memory" : "memories"}.`);
    } catch {
      setError("We couldn't remove those memories. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  /** The filtered list as CSV, built in the browser from the rows on screen. */
  function exportVisible() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      "id",
      "agent",
      "content",
      "tags",
      "source",
      "use_count",
      "last_used_at",
      "created_at",
    ];
    const rows = visible.map((memory) =>
      [
        String(memory.id),
        memory.agentName,
        memory.content,
        memory.tags.join(" "),
        memory.source,
        String(memory.useCount),
        memory.lastUsedAt ?? "",
        memory.createdAt,
      ]
        .map(escape)
        .join(","),
    );

    const blob = new Blob([[header.join(","), ...rows].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `memories-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function toggleAgent(agent: MemoryAgent, enabled: boolean) {
    const previous = agent.enabled;
    setAgents((prev) =>
      prev.map((entry) => (entry.id === agent.id ? { ...entry, enabled } : entry)),
    );
    setError(null);

    try {
      const result = await setAgentMemoryEnabledAction({ agentId: agent.id, enabled });
      if (!result.ok) {
        setAgents((prev) =>
          prev.map((entry) => (entry.id === agent.id ? { ...entry, enabled: previous } : entry)),
        );
        setError(result.error);
      }
    } catch {
      setAgents((prev) =>
        prev.map((entry) => (entry.id === agent.id ? { ...entry, enabled: previous } : entry)),
      );
      setError("We couldn't change that setting. Please try again.");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Graph */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="aui-eyebrow">Visual memory</p>
            <h2 className="mt-1 text-[0.92rem] font-semibold">How the notes connect</h2>
          </div>
          <p className="text-[0.6rem] text-muted-foreground">
            {graph.communities.length}{" "}
            {graph.communities.length === 1 ? "community" : "communities"} · coloured by the
            subject each note was filed under
          </p>
        </div>

        <div className="mt-3">
          <MemoryGraphView
            graph={graph}
            selectedId={selectedId ? `memory:${selectedId}` : null}
            onSelect={(node) => {
              if (!node.memoryId) return;
              setSelectedId(node.memoryId);
              document
                .getElementById(`memory-${node.memoryId}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* Notes */}
        <section className="order-2 min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm lg:order-1">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="aui-eyebrow">Saved notes</p>
              <h2 className="mt-1 text-[0.92rem] font-semibold">
                {visible.length} {visible.length === 1 ? "memory" : "memories"}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
                  filter === "all"
                    ? "border-brand-border bg-brand-soft text-brand-ink"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setFilter(agent.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
                    filter === agent.id
                      ? "border-brand-border bg-brand-soft text-brand-ink"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {agent.name}
                  <span className="tabular-nums opacity-60">{agent.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[9rem] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes, tags or agents"
                maxLength={80}
                className="h-7 pl-7 text-[0.68rem]"
                aria-label="Search memories"
              />
            </div>
            {tagFilter ? (
              <button
                type="button"
                onClick={() => setTagFilter(null)}
                className="rounded-full border border-brand-border bg-brand-soft px-2 py-0.5 text-[0.6rem] text-brand-ink"
              >
                #{tagFilter} ×
              </button>
            ) : null}
          </div>

          {tagCounts.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tagCounts.slice(0, 10).map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                  className={cn(
                    "rounded-full border px-1.5 py-px text-[0.56rem] transition-colors",
                    tagFilter === tag
                      ? "border-brand-border bg-brand-soft text-brand-ink"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  #{tag} <span className="tabular-nums opacity-60">{count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={() =>
                setSelectedIds(
                  selectedIds.length === visible.length ? [] : visible.map((memory) => memory.id),
                )
              }
              className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {visible.length > 0 && selectedIds.length === visible.length
                ? "Clear selection"
                : `Select all ${visible.length}`}
            </button>

            {selectedIds.length === 0 ? null : pendingBulkDelete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-[0.62rem]"
                  disabled={bulkBusy}
                  onClick={() => void removeSelected()}
                >
                  {bulkBusy ? "Removing…" : `Delete ${selectedIds.length}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[0.62rem]"
                  disabled={bulkBusy}
                  onClick={() => setPendingBulkDelete(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-[0.62rem] text-rose-600 hover:text-rose-600 dark:text-rose-300"
                onClick={() => setPendingBulkDelete(true)}
              >
                <Trash2 className="size-3" /> {selectedIds.length} selected
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 gap-1 px-2 text-[0.62rem]"
              disabled={visible.length === 0}
              onClick={exportVisible}
            >
              <Download className="size-3" /> Export CSV
            </Button>
          </div>

          {error ? (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[0.7rem] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[0.7rem] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <Check className="size-3" aria-hidden="true" />
              {notice}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <div className="mt-3 grid place-items-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
              <Brain className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-[0.75rem] font-medium">
                {memories.length === 0 ? "Nothing remembered yet" : "No memory matches"}
              </p>
              <p className="mt-1 max-w-[22rem] text-[0.68rem] leading-relaxed text-muted-foreground">
                {memories.length === 0
                  ? "Ask an agent to remember something, or write a note on the right. Notes are short, durable facts — preferences, people, projects, decisions."
                  : "Try another word, tag or agent — or clear the filters."}
              </p>
              {memories.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-[0.66rem]"
                  onClick={() => {
                    setQuery("");
                    setTagFilter(null);
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {visible.map((memory) => {
                const agent = agents.find((entry) => entry.id === memory.agentId);
                const isSelected = selectedId === memory.id;
                const confirming = pendingDelete === memory.id;

                return (
                  <li
                    key={memory.id}
                    id={`memory-${memory.id}`}
                    className={cn(
                      "rounded-xl border bg-background/60 p-3 transition-colors",
                      isSelected ? "border-brand-border bg-brand-soft/30" : "border-border",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => toggleSelected(memory.id)}
                        aria-pressed={selectedIds.includes(memory.id)}
                        aria-label={
                          selectedIds.includes(memory.id)
                            ? `Deselect memory ${memory.id}`
                            : `Select memory ${memory.id}`
                        }
                        className={cn(
                          "mt-1 grid size-4 shrink-0 place-items-center rounded border transition-colors",
                          selectedIds.includes(memory.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-transparent hover:border-muted-foreground",
                        )}
                      >
                        <Check className="size-2.5" aria-hidden="true" />
                      </button>
                      <AgentAvatar
                        avatar={agent?.avatar ?? memory.agentAvatar}
                        color={agent?.color ?? memory.agentColor}
                        className="size-6 shrink-0 rounded-md shadow-sm ring-1 ring-black/5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[0.7rem] font-semibold">
                            {agent?.name ?? memory.agentName}
                          </span>
                          <span className="rounded-full bg-muted px-1.5 py-px text-[0.54rem] font-medium text-muted-foreground">
                            {memory.source === "owner" ? "Written by you" : "Learned in chat"}
                          </span>
                          <span className="text-[0.54rem] text-muted-foreground tabular-nums">
                            #{memory.id}
                          </span>
                          {memory.useCount > 0 ? (
                            <span className="text-[0.54rem] text-muted-foreground tabular-nums">
                              recalled {memory.useCount}×
                            </span>
                          ) : null}
                        </div>

                        {editingId === memory.id ? (
                          <div className="mt-1.5">
                            <Textarea
                              value={editContent}
                              onChange={(event) => setEditContent(event.target.value)}
                              rows={3}
                              maxLength={MEMORY_CONTENT_MAX}
                              className="min-h-[64px] text-[0.75rem]"
                              aria-label={`Edit memory ${memory.id}`}
                            />
                            <Input
                              value={editTags}
                              onChange={(event) => setEditTags(event.target.value)}
                              placeholder="preference, location"
                              maxLength={120}
                              className="mt-1.5 h-7 text-[0.7rem]"
                              aria-label="Edit tags, comma separated"
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 px-2.5 text-[0.66rem]"
                                disabled={
                                  savingEdit || editContent.trim().length < 4
                                }
                                onClick={() => void saveEdit(memory.id)}
                              >
                                {savingEdit ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[0.66rem]"
                                disabled={savingEdit}
                                onClick={() => {
                                  setEditingId(null);
                                  setError(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <span className="text-[0.54rem] text-muted-foreground tabular-nums">
                                {normalizeMemoryTags(editTags).length}/{MEMORY_TAGS_MAX} tags
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 text-[0.75rem] leading-relaxed whitespace-pre-wrap">
                              {memory.content}
                            </p>

                            {memory.tags.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {memory.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-border px-1.5 py-px text-[0.54rem] text-muted-foreground"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {confirming ? (
                          <>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-6 px-2 text-[0.62rem]"
                              disabled={busyId === memory.id}
                              onClick={() => void remove(memory.id)}
                            >
                              {busyId === memory.id ? "Removing…" : "Confirm"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[0.62rem]"
                              onClick={() => setPendingDelete(null)}
                            >
                              Keep
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground hover:text-foreground"
                              aria-label={`Edit memory ${memory.id}`}
                              title="Edit this memory"
                              disabled={savingEdit}
                              onClick={() =>
                                editingId === memory.id ? setEditingId(null) : beginEdit(memory)
                              }
                            >
                              <PencilLine className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 text-muted-foreground hover:text-rose-600"
                              aria-label={`Forget memory ${memory.id}`}
                              title="Forget this memory"
                              disabled={savingEdit}
                              onClick={() => setPendingDelete(memory.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Controls */}
        <div className="order-1 space-y-4 lg:order-2">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="aui-eyebrow">Use memory</p>
            <h2 className="mt-1 text-[0.92rem] font-semibold">Per agent</h2>
            <p className="mt-1 text-[0.66rem] leading-relaxed text-muted-foreground">
              Off means the agent gets no memory tools and no saved note in its prompt. Its notes
              are kept, so turning it back on restores everything.
            </p>

            {agents.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-border px-2.5 py-3 text-[0.68rem] text-muted-foreground">
                Create an agent first — memory is kept per agent.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {agents.map((agent) => (
                  <li
                    key={agent.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5"
                  >
                    <AgentAvatar
                      avatar={agent.avatar}
                      color={agent.color}
                      className="size-6 shrink-0 rounded-md shadow-sm ring-1 ring-black/5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.72rem] font-medium">
                        {agent.name}
                      </span>
                      <span className="block text-[0.58rem] text-muted-foreground tabular-nums">
                        {agent.count} {agent.count === 1 ? "memory" : "memories"}
                      </span>
                    </span>
                    <Switch
                      checked={agent.enabled}
                      aria-label={`Use memory for ${agent.name}`}
                      onCheckedChange={(value: boolean) => void toggleAgent(agent, value)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="aui-eyebrow">Add a note</p>
            <h2 className="mt-1 text-[0.92rem] font-semibold">Write it yourself</h2>

            <div className="mt-3 flex flex-wrap gap-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setDraftAgent(agent.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
                    draftAgent === agent.id
                      ? "border-brand-border bg-brand-soft text-brand-ink"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <AgentAvatar
                    avatar={agent.avatar}
                    color={agent.color}
                    className="size-3.5 rounded-full"
                  />
                  {agent.name}
                </button>
              ))}
            </div>

            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={3}
              maxLength={MEMORY_CONTENT_MAX}
              placeholder="Loves metric units and short replies. Works in Berlin (Europe/Berlin)."
              className="mt-2 min-h-[72px] text-[0.75rem]"
              aria-label="Memory note"
            />

            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="preference, location"
              maxLength={120}
              className="mt-2 h-8 text-[0.72rem]"
              aria-label="Tags, comma separated"
            />

            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[0.56rem] text-muted-foreground">
                {parsedTags.length}/{MEMORY_TAGS_MAX} tags
              </span>
              {MEMORY_TAG_SUGGESTIONS.filter((tag) => !parsedTags.includes(tag))
                .slice(0, 4)
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setTags((prev) => (prev ? `${prev}, ${tag}` : tag))}
                    className="rounded-full border border-border px-1.5 py-px text-[0.54rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    +{tag}
                  </button>
                ))}
            </div>

            <Button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="mt-2.5 h-8 w-full gap-1.5 text-[0.72rem]"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {saving ? "Saving…" : "Add memory"}
            </Button>

            <p className="mt-1.5 text-[0.56rem] leading-relaxed text-muted-foreground">
              Never store passwords, keys or card numbers. Say “remember this” in chat and the agent
              writes the note itself.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

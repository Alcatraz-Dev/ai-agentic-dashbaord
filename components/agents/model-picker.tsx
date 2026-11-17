"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { ModelLogo } from "@/components/agents/model-logo";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentModelCatalog } from "@/lib/agent-options";
import {
  findCatalogModel,
  formatContextLength,
  groupModels,
  matchesModelQuery,
  modelKeyForId,
  type AgentModelInfo,
} from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

type PickerModel = { key: string; info: AgentModelInfo; builtin: boolean };

/**
 * The model picker, shared by the agent panel and the chat header: search by
 * name, id or provider, grouped by provider, each row showing its logo, name,
 * id and whether it runs on the workspace key. Selecting a row reports the
 * stored `provider` key (`ai:<model-id>`) to the caller.
 */
export function ModelPicker({
  catalog,
  value,
  onSelect,
  disabled = false,
  align = "start",
  matchTriggerWidth = false,
  className,
}: {
  catalog: AgentModelCatalog;
  value: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  /** Size the popup to the trigger, so it lines up with the card it belongs to. */
  matchTriggerWidth?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = findCatalogModel(catalog, value);
  const models: PickerModel[] = [
    ...catalog.builtin.map((info) => ({ key: modelKeyForId(info.id), info, builtin: true })),
    // Saved models store their provider key directly (`custom:<row-id>`).
    ...catalog.custom.map((info) => ({ key: info.id, info, builtin: false })),
  ];
  const visible = models.filter(({ info }) => matchesModelQuery(info, query));
  const groups = groupModels(visible.map((entry) => entry.info));
  const byModelId = new Map(visible.map((entry) => [entry.info.id, entry]));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-[0.68rem] font-medium text-muted-foreground transition hover:text-foreground",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <ModelLogo logo={selected.logo} className="size-3" />
        <span className="max-w-40 truncate">{selected.name}</span>

        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className={cn("gap-2 p-2", matchTriggerWidth ? "w-(--anchor-width)" : "w-[21rem]")}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models by name or id"
            aria-label="Search models"
            autoComplete="off"
            className="h-8 rounded-lg bg-background pl-8 text-[0.7rem]"
          />
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.provider} className="space-y-0.5">
              <p className="px-1 pt-1 text-[0.56rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {group.provider}
              </p>

              {group.models.map((info) => {
                const entry = byModelId.get(info.id);
                if (!entry) return null;

                const isSelected = info.id === selected.id;
                const context = formatContextLength(info.contextLength);
                const detail = info.modelId ?? info.id;

                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      onSelect(entry.key);
                      setOpen(false);
                      setQuery("");
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition",
                      isSelected ? "bg-brand-soft ring-1 ring-brand-border" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-background ring-1 ring-border/70">
                      <ModelLogo logo={info.logo} className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[0.7rem] font-medium">{info.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1 py-0.5 text-[0.5rem] font-semibold tracking-wide uppercase",
                            entry.builtin
                              ? "bg-brand-soft text-brand-ink"
                              : "bg-violet-600/10 text-violet-700",
                          )}
                        >
                          {entry.builtin ? "Included" : "Your key"}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[0.58rem] text-muted-foreground">
                        {[detail, context].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {isSelected ? (
                      <Check className="size-3 shrink-0 text-brand-ink" strokeWidth={3} />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-[0.7rem] text-muted-foreground">
              No models match &ldquo;{query}&rdquo;.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

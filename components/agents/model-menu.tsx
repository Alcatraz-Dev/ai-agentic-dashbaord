"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface ModelMenuItem {
  value: string;
  label: string;
}

/** Minimal model menu that shows built-in models and allows connecting custom models. */
export function ModelMenu({ ownerId }: { ownerId: number }) {
  const [models, setModels] = useState<ModelMenuItem[]>([]);
  const [selected, setSelected] = useState<ModelMenuItem | null>(null);

  useEffect(() => {
    // Fetch models from server - placeholder implementation
    // In original implementation, this would call an API endpoint
    if (ownerId) {
      // TODO: fetch from /api/agent-models or similar
    }
  }, [ownerId]);

  const handleSelect = (model: ModelMenuItem) => {
    setSelected(model);
    // TODO: navigate to agent creation or update provider
  };

  return (
    <div className="relative">
      <button
        onClick={() => {}}
        className="flex items-center gap-2 rounded-md border border-bg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-haspopup="menu"
        aria-label="Select model"
      >
        <span>Alcatraz AI</span>
        <svg
          className="ml-1 w-3 h-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {selected && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card p-2 shadow-lg">
          <span>{selected.label}</span>
          <button
            onClick={() => setSelected(null)}
            className="mt-2 text-sm text-muted-foreground hover-underline"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Model list - would be populated from API */}
      {models.length > 0 && (
        <div className="absolute right-0 mt-10 w-64 rounded-xl border border-border bg-card p-4 shadow-lg">
          {models.map((model) => (
            <div
              key={model.value}
              onClick={() => handleSelect(model)}
              className="cursor-pointer px-2 py-1.5 rounded-md hover:bg-muted/60"
            >
              {model.label}
            </div>
          ))}
        </div>
      )}

      {/* No models message */}
      {models.length === 0 && !selected && (
        <p className="text-sm text-muted-foreground">
          No models connected
        </p>
      )}
    </div>
  );
}
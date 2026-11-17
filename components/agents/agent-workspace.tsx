"use client";

import { useState, type ReactNode } from "react";
import { MessageSquare, SlidersHorizontal } from "lucide-react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

/**
 * Responsive layout for the agent page: one pane at a time behind an affectUI
 * SegmentedControl on mobile/tablet, so the chat gets the whole viewport.
 * From `lg` both panes sit side by side and the switch disappears.
 */
export function AgentWorkspace({ chat, panel }: { chat: ReactNode; panel: ReactNode }) {
  const [tab, setTab] = useState<"chat" | "config">("chat");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 lg:hidden">
        <SegmentedControl
          size="sm"
          fullWidth
          kind="tabs"
          variant="tray"
          value={tab}
          onChange={(val) => setTab(val as "chat" | "config")}
          options={[
            {
              value: "chat",
              label: "Chat",
              icon: <MessageSquare className="size-3.5" />,
            },
            {
              value: "config",
              label: "Configure",
              icon: <SlidersHorizontal className="size-3.5" />,
            },
          ]}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={cn("min-h-0", tab === "config" && "hidden lg:block")}>{chat}</div>
        <div className={cn("min-h-0 lg:overflow-y-auto lg:pr-1", tab === "chat" && "hidden lg:block")}>
          {panel}
        </div>
      </div>
    </div>
  );
}

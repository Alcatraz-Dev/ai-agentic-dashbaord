"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronDown, MessageSquare, PanelLeft, SlidersHorizontal } from "lucide-react";

import { ComposerIntentProvider } from "@/components/agents/composer-intent";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

/**
 * The agent page shell: **two columns, never three**.
 *
 * The chat is the big column and always keeps everything that is left. The
 * template workbench and the configuration rail share a single left column,
 * stacked and each collapsible, so opening both can never squeeze the chat into
 * a sliver (which is what caused the horizontal scroll and the overlapping
 * cards).
 *
 * Below `lg` the same panes become tabs, because a dock that narrow is useless
 * on a phone.
 */

type LayoutId = "focus" | "desk" | "rail" | "split";

/** Before layouts were remembered per template, one key held the owner's choice. */
const LEGACY_LAYOUT_KEY = "alcatraz-agent-layout";

/** Each template keeps its own layout, so a quiet chat layout never hides a pane. */
function layoutKeyFor(template: string): string {
  return `alcatraz-agent-layout:${template}`;
}

/**
 * The left column is resizable, because a code pane is useless at 21rem: past
 * ~40rem the developer workbench switches to its two-column explorer/editor.
 * The width is remembered per browser, like the layout choice.
 */
const DOCK_WIDTH_KEY = "alcatraz-dock-width";
const DOCK_MIN = 18.5;
const DOCK_MAX = 46;
const DOCK_DEFAULT = 21;

function clampDock(rem: number): number {
  return Math.min(DOCK_MAX, Math.max(DOCK_MIN, Math.round(rem * 2) / 2));
}

const LAYOUTS: { id: LayoutId; label: string; icon: ReactNode }[] = [
  { id: "focus", label: "Chat", icon: <MessageSquare className="size-3.5" /> },
  { id: "desk", label: "Desk", icon: <PanelLeft className="size-3.5" /> },
  { id: "rail", label: "Config", icon: <SlidersHorizontal className="size-3.5" /> },
  { id: "split", label: "All", icon: <PanelLeft className="size-3.5" /> },
];

type Docks = { desk: boolean; rail: boolean };

function docksFor(layout: LayoutId): Docks {
  return {
    desk: layout === "desk" || layout === "split",
    rail: layout === "rail" || layout === "split",
  };
}

function isLayout(value: string | null): value is LayoutId {
  return value === "focus" || value === "desk" || value === "rail" || value === "split";
}

export function AgentWorkspace({
  chat,
  panel,
  workbench,
  workbenchLabel,
  template = "blank",
}: {
  chat: ReactNode;
  panel: ReactNode;
  workbench?: ReactNode;
  workbenchLabel?: string;
  /** The active dashboard's template: one pane set and one layout per template. */
  template?: string;
}) {
  const [tab, setTab] = useState<"work" | "chat" | "config">("chat");
  const [layout, setLayout] = useState<LayoutId>("focus");
  const [docks, setDocks] = useState<Docks>({ desk: false, rail: false });
  const [dockWidth, setDockWidth] = useState(DOCK_DEFAULT);
  const [resizingDock, setResizingDock] = useState(false);
  const dockWidthRef = useRef(DOCK_DEFAULT);
  const dockDragRef = useRef<{ x: number; width: number } | null>(null);

  dockWidthRef.current = dockWidth;

  useEffect(() => {
    let stored = NaN;
    try {
      stored = Number(window.localStorage.getItem(DOCK_WIDTH_KEY) ?? "");
    } catch {
      // Private mode: the default width still works.
    }
    if (Number.isFinite(stored) && stored >= DOCK_MIN && stored <= DOCK_MAX) {
      setDockWidth(stored);
    }
  }, []);

  function rememberDock(width: number) {
    try {
      window.localStorage.setItem(DOCK_WIDTH_KEY, String(width));
    } catch {
      // Ignore storage failures; the width still applies for this render.
    }
  }

  function beginDockResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dockDragRef.current = { x: event.clientX, width: dockWidthRef.current };
    setResizingDock(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDockResize(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dockDragRef.current;
    if (!drag) return;
    const rem = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    setDockWidth(clampDock(drag.width + (event.clientX - drag.x) / rem));
  }

  function endDockResize() {
    if (!dockDragRef.current) return;
    dockDragRef.current = null;
    setResizingDock(false);
    rememberDock(dockWidthRef.current);
  }

  function nudgeDock(delta: number) {
    const next = clampDock(dockWidthRef.current + delta);
    setDockWidth(next);
    rememberDock(next);
  }

  function resetDock() {
    setDockWidth(DOCK_DEFAULT);
    rememberDock(DOCK_DEFAULT);
  }

  const layoutKey = layoutKeyFor(template);
  const hasWorkbench = Boolean(workbench);

  useEffect(() => {
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem(layoutKey);
      // A blank dashboard has no pane of its own, so it keeps honouring the
      // choice saved before layouts were stored per template.
      if (!isLayout(stored) && template === "blank") {
        stored = window.localStorage.getItem(LEGACY_LAYOUT_KEY);
      }
    } catch {
      // Private mode: the default layout still works.
    }

    if (isLayout(stored)) {
      // A template without its own pane can only be Chat or Config, so a layout
      // saved before the workbench existed never opens an empty desk.
      const next: LayoutId =
        !hasWorkbench && (stored === "desk" || stored === "split") ? "rail" : stored;
      setLayout(next);
      setDocks(docksFor(next));
      return;
    }

    // Each template opens its own way: one with a workbench shows that pane
    // beside the chat, one without stays on the conversation alone.
    const fallback: LayoutId = hasWorkbench ? "desk" : "focus";
    setLayout(fallback);
    setDocks(docksFor(fallback));
  }, [layoutKey, hasWorkbench, template]);

  // Tabs are the phone's control and docks are the desktop's. Crossing into the
  // wide layout drops a phone tab, so the picker and the panes always describe
  // the same state instead of showing “Desk” with nothing open.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (query.matches) setTab("chat");
    };

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function chooseLayout(next: LayoutId) {
    // One choice drives both surfaces: the desktop docks and the phone tabs.
    // Leaving the phone tab on a panel would hide the chat the picker reopened.
    setTab("chat");
    setLayout(next);
    setDocks(docksFor(next));
    try {
      window.localStorage.setItem(layoutKey, next);
    } catch {
      // Ignore storage failures; the panes still open for this render.
    }
  }

  /** Collapsing one panel keeps the other where it was. */
  function toggleDock(which: keyof Docks) {
    // A dock header on a phone is a close button: the chat comes back.
    if (tab !== "chat") {
      setTab("chat");
      return;
    }

    const next = { ...docks, [which]: !docks[which] };
    const nextLayout: LayoutId =
      next.desk && next.rail ? "split" : next.desk ? "desk" : next.rail ? "rail" : "focus";

    setDocks(next);
    setLayout(nextLayout);
    try {
      window.localStorage.setItem(layoutKey, nextLayout);
    } catch {
      // Ignore.
    }
  }

  // On a phone the tab decides; from `lg` the docks do.
  const showDesk = hasWorkbench && (docks.desk || tab === "work");
  const showRail = docks.rail || tab === "config";
  const deskOpen = docks.desk || tab === "work";
  const railOpen = docks.rail || tab === "config";
  const columnOnMobile = tab !== "chat";
  const columnOnDesktop = docks.desk || docks.rail;

  const layoutOptions = (
    hasWorkbench ? LAYOUTS : LAYOUTS.filter((entry) => entry.id === "focus" || entry.id === "rail")
  ).map((entry) => ({
    value: entry.id,
    label: entry.id === "desk" ? (workbenchLabel ?? "Desk") : entry.label,
    icon: entry.icon,
  }));

  const activeLayout: LayoutId = showDesk && showRail ? "split" : showDesk ? "desk" : showRail ? "rail" : "focus";

  return (
    <ComposerIntentProvider>
      {/*
        The workspace owns the viewport height, exactly like the developer pane
        owns its column: everything below is a bounded box, so Chat / Desk /
        Config / All can never grow the page, overlap a pane or scroll sideways.
        The three steps match the shell's header (h-14 / sm:h-16) and content
        padding (p-3 / sm:p-6 / lg:p-8).
      */}
      <div className="flex h-[calc(100dvh-5rem)] min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-hidden sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)]">
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
          <div className="lg:hidden">
            <SegmentedControl
              size="sm"
              fullWidth
              kind="tabs"
              variant="tray"
              value={tab}
              onChange={(val) => setTab(val as "work" | "chat" | "config")}
              options={[
                ...(workbench
                  ? [
                      {
                        value: "work",
                        label: workbenchLabel ?? "Desk",
                        icon: <PanelLeft className="size-3.5" />,
                      },
                    ]
                  : []),
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

          <div className="ml-auto hidden min-w-0 items-center justify-end gap-2 lg:flex">
            <span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
              Layout
            </span>
            <SegmentedControl
              size="sm"
              kind="tabs"
              variant="tray"
              value={activeLayout}
              onChange={(val) => chooseLayout(val as LayoutId)}
              options={layoutOptions}
            />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden">
          {/*
            One left column holds both panels, stacked and collapsible. The
            column itself never scrolls: an open panel takes its share of the
            height and scrolls its own body, exactly like the developer pane.
            Without that split the two cards are flex children of a bounded
            column, and a card with `overflow-hidden` shrinks to its header —
            which hid every pane body.
          */}
          <aside
            style={{ "--dock": `${dockWidth}rem` } as CSSProperties}
            className={cn(
              "min-h-0 w-full min-w-0 flex-col gap-2 overflow-hidden lg:w-[var(--dock)] lg:shrink-0 lg:pr-0.5",
              columnOnMobile ? "flex" : "hidden",
              columnOnDesktop ? "lg:flex" : "lg:hidden",
            )}
            aria-label="Workspace panels"
          >
            {showDesk ? (
              <DockSection
                title={workbenchLabel ?? "Workbench"}
                open={deskOpen}
                onToggle={() => toggleDock("desk")}
              >
                {workbench}
              </DockSection>
            ) : null}

            {showRail ? (
              <DockSection
                title="Configure"
                open={railOpen}
                onToggle={() => toggleDock("rail")}
              >
                {panel}
              </DockSection>
            ) : null}
          </aside>

          {columnOnDesktop ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the panel column"
              aria-valuenow={dockWidth}
              aria-valuemin={DOCK_MIN}
              aria-valuemax={DOCK_MAX}
              tabIndex={0}
              title="Drag to widen the panel column · double-click to reset"
              onPointerDown={beginDockResize}
              onPointerMove={moveDockResize}
              onPointerUp={endDockResize}
              onPointerCancel={endDockResize}
              onDoubleClick={resetDock}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  nudgeDock(-2);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  nudgeDock(2);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  resetDock();
                }
              }}
              className={cn(
                "hidden w-1 shrink-0 cursor-col-resize self-stretch rounded-full transition-colors lg:block",
                resizingDock ? "bg-brand-ink/50" : "bg-border hover:bg-brand-border",
              )}
            />
          ) : null}

          <div
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              tab === "chat" ? "flex" : "hidden",
              "lg:flex",
            )}
          >
            {chat}
          </div>
        </div>
      </div>
    </ComposerIntentProvider>
  );
}

/**
 * A collapsible panel in the left column: a fixed header row, then a body that
 * scrolls inside whatever height the panel is given. An open panel takes an
 * equal share of the column (one open panel takes all of it), and a collapsed
 * one is just its header, so both panels can be open without either clipping.
 */
function DockSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card/40",
        open ? "flex-1" : "shrink-0",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1 truncate text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1.5 pb-1.5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

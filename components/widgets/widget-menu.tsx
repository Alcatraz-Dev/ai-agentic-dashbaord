"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Copy,
  Lock,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WidgetEditDialog } from "@/components/widgets/widget-edit-dialog";
import { WidgetScheduleDialog } from "@/components/widgets/widget-schedule-dialog";
import { WIDGET_SIZES, type WidgetRecord, type WidgetSize } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

const SIZE_LABELS: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/**
 * The widget's own menu. "Update now" runs its read-only update in place,
 * "Edit with agent" either navigates to that agent's chat or hands the widget
 * to the chat already open, and delete is confirmed because a widget can hold
 * weeks of refreshed data.
 */
export function WidgetMenu({
  widget,
  onDelete,
  onRefresh,
  onApplied,
  editHref,
  onEdit,
  onCustomize,
  onDuplicate,
  onResize,
  resizing = false,
  onToggleLock,
  onResetDesign,
  className,
}: {
  widget: WidgetRecord;
  /** Returns an error message, or null when the widget is gone. */
  onDelete: () => Promise<string | null>;
  /** Runs one update; returns an error message, or null on success. */
  onRefresh?: () => Promise<string | null>;
  /** Receives the widget after an AI edit is applied. */
  onApplied?: (widget: WidgetRecord) => void;
  editHref?: string;
  onEdit?: () => void;
  onCustomize?: () => void;
  onDuplicate?: () => void;
  /** Resize without dragging; the drag handles stay the fast path. */
  onResize?: (size: WidgetSize) => void;
  /** True while a resize is being saved, so the size row can show progress. */
  resizing?: boolean;
  onToggleLock?: () => void;
  onResetDesign?: () => void;
  className?: string;
}) {
  const [editingWithAi, setEditingWithAi] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshNow() {
    if (!onRefresh || refreshing) return;

    setRefreshing(true);
    setRefreshError(null);

    try {
      const message = await onRefresh();
      if (message) setRefreshError(message);
    } catch {
      setRefreshError("We couldn't update that widget. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);

    try {
      const message = await onDelete();
      if (message) {
        setError(message);
        return;
      }
      setConfirming(false);
    } catch {
      setError("We couldn't delete that widget. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${widget.title}`}
          className={cn(
            "grid size-7 place-items-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-48">
          {onResize ? (
            <div data-no-drag className="px-2 pt-1.5 pb-2">
              <p className="pb-1.5 text-[0.6rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                Size
              </p>
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
                {WIDGET_SIZES.map((option) => {
                  const active = widget.size === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${SIZE_LABELS[option]} widget`}
                      disabled={resizing}
                      onClick={() => {
                        if (!active) onResize(option);
                      }}
                      className={cn(
                        "flex h-6 flex-1 items-center justify-center gap-1 rounded-md text-[0.66rem] font-medium capitalize transition",
                        active
                          ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                          : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                      )}
                    >
                      {resizing && active ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        option
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {onResize ? <DropdownMenuSeparator /> : null}
          {onCustomize ? (
            <DropdownMenuItem onClick={onCustomize} className="gap-2 text-[0.8rem]">
              <SlidersHorizontal className="size-3.5" />
              Customize
            </DropdownMenuItem>
          ) : null}
          {onDuplicate ? (
            <DropdownMenuItem onClick={onDuplicate} className="gap-2 text-[0.8rem]">
              <Copy className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
          ) : null}
          {onRefresh && widget.form !== "diagram" ? (
            <DropdownMenuItem
              disabled={refreshing}
              onClick={() => void refreshNow()}
              className="gap-2 text-[0.8rem]"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {refreshing ? "Updating…" : "Update now"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => setEditingWithAi(true)}
            className="gap-2 text-[0.8rem]"
          >
            <Sparkles className="size-3.5" />
            Edit with AI
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setEditingSchedule(true)}
            className="gap-2 text-[0.8rem]"
          >
            <CalendarClock className="size-3.5" />
            Update schedule
          </DropdownMenuItem>
          {editHref ? (
            <DropdownMenuItem
              nativeButton={false}
              render={<Link href={editHref} />}
              className="gap-2 text-[0.8rem]"
            >
              <PencilLine className="size-3.5" />
              Edit with agent
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={onEdit}
              className="gap-2 text-[0.8rem]"
            >
              <PencilLine className="size-3.5" />
              Edit with agent
            </DropdownMenuItem>
          )}
          {onToggleLock ? (
            <DropdownMenuItem onClick={onToggleLock} className="gap-2 text-[0.8rem]">
              {widget.locked ? (
                <Unlock className="size-3.5" />
              ) : (
                <Lock className="size-3.5" />
              )}
              {widget.locked ? "Unlock widget" : "Lock widget"}
            </DropdownMenuItem>
          ) : null}
          {onResetDesign ? (
            <DropdownMenuItem onClick={onResetDesign} className="gap-2 text-[0.8rem]">
              <RotateCcw className="size-3.5" />
              Reset design
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            className="gap-2 text-[0.8rem]"
          >
            <Trash2 className="size-3.5" />
            Delete widget
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WidgetEditDialog
        widget={widget}
        open={editingWithAi}
        onOpenChange={setEditingWithAi}
        onApplied={(updated) => onApplied?.(updated)}
      />

      <WidgetScheduleDialog
        key={`schedule-${widget.id}-${editingSchedule ? "open" : "closed"}`}
        widget={widget}
        open={editingSchedule}
        onOpenChange={setEditingSchedule}
        onSaved={(updated) => onApplied?.(updated)}
      />

      <AlertDialog
        open={refreshError !== null}
        onOpenChange={(open) => {
          if (!open) setRefreshError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Couldn’t update this widget</AlertDialogTitle>
            <AlertDialogDescription>
              {refreshError ?? "The update didn’t run."} The last data is still on the card.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={() => void refreshNow()}>Try again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false);
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this widget?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{widget.title}</span> disappears from
              your dashboard and this chat. Any scheduled sync stops with it. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[0.75rem] text-rose-700">{error}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete widget"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

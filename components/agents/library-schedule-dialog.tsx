"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, TriangleAlert } from "lucide-react";

import {
  attachAgentLibraryItemAction,
  type UpdateAgentLibraryResult,
} from "@/app/actions/agents";
import { createAgentScheduleAction } from "@/app/actions/schedules";
import { ScheduleRuleFields } from "@/components/agents/schedule-rule-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import {
  browserTimeZone,
  normalizeScheduleRule,
  type ScheduleRule,
} from "@/lib/agent-schedule-options";
import { DEFAULT_WIDGET_SCHEDULE_RULE } from "@/lib/schedule-rule";

/**
 * Schedules a recurring run that uses one workspace skill or plugin.
 *
 * It is a normal agent schedule — the same rule fields, the same CloudHike Jobs
 * mirror and the same History as any other run, exactly like a board card's
 * "Schedule this card". What it adds is the attachment step: the skill or
 * plugin is switched on for this agent first, so the run it creates can really
 * load the skill or call the plugin instead of naming something the agent was
 * not allowed to use. Nothing is scheduled until Run schedule.
 */
export function LibraryScheduleDialog({
  open,
  onOpenChange,
  agentId,
  agentName,
  title: initialTitle,
  prompt: initialPrompt,
  attach,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: number;
  agentName: string;
  /** Default schedule name, editable. */
  title: string;
  /** Default brief for each run, editable. */
  prompt: string;
  /** The skill name or plugin slug to switch on for this agent. */
  attach?: { kind: "skill" | "plugin"; name: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [rule, setRule] = useState<ScheduleRule>(() =>
    normalizeScheduleRule(
      { frequency: "daily", times: [{ hour: 9, minute: 0 }], timezone: browserTimeZone() },
      DEFAULT_WIDGET_SCHEDULE_RULE,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: number;
    title: string;
    nextRunAt: string | null;
    note: string | null;
  } | null>(null);

  async function submit() {
    if (saving || created) return;
    if (!title.trim()) {
      setError("Give this schedule a name.");
      return;
    }
    if (!prompt.trim()) {
      setError("Say what the agent should do each run.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let attachNote: string | null = null;

      if (attach) {
        const attached: UpdateAgentLibraryResult = await attachAgentLibraryItemAction({
          id: agentId,
          kind: attach.kind,
          name: attach.name,
        });

        if (!attached.ok) {
          setError(attached.error);
          return;
        }

        attachNote = `The ${attach.kind} is on for ${agentName}.`;
      }

      const result = await createAgentScheduleAction({
        agentId,
        title,
        prompt,
        rule,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCreated({
        id: result.schedule.id,
        title: result.schedule.title,
        nextRunAt: result.schedule.nextRunAt ?? null,
        note: attachNote,
      });
      router.refresh();
      toast.add({
        title: "Run scheduled",
        description: `${result.schedule.title} is set for ${agentName}.`,
        type: "success",
      });
    } catch (submitError) {
      console.error("[agents] library schedule failed", submitError);
      setError("We couldn't schedule that run. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const nextLabel = created?.nextRunAt
    ? new Date(created.nextRunAt).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: rule.timezone,
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        {created ? (
          <div className="space-y-4 px-5 py-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading text-base font-semibold">
                <span className="grid size-8 place-items-center rounded-full bg-emerald-500 text-white">
                  <CalendarClock className="size-4" />
                </span>
                Run schedule created
              </DialogTitle>
              <DialogDescription className="text-[0.78rem] leading-relaxed">
                {created.title} runs on {agentName}
                {nextLabel ? ` next ${nextLabel}` : ""}. {created.note ?? ""}
              </DialogDescription>
            </DialogHeader>

            <p className="rounded-lg bg-muted/50 px-3 py-2 text-[0.66rem] leading-relaxed text-muted-foreground">
              It is an ordinary scheduled run: it appears in the agent&apos;s Scheduling → Regular
              Scheduling tab and its results land in History, and every run may use any other tool
              this agent already has.
            </p>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 px-2.5 text-[0.74rem]"
              >
                Done
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/dashboard/agents/${agentId}`);
                }}
                className="h-8 gap-1.5 px-3 text-[0.74rem]"
              >
                Open {agentName}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-heading text-base font-semibold">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  Schedule a run
                </DialogTitle>
                <DialogDescription className="text-[0.78rem] leading-relaxed">
                  {attach
                    ? `${attach.kind === "skill" ? "This skill" : "This plugin"} is switched on for ${agentName} first, then runs on the rule below.`
                    : `Runs on ${agentName} with the rule below.`}
                </DialogDescription>
              </DialogHeader>

              <TextField
                id="library-schedule-title"
                label="Name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                autoComplete="off"
              />

              <TextArea
                id="library-schedule-prompt"
                label="What should each run do?"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                minRows={4}
                maxLength={4_000}
              />

              <ScheduleRuleFields rule={rule} onChange={setRule} disabled={saving} />

              {error ? (
                <p className="flex items-start gap-1.5 text-[0.72rem] leading-relaxed text-destructive">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="h-8 px-2.5 text-[0.74rem]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void submit()}
                disabled={saving}
                className="h-8 gap-1.5 px-3 text-[0.74rem]"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {saving ? "Scheduling…" : "Run schedule"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

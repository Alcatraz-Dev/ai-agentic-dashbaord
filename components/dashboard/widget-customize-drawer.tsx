"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Lock,
  Paintbrush,
  Palette,
  PanelTop,
  RefreshCw,
  Rows3,
  Sparkles,
  Type,
  Unlock,
} from "lucide-react";

import {
  duplicateWidgetAction,
  refreshWidgetNowAction,
  setWidgetAgentAction,
  setWidgetEditModelAction,
  setWidgetLockAction,
  updateWidgetAppearanceAction,
  updateWidgetDesignAction,
  updateWidgetFormAction,
} from "@/app/actions/widgets";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { ImageUploadField } from "@/components/dashboard/image-upload-field";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ModelPicker } from "@/components/agents/model-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WidgetCard } from "@/components/widgets/widget-card";
import type { AgentModelCatalog, AgentSummary } from "@/lib/agent-options";
import { getWidgetIcon } from "@/components/widgets/widget-icon";
import { WidgetScheduleDialog } from "@/components/widgets/widget-schedule-dialog";
import {
  DEFAULT_WIDGET_APPEARANCE,
  normalizeWidgetAppearance,
  type WidgetAppearance,
} from "@/lib/widget-appearance";
import {
  availableWidgetForms,
  getWidgetDesign,
  getWidgetForm,
  WIDGET_DESIGNS,
  WIDGET_SIZES,
  type WidgetDesignKey,
  type WidgetForm,
  type WidgetIconKey,
  type WidgetRecord,
  type WidgetSize,
} from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * "Customize" drawer for one widget.
 *
 * Every control edits a local draft that the live preview renders immediately:
 * the chosen style, form and appearance only reach the widget on Save. The
 * Style tab offers every finished look as a tiny live preview, the other tabs
 * refine it, and the footer stays quiet until something actually changed.
 */

const TABS = [
  { key: "style", label: "Style", icon: Palette },
  { key: "look", label: "Look", icon: Paintbrush },
  { key: "layout", label: "Layout", icon: Rows3 },
  { key: "type", label: "Type", icon: Type },
  { key: "header", label: "Header", icon: PanelTop },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.72rem] font-medium text-foreground">{label}</span>
        {hint ? <span className="text-[0.62rem] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border/60 py-4 first:border-t-0 first:pt-0">
      {title ? (
        <div className="space-y-0.5">
          <p className="text-[0.6rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {title}
          </p>
          {description ? (
            <p className="text-[0.62rem] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Choices<T extends string>({
  value,
  options,
  disabled = false,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl
      size="sm"
      fullWidth
      variant="tray"
      disabled={disabled}
      value={value}
      onChange={(v) => onChange(v as T)}
      options={options}
    />
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[0.72rem] text-muted-foreground">
      <span>{label}</span>
      <ColorPicker
        value={value}
        onValueChange={onChange}
        label={label}
        showValue
        size="sm"
        align="end"
      />
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  suffix = "px",
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={`${value}${suffix}`}>
      <Slider
        min={min}
        max={max}
        value={[value]}
        disabled={disabled}
        aria-label={label}
        onValueChange={(next) => onChange(Array.isArray(next) ? next[0] : next)}
      />
    </Field>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:border-foreground/20"
    >
      <span className="min-w-0">
        <span className="block text-[0.72rem] font-medium">{label}</span>
        <span className="block text-[0.62rem] text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition",
          checked ? "bg-foreground" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-card shadow-sm transition",
            checked ? "left-4.5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** The quiet icon+label actions that used to be button blocks under every tab. */
function ActionButton({
  icon,
  label,
  busy = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.66rem] font-medium text-muted-foreground transition outline-none hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

/**
 * A one-glance rendering of a style, drawn with that style's own tokens, so
 * the picker shows the look instead of describing it.
 */
function StyleMini({ designKey, icon }: { designKey: WidgetDesignKey; icon: WidgetIconKey }) {
  const design = getWidgetDesign(designKey);
  const Icon = getWidgetIcon(icon);

  return (
    <div className={cn("flex h-full flex-col justify-between gap-1 p-1.5", design.shell)}>
      <div className="flex items-center gap-1">
        <span className={cn("grid size-3.5 shrink-0 place-items-center rounded", design.iconTile)}>
          <Icon className="size-2" strokeWidth={2.5} />
        </span>
        <span className={cn("h-1 w-8 rounded-full bg-current opacity-20", design.title)} />
      </div>
      <span className={cn("text-[10px] leading-none font-bold", design.heading, design.value)}>
        84%
      </span>
      <span className="h-1 w-3/4 rounded-full" style={{ background: design.accent }} />
    </div>
  );
}

type Baseline = { appearance: string; design: WidgetDesignKey; form: WidgetForm };

const baselineOf = (widget: WidgetRecord): Baseline => ({
  appearance: JSON.stringify(normalizeWidgetAppearance(widget.appearance)),
  design: widget.design,
  form: widget.form,
});

export function WidgetCustomizeDrawer({
  widget,
  models,
  agents,
  open,
  onOpenChange,
  onSaved,
  onResize,
  onDuplicate,
}: {
  widget: WidgetRecord | null;
  /** Models offered for this widget's edits ("Edit with AI" and the footer). */
  models?: AgentModelCatalog;
  /** This dashboard's agents: the only agents a card can be moved to. */
  agents?: AgentSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (widget: WidgetRecord) => void;
  onResize: (size: WidgetSize) => void;
  onDuplicate: () => void;
}) {
  const [draft, setDraft] = useState<WidgetAppearance>(DEFAULT_WIDGET_APPEARANCE);
  const [rememberedImage, setRememberedImage] = useState("");
  // Style and form are drafts too: they only reach the widget on Save.
  const [design, setDesign] = useState<WidgetDesignKey>("classic");
  const [form, setForm] = useState<WidgetForm>("number");
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [tab, setTab] = useState<TabKey>("style");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(0);

  useEffect(() => {
    if (!open || !widget) return;
    const next = normalizeWidgetAppearance(widget.appearance);
    setDraft(next);
    setRememberedImage(next.background.kind === "image" ? (next.background.url ?? "") : "");
    setDesign(widget.design);
    setForm(widget.form);
    setBaseline(baselineOf(widget));
    setError(null);
    setNote(null);
    setTab("style");
    // Re-seed only when a different widget opens, so a size change or a save
    // never wipes edits the owner is still making.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widget?.id]);

  // The preview takes the drawer's real width instead of a fixed size.
  useEffect(() => {
    if (!open) return;
    const node = previewRef.current;
    if (!node) return;

    const measure = () => setPreviewWidth(Math.round(node.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  if (!widget) return null;

  const background = draft.background;
  const dirty =
    baseline !== null &&
    (design !== baseline.design ||
      form !== baseline.form ||
      JSON.stringify(draft) !== baseline.appearance);
  const designName = getWidgetDesign(design).name;
  const formName = getWidgetForm(form).name;
  const supportedForms = availableWidgetForms(widget.data);

  function patch(next: Partial<WidgetAppearance>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function setBackgroundKind(kind: WidgetAppearance["background"]["kind"]) {
    if (kind === "theme") patch({ background: { kind: "theme" } });
    else if (kind === "solid")
      patch({ background: { kind: "solid", color: background.color ?? "#ffffff" } });
    else if (kind === "gradient")
      patch({
        background: {
          kind: "gradient",
          from: background.from ?? "#1d4ed8",
          to: background.to ?? "#8b5cf6",
          angle: background.angle ?? 135,
        },
      });
    else
      patch({
        background: {
          kind: "image",
          url: rememberedImage,
          overlay: background.overlay ?? 35,
        },
      });
  }

  async function save() {
    if (saving || !widget) return;
    if (draft.background.kind === "image" && !draft.background.url) {
      setTab("look");
      setError("Upload an image first, or choose another background type.");
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      // Style and form are written first, so the appearance call returns the
      // whole updated card and the drawer and dashboard can never disagree.
      if (design !== widget.design) {
        const designed = await updateWidgetDesignAction({ id: widget.id, design });
        if (!designed.ok) {
          setTab("style");
          setError(designed.error);
          return;
        }
      }

      if (form !== widget.form) {
        const formed = await updateWidgetFormAction({ id: widget.id, form });
        if (!formed.ok) {
          setTab("style");
          setError(formed.error);
          return;
        }
      }

      const result = await updateWidgetAppearanceAction({ id: widget.id, appearance: draft });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDesign(result.widget.design);
      setForm(result.widget.form);
      setBaseline(baselineOf(result.widget));
      onSaved(result.widget);
      setNote("Saved.");
    } catch {
      setError("We couldn't save that appearance. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (saving || !widget) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateWidgetAppearanceAction({ id: widget.id, appearance: null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.widget);
      setDraft(normalizeWidgetAppearance(result.widget.appearance));
      setRememberedImage("");
      setDesign(result.widget.design);
      setForm(result.widget.form);
      setBaseline(baselineOf(result.widget));
      setNote("Design restored.");
    } catch {
      setError("We couldn't reset that design. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshNow() {
    if (refreshing || !widget) return;
    setRefreshing(true);
    setError(null);
    setNote(null);
    try {
      const result = await refreshWidgetNowAction({ id: widget.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.widget);
      setNote(result.note || "Updated.");
    } catch {
      setError("We couldn't update that widget. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleLock() {
    if (!widget) return;
    setError(null);
    const result = await setWidgetLockAction({ id: widget.id, locked: !widget.locked });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.widget);
  }

  async function duplicate() {
    if (!widget) return;
    setError(null);
    const result = await duplicateWidgetAction({ id: widget.id });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDuplicate();
    onOpenChange(false);
  }

  async function pickAgent(agentId: number) {
    if (!widget || agentId === widget.agentId) return;
    setError(null);
    setNote(null);
    const result = await setWidgetAgentAction({ id: widget.id, agentId });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.widget);
    setNote(`Edits now run with ${result.widget.agentName}.`);
  }

  async function pickModel(modelKey: string) {
    if (!widget) return;
    setError(null);
    setNote(null);
    const result = await setWidgetEditModelAction({ id: widget.id, modelKey });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.widget);
    setNote("Saved the model for this widget's edits.");
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[27rem]">
          <SheetHeader className="gap-1 border-b border-border/70 px-4 py-3.5 pr-11">
            <SheetTitle className="flex items-center gap-2.5 text-[0.95rem]">
              <span className="brand-gradient grid size-7 shrink-0 place-items-center rounded-lg text-brand-on">
                <Sparkles className="size-3.5" />
              </span>
              <span className="min-w-0 truncate">Customize widget</span>
              {dirty ? (
                <span className="ml-auto shrink-0 rounded-full border border-brand-border bg-brand-soft/60 px-2 py-0.5 text-[0.58rem] font-medium text-brand-ink">
                  Unsaved
                </span>
              ) : null}
            </SheetTitle>
            <SheetDescription className="text-[0.7rem] leading-relaxed">
              Everything below previews on “{widget.title}” as you change it.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border/60 bg-muted/25 px-4 pt-3 pb-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[0.58rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  Live preview
                </span>
                <span className="max-w-[62%] truncate rounded-full border border-border/70 bg-card px-2 py-0.5 text-[0.58rem] font-medium text-muted-foreground">
                  {designName} · {formName} · {widget.size}
                </span>
              </div>

              <div ref={previewRef} className="w-full">
                <div
                  className="mx-auto"
                  style={{ width: previewWidth > 0 ? `${previewWidth}px` : "100%" }}
                >
                  <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
                    <WidgetCard
                      // The draft's style and form are previewed too; before,
                      // picking a style changed nothing on screen.
                      widget={{ ...widget, design, form, appearance: draft }}
                      size={widget.size}
                      variant="preview"
                      className="h-[196px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-b border-border/60 px-4 py-2">
              <ActionButton
                icon={<RefreshCw className="size-3" />}
                label="Update"
                busy={refreshing}
                onClick={() => void refreshNow()}
              />
              <ActionButton
                icon={<CalendarClock className="size-3" />}
                label="Schedule"
                onClick={() => setScheduleOpen(true)}
              />
              <ActionButton
                icon={<Copy className="size-3" />}
                label="Duplicate"
                onClick={() => void duplicate()}
              />
              <ActionButton
                icon={widget.locked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                label={widget.locked ? "Unlock" : "Lock"}
                onClick={() => void toggleLock()}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2">
              <span className="text-[0.56rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Edits run with
              </span>
              {agents && agents.length > 0 ? (
                <Popover>
                  <PopoverTrigger className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-[0.66rem] font-medium text-muted-foreground transition hover:text-foreground">
                    <AgentAvatar
                      avatar={widget.agentAvatar}
                      color={widget.agentColor}
                      className="size-4 shrink-0 rounded-full"
                    />
                    <span className="max-w-24 truncate">{widget.agentName}</span>
                    <ChevronDown className="size-3 shrink-0 opacity-60" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="z-[70] w-60 gap-0.5 p-1.5">
                    <p className="px-1.5 pt-1 pb-1 text-[0.56rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                      This dashboard&apos;s agents
                    </p>
                    {agents.map((agent) => {
                      const active = agent.id === widget.agentId;

                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => void pickAgent(agent.id)}
                          aria-pressed={active}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-muted/60",
                            active && "bg-brand-soft/50",
                          )}
                        >
                          <AgentAvatar
                            avatar={agent.avatar}
                            color={agent.color}
                            className="size-5 shrink-0 rounded-md"
                          />
                          <span className="min-w-0 flex-1 truncate text-[0.7rem] font-medium">
                            {agent.name}
                          </span>
                          {active ? (
                            <Check className="size-3 shrink-0 text-brand-ink" strokeWidth={3} />
                          ) : null}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="truncate text-[0.66rem] font-medium text-foreground">
                  {widget.agentName}
                </span>
              )}
              {models ? (
                <div className="ml-auto min-w-0 max-w-52 flex-[1_1_8rem]">
                  <ModelPicker
                    catalog={models}
                    value={widget.editModel ?? widget.agentProvider ?? models.defaultKey}
                    onSelect={(key) => void pickModel(key)}
                    align="end"
                    matchTriggerWidth
                    className="justify-between"
                  />
                </div>
              ) : null}
            </div>

            <div className="border-b border-border/60 px-3 py-2">
              <SegmentedControl
                size="sm"
                fullWidth
                variant="tray"
                kind="tabs"
                value={tab}
                onChange={(value) => setTab(value as TabKey)}
                options={TABS.map((entry) => ({
                  value: entry.key,
                  label: entry.label,
                  icon: <entry.icon className="size-3" />,
                }))}
              />
            </div>

            <div className="p-4">
              {tab === "style" ? (
                <>
                  <Section
                    title="Style"
                    description="Each look has its own surface, type and texture. The preview above follows your pick."
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      {WIDGET_DESIGNS.map((option) => {
                        const selected = design === option.key;

                        return (
                          <button
                            key={option.key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setDesign(option.key)}
                            className={cn(
                              "min-w-0 overflow-hidden rounded-xl border text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected
                                ? "border-brand-border ring-1 ring-brand-border"
                                : "border-border hover:border-foreground/15",
                            )}
                          >
                            <span className="block h-14 overflow-hidden p-1">
                              <StyleMini designKey={option.key} icon={widget.icon} />
                            </span>
                            <span className="block truncate border-t border-border/60 px-2 py-1 text-[0.66rem] font-medium">
                              {option.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section
                    title="Form"
                    description="How the stored data is drawn. Only forms this data can honestly support are offered."
                  >
                    <div className="space-y-1">
                      {supportedForms.map((key) => {
                        const option = getWidgetForm(key);
                        const selected = form === key;

                        return (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setForm(key)}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected
                                ? "border-brand-border bg-brand-soft/50"
                                : "border-border bg-card hover:bg-muted/50",
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.7rem] font-medium">
                                {option.name}
                              </span>
                              <span className="block truncate text-[0.58rem] text-muted-foreground">
                                {option.description}
                              </span>
                            </span>
                            {selected ? (
                              <Check className="size-3 shrink-0 text-brand-ink" strokeWidth={3} />
                            ) : (
                              <span className="shrink-0 text-[0.55rem] tracking-wide text-muted-foreground uppercase">
                                {option.family}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                </>
              ) : null}

              {tab === "look" ? (
                <>
                  <Section title="Background" description="What fills the card behind the data.">
                    <Choices
                      value={background.kind}
                      onChange={setBackgroundKind}
                      options={[
                        { value: "theme", label: "Theme" },
                        { value: "solid", label: "Solid" },
                        { value: "gradient", label: "Gradient" },
                        { value: "image", label: "Image" },
                      ]}
                    />

                    {background.kind === "solid" ? (
                      <ColorRow
                        label="Color"
                        value={background.color ?? "#ffffff"}
                        onChange={(color) => patch({ background: { ...background, color } })}
                      />
                    ) : null}

                    {background.kind === "gradient" ? (
                      <>
                        <ColorRow
                          label="From"
                          value={background.from ?? "#1d4ed8"}
                          onChange={(from) => patch({ background: { ...background, from } })}
                        />
                        <ColorRow
                          label="To"
                          value={background.to ?? "#8b5cf6"}
                          onChange={(to) => patch({ background: { ...background, to } })}
                        />
                        <SliderField
                          label="Angle"
                          suffix="°"
                          min={0}
                          max={360}
                          value={background.angle ?? 135}
                          onChange={(angle) => patch({ background: { ...background, angle } })}
                        />
                      </>
                    ) : null}

                    {background.kind === "image" ? (
                      <>
                        <ImageUploadField
                          value={background.url ?? ""}
                          maxDimension={1200}
                          onChange={(url) => {
                            setRememberedImage(url);
                            patch({ background: { ...background, url } });
                          }}
                        />
                        <SliderField
                          label="Dark overlay"
                          suffix="%"
                          min={0}
                          max={80}
                          value={background.overlay ?? 35}
                          onChange={(overlay) => patch({ background: { ...background, overlay } })}
                        />
                      </>
                    ) : null}
                  </Section>

                  <Section title="Shape">
                    <SliderField
                      label="Corner radius"
                      min={0}
                      max={28}
                      value={draft.radius}
                      onChange={(radius) => patch({ radius })}
                    />

                    <Field label="Shadow">
                      <Choices
                        value={draft.shadow}
                        onChange={(shadow) => patch({ shadow })}
                        options={[
                          { value: "none", label: "None" },
                          { value: "sm", label: "Soft" },
                          { value: "md", label: "Medium" },
                          { value: "lg", label: "Large" },
                        ]}
                      />
                    </Field>

                    <SliderField
                      label="Border width"
                      min={0}
                      max={2}
                      value={draft.borderWidth}
                      onChange={(borderWidth) => patch({ borderWidth })}
                    />
                    <ColorRow
                      label="Border color"
                      value={draft.borderColor ?? "#e3e3e7"}
                      onChange={(borderColor) => patch({ borderColor })}
                    />
                    {draft.borderColor ? (
                      <button
                        type="button"
                        onClick={() => patch({ borderColor: null })}
                        className="text-[0.66rem] text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Use the style&apos;s border color
                      </button>
                    ) : null}
                  </Section>
                </>
              ) : null}

              {tab === "layout" ? (
                <>
                  {widget.locked ? (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                      <Lock className="mt-0.5 size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.7rem] font-semibold">This widget is locked</p>
                        <p className="mt-0.5 text-[0.62rem] leading-relaxed opacity-80">
                          Size and spacing are fixed, and the card can&apos;t be dragged or resized
                          on the dashboard.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleLock()}
                        className="shrink-0 rounded-md border border-current/25 px-1.5 py-0.5 text-[0.62rem] font-medium underline-offset-2 hover:underline"
                      >
                        Unlock
                      </button>
                    </div>
                  ) : null}

                  <Section
                    title="Size"
                    description="Or drag a corner of the card on the dashboard."
                  >
                    <div className="grid grid-cols-3 gap-1">
                      {WIDGET_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          aria-pressed={widget.size === size}
                          disabled={widget.locked}
                          onClick={() => onResize(size)}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-[0.68rem] font-medium capitalize transition disabled:pointer-events-none disabled:opacity-40",
                            widget.size === size
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Spacing">
                    <Field label="Content alignment">
                      <Choices
                        value={draft.align}
                        disabled={widget.locked}
                        onChange={(align) => patch({ align })}
                        options={[
                          { value: "left", label: "Left" },
                          { value: "center", label: "Center" },
                        ]}
                      />
                    </Field>

                    <SliderField
                      label="Padding"
                      min={8}
                      max={24}
                      value={draft.padding}
                      disabled={widget.locked}
                      onChange={(padding) => patch({ padding })}
                    />

                    <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[0.64rem] leading-relaxed text-muted-foreground">
                      Position is set by dragging the card on the dashboard. Locked widgets keep
                      their place.
                    </p>
                  </Section>
                </>
              ) : null}

              {tab === "type" ? (
                <>
                  <Section title="Typeface">
                    <Field label="Font">
                      <Choices
                        value={draft.font}
                        onChange={(font) => patch({ font })}
                        options={[
                          { value: "sans", label: "Sans" },
                          { value: "serif", label: "Serif" },
                          { value: "mono", label: "Mono" },
                        ]}
                      />
                    </Field>
                    <Field label="Title size">
                      <Choices
                        value={draft.headingSize}
                        onChange={(headingSize) => patch({ headingSize })}
                        options={[
                          { value: "sm", label: "Small" },
                          { value: "base", label: "Medium" },
                          { value: "lg", label: "Large" },
                        ]}
                      />
                    </Field>
                  </Section>

                  <Section title="Text color">
                    <ColorRow
                      label="Text color"
                      value={draft.textColor ?? "#18181b"}
                      onChange={(textColor) => patch({ textColor })}
                    />
                    {draft.textColor ? (
                      <button
                        type="button"
                        onClick={() => patch({ textColor: null })}
                        className="text-[0.66rem] text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Use the style&apos;s text color
                      </button>
                    ) : null}
                  </Section>
                </>
              ) : null}

              {tab === "header" ? (
                <Section title="Header elements" description="What the card's top row shows.">
                  <div className="space-y-2">
                    <ToggleRow
                      label="Show title"
                      description="The widget's name at the top."
                      checked={draft.header.title}
                      onChange={(title) => patch({ header: { ...draft.header, title } })}
                    />
                    <ToggleRow
                      label="Show icon"
                      description="The small icon tile beside the title."
                      checked={draft.header.icon}
                      onChange={(icon) => patch({ header: { ...draft.header, icon } })}
                    />
                    <ToggleRow
                      label="Show last updated"
                      description="When the data last changed."
                      checked={draft.header.updated}
                      onChange={(updated) => patch({ header: { ...draft.header, updated } })}
                    />
                  </div>
                </Section>
              ) : null}
            </div>
          </div>

          <SheetFooter className="gap-2 border-t border-border/70 px-4 py-3">
            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.7rem] text-destructive"
              >
                {error}
              </p>
            ) : null}
            {note ? (
              <p className="flex items-center gap-1 text-[0.68rem] text-emerald-700 dark:text-emerald-400">
                <Check className="size-3" /> {note}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => void reset()}
                className="h-8 rounded-lg px-2.5 text-[0.7rem] text-muted-foreground"
              >
                Reset design
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || !dirty}
                onClick={() => void save()}
                className="brand-gradient h-8 gap-1.5 rounded-lg px-3.5 text-[0.7rem] text-brand-on"
              >
                {saving ? <Loader2 className="size-3 animate-spin" /> : null}
                {dirty ? "Save changes" : "Saved"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <WidgetScheduleDialog
        key={`customize-schedule-${widget.id}-${scheduleOpen ? "open" : "closed"}`}
        widget={widget}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        onSaved={(updated) => onSaved(updated)}
      />
    </>
  );
}

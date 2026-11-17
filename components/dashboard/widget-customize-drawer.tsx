"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, RefreshCw, Sparkles, Unlock } from "lucide-react";

import {
  duplicateWidgetAction,
  refreshWidgetNowAction,
  setWidgetLockAction,
  updateWidgetAppearanceAction,
} from "@/app/actions/widgets";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ImageUploadField } from "@/components/dashboard/image-upload-field";
import { WidgetCard } from "@/components/widgets/widget-card";
import { WidgetScheduleDialog } from "@/components/widgets/widget-schedule-dialog";
import {
  DEFAULT_WIDGET_APPEARANCE,
  normalizeWidgetAppearance,
  type WidgetAppearance,
} from "@/lib/widget-appearance";
import { WIDGET_SIZES, type WidgetRecord, type WidgetSize } from "@/lib/widget-types";
import { cn } from "@/lib/utils";

/**
 * "Customize" drawer for one widget.
 *
 * Every control edits a local draft that is shown in the live preview; nothing
 * is written until Save. Sizes are applied through the dashboard's re-flowing
 * action, and the destructive/duplicate actions live here too so the owner can
 * do everything from one place.
 */

const TABS = [
  { key: "appearance", label: "Appearance" },
  { key: "layout", label: "Layout" },
  { key: "type", label: "Typography" },
  { key: "header", label: "Header" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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

export function WidgetCustomizeDrawer({
  widget,
  open,
  onOpenChange,
  onSaved,
  onResize,
  onDuplicate,
}: {
  widget: WidgetRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (widget: WidgetRecord) => void;
  onResize: (size: WidgetSize) => void;
  onDuplicate: () => void;
}) {
  const [draft, setDraft] = useState<WidgetAppearance>(DEFAULT_WIDGET_APPEARANCE);
  const [rememberedImage, setRememberedImage] = useState("");
  const [tab, setTab] = useState<TabKey>("appearance");
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
    setRememberedImage(next.background.kind === "image" ? next.background.url ?? "" : "");
    setError(null);
    setNote(null);
    setTab("appearance");
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
    if (saving) return;
    if (draft.background.kind === "image" && !draft.background.url) {
      setTab("appearance");
      setError("Upload an image first, or choose another background type.");
      return;
    }
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      const result = await updateWidgetAppearanceAction({ id: widget!.id, appearance: draft });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.widget);
      setNote("Saved.");
    } catch {
      setError("We couldn't save that appearance. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateWidgetAppearanceAction({ id: widget!.id, appearance: null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.widget);
      setDraft(DEFAULT_WIDGET_APPEARANCE);
      setRememberedImage("");
      setNote("Design restored.");
    } catch {
      setError("We couldn't reset that design. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    setNote(null);
    try {
      const result = await refreshWidgetNowAction({ id: widget!.id });
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
    setError(null);
    const result = await setWidgetLockAction({ id: widget!.id, locked: !widget!.locked });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.widget);
  }

  async function duplicate() {
    setError(null);
    const result = await duplicateWidgetAction({ id: widget!.id });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDuplicate();
    onOpenChange(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[27rem]">
          <SheetHeader className="border-b border-border/70 px-4 py-3.5">
            <SheetTitle className="flex items-center gap-2 text-[0.95rem]">
              <span className="brand-gradient grid size-7 place-items-center rounded-lg text-brand-on">
                <Sparkles className="size-3.5" />
              </span>
              Customize widget
            </SheetTitle>
            <SheetDescription className="text-[0.72rem]">
              Changes preview live on “{widget.title}”. Nothing is saved until you click Save.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border/60 bg-muted/25 px-4 py-3">
              <div ref={previewRef} className="w-full">
                <div
                  className="mx-auto"
                  style={{ width: previewWidth > 0 ? `${previewWidth}px` : "100%" }}
                >
                  <WidgetCard
                    widget={{ ...widget, appearance: draft }}
                    size={widget.size}
                    variant="preview"
                    className="h-[205px]"
                  />
                </div>
              </div>
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
                }))}
              />
            </div>

            <div className="px-4 py-4">
              {tab === "appearance" ? (
                <>
                  <Section title="Background" description="What fills the card behind the data.">
                  <Field label="Background">
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
                  </Field>

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
                      Use the design's border color
                    </button>
                  ) : null}
                  </Section>
                </>
              ) : null}

              {tab === "layout" ? (
                <>
                  {widget.locked ? (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                      <Lock className="mt-0.5 size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.7rem] font-semibold">This widget is locked</p>
                        <p className="mt-0.5 text-[0.62rem] leading-relaxed opacity-80">
                          Size and spacing are fixed, and the card can't be dragged or resized on
                          the dashboard.
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

                  <Section title="Size" description="Or drag a corner of the card on the dashboard.">
                  <Field label="Dimensions" hint={widget.locked ? "locked" : undefined}>
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
                  </Field>
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
                    Position is set by dragging the card on the dashboard. Locked widgets keep their
                    place.
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
                      Use the design's text color
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

              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-[0.68rem] font-semibold">Refresh</p>
                <p className="text-[0.62rem] leading-relaxed text-muted-foreground">
                  Updates re-read what this widget tracks. The schedule is shared with the widget's
                  own cron.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={refreshing}
                    onClick={() => void refreshNow()}
                    className="h-7 gap-1.5 rounded-lg px-2.5 text-[0.68rem]"
                  >
                    {refreshing ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    Update now
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setScheduleOpen(true)}
                    className="h-7 rounded-lg px-2.5 text-[0.68rem]"
                  >
                    Edit schedule
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void duplicate()}
                  className="h-7 rounded-lg px-2.5 text-[0.68rem]"
                >
                  Duplicate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void toggleLock()}
                  className="h-7 gap-1.5 rounded-lg px-2.5 text-[0.68rem]"
                >
                  {widget.locked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                  {widget.locked ? "Unlock" : "Lock"}
                </Button>
              </div>

              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.7rem] text-destructive">
                  {error}
                </p>
              ) : null}
              {note ? (
                <p className="flex items-center gap-1 text-[0.68rem] text-emerald-700">
                  <Check className="size-3" /> {note}
                </p>
              ) : null}
            </div>
          </div>

          <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => void reset()}
              className="h-8 rounded-lg px-2.5 text-[0.7rem]"
            >
              Reset design
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void save()}
              className="brand-gradient h-8 gap-1.5 rounded-lg px-3.5 text-[0.7rem] text-brand-on"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : null}
              Save changes
            </Button>
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

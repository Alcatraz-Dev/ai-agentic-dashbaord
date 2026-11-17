"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, PaintBucket, Loader2 } from "lucide-react";

import { updateDashboardAppearanceAction } from "@/app/actions/dashboards";
import { ImageUploadField } from "@/components/dashboard/image-upload-field";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DEFAULT_DASHBOARD_APPEARANCE,
  normalizeDashboardAppearance,
  type DashboardAppearance,
  type WidgetBackground,
} from "@/lib/widget-appearance";
import { cn } from "@/lib/utils";

/**
 * Dashboard-wide background: the palette surface, a solid colour, a gradient or
 * an image. Stored on the dashboard row, so it survives a reload.
 */
export function DashboardBackgroundButton({
  appearance,
  onSaved,
}: {
  appearance: DashboardAppearance | null;
  onSaved: (appearance: DashboardAppearance) => void;
}) {
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState<WidgetBackground>({ kind: "theme" });
  const [rememberedImage, setRememberedImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = normalizeDashboardAppearance(appearance).background;
    setBackground(next);
    setRememberedImage(next.kind === "image" ? next.url ?? "" : "");
    setError(null);
  }, [open, appearance]);

  function setKind(kind: WidgetBackground["kind"]) {
    if (kind === "theme") setBackground({ kind: "theme" });
    else if (kind === "solid") setBackground({ kind: "solid", color: "#eef2f8" });
    else if (kind === "gradient")
      setBackground({ kind: "gradient", from: "#eef2f8", to: "#e0e7ff", angle: 160 });
    else setBackground({ kind: "image", url: rememberedImage, overlay: 45 });
  }

  async function save() {
    if (saving) return;
    if (background.kind === "image" && !background.url) {
      setError("Upload an image first, or choose another background type.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await updateDashboardAppearanceAction({ appearance: { background } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.appearance);
      setOpen(false);
    } catch {
      setError("We couldn't save that background. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-xl bg-card px-2.5 text-[0.7rem]"
          />
        }
      >
        <PaintBucket className="size-3.5" />
        Background
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[0.95rem]">
            <span className="brand-gradient grid size-7 place-items-center rounded-lg text-brand-on">
              <ImageIcon className="size-3.5" />
            </span>
            Dashboard background
          </DialogTitle>
          <DialogDescription className="text-[0.72rem]">
            Applies behind every widget on this dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SegmentedControl
            size="sm"
            fullWidth
            variant="tray"
            value={background.kind}
            onChange={(val) => setKind(val as WidgetBackground["kind"])}
            options={[
              { value: "theme", label: "Theme" },
              { value: "solid", label: "Solid" },
              { value: "gradient", label: "Gradient" },
              { value: "image", label: "Image" },
            ]}
          />

          {background.kind === "solid" ? (
            <div className="flex items-center justify-between text-[0.72rem] text-muted-foreground">
              <span>Color</span>
              <ColorPicker
                value={background.color ?? "#eef2f8"}
                onValueChange={(color) => setBackground({ ...background, color })}
                label="Background color"
                showValue
                size="sm"
                align="end"
              />
            </div>
          ) : null}

          {background.kind === "gradient" ? (
            <>
              <div className="flex items-center justify-between text-[0.72rem] text-muted-foreground">
                <span>From</span>
                <ColorPicker
                  value={background.from ?? "#eef2f8"}
                  onValueChange={(from) => setBackground({ ...background, from })}
                  label="Gradient start"
                  showValue
                  size="sm"
                  align="end"
                />
              </div>
              <div className="flex items-center justify-between text-[0.72rem] text-muted-foreground">
                <span>To</span>
                <ColorPicker
                  value={background.to ?? "#e0e7ff"}
                  onValueChange={(to) => setBackground({ ...background, to })}
                  label="Gradient end"
                  showValue
                  size="sm"
                  align="end"
                />
              </div>
              <div className="space-y-2 text-[0.72rem] text-muted-foreground">
                <span className="block">Angle: {background.angle ?? 160}°</span>
                <Slider
                  min={0}
                  max={360}
                  value={[background.angle ?? 160]}
                  aria-label="Gradient angle"
                  onValueChange={(next) =>
                    setBackground({
                      ...background,
                      angle: Array.isArray(next) ? next[0] : next,
                    })
                  }
                />
              </div>
            </>
          ) : null}

          {background.kind === "image" ? (
            <>
              <ImageUploadField
                value={background.url ?? ""}
                maxDimension={1600}
                onChange={(url) => {
                  setRememberedImage(url);
                  setBackground({ ...background, url });
                }}
              />
              <div className="space-y-2 text-[0.72rem] text-muted-foreground">
                <span className="block">Dark overlay: {background.overlay ?? 45}%</span>
                <Slider
                  min={0}
                  max={80}
                  value={[background.overlay ?? 45]}
                  aria-label="Dark overlay"
                  onValueChange={(next) =>
                    setBackground({
                      ...background,
                      overlay: Array.isArray(next) ? next[0] : next,
                    })
                  }
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-destructive/5 px-3 py-2 text-[0.7rem] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setBackground(DEFAULT_DASHBOARD_APPEARANCE.background);
              setRememberedImage("");
            }}
            className="text-[0.7rem]"
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void save()}
            className="brand-gradient gap-1.5 text-brand-on"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

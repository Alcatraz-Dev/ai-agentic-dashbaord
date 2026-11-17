"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Upload, X } from "lucide-react";

import { MAX_IMAGE_DATA_URL_LENGTH } from "@/lib/widget-appearance";
import { cn } from "@/lib/utils";

export const IMAGE_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressImageFile(
  file: File,
  maxDimension: number,
  maxLength: number = MAX_IMAGE_DATA_URL_LENGTH,
): Promise<string> {
  const image = await loadImage(file);
  const sourceWidth = "width" in image ? image.width : 0;
  const sourceHeight = "height" in image ? image.height : 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("That image couldn't be read.");
  }

  let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));

  for (let pass = 0; pass < 4; pass += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser can't prepare images.");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    for (let quality = 0.82; quality >= 0.5; quality -= 0.08) {
      let dataUrl = canvas.toDataURL("image/webp", quality);
      if (!dataUrl.startsWith("data:image/webp")) {
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length <= maxLength) {
        if ("close" in image) image.close();
        return dataUrl;
      }
    }

    scale *= 0.78;
  }

  if ("close" in image) image.close();
  throw new Error("That image is too detailed. Try a smaller or simpler picture.");
}

/**
 * Upload/replace/remove an image background. Files never leave the browser
 * uncompressed: the picture is resized and encoded as a compact WebP data URL
 * so it can be stored with the widget or dashboard appearance.
 */
export function ImageUploadField({
  value,
  onChange,
  maxDimension = 1400,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  maxDimension?: number;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processFile(file: File | undefined) {
    if (!file) return;

    if (!IMAGE_ACCEPTED_TYPES.includes(file.type)) {
      setError("Use a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > IMAGE_MAX_FILE_BYTES) {
      setError("Keep the image under 8 MB.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const dataUrl = await compressImageFile(file, maxDimension);
      onChange(dataUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "That image couldn't be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openPicker() {
    if (!busy) inputRef.current?.click();
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    void processFile(event.dataTransfer.files[0]);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPTED_TYPES.join(",")}
        className="sr-only"
        onChange={(event) => void processFile(event.target.files?.[0])}
      />

      {value ? (
        <div
          className="group relative overflow-hidden rounded-xl border border-border bg-muted/30"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-28 w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
            <span className="text-[0.62rem] font-medium text-white/90">Image ready</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-background/95 px-2 text-[0.62rem] font-semibold text-zinc-900 shadow-sm transition hover:bg-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                Replace
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
                disabled={busy}
                aria-label="Remove image"
                className="grid size-7 place-items-center rounded-md bg-black/40 text-white ring-1 ring-white/30 transition hover:bg-black/60 disabled:opacity-60"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          {dragging ? (
            <div className="absolute inset-0 grid place-items-center bg-brand-ink/75 text-[0.7rem] font-semibold text-white">
              Drop to replace
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          disabled={busy}
          className={cn(
            "flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition",
            dragging
              ? "border-brand-border bg-brand-soft/10 text-brand-ink"
              : "border-border bg-muted/20 text-muted-foreground hover:border-foreground/25 hover:bg-muted/35",
          )}
        >
          <span className="grid size-8 place-items-center rounded-full bg-card text-foreground ring-1 ring-border">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : dragging ? (
              <Upload className="size-4" />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </span>
          <span className="text-[0.72rem] font-semibold text-foreground">
            {busy ? "Preparing image…" : dragging ? "Drop image here" : "Upload an image"}
          </span>
          <span className="text-[0.62rem]">Drag and drop, or click to browse · JPEG, PNG, WebP</span>
        </button>
      )}

      <p className="text-[0.6rem] leading-relaxed text-muted-foreground">
        Images are resized and compressed automatically. Up to 8 MB.
      </p>
      {error ? (
        <p role="alert" className="text-[0.64rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

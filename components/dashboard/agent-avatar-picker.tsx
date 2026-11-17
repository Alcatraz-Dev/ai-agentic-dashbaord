"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Play, Shuffle, Trash2 } from "lucide-react";

import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import {
  compressImageFile,
  IMAGE_ACCEPTED_TYPES,
  IMAGE_MAX_FILE_BYTES,
} from "@/components/dashboard/image-upload-field";
import {
  AGENT_AVATAR_MAX_LENGTH,
  AGENT_COLORS,
  AGENT_FACES,
  AGENT_MOTIONS,
  AGENT_SHAPES,
  avatarKey,
  DEFAULT_AGENT_FACE,
  DEFAULT_AGENT_SHAPE,
  getAgentAvatarLabel,
  getAgentColor,
  getAgentMotion,
  isAgentAvatarImage,
  parseAgentAvatar,
} from "@/lib/agent-options";
import { cn } from "@/lib/utils";

const GROUP_LABEL =
  "mb-1 text-[0.6rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase";

/** Portraits are downscaled hard — they are only ever shown at 20–96px. */
const AVATAR_IMAGE_DIMENSION = 320;

function pickOne<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)] ?? list[0];
}

/**
 * The Grok Bots Studio picker: a shape, a face and a colour, each chosen on its
 * own, plus "Surprise me" or an uploaded photo. Used by the create dialog, the
 * agent panel and dashboard settings, so the surfaces can never drift apart.
 *
 * The preview remounts whenever the pick is changed (or "Play motion" is
 * pressed), which restarts the body's ambient motion and the wink — otherwise a
 * CSS animation would already be mid-cycle by the time you notice the choice.
 *
 * `compact` keeps the same grids but with smaller tiles for the agent rail.
 */
export function AgentAvatarPicker({
  avatar,
  color,
  onAvatarChange,
  onColorChange,
  compact = false,
}: {
  avatar: string;
  color: string;
  onAvatarChange: (avatar: string) => void;
  onColorChange: (color: string) => void;
  compact?: boolean;
}) {
  const spec = parseAgentAvatar(avatar);
  const photo = isAgentAvatarImage(avatar);
  const colorOption = getAgentColor(color);
  const motionOption = getAgentMotion(spec.motion);
  const tile = compact ? "size-8" : "size-9";

  const [play, setPlay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function choose(next: string) {
    onAvatarChange(next);
    setError(null);
    setPlay((count) => count + 1);
  }

  function surprise() {
    // Never hand back the exact same pick: change every part it can.
    const shapes = AGENT_SHAPES.filter((option) => option.id !== spec.shape);
    const faces = AGENT_FACES.filter((option) => option.id !== spec.face);
    const colors = AGENT_COLORS.filter((option) => option.id !== color);

    choose(
      avatarKey(
        pickOne(shapes.length ? shapes : AGENT_SHAPES).id,
        pickOne(faces.length ? faces : AGENT_FACES).id,
        pickOne(AGENT_MOTIONS).id,
      ),
    );
    onColorChange(pickOne(colors.length ? colors : AGENT_COLORS).id);
  }

  async function handleFile(file: File | undefined) {
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
      const dataUrl = await compressImageFile(file, AVATAR_IMAGE_DIMENSION, AGENT_AVATAR_MAX_LENGTH);
      choose(dataUrl);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "That image couldn't be uploaded.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2.5">
      {/* Live preview: remounts on every pick so the motion plays from the start. */}
      <div className="flex items-center gap-3.5">
        <AgentAvatar
          key={`${avatar}:${play}`}
          avatar={avatar}
          color={color}
          className={compact ? "size-16 shrink-0" : "size-20 shrink-0"}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.82rem] font-semibold">{getAgentAvatarLabel(avatar)}</p>
          <p className="truncate text-[0.66rem] text-muted-foreground">
            {colorOption.label} · {motionOption.label}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setPlay((count) => count + 1)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Play className="size-2.5" />
              Play motion
            </button>
            {photo ? (
              <button
                type="button"
                onClick={() => choose(avatarKey(DEFAULT_AGENT_SHAPE, DEFAULT_AGENT_FACE))}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-2.5" />
                Remove photo
              </button>
            ) : null}
            <button
              type="button"
              onClick={surprise}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Shuffle className="size-2.5" />
              Surprise me
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className={GROUP_LABEL}>Shape</p>
        <div className="grid grid-cols-8 gap-1">
          {AGENT_SHAPES.map((option) => {
            const selected = !photo && option.id === spec.shape;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(avatarKey(option.id, spec.face, spec.motion))}
                aria-pressed={selected}
                aria-label={`${option.label} shape`}
                title={option.label}
                className={cn(
                  "grid place-items-center rounded-lg p-0.5 transition",
                  selected
                    ? "bg-muted ring-1 ring-foreground/20"
                    : "opacity-60 hover:bg-muted/60 hover:opacity-100",
                )}
              >
                <AgentAvatar
                  avatar={avatarKey(option.id, spec.face)}
                  color={color}
                  className={tile}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={GROUP_LABEL}>Face</p>
        <div className="grid grid-cols-8 gap-1">
          {AGENT_FACES.map((option) => {
            const selected = !photo && option.id === spec.face;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(avatarKey(spec.shape, option.id, spec.motion))}
                aria-pressed={selected}
                aria-label={`${option.label} face`}
                title={option.label}
                className={cn(
                  "grid place-items-center rounded-lg p-0.5 transition",
                  selected
                    ? "bg-muted ring-1 ring-foreground/20"
                    : "opacity-60 hover:bg-muted/60 hover:opacity-100",
                )}
              >
                <AgentAvatar
                  avatar={avatarKey(spec.shape, option.id)}
                  color={color}
                  className={tile}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={GROUP_LABEL}>
          Colour
          <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/80">
            {colorOption.label}
          </span>
        </p>
        <div className="grid w-fit grid-cols-6 gap-2">
          {AGENT_COLORS.map((option) => {
            const selected = option.id === color;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onColorChange(option.id);
                  setPlay((count) => count + 1);
                }}
                aria-pressed={selected}
                aria-label={option.label}
                title={option.label}
                className={cn(
                  "size-7 rounded-full bg-gradient-to-br transition",
                  option.gradient,
                  selected
                    ? "ring-2 ring-foreground/25 ring-offset-2 ring-offset-background"
                    : "hover:scale-110",
                )}
              />
            );
          })}
        </div>
      </div>

      <div>
        <p className={GROUP_LABEL}>
          Move
          <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/80">
            {motionOption.label}
          </span>
        </p>
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
          {AGENT_MOTIONS.map((option) => {
            const selected = !photo && option.id === spec.motion;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(avatarKey(spec.shape, spec.face, option.id))}
                aria-pressed={selected}
                className={cn(
                  "truncate rounded-lg border px-1.5 py-1.5 text-[0.62rem] font-medium transition",
                  selected
                    ? "border-brand-border bg-brand-soft text-brand-ink"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPTED_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[0.66rem] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
          {busy ? "Preparing photo…" : "Upload photo"}
        </button>
        <span className="text-[0.6rem] text-muted-foreground">JPEG, PNG or WebP</span>
      </div>

      {error ? (
        <p role="alert" className="text-[0.64rem] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

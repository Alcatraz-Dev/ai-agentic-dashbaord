import type { ReactNode } from "react";

import { getAgentColor, isAgentAvatarImage, parseAgentAvatar } from "@/lib/agent-options";
import { cn } from "@/lib/utils";

/**
 * Agent portraits in the Grok Bots Studio clay style: eight shapes × sixteen
 * faces, coloured with the agent's clay tones.
 *
 * Each portrait is one 48 × 48 silhouette painted three times — a darker body,
 * a slightly inset base tone and a specular glint — which gives the clay its
 * volume without gradients, filters or per-instance ids. The face is a shared
 * drawing nudged into each body's usable area, so every shape works with every
 * face.
 *
 * All of it scales from the same view box, so a portrait reads the same at 20px
 * in the sidebar and 64px in the empty state. Eyes blink and the rounder bodies
 * float on the `avatar-*` keyframes in `app/globals.css`; everything pauses
 * under `prefers-reduced-motion`.
 */
type ClayShape = {
  /** Silhouette of the body, painted three times for the shading. */
  body: string;
  /** Specular highlight, kept inside the silhouette on every shape. */
  glint: { cx: number; cy: number; rx: number; ry: number; rotate?: number };
  /** Moves and scales the shared face into this body's usable area. */
  face: { dy?: number; scale?: number };
  /** Each body gets its own slow ambient motion. */
  motion?: "bob" | "bounce" | "tilt" | "breathe" | "drift";
};

const SHAPES: Record<string, ClayShape> = {
  circle: {
    body: "M24 5.5a19.5 19.5 0 1 1 0 39 19.5 19.5 0 0 1 0-39Z",
    glint: { cx: 16.5, cy: 15.5, rx: 6.6, ry: 3.8, rotate: -28 },
    face: { scale: 1.06 },
    motion: "bob",
  },
  pebble: {
    body: "M23.4 5.3c9.3-.6 17.9 5.4 18.7 14.7.9 9.9-6.4 19.6-16.2 21.6-9.6 2-18.6-4.2-19.6-13.6C5.4 18.6 14 5.9 23.4 5.3Z",
    glint: { cx: 16.5, cy: 16, rx: 6.4, ry: 3.9, rotate: -24 },
    face: { scale: 1.06 },
    motion: "bounce",
  },
  squircle: {
    body: "M18.5 5.5h11a13 13 0 0 1 13 13v11a13 13 0 0 1-13 13h-11a13 13 0 0 1-13-13v-11a13 13 0 0 1 13-13Z",
    glint: { cx: 16, cy: 15, rx: 6.4, ry: 4, rotate: -26 },
    face: { scale: 1.04 },
    motion: "breathe",
  },
  capsule: {
    body: "M24 4.5a13 13 0 0 1 13 13v13a13 13 0 0 1-26 0v-13a13 13 0 0 1 13-13Z",
    glint: { cx: 19, cy: 14, rx: 4.4, ry: 3.2, rotate: -20 },
    face: { dy: 0.5, scale: 0.92 },
    motion: "bob",
  },
  triangle: {
    body: "M22.5 7.3c.7-1.2 2.3-1.2 3 0l16.6 28.9c.7 1.3-.2 2.8-1.6 2.8H7.5c-1.4 0-2.3-1.5-1.6-2.8Z",
    glint: { cx: 24, cy: 19.5, rx: 5.6, ry: 2.8 },
    face: { dy: 3.2, scale: 0.95 },
    motion: "bounce",
  },
  hexagon: {
    body: "M25.7 6.1l13 7.5a3.2 3.2 0 0 1 1.6 2.8v15.2a3.2 3.2 0 0 1-1.6 2.8l-13 7.5a3.2 3.2 0 0 1-3.2 0l-13-7.5a3.2 3.2 0 0 1-1.6-2.8V16.4a3.2 3.2 0 0 1 1.6-2.8l13-7.5a3.2 3.2 0 0 1 3.2 0Z",
    glint: { cx: 16.6, cy: 15.4, rx: 5.8, ry: 3.6, rotate: -26 },
    face: { scale: 1.02 },
    motion: "tilt",
  },
  cloud: {
    body: "M12.5 35.2a8.2 8.2 0 0 1 .6-16.3 11.6 11.6 0 0 1 21.9-1.6 9.4 9.4 0 0 1 1.5 17.9Z",
    glint: { cx: 15.5, cy: 24.5, rx: 3.2, ry: 3 },
    face: { dy: 0.6, scale: 0.92 },
    motion: "drift",
  },
  droplet: {
    body: "M24 5C24 5 41 19.7 41 30.4 41 40.1 33.3 46 24 46 14.7 46 7 40.1 7 30.4 7 19.7 24 5 24 5Z",
    glint: { cx: 22.5, cy: 18.5, rx: 4.6, ry: 3.2, rotate: -18 },
    face: { dy: 0.4, scale: 0.96 },
    motion: "bob",
  },
};

/** The sixteen faces; paper white is only ever used for a catchlight. */
const FACES: Record<string, ReactNode> = {
  neutral: (
    <>
      <g className="avatar-blink">
        <circle cx="18.8" cy="24.6" r="2.05" fill="currentColor" stroke="none" />
        <circle cx="29.2" cy="24.6" r="2.05" fill="currentColor" stroke="none" />
      </g>
      <path d="M21.6 31h4.8" strokeWidth={2} />
    </>
  ),
  attentive: (
    <>
      <g className="avatar-blink">
        <ellipse cx="18.4" cy="24.2" rx="2.9" ry="3.3" fill="currentColor" stroke="none" />
        <ellipse cx="29.6" cy="24.2" rx="2.9" ry="3.3" fill="currentColor" stroke="none" />
        <circle cx="17.5" cy="23.1" r="0.9" fill="#fff" stroke="none" opacity="0.85" />
        <circle cx="28.7" cy="23.1" r="0.9" fill="#fff" stroke="none" opacity="0.85" />
      </g>
      <ellipse cx="24" cy="31.4" rx="1.9" ry="2.3" fill="currentColor" stroke="none" opacity="0.85" />
    </>
  ),
  surprised: (
    <>
      <g className="avatar-blink">
        <circle cx="18.6" cy="24.2" r="2.6" fill="currentColor" stroke="none" />
        <circle cx="29.4" cy="24.2" r="2.6" fill="currentColor" stroke="none" />
        <circle cx="17.7" cy="23.1" r="0.8" fill="#fff" stroke="none" opacity="0.8" />
        <circle cx="28.5" cy="23.1" r="0.8" fill="#fff" stroke="none" opacity="0.8" />
      </g>
      <ellipse cx="24" cy="31.8" rx="2.4" ry="3" fill="currentColor" stroke="none" opacity="0.85" />
    </>
  ),
  excited: (
    <>
      <path d="M16.6 25c1.2-1.9 3.2-1.9 4.4 0" strokeWidth={2.1} />
      <path d="M27 25c1.2-1.9 3.2-1.9 4.4 0" strokeWidth={2.1} />
      <path
        d="M19 29.8h10c0 3.3-2.2 4.9-5 4.9s-5-1.6-5-4.9Z"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
    </>
  ),
  happy: (
    <>
      <g className="avatar-blink">
        <circle
          cx="18.5"
          cy="25"
          r="2.3"
          fill="currentColor"
          stroke="none"
          className="avatar-wink"
        />
        <circle cx="29.5" cy="25" r="2.3" fill="currentColor" stroke="none" />
      </g>
      <path d="M19 30.2c1.5 2.9 8.5 2.9 10 0" strokeWidth={2.2} />
    </>
  ),
  laughing: (
    <>
      <path d="M16.4 25.2c1.3-2.1 3.5-2.1 4.8 0" strokeWidth={2.2} />
      <path d="M26.8 25.2c1.3-2.1 3.5-2.1 4.8 0" strokeWidth={2.2} />
      <path
        d="M18.4 29.4h11.2c0 4.3-2.5 6.4-5.6 6.4s-5.6-2.1-5.6-6.4Z"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      <ellipse cx="24" cy="34.1" rx="2.7" ry="1.4" fill="#fff" stroke="none" opacity="0.55" />
    </>
  ),
  angry: (
    <>
      <path d="M16 19.4l4.4 1.7" strokeWidth={1.8} />
      <path d="M32 19.4l-4.4 1.7" strokeWidth={1.8} />
      <g className="avatar-blink">
        <circle cx="18.8" cy="26.2" r="2" fill="currentColor" stroke="none" />
        <circle cx="29.2" cy="26.2" r="2" fill="currentColor" stroke="none" />
      </g>
      <path d="M21.8 31.8c1.3-1.3 3.1-1.3 4.4 0" strokeWidth={2} />
    </>
  ),
  sad: (
    <>
      <path d="M16 21.4l4.4-1.6" strokeWidth={1.7} />
      <path d="M32 21.4l-4.4-1.6" strokeWidth={1.7} />
      <g className="avatar-blink">
        <circle cx="18.8" cy="26" r="2.05" fill="currentColor" stroke="none" />
        <circle cx="29.2" cy="26" r="2.05" fill="currentColor" stroke="none" />
      </g>
      <path d="M21.6 32c1.4-1.4 3.4-1.4 4.8 0" strokeWidth={2} />
    </>
  ),
  scared: (
    <>
      <path d="M16 19.6l4.4 1.1" strokeWidth={1.6} />
      <path d="M32 19.6l-4.4 1.1" strokeWidth={1.6} />
      <g className="avatar-blink">
        <ellipse cx="18.6" cy="26" rx="2.4" ry="2.9" fill="currentColor" stroke="none" />
        <ellipse cx="29.4" cy="26" rx="2.4" ry="2.9" fill="currentColor" stroke="none" />
        <circle cx="17.8" cy="25" r="0.8" fill="#fff" stroke="none" opacity="0.85" />
        <circle cx="28.6" cy="25" r="0.8" fill="#fff" stroke="none" opacity="0.85" />
      </g>
      <ellipse cx="24" cy="32.2" rx="1.6" ry="2.1" fill="currentColor" stroke="none" opacity="0.85" />
    </>
  ),
  suspicious: (
    <>
      <circle cx="19" cy="24.8" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="18.2" cy="23.8" r="0.7" fill="#fff" stroke="none" opacity="0.8" />
      <path d="M26.6 24.9h4.8" strokeWidth={2.2} />
      <path d="M26.2 20.4l5.4 1.1" strokeWidth={1.9} />
      <path d="M21.4 31.6c1.3.8 2.8.8 4.2 0" strokeWidth={2} />
    </>
  ),
  confused: (
    <>
      <path d="M15.6 21.6c1.4-1 3-1 4.4 0" strokeWidth={1.8} />
      <g className="avatar-blink">
        <circle cx="18.6" cy="25.4" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="29.4" cy="25.4" r="1.7" fill="currentColor" stroke="none" />
      </g>
      <path d="M20.8 31.2c.9-1 2.1-1 2.9 0 .8 1 2 1 2.9 0" strokeWidth={1.9} />
    </>
  ),
  curious: (
    <>
      <g className="avatar-blink">
        <circle cx="19.4" cy="24.6" r="2.6" fill="currentColor" stroke="none" />
        <circle cx="29" cy="24.6" r="2" fill="currentColor" stroke="none" />
        <circle cx="18.6" cy="23.6" r="0.8" fill="#fff" stroke="none" opacity="0.8" />
        <circle cx="28.3" cy="23.6" r="0.7" fill="#fff" stroke="none" opacity="0.8" />
      </g>
      <path d="M25.6 20.2c1.3-1 2.9-0.9 3.8 0.1" strokeWidth={1.9} />
      <ellipse cx="24.4" cy="31.4" rx="1.7" ry="2.1" fill="currentColor" stroke="none" opacity="0.85" />
    </>
  ),
  proud: (
    <>
      <path d="M16.4 25.4c1.2-1.7 3.2-1.7 4.4 0" strokeWidth={2.1} />
      <path d="M27.2 25.4c1.2-1.7 3.2-1.7 4.4 0" strokeWidth={2.1} />
      <path d="M20.4 31.2c1.3 1.5 3.2 1.7 4.9 0.6" strokeWidth={2} />
    </>
  ),
  shy: (
    <>
      <g className="avatar-blink">
        <circle cx="20" cy="25.6" r="2.1" fill="currentColor" stroke="none" />
        <circle cx="28.6" cy="25.6" r="2.1" fill="currentColor" stroke="none" />
      </g>
      <ellipse cx="15.6" cy="29.8" rx="2.4" ry="1.5" fill="#fff" stroke="none" opacity="0.22" />
      <ellipse cx="32.4" cy="29.8" rx="2.4" ry="1.5" fill="#fff" stroke="none" opacity="0.22" />
      <path d="M21.7 32.4c.9.9 2 .9 2.6 0 .7-.9 1.7-.9 2.4 0" strokeWidth={1.9} />
    </>
  ),
  unimpressed: (
    <>
      <path d="M16.4 24.8h4.8" strokeWidth={2.1} />
      <path d="M26.8 24.8h4.8" strokeWidth={2.1} />
      <path d="M21.4 31.6h5.2" strokeWidth={2} />
    </>
  ),
  sleepy: (
    <>
      <path d="M15.8 24.6c1.4 1.8 3.4 1.8 4.8 0" strokeWidth={2} />
      <path d="M27.4 24.6c1.4 1.8 3.4 1.8 4.8 0" strokeWidth={2} />
      <path d="M21.6 31.2c1.4 1.1 3.4 1.1 4.8 0" strokeWidth={2} />
    </>
  ),
};

/** Nested transform: shrink about the centre, then nudge up and left. */
const INNER_BODY = "translate(-0.9 -1.2) translate(24 24) scale(0.9) translate(-24 -24)";

export function AgentAvatar({
  avatar,
  color,
  className,
}: {
  avatar: string;
  color: string;
  className?: string;
}) {
  // An uploaded photo replaces the clay portrait, cropped into the same squircle.
  if (isAgentAvatarImage(avatar)) {
    return (
      <span
        className={cn(
          "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-[28%] bg-muted ring-1 ring-black/10",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="size-full object-cover" />
      </span>
    );
  }

  const spec = parseAgentAvatar(avatar);
  const shape = SHAPES[spec.shape] ?? SHAPES.circle;
  const face = FACES[spec.face] ?? FACES.happy;
  const clay = getAgentColor(color).clay;
  // `auto` keeps the body's own ambient motion; `still` freezes it entirely.
  const motion =
    spec.motion === "still" ? null : spec.motion !== "auto" ? spec.motion : (shape.motion ?? null);

  const faceTransform = `translate(0 ${shape.face.dy ?? 0}) translate(24 27) scale(${
    shape.face.scale ?? 1
  }) translate(-24 -27)`;

  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)}>
      {/* `size-full!` is deliberate: sidebar buttons force `[&_svg]:size-4` on
          every descendant svg, which would shrink the portrait to 16px. */}
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
        className="size-full! drop-shadow-[0_1px_2px_rgba(15,23,42,0.22)]"
      >
        {/* Contact shadow, kept still while a body floats. */}
        <path d={shape.body} fill={clay.ink} opacity="0.16" transform="translate(0 1.7)" />
        <g className={motion ? `avatar-${motion}` : undefined}>
          <path d={shape.body} fill={clay.dark} />
          <path d={shape.body} fill={clay.base} transform={INNER_BODY} />
          <ellipse
            cx={shape.glint.cx}
            cy={shape.glint.cy}
            rx={shape.glint.rx}
            ry={shape.glint.ry}
            fill={clay.light}
            opacity="0.8"
            transform={
              shape.glint.rotate
                ? `rotate(${shape.glint.rotate} ${shape.glint.cx} ${shape.glint.cy})`
                : undefined
            }
          />
          <g
            fill="none"
            stroke={clay.ink}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            color={clay.ink}
            transform={faceTransform}
          >
            {face}
          </g>
        </g>
      </svg>
    </span>
  );
}

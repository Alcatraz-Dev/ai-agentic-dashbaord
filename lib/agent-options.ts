import {
  Asterisk,
  MessageSquare,
  Moon,
  MousePointer2,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";

/**
 * Agent providers are now only built-in. BYO AI (Claude, ChatGPT, Codex,
 * Cursor, Kimi via API keys) has been removed.
 */

/**
 * How the agent handles app actions that change data.
 * `ask` — every change waits for the approval card.
 * `auto` — a change the owner already approved once for this agent runs again
 * without asking (30-day memory), still recorded in `agent_approvals`.
 * `full` — every change runs without a card, still recorded.
 */
export type AgentApprovalMode = "ask" | "auto" | "full";

export const AGENT_APPROVAL_MODES: {
  id: AgentApprovalMode;
  label: string;
  note: string;
}[] = [
  {
    id: "ask",
    label: "Request approval",
    note: "Every app action that changes data waits for your OK.",
  },
  {
    id: "auto",
    label: "Approve for me",
    note: "After you approve an action once, this agent repeats it without asking.",
  },
  {
    id: "full",
    label: "Full access",
    note: "Data-changing app actions run without a card. Everything is still logged.",
  },
];

export function normalizeApprovalMode(value: unknown): AgentApprovalMode {
  return value === "auto" || value === "full" ? value : "ask";
}

/** What the sidebar needs to render an agent row. */
export type AgentSummary = {
  id: number;
  name: string;
  avatar: string;
  color: string;
  provider: string;
  /** The dashboard this agent belongs to; null on rows created before boards. */
  dashboardId: number | null;
  /** The team this agent works in; null = it works alone. */
  teamId: number | null;
  /** How data-changing app actions are approved. */
  approvalMode: AgentApprovalMode;
  /** One short line on what the agent is for; the prompt leads with it. */
  objective: string | null;
  /** Tool ids the agent may call; null means all built-in tools. */
  enabledTools: string[] | null;
  /** MCP tool keys (`serverId:toolName`); null means every MCP tool. */
  mcpTools: string[] | null;
  /** Workspace skill names this agent may load; null means every skill. */
  enabledSkills: string[] | null;
  /** Custom plugin slugs this agent may call; null means every plugin. */
  enabledPlugins: string[] | null;
  /** Workspace diagram names this agent may load; null means every diagram. */
  enabledDiagrams: string[] | null;
};

/** Everything the chat page needs about one agent. */
export type AgentDetail = AgentSummary & {
  instructions: string | null;
};

export const AGENT_NAME_MAX_LENGTH = 48;
export const AGENT_OBJECTIVE_MAX_LENGTH = 300;
export const AGENT_INSTRUCTIONS_MAX_LENGTH = 800;

export type AgentColorOption = {
  id: string;
  label: string;
  /** Gradient used for the colour picker and small previews. */
  gradient: string;
  /** Solid swatch used in the colour picker. */
  dot: string;
  /** Tinted glyph colour for unselected avatar tiles. */
  glyph: string;
  /** Tinted surface used for small badges. */
  soft: string;
  /**
   * Clay tones for the portrait: `base` is the body, `dark` the shaded rim,
   * `light` the specular highlight and `ink` the eyes and mouth. Fixed hex, like
   * `gradient` — a portrait is an identity, not part of the palette.
   */
  clay: { base: string; dark: string; light: string; ink: string };
};

/** The twelve clay colours from the Grok Bots avatar maker. */
export const AGENT_COLORS: AgentColorOption[] = [
  {
    id: "blue",
    label: "Ocean",
    /* Literal stops: an agent's colour identifies it, so it must not follow
       the active palette (it would collide with "Grape" in cyber). */
    gradient: "from-[#3b82f6] to-[#6366f1]",
    dot: "bg-[#3b82f6]",
    glyph: "text-blue-600",
    soft: "bg-blue-50 text-blue-700",
    clay: { base: "#5b8def", dark: "#3f6bd6", light: "#a9c6fb", ink: "#16224a" },
  },
  {
    id: "indigo",
    label: "Indigo",
    gradient: "from-indigo-500 to-blue-600",
    dot: "bg-indigo-500",
    glyph: "text-indigo-600",
    soft: "bg-indigo-50 text-indigo-700",
    clay: { base: "#6366f1", dark: "#4a4fd0", light: "#b3b6fb", ink: "#1b1c4d" },
  },
  {
    id: "violet",
    label: "Grape",
    gradient: "from-violet-500 to-purple-600",
    dot: "bg-violet-500",
    glyph: "text-violet-600",
    soft: "bg-violet-50 text-violet-700",
    clay: { base: "#8b6cf0", dark: "#6a4bd4", light: "#c3b0fa", ink: "#251246" },
  },
  {
    id: "pink",
    label: "Pink",
    gradient: "from-pink-500 to-fuchsia-600",
    dot: "bg-pink-500",
    glyph: "text-pink-600",
    soft: "bg-pink-50 text-pink-700",
    clay: { base: "#f06cae", dark: "#d44a8e", light: "#ffb0d4", ink: "#4b0f2c" },
  },
  {
    id: "rose",
    label: "Coral",
    gradient: "from-rose-500 to-pink-600",
    dot: "bg-rose-500",
    glyph: "text-rose-600",
    soft: "bg-rose-50 text-rose-700",
    clay: { base: "#f4697f", dark: "#d8465f", light: "#ffb3c0", ink: "#47111d" },
  },
  {
    id: "red",
    label: "Red",
    gradient: "from-red-500 to-rose-600",
    dot: "bg-red-500",
    glyph: "text-red-600",
    soft: "bg-red-50 text-red-700",
    clay: { base: "#ef5350", dark: "#cf3b38", light: "#ffa3a0", ink: "#4a0f0d" },
  },
  {
    id: "orange",
    label: "Orange",
    gradient: "from-orange-500 to-amber-600",
    dot: "bg-orange-500",
    glyph: "text-orange-600",
    soft: "bg-orange-50 text-orange-700",
    clay: { base: "#f98342", dark: "#d96320", light: "#ffbe94", ink: "#4a1d05" },
  },
  {
    id: "amber",
    label: "Sunset",
    gradient: "from-amber-500 to-orange-600",
    dot: "bg-amber-500",
    glyph: "text-amber-600",
    soft: "bg-amber-50 text-amber-700",
    clay: { base: "#f6a623", dark: "#d8850c", light: "#ffd489", ink: "#432506" },
  },
  {
    id: "lime",
    label: "Lime",
    gradient: "from-lime-500 to-green-600",
    dot: "bg-lime-500",
    glyph: "text-lime-600",
    soft: "bg-lime-50 text-lime-700",
    clay: { base: "#8bc63f", dark: "#6da325", light: "#c6e894", ink: "#213407" },
  },
  {
    id: "emerald",
    label: "Forest",
    gradient: "from-emerald-500 to-teal-600",
    dot: "bg-emerald-500",
    glyph: "text-emerald-600",
    soft: "bg-emerald-50 text-emerald-700",
    clay: { base: "#20bf8a", dark: "#0e9d6e", light: "#8ee7c4", ink: "#04372a" },
  },
  {
    id: "turquoise",
    label: "Turquoise",
    gradient: "from-teal-400 to-cyan-600",
    dot: "bg-teal-400",
    glyph: "text-teal-600",
    soft: "bg-teal-50 text-teal-700",
    clay: { base: "#2fc8c0", dark: "#14a6a0", light: "#9ff0ec", ink: "#043332" },
  },
  {
    id: "slate",
    label: "Graphite",
    gradient: "from-slate-600 to-slate-800",
    dot: "bg-slate-700",
    glyph: "text-slate-700",
    soft: "bg-slate-100 text-slate-700",
    clay: { base: "#6b7a90", dark: "#4d5a6e", light: "#aab7c8", ink: "#131c2b" },
  },
];

export const DEFAULT_AGENT_COLOR = "blue";

export function isAgentColor(value: string): boolean {
  return AGENT_COLORS.some((option) => option.id === value);
}

export function getAgentColor(value: string): AgentColorOption {
  return AGENT_COLORS.find((option) => option.id === value) ?? AGENT_COLORS[0];
}

/**
 * Portraits follow the Grok Bots Studio avatar maker: eight clay shapes and
 * sixteen faces, tinted by one of the twelve colours above. A stored avatar is
 * `shape:face` (e.g. `circle:happy`); older single-key rows still resolve.
 */
export type AgentShapeOption = { id: string; label: string };
export type AgentFaceOption = { id: string; label: string };

export const AGENT_SHAPES: AgentShapeOption[] = [
  { id: "circle", label: "Circle" },
  { id: "pebble", label: "Pebble" },
  { id: "squircle", label: "Squircle" },
  { id: "capsule", label: "Capsule" },
  { id: "triangle", label: "Triangle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "cloud", label: "Cloud" },
  { id: "droplet", label: "Droplet" },
];

export const AGENT_FACES: AgentFaceOption[] = [
  { id: "neutral", label: "Neutral" },
  { id: "attentive", label: "Attentive" },
  { id: "surprised", label: "Surprised" },
  { id: "excited", label: "Excited" },
  { id: "happy", label: "Happy" },
  { id: "laughing", label: "Laughing" },
  { id: "angry", label: "Angry" },
  { id: "sad", label: "Sad" },
  { id: "scared", label: "Scared" },
  { id: "suspicious", label: "Suspicious" },
  { id: "confused", label: "Confused" },
  { id: "curious", label: "Curious" },
  { id: "proud", label: "Proud" },
  { id: "shy", label: "Shy" },
  { id: "unimpressed", label: "Unimpressed" },
  { id: "sleepy", label: "Sleepy" },
];

/**
 * The Studio's Move row. `auto` keeps each shape's own ambient motion (the
 * default, so existing `shape:face` rows keep behaving exactly as before),
 * `still` freezes the portrait, and the rest pin one animation.
 */
export type AgentMotionOption = { id: string; label: string };

export const AGENT_MOTIONS: AgentMotionOption[] = [
  { id: "auto", label: "Auto" },
  { id: "still", label: "Still" },
  { id: "bob", label: "Bob" },
  { id: "bounce", label: "Bounce" },
  { id: "float", label: "Float" },
  { id: "breathe", label: "Breathe" },
  { id: "tilt", label: "Tilt" },
  { id: "sway", label: "Sway" },
  { id: "wiggle", label: "Wiggle" },
  { id: "spin", label: "Spin" },
  { id: "orbit", label: "Orbit" },
  { id: "pulse", label: "Pulse" },
  { id: "hop", label: "Hop" },
  { id: "squash", label: "Squash" },
  { id: "wobble", label: "Wobble" },
];

export const DEFAULT_AGENT_MOTION = "auto";

export function isAgentMotion(value: string): boolean {
  return AGENT_MOTIONS.some((option) => option.id === value);
}

export function getAgentMotion(value: string): AgentMotionOption {
  return AGENT_MOTIONS.find((option) => option.id === value) ?? AGENT_MOTIONS[0];
}

export const DEFAULT_AGENT_SHAPE = "circle";
export const DEFAULT_AGENT_FACE = "happy";

/**
 * Stored avatar value for a shape + face (+ an optional pinned motion). `auto`
 * is left out of the key on purpose, so existing two-part rows stay canonical.
 */
export function avatarKey(shape: string, face: string, motion?: string): string {
  const move = motion && motion !== DEFAULT_AGENT_MOTION && isAgentMotion(motion) ? motion : null;
  return move ? `${shape}:${face}:${move}` : `${shape}:${face}`;
}

export const DEFAULT_AGENT_AVATAR = avatarKey(DEFAULT_AGENT_SHAPE, DEFAULT_AGENT_FACE);

/**
 * An uploaded portrait is a compressed WebP data URL stored in the same `avatar`
 * text column. The length cap keeps a row from carrying an arbitrary payload and
 * the prefix check means only real image data is ever rendered.
 */
export const AGENT_AVATAR_MAX_LENGTH = 200_000;

const AGENT_AVATAR_IMAGE_PREFIX = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

export function isAgentAvatarImage(value: string): boolean {
  const raw = String(value ?? "");
  return raw.length <= AGENT_AVATAR_MAX_LENGTH && AGENT_AVATAR_IMAGE_PREFIX.test(raw);
}

export function isAgentShape(value: string): boolean {
  return AGENT_SHAPES.some((option) => option.id === value);
}

export function isAgentFace(value: string): boolean {
  return AGENT_FACES.some((option) => option.id === value);
}

/**
 * Keys stored before the shape + face portraits. Rows keep their original key;
 * these map it onto the closest portrait so no migration or backfill is needed.
 */
const LEGACY_AGENT_AVATARS: Record<string, string> = {
  buddy: "circle:happy",
  blob: "pebble:neutral",
  orbit: "hexagon:curious",
  sprout: "droplet:happy",
  bolt: "squircle:excited",
  star: "triangle:happy",
  robot: "squircle:attentive",
  astronaut: "capsule:happy",
  sun: "hexagon:excited",
  cat: "pebble:curious",
  bear: "circle:happy",
  bunny: "droplet:shy",
  owl: "triangle:proud",
  ghost: "cloud:surprised",
  alien: "pebble:excited",
};

export type AgentAvatarSpec = { shape: string; face: string; motion: string };

/** Splits a stored avatar into its shape, face and motion, falling back per part. */
export function parseAgentAvatar(value: string): AgentAvatarSpec {
  const raw = String(value ?? "").trim();

  const [shapePart, facePart, motionPart, ...rest] = raw.split(":");
  if (facePart !== undefined && rest.length === 0) {
    return {
      shape: isAgentShape(shapePart) ? shapePart : DEFAULT_AGENT_SHAPE,
      face: isAgentFace(facePart) ? facePart : DEFAULT_AGENT_FACE,
      motion: motionPart && isAgentMotion(motionPart) ? motionPart : DEFAULT_AGENT_MOTION,
    };
  }

  if (isAgentShape(raw)) {
    return { shape: raw, face: DEFAULT_AGENT_FACE, motion: DEFAULT_AGENT_MOTION };
  }

  const legacy = LEGACY_AGENT_AVATARS[raw];
  if (legacy) {
    const [legacyShape, legacyFace] = legacy.split(":");
    return {
      shape: isAgentShape(legacyShape) ? legacyShape : DEFAULT_AGENT_SHAPE,
      face: isAgentFace(legacyFace) ? legacyFace : DEFAULT_AGENT_FACE,
      motion: DEFAULT_AGENT_MOTION,
    };
  }

  return { shape: DEFAULT_AGENT_SHAPE, face: DEFAULT_AGENT_FACE, motion: DEFAULT_AGENT_MOTION };
}

/** The canonical `shape:face[:motion]` value to store for any accepted avatar input. */
export function normalizeAgentAvatar(value: string): string {
  const raw = String(value ?? "").trim();
  if (isAgentAvatarImage(raw)) return raw;

  const spec = parseAgentAvatar(raw);
  return avatarKey(spec.shape, spec.face, spec.motion);
}

/** True for a `shape:face` pair, a pinned motion, a bare shape, or a legacy key. */
export function isAgentAvatar(value: string): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  if (isAgentAvatarImage(raw)) return true;

  const [shapePart, facePart, motionPart, ...rest] = raw.split(":");
  if (facePart !== undefined && rest.length === 0) {
    if (!isAgentShape(shapePart) || !isAgentFace(facePart)) return false;
    return motionPart === undefined || isAgentMotion(motionPart);
  }

  return isAgentShape(raw) || Object.prototype.hasOwnProperty.call(LEGACY_AGENT_AVATARS, raw);
}

/** Human label for the picker header, e.g. "Circle · Happy". */
export function getAgentAvatarLabel(value: string): string {
  if (isAgentAvatarImage(value)) return "Uploaded photo";

  const spec = parseAgentAvatar(value);
  const shape = AGENT_SHAPES.find((option) => option.id === spec.shape)?.label ?? "Circle";
  const face = AGENT_FACES.find((option) => option.id === spec.face)?.label ?? "Happy";
  return `${shape} · ${face}`;
}

export type AgentProviderOption = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tinted square behind the provider icon. */
  chip: string;
  kind: "builtin";
};

export const AGENT_PROVIDERS: AgentProviderOption[] = [
  {
    id: "alcatraz",
    name: "Alcatraz AI",
    description: "Built-in agent powered by OpenAI. Works right away.",
    icon: Sparkles,
    chip: "bg-blue-50 text-blue-600 ring-blue-100",
    kind: "builtin",
  },
];

export function isAgentProvider(value: string): boolean {
  return AGENT_PROVIDERS.some((option) => option.id === value);
}

import type { AgentModelInfo } from "./model-catalog";

export type AgentModelCatalog = {
  builtin: readonly AgentModelInfo[];
  custom: readonly AgentModelInfo[];
  defaultKey: string;
};

export const DEFAULT_AGENT_MODEL = "openai/gpt-5.4";

export function getAgentProvider(value: string): AgentProviderOption {
  return AGENT_PROVIDERS.find((option) => option.id === value) ?? AGENT_PROVIDERS[0];
}

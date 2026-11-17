/**
 * Per-widget (and per-dashboard) visual customization.
 *
 * Everything here is plain, validated data so it can travel through server
 * actions, JSONB and the client without ever becoming markup. Colours are hex
 * only, and images are either a validated https URL or a compact image data URL
 * produced by the upload control, so a stored customization can never inject CSS
 * or hold an arbitrary payload.
 */

export type BackgroundKind = "theme" | "solid" | "gradient" | "image";

export type WidgetBackground = {
  kind: BackgroundKind;
  /** Solid colour, or the start of a gradient. */
  color?: string;
  from?: string;
  to?: string;
  angle?: number;
  url?: string;
  /** 0–80: dark veil over an image so text stays readable. */
  overlay?: number;
};

export type WidgetHeaderOptions = {
  title: boolean;
  icon: boolean;
  updated: boolean;
};

export type WidgetAppearance = {
  background: WidgetBackground;
  borderColor: string | null;
  /** 0–2 px. */
  borderWidth: number;
  /** 0–28 px. */
  radius: number;
  shadow: "none" | "sm" | "md" | "lg";
  /** 8–24 px. */
  padding: number;
  align: "left" | "center";
  font: "sans" | "serif" | "mono";
  headingSize: "sm" | "base" | "lg";
  textColor: string | null;
  header: WidgetHeaderOptions;
};

export type DashboardAppearance = {
  background: WidgetBackground;
};

export const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = {
  background: { kind: "theme" },
  borderColor: null,
  borderWidth: 1,
  radius: 16,
  shadow: "md",
  padding: 14,
  align: "left",
  font: "sans",
  headingSize: "base",
  textColor: null,
  header: { title: true, icon: true, updated: false },
};

export const DEFAULT_DASHBOARD_APPEARANCE: DashboardAppearance = {
  background: { kind: "theme" },
};

const HEX = /^#[0-9a-f]{3,8}$/i;
/** Matches what the upload control writes; nothing else can enter the style. */
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i;
/** Kept well under Next's server-action body limit. */
export const MAX_IMAGE_DATA_URL_LENGTH = 700_000;

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;
}

function optionalColor(value: unknown): string | null {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim() : null;
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function imageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("data:")) {
    if (trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) return undefined;
    return IMAGE_DATA_URL.test(trimmed) ? trimmed : undefined;
  }

  if (trimmed.length > 2_000 || !/^https:\/\//i.test(trimmed)) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function normalizeBackground(input: unknown): WidgetBackground {
  if (!input || typeof input !== "object") return { kind: "theme" };
  const raw = input as Record<string, unknown>;
  const kind = raw.kind;

  if (kind === "solid") {
    return { kind: "solid", color: color(raw.color, "#ffffff") };
  }

  if (kind === "gradient") {
    return {
      kind: "gradient",
      from: color(raw.from, "#1d4ed8"),
      to: color(raw.to, "#3b82f6"),
      angle: bounded(raw.angle, 0, 360, 135),
    };
  }

  if (kind === "image") {
    const url = imageUrl(raw.url);
    if (!url) return { kind: "theme" };
    return { kind: "image", url, overlay: bounded(raw.overlay, 0, 80, 35) };
  }

  return { kind: "theme" };
}

function shadow(value: unknown, fallback: WidgetAppearance["shadow"]) {
  return value === "none" || value === "sm" || value === "md" || value === "lg"
    ? value
    : fallback;
}

export function normalizeWidgetAppearance(input: unknown): WidgetAppearance {
  if (!input || typeof input !== "object") return { ...DEFAULT_WIDGET_APPEARANCE };
  const raw = input as Record<string, unknown>;
  const header =
    raw.header && typeof raw.header === "object"
      ? (raw.header as Record<string, unknown>)
      : {};

  return {
    background: normalizeBackground(raw.background),
    borderColor: optionalColor(raw.borderColor),
    borderWidth: bounded(raw.borderWidth, 0, 2, DEFAULT_WIDGET_APPEARANCE.borderWidth),
    radius: bounded(raw.radius, 0, 28, DEFAULT_WIDGET_APPEARANCE.radius),
    shadow: shadow(raw.shadow, DEFAULT_WIDGET_APPEARANCE.shadow),
    padding: bounded(raw.padding, 8, 24, DEFAULT_WIDGET_APPEARANCE.padding),
    align: raw.align === "center" ? "center" : "left",
    font: raw.font === "serif" || raw.font === "mono" ? raw.font : "sans",
    headingSize:
      raw.headingSize === "sm" || raw.headingSize === "lg" ? raw.headingSize : "base",
    textColor: optionalColor(raw.textColor),
    header: {
      title: header.title !== false,
      icon: header.icon !== false,
      updated: header.updated === true,
    },
  };
}

export function normalizeDashboardAppearance(input: unknown): DashboardAppearance {
  if (!input || typeof input !== "object") return { ...DEFAULT_DASHBOARD_APPEARANCE };
  const raw = input as Record<string, unknown>;
  return { background: normalizeBackground(raw.background) };
}

/** True when the appearance can be cleared without losing a real choice. */
export function isDefaultWidgetAppearance(value: WidgetAppearance): boolean {
  const a = normalizeWidgetAppearance(value);
  const b = DEFAULT_WIDGET_APPEARANCE;
  return (
    a.background.kind === "theme" &&
    a.borderColor === null &&
    a.borderWidth === b.borderWidth &&
    a.radius === b.radius &&
    a.shadow === b.shadow &&
    a.padding === b.padding &&
    a.align === "left" &&
    a.font === "sans" &&
    a.headingSize === "base" &&
    a.textColor === null &&
    a.header.title &&
    a.header.icon &&
    !a.header.updated
  );
}

export const WIDGET_SHADOWS: Record<WidgetAppearance["shadow"], string> = {
  none: "none",
  sm: "0 1px 2px rgba(16, 24, 40, 0.08)",
  md: "0 12px 30px -16px rgba(16, 24, 40, 0.35)",
  lg: "0 28px 60px -24px rgba(16, 24, 40, 0.45)",
};

export const WIDGET_FONTS: Record<WidgetAppearance["font"], string> = {
  sans: "var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "var(--aui-font-mono), ui-monospace, monospace",
};

export const WIDGET_HEADING_SIZES: Record<WidgetAppearance["headingSize"], string> = {
  sm: "0.72rem",
  base: "0.8rem",
  lg: "0.95rem",
};

/** Background-only styles; the card adds the image overlay itself. */
export function backgroundStyle(background: WidgetBackground): Record<string, string> {
  if (background.kind === "solid") {
    return { backgroundColor: background.color ?? "#ffffff" };
  }
  if (background.kind === "gradient") {
    return {
      backgroundColor: background.from ?? "#1d4ed8",
      backgroundImage: `linear-gradient(${background.angle ?? 135}deg, ${
        background.from ?? "#1d4ed8"
      }, ${background.to ?? "#3b82f6"})`,
    };
  }
  if (background.kind === "image" && background.url) {
    return {
      backgroundImage: `url("${background.url}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return {};
}

/**
 * Theme palettes. Appearance (light / dark / system) lives in the root layout's
 * next-themes-style class on <html>; a palette puts `data-theme` on <html> and
 * swaps the CSS token set in globals.css. Client-safe: no server imports.
 *
 * Only palettes with a real token block in globals.css are listed here, so the
 * picker can never offer a theme that does nothing. Contrast for every one is
 * checked by scripts/check-palette-contrast.mjs.
 */

export type PaletteId =
  | "alcatraz"
  | "graphite"
  | "ocean"
  | "lagoon"
  | "matcha"
  | "forest"
  | "citrus"
  | "gold"
  | "sunset"
  | "sand"
  | "coral"
  | "crimson"
  | "berry"
  | "plum"
  | "grape"
  | "lavender"
  | "indigo"
  | "dusk";

export type ThemeAppearance = "light" | "dark" | "system";

export function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return value === "light" || value === "dark" || value === "system";
}

export type Palette = {
  id: PaletteId;
  label: string;
  blurb: string;
  /** Swatches used by the picker; also the preview gradient. */
  swatches: { light: string[]; dark: string[] };
};

export const PALETTE_STORAGE_KEY = "alcatraz-palette";
/** next-themes owns this key; mirrored into the account on change. */
export const APPEARANCE_STORAGE_KEY = "theme";

export const PALETTES: Palette[] = [
  {
    id: "alcatraz",
    label: "Alcatraz",
    blurb: "Ink, paper and electric blue",
    swatches: {
      light: ["#f6f6f7", "#1d4ed8", "#18181b"],
      dark: ["#0b0b0d", "#82bcff", "#f4f4f5"],
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    blurb: "Monochrome, cool and quiet",
    swatches: {
      light: ["#f5f5f6", "#2b2b31", "#8a8a94"],
      dark: ["#0e0e10", "#e4e4e7", "#71717a"],
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    blurb: "Sea glass and deep teal",
    swatches: {
      light: ["#f2fbfc", "#056872", "#4ee0e8"],
      dark: ["#06181c", "#4ee0e8", "#a9d3da"],
    },
  },
  {
    id: "lagoon",
    label: "Lagoon",
    blurb: "Bright water and pale aqua",
    swatches: {
      light: ["#f0faf9", "#0b6157", "#149e8d"],
      dark: ["#05100f", "#4fd8c4", "#8ee8d9"],
    },
  },
  {
    id: "matcha",
    label: "Matcha",
    blurb: "Fresh green on warm white",
    swatches: {
      light: ["#f6fbf1", "#3f7a1e", "#a3e635"],
      dark: ["#0f1509", "#a3e635", "#d4f7a1"],
    },
  },
  {
    id: "forest",
    label: "Forest",
    blurb: "Deep pine and moss",
    swatches: {
      light: ["#f4f8f2", "#1f5d3a", "#4b9a6b"],
      dark: ["#0b120c", "#86d3a2", "#3f8f5f"],
    },
  },
  {
    id: "citrus",
    label: "Citrus",
    blurb: "Bright lime on cream",
    swatches: {
      light: ["#fafcef", "#4d6b0a", "#86a81c"],
      dark: ["#0c1004", "#c6e56a", "#cfe98a"],
    },
  },
  {
    id: "gold",
    label: "Gold",
    blurb: "Warm butter and deep amber",
    swatches: {
      light: ["#fdfbf2", "#6f5300", "#b58a12"],
      dark: ["#0f0d04", "#f0d05e", "#ecd27a"],
    },
  },
  {
    id: "coral",
    label: "Coral",
    blurb: "Blush paper, deep rose ink",
    swatches: {
      light: ["#fff7f4", "#b4233a", "#f2a48f"],
      dark: ["#170b0e", "#ff8a8f", "#ffc2b8"],
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    blurb: "Amber light and burnt orange",
    swatches: {
      light: ["#fff8f1", "#b0460f", "#e07a34"],
      dark: ["#150d07", "#ffa25e", "#e8843c"],
    },
  },
  {
    id: "sand",
    label: "Sand",
    blurb: "Warm linen and terracotta",
    swatches: {
      light: ["#fbf7ef", "#8a4f22", "#e8b27a"],
      dark: ["#171208", "#e8b27a", "#f5d6b0"],
    },
  },
  {
    id: "crimson",
    label: "Crimson",
    blurb: "Crimson ink on porcelain",
    swatches: {
      light: ["#fdf6f6", "#9f1239", "#d6336c"],
      dark: ["#120608", "#ff8fa3", "#ff9fb0"],
    },
  },
  {
    id: "berry",
    label: "Berry",
    blurb: "Pink paper, plum and magenta",
    swatches: {
      light: ["#fff5fa", "#a51d6b", "#ff8ac4"],
      dark: ["#1d0812", "#ff8ac4", "#ffc2dd"],
    },
  },
  {
    id: "plum",
    label: "Plum",
    blurb: "Ripe plum and orchid",
    swatches: {
      light: ["#fcf6fb", "#86157a", "#c026a5"],
      dark: ["#10060f", "#f2a0e2", "#f3aae4"],
    },
  },
  {
    id: "grape",
    label: "Grape",
    blurb: "Vivid violet on pale lilac",
    swatches: {
      light: ["#f8f5ff", "#6d28d9", "#a855f7"],
      dark: ["#100b1c", "#c4b5fd", "#a78bfa"],
    },
  },
  {
    id: "lavender",
    label: "Lavender",
    blurb: "Soft lilac and violet",
    swatches: {
      light: ["#f8f6ff", "#5a35d6", "#b9a5ff"],
      dark: ["#120e22", "#b9a5ff", "#d9ccff"],
    },
  },
  {
    id: "indigo",
    label: "Indigo",
    blurb: "Midnight blue and periwinkle",
    swatches: {
      light: ["#f4f6fd", "#3730a3", "#6366f1"],
      dark: ["#080a14", "#a5b4fc", "#b3befd"],
    },
  },
  {
    id: "dusk",
    label: "Dusk",
    blurb: "Quiet violet after hours",
    swatches: {
      light: ["#f6f5fb", "#4c3f86", "#b8a6ff"],
      dark: ["#12111c", "#b8a6ff", "#d8ccff"],
    },
  },
];

const IDS = PALETTES.map((palette) => palette.id);

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === "string" && IDS.includes(value as PaletteId);
}

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}

export function paletteGradient(id: PaletteId, mode: "light" | "dark"): string {
  const colors = getPalette(id).swatches[mode];
  return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 55%, ${colors[2]} 100%)`;
}

/**
 * Runs before first paint so a stored palette never flashes the default blue.
 * Kept dependency-free because it is inlined into the document body.
 */
export const PALETTE_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${PALETTE_STORAGE_KEY}");if(${JSON.stringify(
  IDS,
)}.indexOf(p)<0)p="alcatraz";document.documentElement.setAttribute("data-theme",p);}catch(e){}})();`;

/** Reads the palette chosen on this device. Safe on the server (returns default). */
export function readStoredPalette(): PaletteId {
  if (typeof window === "undefined") return "alcatraz";

  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPaletteId(stored) ? stored : "alcatraz";
  } catch {
    return "alcatraz";
  }
}

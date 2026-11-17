"use client";

import type { PaletteId } from "@/lib/themes";

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function usePalette() {
  return {
    palette: "alcatraz" as PaletteId,
    setPalette: (_id: PaletteId) => {},
  };
}

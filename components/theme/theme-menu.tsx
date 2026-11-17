"use client";

import { useEffect, useState } from "react";

import { Check } from "lucide-react";

import { saveThemePreferenceAction } from "@/app/actions/theme";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  isPaletteId,
  PALETTE_STORAGE_KEY,
  PALETTES,
  paletteGradient,
  type PaletteId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Color theme picker. The palette is a `data-theme` attribute on <html> plus a
 * device-local preference, so it applies before paint (see PALETTE_BOOT_SCRIPT)
 * and follows the user across every surface without a server round-trip. The
 * choice is also mirrored onto the account so a new browser picks it up.
 */
export function ThemeMenu({ className }: { className?: string }) {
  const [palette, setPalette] = useState<PaletteId>("alcatraz");
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
      if (isPaletteId(stored)) setPalette(stored);
    } catch {
      // A blocked localStorage just keeps the default palette.
    }

    const root = document.documentElement;
    const sync = () => setMode(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function apply(id: PaletteId) {
    setPalette(id);
    document.documentElement.setAttribute("data-theme", id);
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
    } catch {
      // Device-only persistence is a nice-to-have, never a hard failure.
    }
    void saveThemePreferenceAction(id, mode);
  }

  const current = PALETTES.find((entry) => entry.id === palette) ?? PALETTES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Change color theme (${current.label})`}
        title={`Color theme · ${current.label}`}
        className={cn(
          "grid size-9 place-items-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="size-[18px] rounded-full shadow-inner ring-1 ring-black/15 transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundImage: paletteGradient(palette, mode) }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={10} className="w-[16rem] p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-[0.76rem] font-semibold">Color theme</p>
          <p className="mt-0.5 text-[0.62rem] text-muted-foreground">
            {PALETTES.length} palettes · synced to your account
          </p>
        </div>

        <div role="group" aria-label="Color palettes" className="grid grid-cols-4 gap-0.5 p-1.5">
          {PALETTES.map((entry) => {
            const active = entry.id === palette;

            return (
              <DropdownMenuItem
                key={entry.id}
                onClick={() => apply(entry.id)}
                title={`${entry.label} — ${entry.blurb}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-0.5 py-1.5 text-center",
                  active && "bg-muted/70",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative grid size-6 place-items-center rounded-full shadow-inner ring-1 ring-black/15 transition-transform duration-200",
                    active && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover",
                  )}
                  style={{ backgroundImage: paletteGradient(entry.id, mode) }}
                >
                  {active ? <Check className="size-2.5 text-white drop-shadow-sm" strokeWidth={4} /> : null}
                </span>
                <span className="w-full truncate text-[0.55rem] font-medium leading-tight">
                  {entry.label}
                </span>
                {active ? <span className="sr-only">Selected</span> : null}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

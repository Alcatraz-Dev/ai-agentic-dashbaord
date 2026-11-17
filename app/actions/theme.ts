"use server";

import { getCurrentUser } from "@/lib/session";
import { setThemePreference } from "@/lib/theme-preference";
import { isPaletteId, isThemeAppearance } from "@/lib/themes";
import { ensureUserRecord } from "@/lib/users";

/**
 * Stores the theme on the signed-in user so it follows them to another device.
 * Signed-out visitors keep a device-only choice; that is not an error.
 */
export async function saveThemePreferenceAction(
  palette: string,
  appearance: string,
): Promise<{ ok: boolean }> {
  if (!isPaletteId(palette) || !isThemeAppearance(appearance)) return { ok: false };

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: true };

    const profile = await ensureUserRecord(user);
    await setThemePreference(profile.id, { palette, appearance });
    return { ok: true };
  } catch (error) {
    console.error("[theme] could not save preference", error);
    return { ok: false };
  }
}

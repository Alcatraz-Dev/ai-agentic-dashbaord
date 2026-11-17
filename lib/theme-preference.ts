import "server-only";

import { eq } from "drizzle-orm";

import { db, users } from "@/db";
import {
  isPaletteId,
  isThemeAppearance,
  type PaletteId,
  type ThemeAppearance,
} from "@/lib/themes";

export type ThemePreference = {
  palette: PaletteId;
  appearance: ThemeAppearance;
};

const DEFAULT: ThemePreference = { palette: "alcatraz", appearance: "system" };

/** The theme saved on the account, used to sync a new device on dashboard load. */
export async function getThemePreference(profileId: number): Promise<ThemePreference> {
  const [row] = await db
    .select({ palette: users.themePalette, appearance: users.themeAppearance })
    .from(users)
    .where(eq(users.id, profileId))
    .limit(1);

  if (!row) return DEFAULT;

  return {
    palette: isPaletteId(row.palette) ? row.palette : DEFAULT.palette,
    appearance: isThemeAppearance(row.appearance) ? row.appearance : DEFAULT.appearance,
  };
}

export async function setThemePreference(
  profileId: number,
  preference: ThemePreference,
): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({
      themePalette: preference.palette,
      themeAppearance: preference.appearance,
      updatedAt: new Date(),
    })
    .where(eq(users.id, profileId))
    .returning({ id: users.id });

  return Boolean(row);
}

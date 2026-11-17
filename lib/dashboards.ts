import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { dashboards, db, users } from "@/db";
import { normalizeDashboardAppearance } from "@/lib/widget-appearance";
import { ensureUserRecord } from "@/lib/users";
import type { AuthUser } from "@/lib/auth-types";

/** Remembers which dashboard the workspace is looking at. */
export const DASHBOARD_COOKIE = "alcatraz-dashboard";
export const DASHBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type NewDashboardInput = {
  name: string;
  icon: string;
  color: string;
  template: string;
};

const dashboardColumns = {
  id: dashboards.id,
  name: dashboards.name,
  icon: dashboards.icon,
  color: dashboards.color,
  template: dashboards.template,
  appearance: dashboards.appearance,
};

export type DashboardRecord = Awaited<ReturnType<typeof listDashboardsForUser>>[number];

/** Every dashboard the signed-in user owns, oldest first. */
export async function listDashboardsForUser(authUserId: string) {
  return db
    .select(dashboardColumns)
    .from(dashboards)
    .innerJoin(users, eq(dashboards.ownerId, users.id))
    .where(eq(users.authUserId, authUserId))
    .orderBy(asc(dashboards.createdAt), asc(dashboards.id));
}

/** Every dashboard one app profile owns, oldest first. */
export async function listDashboardsForProfile(profileId: number) {
  return db
    .select(dashboardColumns)
    .from(dashboards)
    .where(eq(dashboards.ownerId, profileId))
    .orderBy(asc(dashboards.createdAt), asc(dashboards.id));
}

/**
 * Chooses the active dashboard: the cookie's row when the owner still has it,
 * otherwise the oldest dashboard. Pure, so server code can reuse it.
 */
export function pickActiveDashboardId<T extends { id: number }>(
  rows: T[],
  cookieValue: string | null | undefined,
): number | null {
  const wanted = Number(cookieValue ?? "");
  if (Number.isInteger(wanted) && wanted > 0 && rows.some((row) => row.id === wanted)) {
    return wanted;
  }
  return rows[0]?.id ?? null;
}

/** The dashboard the workspace is currently showing, or null if none exist. */
export async function getDashboardForUser(authUserId: string) {
  const rows = await listDashboardsForUser(authUserId);
  if (rows.length === 0) return null;

  const store = await cookies();
  const id = pickActiveDashboardId(rows, store.get(DASHBOARD_COOKIE)?.value);
  return rows.find((row) => row.id === id) ?? rows[0];
}

/** The active dashboard for an app profile id (API routes, actions). */
export async function getActiveDashboardForProfile(profileId: number) {
  const rows = await listDashboardsForProfile(profileId);
  if (rows.length === 0) return null;

  const store = await cookies();
  const id = pickActiveDashboardId(rows, store.get(DASHBOARD_COOKIE)?.value);
  return rows.find((row) => row.id === id) ?? rows[0];
}

/** Remembers the dashboard a create/switch action just landed on. */
export async function setActiveDashboardCookie(id: number) {
  const store = await cookies();
  store.set(DASHBOARD_COOKIE, String(id), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: DASHBOARD_COOKIE_MAX_AGE,
  });
}

/** Saves the dashboard background for the signed-in owner. */
export async function updateDashboardAppearanceForUser(
  authUserId: string,
  input: unknown,
) {
  const dashboard = await getDashboardForUser(authUserId);
  if (!dashboard) return null;

  const appearance = normalizeDashboardAppearance(input);
  const [row] = await db
    .update(dashboards)
    .set({
      appearance: appearance.background.kind === "theme" ? null : appearance,
      updatedAt: new Date(),
    })
    .where(eq(dashboards.id, dashboard.id))
    .returning({ appearance: dashboards.appearance });

  return row ? normalizeDashboardAppearance(row.appearance) : null;
}

export type DashboardUpdateInput = {
  name: string;
  icon: string;
  color: string;
  template: string;
};

/** Renames or re-dresses the active dashboard. */
export async function updateDashboardForUser(
  authUserId: string,
  input: DashboardUpdateInput,
) {
  const dashboard = await getDashboardForUser(authUserId);
  if (!dashboard) return null;

  const [row] = await db
    .update(dashboards)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(dashboards.id, dashboard.id))
    .returning({
      id: dashboards.id,
      name: dashboards.name,
      icon: dashboards.icon,
      color: dashboards.color,
      template: dashboards.template,
    });

  return row ?? null;
}

/** Inserts one dashboard for the owner. Its widgets are added separately. */
export async function createDashboardForUser(user: AuthUser, input: NewDashboardInput) {
  const profile = await ensureUserRecord(user);

  const [row] = await db
    .insert(dashboards)
    .values({
      ownerId: profile.id,
      name: input.name,
      icon: input.icon,
      color: input.color,
      template: input.template,
    })
    .returning();

  return row ?? null;
}

/**
 * Deletes one dashboard the owner actually owns. Its widgets, layout and
 * background go with it through the foreign-key cascade.
 */
export async function deleteDashboardForUser(profileId: number, id: number) {
  if (!Number.isInteger(id) || id <= 0) return false;

  const [row] = await db
    .delete(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.ownerId, profileId)))
    .returning({ id: dashboards.id });

  return Boolean(row);
}

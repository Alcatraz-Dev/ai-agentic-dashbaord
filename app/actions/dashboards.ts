"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { listAgentsForUser } from "@/lib/agents";
import {
  DASHBOARD_NAME_MAX_LENGTH,
  DEFAULT_DASHBOARD_COLOR,
  DEFAULT_DASHBOARD_TEMPLATE,
  getDashboardPortrait,
  isDashboardColor,
  isDashboardTemplate,
} from "@/lib/dashboard-options";
import {
  DASHBOARD_COOKIE,
  DASHBOARD_COOKIE_MAX_AGE,
  createDashboardForUser,
  deleteDashboardForUser,
  getDashboardForUser,
  listDashboardsForProfile,
  setActiveDashboardCookie,
  updateDashboardAppearanceForUser,
  updateDashboardForUser,
} from "@/lib/dashboards";
import { getTemplateBlueprint } from "@/lib/dashboard-starters";
import { getPlanUsage } from "@/lib/plan-usage";
import { PRICING_URL } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import { createStarterWidgetsForUser } from "@/lib/widgets";
import type { DashboardAppearance } from "@/lib/widget-appearance";

export type CreateDashboardState = { error: string | null };

export type UpdateDashboardResult =
  | {
      ok: true;
      dashboard: { id: number; name: string; icon: string; color: string; template: string };
    }
  | { ok: false; error: string };

/**
 * Renames or re-dresses the active dashboard: name, clay portrait, colour and
 * template. Owner-scoped, so it can only ever touch this user's row.
 */
export async function updateDashboardAction(input: {
  name: string;
  icon: string;
  color: string;
  template: string;
}): Promise<UpdateDashboardResult> {
  const user = await requireUser();

  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { ok: false, error: "Give your dashboard a name." };
  if (name.length > DASHBOARD_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${DASHBOARD_NAME_MAX_LENGTH} characters.` };
  }

  const color = String(input.color ?? "");
  const template = String(input.template ?? "");

  try {
    const dashboard = await updateDashboardForUser(user.id, {
      name,
      icon: getDashboardPortrait(String(input.icon ?? "")),
      color: isDashboardColor(color) ? color : DEFAULT_DASHBOARD_COLOR,
      template: isDashboardTemplate(template) ? template : DEFAULT_DASHBOARD_TEMPLATE,
    });

    if (!dashboard) return { ok: false, error: "Create a dashboard first." };

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/dashboards");
    return { ok: true, dashboard };
  } catch (error) {
    console.error("[dashboards] update failed", error);
    return { ok: false, error: "We couldn't save your changes. Please try again." };
  }
}

export type ApplyTemplateResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

/**
 * Adds a template's starter cards to the active dashboard. Cards whose title is
 * already there are skipped, so this is safe to press twice, and the plan's
 * remaining widget allowance caps how many land. Existing cards never move out
 * of their cells — the new ones are placed around them.
 */
export async function applyDashboardTemplateAction(
  template: string,
  options?: {
    /** Chat surfaces also dress the dashboard in the template's look. */
    dress?: boolean;
  },
): Promise<ApplyTemplateResult> {
  const user = await requireUser();

  const blueprint = getTemplateBlueprint(String(template ?? ""));
  if (!blueprint) return { ok: false, error: "Pick a template that ships starter cards." };
  if (blueprint.widgets.length === 0) {
    return { ok: false, error: "Blank starts empty — ask an agent for your first widget instead." };
  }

  try {
    const profile = await ensureUserRecord(user);
    const dashboard = await getDashboardForUser(user.id);
    if (!dashboard) return { ok: false, error: "Create a dashboard first." };

    // Agents belong to a dashboard, so starter cards go to this board's own
    // agent. Only agents from before that column existed (null) fall back to
    // the workspace list, so an old workspace can still seed its first board.
    const dashboardAgents = await listAgentsForUser(profile.id, dashboard.id);
    const agents =
      dashboardAgents.length > 0 ? dashboardAgents : await listAgentsForUser(profile.id);
    if (!agents[0]) {
      return {
        ok: false,
        error:
          "Create an AI agent on this dashboard first — every widget belongs to the agent that updates it.",
      };
    }

    const usage = await getPlanUsage(profile.id);
    const remaining = Math.max(0, usage.definition.widgets - usage.widgetsUsed);
    if (remaining === 0) {
      return {
        ok: false,
        error: `Your ${usage.definition.name} plan includes ${usage.definition.widgets} widgets. ${PRICING_URL} explains what Pro adds.`,
      };
    }

    const added = await createStarterWidgetsForUser({
      profileId: profile.id,
      dashboardId: dashboard.id,
      agentId: agents[0].id,
      template: String(template),
      maxWidgets: remaining,
    });

    // A chat suggestion is a one-click start, so it also takes the template's
    // clay portrait and colour. Settings keeps the owner's look unless they
    // save it there themselves.
    if (options?.dress) {
      await updateDashboardForUser(user.id, {
        name: dashboard.name,
        icon: blueprint.portrait,
        color: blueprint.color,
        template: dashboard.template,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/dashboards");
    return { ok: true, added, skipped: Math.max(0, blueprint.widgets.length - added) };
  } catch (error) {
    console.error("[dashboards] template apply failed", error);
    return { ok: false, error: "We couldn't add those cards. Please try again." };
  }
}

/** Saves the dashboard background (colours, gradient or image). */
export async function updateDashboardAppearanceAction(input: {
  appearance: unknown;
}): Promise<
  { ok: true; appearance: DashboardAppearance } | { ok: false; error: string }
> {
  const user = await requireUser();

  try {
    const appearance = await updateDashboardAppearanceForUser(user.id, input.appearance);
    if (!appearance) return { ok: false, error: "Create a dashboard first." };

    revalidatePath("/dashboard");
    return { ok: true, appearance };
  } catch (error) {
    console.error("[dashboards] appearance update failed", error);
    return { ok: false, error: "We couldn't save that background. Please try again." };
  }
}

function readField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Creates another dashboard and switches to it. A non-blank template seeds its
 * getting-started checklist when the workspace already has an agent to own it.
 */
export async function createDashboardAction(
  _prevState: CreateDashboardState,
  formData: FormData,
): Promise<CreateDashboardState> {
  const user = await requireUser();

  const name = readField(formData, "name").replace(/\s+/g, " ");
  if (!name) return { error: "Give your dashboard a name." };
  if (name.length > DASHBOARD_NAME_MAX_LENGTH) {
    return { error: `Keep the name under ${DASHBOARD_NAME_MAX_LENGTH} characters.` };
  }

  const icon = readField(formData, "icon");
  const color = readField(formData, "color");
  const template = isDashboardTemplate(readField(formData, "template"))
    ? readField(formData, "template")
    : DEFAULT_DASHBOARD_TEMPLATE;

  let createdId: number | null = null;

  try {
    const profile = await ensureUserRecord(user);
    const created = await createDashboardForUser(user, {
      name,
      icon: getDashboardPortrait(icon),
      color: isDashboardColor(color) ? color : DEFAULT_DASHBOARD_COLOR,
      template,
    });

    if (!created) {
      return { error: "We couldn't create your dashboard. Please try again." };
    }

    createdId = created.id;

    // Starter content is a bonus, never a reason to fail the create.
    try {
      // Seed with the new board's own agents, never another dashboard's team.
      const dashboardAgents = await listAgentsForUser(profile.id, created.id);
      const agents =
        dashboardAgents.length > 0 ? dashboardAgents : await listAgentsForUser(profile.id);
      if (agents[0]) {
        const usage = await getPlanUsage(profile.id);
        await createStarterWidgetsForUser({
          profileId: profile.id,
          dashboardId: created.id,
          agentId: agents[0].id,
          template,
          maxWidgets: Math.max(0, usage.definition.widgets - usage.widgetsUsed),
        });
      }
    } catch (error) {
      console.error("[dashboards] starter widgets failed", error);
    }

    await setActiveDashboardCookie(created.id);
  } catch (error) {
    console.error("[dashboards] create failed", error);
    return { error: "We couldn't create your dashboard. Please try again." };
  }

  if (!createdId) {
    return { error: "We couldn't create your dashboard. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/dashboards");
  redirect("/dashboard");
}

export type SwitchDashboardResult = { ok: true } | { ok: false; error: string };

/** Remembers another of the owner's dashboards as the active one. */
export async function switchDashboardAction(id: number): Promise<SwitchDashboardResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const owned = await listDashboardsForProfile(profile.id);
    if (!owned.some((dashboard) => dashboard.id === id)) {
      return { ok: false, error: "That dashboard could not be found." };
    }

    await setActiveDashboardCookie(id);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/dashboards");
    return { ok: true };
  } catch (error) {
    console.error("[dashboards] switch failed", error);
    return { ok: false, error: "We couldn't switch dashboards. Please try again." };
  }
}

export type DeleteDashboardResult =
  | { ok: true; nextId: number | null }
  | { ok: false; error: string };

/**
 * Deletes one of the owner's dashboards. Its widgets and layout cascade away;
 * agents and their transcripts are untouched. If it was the active dashboard,
 * the next one is selected (or none, which returns the workspace to onboarding).
 */
export async function deleteDashboardAction(id: number): Promise<DeleteDashboardResult> {
  const user = await requireUser();

  try {
    const profile = await ensureUserRecord(user);
    const active = await getDashboardForUser(user.id);

    const deleted = await deleteDashboardForUser(profile.id, id);
    if (!deleted) return { ok: false, error: "That dashboard could not be found." };

    const remaining = await listDashboardsForProfile(profile.id);

    if (active?.id === id) {
      const store = await cookies();
      const next = remaining[0] ?? null;
      if (next) {
        store.set(DASHBOARD_COOKIE, String(next.id), {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: DASHBOARD_COOKIE_MAX_AGE,
        });
      } else {
        store.delete(DASHBOARD_COOKIE);
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/dashboards");
    revalidatePath("/dashboard/new");

    return { ok: true, nextId: remaining[0]?.id ?? null };
  } catch (error) {
    console.error("[dashboards] delete failed", error);
    return { ok: false, error: "We couldn't delete that dashboard. Please try again." };
  }
}

import { z } from "zod";

import { getAgentForUser } from "@/lib/agents";
import { isValidTimeZone } from "@/lib/agent-schedule-options";
import { getActiveDashboardForProfile } from "@/lib/dashboards";
import { syncWidgetScheduleJobs } from "@/lib/schedule-jobs";
import { widgetLimitError } from "@/lib/plan-usage";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";
import {
  isWidgetDesignKey,
  isWidgetForm,
  normalizeWidgetProposal,
  type WidgetDesignOption,
} from "@/lib/widget-types";
import {
  createWidgetForUser,
  getWidgetForUser,
  isWidgetDesignAvailableForUser,
} from "@/lib/widgets";

/**
 * Creates a widget from the style picker card.
 *
 * The proposal was streamed by the agent, but the client is still untrusted:
 * the payload is normalized again here, the agent must belong to the session,
 * and the chosen design must be one of the two options that were offered. The
 * agent never writes the row itself.
 */

const bodySchema = z.object({
  agentId: z.number().int().positive(),
  proposal: z.unknown(),
  design: z.unknown(),
  /** Browser IANA zone for the default 8 AM / 6 PM updates. */
  timezone: z.string().max(64).optional().nullable(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to sign in to add a widget." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send the widget as JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "That widget couldn't be read." }, { status: 400 });
  }

  const proposal = normalizeWidgetProposal(parsed.data.proposal);
  if (!proposal) {
    return Response.json({ error: "That widget proposal is incomplete." }, { status: 400 });
  }

  const chosen = parsed.data.design as { design?: unknown; form?: unknown };
  if (!isWidgetDesignKey(chosen?.design) || !isWidgetForm(chosen?.form)) {
    return Response.json({ error: "Pick one of the offered designs." }, { status: 400 });
  }

  const offered = proposal.options.find(
    (option) => option.design === chosen.design && option.form === chosen.form,
  );
  if (!offered) {
    return Response.json({ error: "Pick one of the offered designs." }, { status: 400 });
  }

  // The form + style pair is part of the offered option, not a free field: use
  // the option the user actually picked.
  const design: WidgetDesignOption = { design: offered.design, form: offered.form };

  try {
    const profile = await ensureUserRecord(user);

    const limitError = await widgetLimitError(profile.id);
    if (limitError) {
      return Response.json({ error: limitError }, { status: 403 });
    }

    const dashboard = await getActiveDashboardForProfile(profile.id);
    if (!dashboard) {
      return Response.json(
        { error: "Create your dashboard first, then add the widget again." },
        { status: 409 },
      );
    }

    const agent = await getAgentForUser(profile.id, parsed.data.agentId);
    if (!agent) {
      return Response.json({ error: "That agent could not be found." }, { status: 404 });
    }

    const available = await isWidgetDesignAvailableForUser(profile.id, design);
    if (!available) {
      return Response.json(
        { error: "That form and style are already on your dashboard. Pick another design." },
        { status: 409 },
      );
    }

    const timezone =
      typeof parsed.data.timezone === "string" && isValidTimeZone(parsed.data.timezone)
        ? parsed.data.timezone
        : null;

    const widget = await createWidgetForUser({
      profileId: profile.id,
      dashboardId: dashboard.id,
      agentId: agent.id,
      proposal,
      design,
      timezone,
    });

    if (!widget) {
      return Response.json(
        { error: "Create your dashboard first, then add the widget again." },
        { status: 409 },
      );
    }

    // Jobs owns the timer. A failure is stored on the widget and the app's
    // fallback catch-up still refreshes it, so widget creation never fails on
    // an unavailable scheduler.
    await syncWidgetScheduleJobs(widget.id).catch((error) =>
      console.error("[widgets] could not sync the new widget to Jobs", error),
    );
    const saved = (await getWidgetForUser(profile.id, widget.id)) ?? widget;

    return Response.json(
      { widget: saved },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[widgets] create failed", error);
    return Response.json(
      { error: "We couldn't add that widget. Please try again." },
      { status: 500 },
    );
  }
}

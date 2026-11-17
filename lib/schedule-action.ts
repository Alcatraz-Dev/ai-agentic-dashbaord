/**
 * The one mutating app action a schedule may run without asking again.
 *
 * A schedule runs with nobody watching, so an approval card can never be
 * answered. Instead the owner confirms the exact action on the schedule form
 * and the server stores it here; every scheduled `app_run_action` is checked
 * against this policy and nothing else can be sent or posted.
 *
 * Client-safe: the form, the confirmation card, the runner and the history all
 * read the same shape.
 */

export type ScheduleActionPolicy = {
  /** Composio toolkit slug, e.g. "gmail". */
  toolkit: string;
  /** Composio action slug, e.g. "GMAIL_SEND_EMAIL". */
  action: string;
  /** Human label from app_find_actions, e.g. "Send Email". */
  actionLabel: string;
  /** Argument the destination is written to, e.g. "recipient_email". */
  destinationField: string;
  /** The only destination this schedule may reach. */
  destination: string;
  /** How many times one run may execute it. Always at least 1. */
  maxPerRun: number;
};

/** One action a scheduled run actually executed, for the history tab. */
export type ScheduleSentAction = {
  toolkit: string;
  action: string;
  actionLabel: string;
  destinationField: string;
  destination: string;
  /** The action's one-line summary as it was stored. */
  summary: string;
  /** ISO timestamp of the execution. */
  at: string;
};

export const SCHEDULE_ACTION_MAX_PER_RUN = 3;

/** "Gmail · Send Email → me@example.com" */
export function describeScheduleAction(
  policy: Pick<ScheduleActionPolicy, "toolkit" | "actionLabel" | "destination">,
): string {
  const app = policy.toolkit
    ? policy.toolkit.charAt(0).toUpperCase() + policy.toolkit.slice(1).replace(/_/g, " ")
    : "App";
  return `${app} · ${policy.actionLabel || "Action"} → ${policy.destination}`;
}

/* ------------------------------------------------------------------ */
/* Argument guard                                                      */
/* ------------------------------------------------------------------ */

const EMAIL_PATTERN = /[^\s<>,;"'()\[\]]+@[^\s<>,;"'()\[\]]+\.[^\s<>,;"'()\[\]]+/g;
const RECIPIENT_KEY =
  /(^|_)(to|cc|bcc|recipient|recipients|receiver|email|emails|e_mail|user|users|member|members|invitee|invitees|channel|phone|number|thread|chat|conversation|dm|handle)$/i;

/**
 * Where a social or community post lands, and who may see it. These are not
 * recipients in the email sense, but changing one still sends the post
 * somewhere the owner did not confirm — so only the destination field the form
 * itself set is allowed to carry one.
 */
const SCOPE_KEY =
  /(^|_)(subreddit|subreddit_id|page|page_id|board|board_id|account|account_id|audience|visibility|in_reply_to|in_reply_to_id|reply_to|reply_to_id|reply_target|parent_id|thread_id|community|group|group_id)$/i;

/** True for anything the model actually filled in, including arrays and objects. */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export type ScheduleArgsGuard =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Sanitises what the model asked to send against the confirmed policy.
 *
 * The destination field is overwritten with the form's value; any other
 * argument that would reach a different recipient — another address, a `cc`, a
 * second channel — is refused instead of silently dropped, so a run can never
 * widen who receives it.
 */
export function guardScheduledActionArgs(
  raw: Record<string, unknown>,
  policy: Pick<ScheduleActionPolicy, "destinationField" | "destination">,
): ScheduleArgsGuard {
  const destination = policy.destination.trim();
  const wanted = destination.toLowerCase();
  const args: Record<string, unknown> = { ...raw };

  for (const [key, value] of Object.entries(raw)) {
    // The form owns this field; whatever the model sent is replaced.
    if (key === policy.destinationField) continue;

    // A scheduled post cannot drift to another subreddit, page, board, account,
    // reply target or audience than the one the owner confirmed on the form.
    // The form only ever set the destination field, so anything else is a
    // widened scope rather than a harmless extra argument.
    if (SCOPE_KEY.test(key) && hasValue(value)) {
      return {
        ok: false,
        message: `Refused: ${key} would send this to a different place than the confirmed destination (${destination}). This schedule may only post there.`,
      };
    }

    // Only recipient-shaped arguments can widen who receives it; a body or
    // subject that mentions an address is content, not a destination.
    if (!RECIPIENT_KEY.test(key)) continue;

    const values = Array.isArray(value) ? value : [value];

    if (Array.isArray(value) && value.length > 1) {
      return {
        ok: false,
        message: `Refused: this schedule may send to one destination only (${destination}), but ${key} lists ${value.length}.`,
      };
    }

    for (const entry of values) {
      if (typeof entry !== "string") continue;

      const emails = entry.toLowerCase().match(EMAIL_PATTERN) ?? [];
      const extra = emails.filter((email) => email !== wanted);
      if (extra.length > 0) {
        return {
          ok: false,
          message: `Refused: ${key} would also reach ${extra[0]}, and this schedule may only send to ${destination}.`,
        };
      }

      if (
        emails.length === 0 &&
        RECIPIENT_KEY.test(key) &&
        entry.trim() &&
        entry.trim().toLowerCase() !== wanted
      ) {
        return {
          ok: false,
          message: `Refused: ${key} is set to ${entry.trim()}, and this schedule may only send to ${destination}.`,
        };
      }
    }
  }

  args[policy.destinationField] = destination;
  return { ok: true, args };
}

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const ACTION_SLUG = /^[A-Z0-9][A-Z0-9_]{1,95}$/i;

function clean(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Validates what a form submitted. Nothing here talks to Composio: the runtime
 * re-checks the action against the live action list before it can run, so a
 * stale or made-up slug fails the run instead of sending something else.
 */
export function normalizeScheduleAction(
  input: unknown,
): { ok: true; action: ScheduleActionPolicy | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, action: null };

  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "That action isn't valid. Ask the agent to prepare it again." };
  }

  const raw = input as Record<string, unknown>;
  const toolkit = clean(raw.toolkit, 64).toLowerCase();
  const action = clean(raw.action, 96).toUpperCase();
  const actionLabel = clean(raw.actionLabel, 80);
  const destinationField = clean(raw.destinationField, 64);
  const destination = clean(raw.destination, 200);
  const maxPerRun = Math.trunc(Number(raw.maxPerRun ?? 1));

  if (!SLUG.test(toolkit)) {
    return { ok: false, error: "Pick the app the schedule is allowed to use." };
  }
  if (!ACTION_SLUG.test(action)) {
    return { ok: false, error: "Pick the exact action the schedule is allowed to run." };
  }
  if (!destinationField) {
    return { ok: false, error: "Set which field the destination goes in." };
  }
  if (!destination) {
    return { ok: false, error: "Set the one destination this schedule may send to." };
  }
  if (!Number.isFinite(maxPerRun) || maxPerRun < 1 || maxPerRun > SCHEDULE_ACTION_MAX_PER_RUN) {
    return { ok: false, error: `A run can send that action once to ${SCHEDULE_ACTION_MAX_PER_RUN} times.` };
  }

  return {
    ok: true,
    action: {
      toolkit,
      action,
      actionLabel: actionLabel || action.replace(/_/g, " ").toLowerCase(),
      destinationField,
      destination,
      maxPerRun,
    },
  };
}

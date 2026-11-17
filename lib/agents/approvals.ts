import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { agentApprovals, agents, db } from "@/db";
import type { AgentResultCard } from "@/lib/apps/results";

/**
 * Approval tokens for app actions that change data.
 *
 * The model never gets to run a mutating action: `app_run_action` seals the
 * action and its arguments into an AES-256-GCM token bound to the owner and the
 * agent, shows an approval card, and stops. Only the card's approve endpoint can
 * open the token, and only for the same signed-in owner and agent. The
 * `agent_approvals` row is what makes it single-use: consumption is a
 * conditional update that succeeds once, so a replayed token is rejected even
 * inside its time window.
 *
 * Key material comes from `AGENT_SECRETS_KEY`. Deployments that predate that
 * variable fall back to `AUTH_SECRET_KEY`, which is already required; either
 * way the key never leaves the server.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const TOKEN_TTL_MS = 15 * 60 * 1000;

export type ApprovalAction = {
  ownerId: number;
  agentId: number;
  toolkit: string;
  /** Composio action slug, e.g. GMAIL_SEND_EMAIL. */
  action: string;
  /** Arguments the action will run with, exactly as approved. */
  args: Record<string, unknown>;
  /** One line for the row and the card. */
  summary: string;
};

export type ApprovalTokenPayload = ApprovalAction & {
  jti: string;
  exp: number;
};

export class ApprovalError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApprovalError";
    this.status = status;
  }
}

function secretMaterial(): string {
  const material =
    process.env.AGENT_SECRETS_KEY?.trim() ||
    process.env.AI_SECRET_KEY?.trim() ||
    process.env.AUTH_SECRET_KEY?.trim();

  if (!material) {
    throw new ApprovalError(
      "Approvals are not configured. Set AGENT_SECRETS_KEY in the environment.",
      503,
    );
  }

  return material;
}

let cachedKey: { material: string; key: Buffer } | null = null;

function wrappingKey(): Buffer {
  const material = secretMaterial();
  if (cachedKey?.material === material) return cachedKey.key;

  const key = scryptSync(material, "alcatraz-app-approvals", 32);
  cachedKey = { material, key };
  return key;
}

function seal(payload: ApprovalTokenPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, wrappingKey(), iv);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function open(token: string): ApprovalTokenPayload {
  const [version, iv, tag, ciphertext] = token.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new ApprovalError("That approval isn't valid any more. Ask the agent to prepare it again.", 400);
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, wrappingKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const payload = JSON.parse(plaintext) as Partial<ApprovalTokenPayload>;
    if (
      typeof payload.jti !== "string" ||
      typeof payload.ownerId !== "number" ||
      typeof payload.agentId !== "number" ||
      typeof payload.toolkit !== "string" ||
      typeof payload.action !== "string" ||
      typeof payload.summary !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.args !== "object" ||
      payload.args === null
    ) {
      throw new ApprovalError("That approval isn't valid any more. Ask the agent to prepare it again.");
    }

    return payload as ApprovalTokenPayload;
  } catch (error) {
    if (error instanceof ApprovalError) throw error;
    throw new ApprovalError("That approval isn't valid any more. Ask the agent to prepare it again.", 400);
  }
}

/**
 * Creates the row and returns the opaque token. `jti` is generated here and
 * carried inside the sealed payload, so nobody can swap one approval for
 * another.
 */
export async function createApproval(input: ApprovalAction): Promise<{ token: string; expiresAt: Date }> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(agentApprovals).values({
    jti,
    ownerId: input.ownerId,
    agentId: input.agentId,
    toolkit: input.toolkit,
    action: input.action,
    summary: input.summary.slice(0, 200),
    status: "pending",
    expiresAt,
  });

  const token = seal({ ...input, jti, exp: expiresAt.getTime() });
  return { token, expiresAt };
}

/**
 * "Approve for me": true when the owner already approved this exact action on
 * this toolkit for this agent in the last 30 days. Prior consent only ever
 * covers the action it was given for.
 */
export async function hasRememberedApproval(input: {
  ownerId: number;
  agentId: number;
  toolkit: string;
  action: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({ jti: agentApprovals.jti })
    .from(agentApprovals)
    .where(
      and(
        eq(agentApprovals.ownerId, input.ownerId),
        eq(agentApprovals.agentId, input.agentId),
        eq(agentApprovals.toolkit, input.toolkit),
        eq(agentApprovals.action, input.action),
        eq(agentApprovals.status, "approved"),
        gt(agentApprovals.usedAt, since),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/** One line in the workspace approval log. */
export type ApprovalLogEntry = {
  jti: string;
  agentName: string;
  toolkit: string;
  action: string;
  summary: string;
  mode: "approved" | "remembered" | "full access";
  at: Date;
};

/**
 * Every approved app action for this owner, newest first — manual approvals
 * next to the ones an agent ran under "Approve for me" or "Full access".
 */
export async function listApprovalLog(ownerId: number, limit = 20): Promise<ApprovalLogEntry[]> {
  const rows = await db
    .select({
      jti: agentApprovals.jti,
      agentName: agents.name,
      toolkit: agentApprovals.toolkit,
      action: agentApprovals.action,
      summary: agentApprovals.summary,
      usedAt: agentApprovals.usedAt,
      createdAt: agentApprovals.createdAt,
    })
    .from(agentApprovals)
    .innerJoin(agents, eq(agents.id, agentApprovals.agentId))
    .where(and(eq(agentApprovals.ownerId, ownerId), eq(agentApprovals.status, "approved")))
    .orderBy(desc(agentApprovals.usedAt), desc(agentApprovals.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const mode = row.summary.startsWith("[remembered]")
      ? ("remembered" as const)
      : row.summary.startsWith("[full access]")
        ? ("full access" as const)
        : ("approved" as const);

    return {
      jti: row.jti,
      agentName: row.agentName,
      toolkit: row.toolkit,
      action: row.action,
      summary: row.summary.replace(/^\[(remembered|full access)\]\s*/, ""),
      mode,
      at: row.usedAt ?? row.createdAt,
    };
  });
}

/**
 * Writes the audit row for an action the agent ran without a card, so a
 * remembered or full-access run is just as traceable as an approved one.
 */
export async function recordAutoApproval(input: ApprovalAction & { mode: string }): Promise<void> {
  await db.insert(agentApprovals).values({
    jti: randomUUID(),
    ownerId: input.ownerId,
    agentId: input.agentId,
    toolkit: input.toolkit,
    action: input.action,
    summary: `[${input.mode}] ${input.summary}`.slice(0, 200),
    status: "approved",
    expiresAt: new Date(),
    usedAt: new Date(),
  });
}

/**
 * Verifies the token belongs to this owner and agent, then marks it used (or
 * denied) with a single conditional update. Throws when it is tampered with,
 * expired, already used or presented by someone else.
 */
export async function consumeApproval(
  token: string,
  context: { ownerId: number; agentId: number; decision: "approve" | "deny" },
): Promise<ApprovalTokenPayload> {
  const payload = open(token);

  if (payload.ownerId !== context.ownerId || payload.agentId !== context.agentId) {
    throw new ApprovalError("This approval belongs to a different agent.", 403);
  }

  if (payload.exp <= Date.now()) {
    throw new ApprovalError("This approval expired. Ask the agent to prepare the action again.", 410);
  }

  const [claimed] = await db
    .update(agentApprovals)
    .set({
      status: context.decision === "approve" ? "approved" : "denied",
      usedAt: new Date(),
    })
    .where(
      and(
        eq(agentApprovals.jti, payload.jti),
        eq(agentApprovals.ownerId, context.ownerId),
        eq(agentApprovals.agentId, context.agentId),
        eq(agentApprovals.status, "pending"),
        isNull(agentApprovals.usedAt),
        gt(agentApprovals.expiresAt, new Date()),
      ),
    )
    .returning({ jti: agentApprovals.jti });

  if (!claimed) {
    throw new ApprovalError(
      "This approval was already used or expired. Ask the agent to prepare the action again.",
      409,
    );
  }

  return payload;
}

/** Shape returned to the browser after an approval runs. */
export type ApprovalOutcome = {
  card: AgentResultCard;
};

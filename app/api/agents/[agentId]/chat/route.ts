import { z } from "zod";

import { streamAgentReply } from "@/lib/agent-runtime";
import {
  AGENT_STREAM_CONTENT_TYPE,
  type AgentStreamEvent,
  type AgentToolSource,
} from "@/lib/agent-runtime/protocol";
import { appendAgentMessage } from "@/lib/agent-messages";
import type { AgentResultCard } from "@/lib/apps/results";
import { getAgentForUser } from "@/lib/agents";
import { getCurrentUser } from "@/lib/session";
import { ensureUserRecord } from "@/lib/users";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_MESSAGES = 30;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

const SAFE_FALLBACK = "The agent couldn't finish that reply. Please try again.";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "You need to sign in to chat with an agent." }, { status: 401 });
  }

  const { agentId } = await params;
  const profile = await ensureUserRecord(user);
  const agent = await getAgentForUser(profile.id, Number(agentId));

  if (!agent) {
    return Response.json({ error: "That agent could not be found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Send the conversation as JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: "That message couldn't be read. Try again." }, { status: 400 });
  }

  const messages = parsed.data.messages;
  if (messages.at(-1)?.role !== "user") {
    return Response.json({ error: "There's nothing to send yet." }, { status: 400 });
  }

  const userMessage = messages[messages.length - 1];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away mid-stream; nothing left to write to.
        }
      };

      // Collected while streaming so the finished turn can be stored.
      let reply = "";
      const steps: { name: string; label: string }[] = [];
      let sources: AgentToolSource[] = [];
      const cards: AgentResultCard[] = [];

      await appendAgentMessage({
        agentId: agent.id,
        role: "user",
        content: userMessage.content,
      }).catch((error) => console.error("[agents] could not save the user turn", error));

      try {
        for await (const event of streamAgentReply(
          { ...agent, ownerId: profile.id },
          messages,
          request.signal,
        )) {
          if (request.signal.aborted) break;

          if (event.type === "text") reply += event.delta;
          else if (event.type === "tool_started") {
            steps.push({ name: event.name, label: event.label });
          } else if (event.type === "sources") sources = event.sources;
          else if (event.type === "app_result") cards.push(event.card);

          send(event);
        }

        if (reply.trim() && !request.signal.aborted) {
          await appendAgentMessage({
            agentId: agent.id,
            role: "assistant",
            content: reply.trim(),
            steps: steps.length > 0 ? steps.map((step) => ({ ...step, status: "done" as const })) : null,
            sources: sources.length > 0 ? sources : null,
            cards: cards.length > 0 ? cards : null,
          }).catch((error) => console.error("[agents] could not save the reply", error));
        }
      } catch (error) {
        // The runtime already maps its own failures; this catches anything the
        // stream plumbing throws. Never forward the provider's message.
        console.error("[agents] chat stream failed", error);
        if (!request.signal.aborted) send({ type: "error", message: SAFE_FALLBACK });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": AGENT_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

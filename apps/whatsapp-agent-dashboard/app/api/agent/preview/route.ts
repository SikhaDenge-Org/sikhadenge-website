import { NextResponse } from "next/server";

import { buildAgentInputFromConversation } from "../../../../lib/agent/context";
import { generateAgentDecision } from "../../../../lib/agent/orchestrator";
import type { AgentInput } from "../../../../lib/agent/types";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARACTERS = 4_000;

type PreviewPayload = {
  message?: unknown;
  conversationId?: unknown;
  languageHint?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: PreviewPayload;
  try {
    payload = (await request.json()) as PreviewPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const conversationId =
    typeof payload.conversationId === "string"
      ? payload.conversationId.trim()
      : "";
  const languageHint =
    typeof payload.languageHint === "string"
      ? payload.languageHint.trim()
      : null;

  if (!message || message.length > MAX_MESSAGE_CHARACTERS) {
    return NextResponse.json(
      {
        error: `Message must contain 1-${MAX_MESSAGE_CHARACTERS} characters.`,
      },
      { status: 400 },
    );
  }

  let agentInput: AgentInput;
  if (conversationId) {
    const conversationInput = await buildAgentInputFromConversation({
      conversationId,
      customerMessage: message,
    });
    if (!conversationInput) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }
    agentInput = conversationInput;
  } else {
    agentInput = {
      customerMessage: message,
      languageHint,
      history: [],
      contact: null,
      lead: null,
    };
  }

  const decision = await generateAgentDecision(agentInput);
  return NextResponse.json(
    {
      previewOnly: true,
      outboundSent: false,
      decision,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

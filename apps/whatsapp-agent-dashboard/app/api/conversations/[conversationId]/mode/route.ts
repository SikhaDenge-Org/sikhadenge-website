import { AgentMode } from "@prisma/client";
import { NextResponse } from "next/server";

import { setConversationMode } from "../../../../../lib/operations/conversation-operations";
import {
  operationErrorResponse,
  operationRequestContext,
  requireOperationsUser,
} from "../../../../../lib/operations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_SETTABLE_MODES = new Set<string>([
  AgentMode.AI,
  AgentMode.HUMAN,
  AgentMode.PAUSED,
]);

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const auth = await requireOperationsUser();
  if (auth.error) return auth.error;

  let payload: { mode?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const mode =
    typeof payload.mode === "string" ? payload.mode.trim().toUpperCase() : "";
  if (!USER_SETTABLE_MODES.has(mode)) {
    return NextResponse.json({ error: "Unsupported conversation mode." }, { status: 400 });
  }

  try {
    const conversation = await setConversationMode({
      conversationId: context.params.conversationId,
      mode: mode as AgentMode,
      reason: typeof payload.reason === "string" ? payload.reason : null,
      actor: { id: auth.user.id, role: auth.user.role },
      context: operationRequestContext(request),
    });
    return NextResponse.json(
      { conversation, outboundSent: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return operationErrorResponse(error);
  }
}

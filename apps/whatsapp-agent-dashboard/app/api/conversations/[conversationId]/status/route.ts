import { ConversationStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { updateConversationStatus } from "../../../../../lib/operations/conversation-operations";
import {
  operationErrorResponse,
  operationRequestContext,
  requireOperationsUser,
} from "../../../../../lib/operations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set<string>(Object.values(ConversationStatus));

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const auth = await requireOperationsUser();
  if (auth.error) return auth.error;

  let payload: { status?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const rawStatus =
    typeof payload.status === "string" ? payload.status.trim().toUpperCase() : "";
  if (!STATUSES.has(rawStatus)) {
    return NextResponse.json({ error: "Unsupported conversation status." }, { status: 400 });
  }

  try {
    const conversation = await updateConversationStatus({
      conversationId: context.params.conversationId,
      status: rawStatus as ConversationStatus,
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

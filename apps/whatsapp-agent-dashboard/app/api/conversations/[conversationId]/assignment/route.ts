import { NextResponse } from "next/server";

import {
  assignConversation,
} from "../../../../../lib/operations/conversation-operations";
import {
  operationErrorResponse,
  operationRequestContext,
  requireOperationsUser,
} from "../../../../../lib/operations/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: { conversationId: string } },
) {
  const auth = await requireOperationsUser();
  if (auth.error) return auth.error;

  let payload: { assigneeId?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const assigneeId =
    payload.assigneeId === null
      ? null
      : typeof payload.assigneeId === "string" && payload.assigneeId.trim()
        ? payload.assigneeId.trim()
        : null;
  const reason = typeof payload.reason === "string" ? payload.reason : null;

  try {
    const result = await assignConversation({
      conversationId: context.params.conversationId,
      assigneeId,
      reason,
      actor: { id: auth.user.id, role: auth.user.role },
      context: operationRequestContext(request),
    });
    return NextResponse.json(
      { ...result, outboundSent: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return operationErrorResponse(error);
  }
}

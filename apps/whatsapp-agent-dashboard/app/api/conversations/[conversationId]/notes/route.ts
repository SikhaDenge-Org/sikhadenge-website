import { NextResponse } from "next/server";

import { addLeadNote } from "../../../../../lib/operations/conversation-operations";
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

  let payload: { body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (typeof payload.body !== "string") {
    return NextResponse.json({ error: "Note body is required." }, { status: 400 });
  }

  try {
    const note = await addLeadNote({
      conversationId: context.params.conversationId,
      body: payload.body,
      actor: { id: auth.user.id, role: auth.user.role },
      context: operationRequestContext(request),
    });
    return NextResponse.json(
      { note, outboundSent: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return operationErrorResponse(error);
  }
}

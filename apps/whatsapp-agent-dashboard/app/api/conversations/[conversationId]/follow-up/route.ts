import { NextResponse } from "next/server";

import { scheduleLeadFollowUp } from "../../../../../lib/operations/conversation-operations";
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

  let payload: { followUpAt?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let followUpAt: Date | null = null;
  if (payload.followUpAt !== null && payload.followUpAt !== undefined) {
    if (typeof payload.followUpAt !== "string") {
      return NextResponse.json({ error: "followUpAt must be an ISO date string or null." }, { status: 400 });
    }
    followUpAt = new Date(payload.followUpAt);
    if (Number.isNaN(followUpAt.getTime())) {
      return NextResponse.json({ error: "Invalid follow-up date." }, { status: 400 });
    }
  }

  try {
    const lead = await scheduleLeadFollowUp({
      conversationId: context.params.conversationId,
      followUpAt,
      reason: typeof payload.reason === "string" ? payload.reason : null,
      actor: { id: auth.user.id, role: auth.user.role },
      context: operationRequestContext(request),
    });
    return NextResponse.json(
      { lead, outboundSent: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return operationErrorResponse(error);
  }
}

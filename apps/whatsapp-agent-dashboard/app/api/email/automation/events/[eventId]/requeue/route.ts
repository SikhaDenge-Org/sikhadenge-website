import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { requeueFailedEmailAutomationEvent } from "@/modules/email-automation/automation/event-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: { eventId: string } },
) {
  try {
    const access = await requireEmailManagerAccess();
    const event = await requeueFailedEmailAutomationEvent({
      workspaceId: access.workspaceId,
      eventId: context.params.eventId,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email automation event requeue failed." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
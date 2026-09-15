import { NextResponse } from "next/server";

import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { processEmailAutomationEvents } from "@/modules/email-automation/automation/dispatcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = typeof payload.limit === "number" ? payload.limit : 20;
    const result = await processEmailAutomationEvents({
      workspaceId: access.workspaceId,
      actorUserId: access.user.id,
      limit,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email automation processing failed." },
      { status: 400 },
    );
  }
}
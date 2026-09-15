import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: { connectionId: string } },
) {
  try {
    const access = await requireEmailManagerAccess();
    const connectionId = context.params.connectionId.trim();
    if (!connectionId) {
      return NextResponse.json({ error: "Connection id is required." }, { status: 400 });
    }

    const runtime = buildEmailE1Runtime();
    const senders = await runtime.service.refreshSenders({
      workspaceId: access.workspaceId,
      connectionId,
    });

    return NextResponse.json(
      { connectionId, senders },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Email sender aliases could not be refreshed." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

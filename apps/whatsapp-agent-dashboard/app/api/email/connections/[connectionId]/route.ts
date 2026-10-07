import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
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
    await runtime.service.revoke({
      workspaceId: access.workspaceId,
      connectionId,
    });

    return NextResponse.json(
      { revoked: true, connectionId },
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
      { error: "Email connection could not be revoked." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

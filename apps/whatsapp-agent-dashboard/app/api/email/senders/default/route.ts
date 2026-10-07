import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailE1Runtime } from "@/modules/email-automation/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const payload = (await request.json()) as Record<string, unknown>;
    const senderIdentityId =
      typeof payload.senderIdentityId === "string"
        ? payload.senderIdentityId.trim()
        : "";
    if (!senderIdentityId) {
      return NextResponse.json(
        { error: "senderIdentityId is required." },
        { status: 400 },
      );
    }

    const runtime = buildEmailE1Runtime();
    await runtime.service.setDefaultSender({
      workspaceId: access.workspaceId,
      senderIdentityId,
    });

    const senders = await runtime.senders.listByWorkspace(access.workspaceId);
    return NextResponse.json(
      { senderIdentityId, senders },
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
      { error: "Default email sender could not be updated." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

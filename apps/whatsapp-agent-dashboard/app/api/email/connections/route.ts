import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailReadRuntime } from "@/modules/email-automation/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await requireEmailManagerAccess();
    const runtime = buildEmailReadRuntime();
    const [connections, senders] = await Promise.all([
      runtime.connections.listByWorkspace(access.workspaceId),
      runtime.senders.listByWorkspace(access.workspaceId),
    ]);

    return NextResponse.json(
      {
        workspace: {
          id: access.workspaceId,
          slug: access.workspaceSlug,
        },
        connections,
        senders,
      },
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
      { error: "Email connection state could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

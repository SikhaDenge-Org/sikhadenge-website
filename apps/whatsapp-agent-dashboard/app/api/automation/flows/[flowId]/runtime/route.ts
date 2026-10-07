import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { assertAutomationFlowWorkspaceAccess } from "@/lib/automation/automation-service";
import { loadPersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";
import { executePublishedAutomation } from "@/modules/automations/application/runtime-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function POST(
  request: Request,
  context: { params: { flowId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const security = await loadPersistedWorkspaceSecurityContext(user.id);
    await assertAutomationFlowWorkspaceAccess(
      context.params.flowId,
      security?.workspace.id ?? null,
    );
    const payload = (await request.json()) as {
      eventId?: unknown;
      conversationId?: unknown;
      sample?: unknown;
    };
    if (typeof payload.eventId !== "string" || typeof payload.conversationId !== "string") {
      return NextResponse.json(
        { error: "eventId and conversationId are required." },
        { status: 400 },
      );
    }
    const result = await executePublishedAutomation({
      flowId: context.params.flowId,
      eventId: payload.eventId,
      conversationId: payload.conversationId,
      sample: payload.sample,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automation runtime failed." },
      { status: 400 },
    );
  }
}


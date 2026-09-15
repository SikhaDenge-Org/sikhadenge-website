import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { assertAutomationFlowWorkspaceAccess } from "@/lib/automation/automation-service";
import { loadPersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";
import { publishAutomationGraph } from "@/modules/automations/application/graph-version-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function POST(_request: Request, context: { params: { flowId: string } }) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const security = await loadPersistedWorkspaceSecurityContext(user.id);
    await assertAutomationFlowWorkspaceAccess(context.params.flowId, security?.workspace.id ?? null);
    const published = await publishAutomationGraph({ flowId: context.params.flowId, actorId: user.id });
    return NextResponse.json({ published }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Graph publish failed." }, { status: 400 });
  }
}

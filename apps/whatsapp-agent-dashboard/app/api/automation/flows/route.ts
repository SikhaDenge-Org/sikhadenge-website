import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { loadPersistedWorkspaceSecurityContext } from "../../../../modules/auth/infrastructure/prisma-authorization";
import {
  createAutomationFlow,
  getAutomationRuntimeStatus,
  listAutomationFlows,
  listAutomationFlowsForWorkspace,
} from "../../../../lib/automation/automation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }
  const security = await loadPersistedWorkspaceSecurityContext(user.id);
  const flows = security
    ? await listAutomationFlowsForWorkspace(security.workspace.id, true)
    : (await listAutomationFlows()).filter((flow) => flow.workspaceId === null);
  return NextResponse.json(
    { flows, runtime: getAutomationRuntimeStatus(), generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const security = await loadPersistedWorkspaceSecurityContext(user.id);
    const result = await createAutomationFlow({
      workspaceId: security?.workspace.id ?? null,
      name: payload.name,
      description: payload.description,
      nodes: payload.nodes,
      actorId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automation flow creation failed." },
      { status: 400 },
    );
  }
}

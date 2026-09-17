import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { updateAutomationFlow } from "../../../../../lib/automation/automation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function PATCH(
  request: Request,
  context: { params: { flowId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await updateAutomationFlow({
      flowId: context.params.flowId,
      name: payload.name,
      description: payload.description,
      nodes: payload.nodes,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Automation flow update failed." },
      { status: 400 },
    );
  }
}

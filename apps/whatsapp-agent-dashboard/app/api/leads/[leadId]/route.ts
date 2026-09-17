import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { updateLead } from "../../../../lib/leads/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function PATCH(
  request: Request,
  context: { params: { leadId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!WRITE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const values = (await request.json()) as Record<string, unknown>;
    const lead = await updateLead({
      leadId: context.params.leadId,
      values,
      actorId: user.id,
    });
    return NextResponse.json({ lead });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Lead update failed.";
    return NextResponse.json(
      { error: detail },
      { status: detail.includes("not found") ? 404 : 400 },
    );
  }
}

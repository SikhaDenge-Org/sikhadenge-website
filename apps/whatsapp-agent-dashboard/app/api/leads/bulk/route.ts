import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { bulkUpdateLeads } from "../../../../lib/leads/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function PATCH(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!WRITE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as {
      leadIds?: unknown;
      values?: Record<string, unknown>;
    };
    const result = await bulkUpdateLeads({
      leadIds: payload.leadIds,
      values: payload.values ?? {},
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk lead update failed." },
      { status: 400 },
    );
  }
}

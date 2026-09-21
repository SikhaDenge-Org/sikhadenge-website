import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { addLeadNote } from "../../../../../lib/leads/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function POST(
  request: Request,
  context: { params: { leadId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!WRITE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as { body?: unknown };
    const note = await addLeadNote({
      leadId: context.params.leadId,
      body: payload.body,
      actorId: user.id,
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Lead note could not be added.";
    return NextResponse.json(
      { error: detail },
      { status: detail.includes("not found") ? 404 : 400 },
    );
  }
}

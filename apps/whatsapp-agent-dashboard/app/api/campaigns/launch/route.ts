import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import {
  launchTargetedCampaign,
  parseCampaignFilters,
} from "../../../../lib/campaigns/targeting-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const result = await launchTargetedCampaign({
      name: typeof payload.name === "string" ? payload.name : "",
      templateId:
        typeof payload.templateId === "string" ? payload.templateId : "",
      filters: parseCampaignFilters(payload.filters),
      components: Array.isArray(payload.components) ? payload.components : [],
      actorId: user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Targeted campaign launch failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

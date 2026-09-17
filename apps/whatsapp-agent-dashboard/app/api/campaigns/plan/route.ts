import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { createCampaignPlan } from "../../../../lib/campaigns/campaign-service";

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

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const campaign = await createCampaignPlan({
      name: payload.name,
      templateId: payload.templateId,
      filters: payload.filters,
      variables: payload.variables,
      scheduledAt: payload.scheduledAt,
      batchSize: payload.batchSize,
      sendRatePerMinute: payload.sendRatePerMinute,
      frequencyCapDays: payload.frequencyCapDays,
      actorId: user.id,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Campaign plan creation failed." },
      { status: 400 },
    );
  }
}

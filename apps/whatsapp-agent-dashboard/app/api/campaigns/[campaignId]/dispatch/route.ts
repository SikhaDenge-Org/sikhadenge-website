import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { dispatchCampaignPlan } from "../../../../../lib/campaigns/campaign-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function POST(
  _request: Request,
  context: { params: { campaignId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const campaign = await dispatchCampaignPlan(context.params.campaignId, user.id);
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Campaign dispatch failed." },
      { status: 400 },
    );
  }
}

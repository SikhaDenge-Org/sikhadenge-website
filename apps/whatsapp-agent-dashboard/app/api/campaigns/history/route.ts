import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { listCampaignPlans } from "../../../../lib/campaigns/campaign-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const campaigns = await listCampaignPlans(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), campaigns },
    { headers: { "Cache-Control": "no-store" } },
  );
}

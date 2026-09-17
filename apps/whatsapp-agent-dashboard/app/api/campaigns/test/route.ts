import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { validateCampaignTest } from "../../../../lib/campaigns/campaign-service";

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
    const result = await validateCampaignTest({
      templateId: payload.templateId,
      filters: payload.filters,
      variables: payload.variables,
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Campaign test validation failed." },
      { status: 400 },
    );
  }
}

import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import {
  parseCampaignFilters,
  previewCampaignAudience,
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

  const filters = parseCampaignFilters(payload.filters);
  const requestedLimit = Number(payload.limit ?? 25);
  const preview = await previewCampaignAudience(
    filters,
    Number.isFinite(requestedLimit) ? requestedLimit : 25,
  );

  return NextResponse.json(
    { filters, ...preview },
    { headers: { "Cache-Control": "no-store" } },
  );
}

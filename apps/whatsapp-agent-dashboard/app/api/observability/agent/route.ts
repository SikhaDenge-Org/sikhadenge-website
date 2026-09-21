import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { getAgentObservabilitySummary } from "../../../../lib/observability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.ANALYST,
]);

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(requestedDays) ? requestedDays : 7;
  const summary = await getAgentObservabilitySummary(days);

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}

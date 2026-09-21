import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPlatformAnalytics } from "../../../../lib/analytics/platform-analytics";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.ANALYST,
  DashboardRole.COUNSELOR,
]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  return NextResponse.json(await getPlatformAnalytics(), {
    headers: { "Cache-Control": "no-store" },
  });
}

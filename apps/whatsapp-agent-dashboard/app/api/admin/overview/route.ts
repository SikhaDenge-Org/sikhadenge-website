import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getAdminOverview } from "../../../../lib/admin/admin-service";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== DashboardRole.ADMIN) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }
  return NextResponse.json(await getAdminOverview(), {
    headers: { "Cache-Control": "no-store" },
  });
}

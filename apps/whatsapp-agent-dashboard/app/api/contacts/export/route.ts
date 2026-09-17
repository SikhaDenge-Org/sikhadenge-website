import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { exportContactsCsv } from "../../../../lib/contacts/contact-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const csv = await exportContactsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sikhadenge-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

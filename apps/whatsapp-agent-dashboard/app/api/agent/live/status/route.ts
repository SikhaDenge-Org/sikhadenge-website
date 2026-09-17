import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  getLiveAgentStatus,
} from "../../../../../lib/agent/live-agent-service";
import { getCurrentDashboardUser } from "../../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const status = await getLiveAgentStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}

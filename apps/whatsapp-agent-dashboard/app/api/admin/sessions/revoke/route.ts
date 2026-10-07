import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { revokeDashboardSessions } from "../../../../../lib/admin/admin-service";
import { getCurrentDashboardUser } from "../../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== DashboardRole.ADMIN) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const result = await revokeDashboardSessions({ userId: payload.userId, actorId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Session revocation failed." }, { status: 400 });
  }
}

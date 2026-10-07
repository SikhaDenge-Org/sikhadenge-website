import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { updateDashboardUser } from "../../../../../lib/admin/admin-service";
import { getCurrentDashboardUser } from "../../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: { userId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== DashboardRole.ADMIN) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const updated = await updateDashboardUser({
      userId: context.params.userId,
      role: payload.role,
      isActive: payload.isActive,
      newPassword: payload.newPassword,
      actorId: user.id,
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "User update failed." }, { status: 400 });
  }
}

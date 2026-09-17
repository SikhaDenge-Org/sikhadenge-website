import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { createDashboardUser } from "../../../../lib/admin/admin-service";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== DashboardRole.ADMIN) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const created = await createDashboardUser({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      actorId: user.id,
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "User creation failed." }, { status: 400 });
  }
}

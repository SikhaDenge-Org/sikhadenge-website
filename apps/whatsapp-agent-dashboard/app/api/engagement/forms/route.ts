import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { createEngagementForm } from "../../../../lib/engagement/engagement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const form = await createEngagementForm({
      name: payload.name,
      description: payload.description,
      status: payload.status,
      fields: payload.fields,
      actorId: user.id,
    });
    return NextResponse.json({ form }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form creation failed." }, { status: 400 });
  }
}

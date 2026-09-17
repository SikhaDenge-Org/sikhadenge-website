import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { createAppointment, updateAppointment } from "../../../../lib/engagement/engagement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

async function identity() {
  const user = await getCurrentDashboardUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) } as const;
  if (!ALLOWED.has(user.role)) return { error: NextResponse.json({ error: "Insufficient permission." }, { status: 403 }) } as const;
  return { user } as const;
}

export async function POST(request: Request) {
  const auth = await identity();
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const appointment = await createAppointment({
      contactId: payload.contactId,
      title: payload.title,
      scheduledAt: payload.scheduledAt,
      durationMinutes: payload.durationMinutes,
      ownerId: payload.ownerId,
      meetingUrl: payload.meetingUrl,
      notes: payload.notes,
      actorId: auth.user.id,
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Appointment creation failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await identity();
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const appointmentId = typeof payload.appointmentId === "string" ? payload.appointmentId : "";
    const appointment = await updateAppointment({
      appointmentId,
      status: payload.status,
      actorId: auth.user.id,
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Appointment update failed." }, { status: 400 });
  }
}

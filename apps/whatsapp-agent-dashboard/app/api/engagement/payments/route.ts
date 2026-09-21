import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { createPaymentRecord, updatePaymentRecord } from "../../../../lib/engagement/engagement-service";

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
    const payment = await createPaymentRecord({
      contactId: payload.contactId,
      reference: payload.reference,
      course: payload.course,
      amount: payload.amount,
      provider: payload.provider,
      providerPaymentId: payload.providerPaymentId,
      status: payload.status,
      notes: payload.notes,
      actorId: auth.user.id,
    });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment record creation failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await identity();
  if ("error" in auth) return auth.error;
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : "";
    const payment = await updatePaymentRecord({
      paymentId,
      status: payload.status,
      providerPaymentId: payload.providerPaymentId,
      actorId: auth.user.id,
    });
    return NextResponse.json({ payment });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment update failed." }, { status: 400 });
  }
}

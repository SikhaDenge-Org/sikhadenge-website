import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { createFormSubmission } from "../../../../lib/engagement/engagement-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const submission = await createFormSubmission({
      formId: payload.formId,
      contactId: payload.contactId,
      values: payload.values,
      source: payload.source,
      actorId: user.id,
    });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Form submission failed." }, { status: 400 });
  }
}

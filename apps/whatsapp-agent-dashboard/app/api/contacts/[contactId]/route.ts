import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { getContactById, updateContact } from "../../../../lib/contacts/contact-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function GET(
  _request: Request,
  context: { params: { contactId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const contact = await getContactById(context.params.contactId);
    return NextResponse.json(
      { contact },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact could not be loaded." },
      { status: 404 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: { contactId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!WRITE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const contact = await updateContact(context.params.contactId, payload as never, user.id);
    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact update failed." },
      { status: 400 },
    );
  }
}

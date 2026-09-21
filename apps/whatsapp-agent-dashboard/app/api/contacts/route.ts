import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import {
  createContact,
  getContactOptions,
  listContacts,
} from "../../../lib/contacts/contact-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set(Object.values(DashboardRole));
const WRITE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!READ_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const url = new URL(request.url);
  const [directory, options] = await Promise.all([
    listContacts({
      search: url.searchParams.get("search") || undefined,
      consentStatus: url.searchParams.get("consent") || undefined,
      stage: url.searchParams.get("stage") || undefined,
      assignedToId: url.searchParams.get("assignedToId") || undefined,
      limit: Number(url.searchParams.get("limit") || 200),
    }),
    getContactOptions(),
  ]);
  return NextResponse.json(
    { ...directory, options },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!WRITE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const contact = await createContact(payload as never, user.id);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact creation failed." },
      { status: 400 },
    );
  }
}

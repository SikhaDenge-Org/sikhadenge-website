import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import { listLeads } from "../../../lib/leads/lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set(Object.values(DashboardRole));

function booleanParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!READ_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const result = await listLeads({
      search: url.searchParams.get("search") || undefined,
      stage: url.searchParams.get("stage") || undefined,
      temperature: url.searchParams.get("temperature") || undefined,
      assignedToId: url.searchParams.get("assignedToId") || undefined,
      due: booleanParam(url.searchParams.get("due")),
      limit: Number(url.searchParams.get("limit") || 250),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Leads could not be loaded." },
      { status: 400 },
    );
  }
}

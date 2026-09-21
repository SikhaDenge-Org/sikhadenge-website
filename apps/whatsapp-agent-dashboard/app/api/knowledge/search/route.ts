import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { retrieveApprovedKnowledge } from "../../../../lib/agent/knowledge";
import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
  DashboardRole.ANALYST,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query || query.length > 2_000) {
    return NextResponse.json(
      { error: "Query must contain 1-2,000 characters." },
      { status: 400 },
    );
  }

  const references = await retrieveApprovedKnowledge(query);
  return NextResponse.json(
    {
      query,
      count: references.length,
      references,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

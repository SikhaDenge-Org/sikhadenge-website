import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { listOperationsQueue } from "../../../../lib/operations/conversation-operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function booleanParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "100");
  const queue = await listOperationsQueue({
    limit: Number.isFinite(requestedLimit) ? requestedLimit : 100,
    assignedToId: url.searchParams.get("assignedToId"),
    onlyUnassigned: booleanParam(url.searchParams.get("unassigned")),
    onlyDue: booleanParam(url.searchParams.get("due")),
  });

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      queue,
      outboundSent: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { dispatchQueuedOutboundBatch } from "../../../../lib/outbound/outbound-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DISPATCH_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!DISPATCH_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let payload: { limit?: unknown } = {};
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 0) {
    try {
      payload = (await request.json()) as { limit?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }
  }

  const requestedLimit = Number(payload.limit ?? 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;
  const result = await dispatchQueuedOutboundBatch(limit);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

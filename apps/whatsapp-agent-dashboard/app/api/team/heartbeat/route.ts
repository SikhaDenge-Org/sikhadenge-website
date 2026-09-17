import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(
    { ok: true, userId: user.id, seenAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";

import { destroyCurrentDashboardSession } from "../../../../lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  await destroyCurrentDashboardSession();
  return NextResponse.json(
    { ok: true, redirectTo: "/login" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

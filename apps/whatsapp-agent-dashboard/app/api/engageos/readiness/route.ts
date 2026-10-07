import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { buildRemainingPhaseReadiness } from "@/modules/release/application/phase-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const phases = buildRemainingPhaseReadiness();
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      vocabulary: {
        repositoryImplemented: "code and CI-testable exit gates exist in this branch",
        productionEvidenceReady: "external account/runtime evidence has been explicitly approved",
        live: "controlled production activation has been explicitly recorded",
      },
      phases,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

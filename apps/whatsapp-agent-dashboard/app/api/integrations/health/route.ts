import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { listPersistedIntegrationHealth } from "@/modules/integrations/infrastructure/prisma-integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.ANALYST,
]);

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  const health = await listPersistedIntegrationHealth();
  return NextResponse.json(
    {
      health: health.map((item) => ({
        ...item,
        evidence: {
          ...item.evidence,
          apiVerifiedAt: item.evidence.apiVerifiedAt?.toISOString() ?? null,
          webhookVerifiedAt: item.evidence.webhookVerifiedAt?.toISOString() ?? null,
          tokenExpiresAt: item.evidence.tokenExpiresAt?.toISOString() ?? null,
          revokedAt: item.evidence.revokedAt?.toISOString() ?? null,
          disconnectedAt: item.evidence.disconnectedAt?.toISOString() ?? null,
        },
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

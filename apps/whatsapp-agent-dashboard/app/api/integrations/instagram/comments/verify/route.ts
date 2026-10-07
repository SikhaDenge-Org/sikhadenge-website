import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { verifyInstagramCommentCapabilityReadOnly } from "@/lib/instagram/comment-capability-verifier";
import { recordMetaPermissionEvidence } from "@/modules/integrations/infrastructure/prisma-integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function POST() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });

  const result = await verifyInstagramCommentCapabilityReadOnly();
  let integrationStatus: string | null = null;
  if (result.verified && result.accountId) {
    const persisted = await recordMetaPermissionEvidence({
      channel: "INSTAGRAM",
      externalAccountId: result.accountId,
      verifiedAt: new Date(result.checkedAt),
    });
    integrationStatus = persisted.status;
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "INSTAGRAM_COMMENT_PERMISSION_READ_PROBE",
      entityType: "IntegrationProvider",
      entityId: result.accountId ?? "META_INSTAGRAM",
      after: {
        verified: result.verified,
        checkedAt: result.checkedAt,
        probeMediaId: result.probeMediaId,
        statusCode: result.statusCode,
        integrationStatus,
        externalWriteSent: false,
      },
    },
  });

  return NextResponse.json(
    { ...result, integrationStatus },
    { status: result.verified ? 200 : 424, headers: { "Cache-Control": "no-store" } },
  );
}

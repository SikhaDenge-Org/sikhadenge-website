import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { verifyMessengerPageCapabilityReadOnly } from "@/lib/messenger/page-capability-verifier";
import { recordMetaPermissionEvidence } from "@/modules/integrations/infrastructure/prisma-integration-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set<DashboardRole>([DashboardRole.ADMIN, DashboardRole.MANAGER]);

export async function POST() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED.has(user.role)) return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });

  const result = await verifyMessengerPageCapabilityReadOnly();
  let integrationStatus: string | null = null;
  if (result.verified && result.pageId) {
    const persisted = await recordMetaPermissionEvidence({
      channel: "MESSENGER",
      externalAccountId: result.pageId,
      verifiedAt: new Date(result.checkedAt),
    });
    integrationStatus = persisted.status;
  }

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "MESSENGER_PAGE_CAPABILITY_READ_PROBE",
      entityType: "IntegrationProvider",
      entityId: result.pageId ?? "META_MESSENGER",
      after: {
        verified: result.verified,
        checkedAt: result.checkedAt,
        pageName: result.pageName,
        conversationReadVerified: result.conversationReadVerified,
        commentReadVerified: result.commentReadVerified,
        probePostId: result.probePostId,
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

import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import {
  listEmailDeliverabilityEvidence,
  refreshEmailDeliverabilityEvidence,
} from "@/modules/email-automation/application/deliverability-evidence-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof EmailDashboardAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Email deliverability evidence operation failed." },
    { status: 400 },
  );
}

export async function GET() {
  try {
    const access = await requireEmailManagerAccess();
    const evidence = await listEmailDeliverabilityEvidence(access.workspaceId);
    return NextResponse.json(
      { workspaceId: access.workspaceId, evidence },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST() {
  try {
    const access = await requireEmailManagerAccess();
    const refresh = await refreshEmailDeliverabilityEvidence({
      workspaceId: access.workspaceId,
      force: true,
    });
    const evidence = await listEmailDeliverabilityEvidence(access.workspaceId);
    return NextResponse.json(
      { workspaceId: access.workspaceId, refresh, evidence },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

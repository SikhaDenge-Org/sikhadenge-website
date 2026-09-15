import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { getEmailRuntimePolicy } from "@/modules/email-automation/application/runtime-policy";
import { internalRecipientAllowlist } from "@/modules/email-automation/application/manual-send-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireEmailManagerAccess();
    const policy = getEmailRuntimePolicy();
    return NextResponse.json({
      runtimeEnabled: policy.runtimeEnabled,
      externalWritesEnabled: policy.externalWritesEnabled,
      mode: policy.mode,
      internalRecipientAllowlistCount: internalRecipientAllowlist().size,
      manualSendEnabled: policy.runtimeEnabled && (policy.mode === "DRY_RUN" || policy.mode === "INTERNAL_RECIPIENTS"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Email runtime state could not be loaded." }, { status: 500 });
  }
}

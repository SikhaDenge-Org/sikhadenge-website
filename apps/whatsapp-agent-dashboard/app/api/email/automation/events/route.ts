import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { getEmailRuntimePolicy } from "@/modules/email-automation/application/runtime-policy";
import {
  EMAIL_EVENT_STATUS,
  listEmailAutomationEvents,
  type EmailAutomationEventStatus,
} from "@/modules/email-automation/automation/event-outbox";
import { EMAIL_AUTOMATION_MANUAL_MAX_ATTEMPTS } from "@/modules/email-automation/providers/provider-error-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status")?.toUpperCase();
    const status = rawStatus && EMAIL_EVENT_STATUS.includes(rawStatus as EmailAutomationEventStatus)
      ? (rawStatus as EmailAutomationEventStatus)
      : undefined;
    const events = await listEmailAutomationEvents({
      workspaceId: access.workspaceId,
      status,
      take: Number(url.searchParams.get("take") || 50),
    });
    const policy = getEmailRuntimePolicy();
    return NextResponse.json(
      {
        events,
        automationEnabled: policy.automationEnabled,
        runtimeMode: policy.mode,
        manualRetryMaxAttempts: EMAIL_AUTOMATION_MANUAL_MAX_ATTEMPTS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Email automation events could not be loaded." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { ManualEmailSendService } from "@/modules/email-automation/application/manual-send-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") ?? "50");
    const messages = await new ManualEmailSendService().list(access.workspaceId, Number.isFinite(requested) ? requested : 50);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Email message audit could not be loaded.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

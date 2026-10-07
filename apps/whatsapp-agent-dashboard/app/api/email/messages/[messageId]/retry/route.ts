import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { ManualEmailSendService } from "@/modules/email-automation/application/manual-send-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { messageId: string } };

export async function POST(request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.idempotencyKey !== "string") return NextResponse.json({ error: "idempotencyKey is required." }, { status: 400 });
    const result = await new ManualEmailSendService().retry({ workspaceId: access.workspaceId, messageId: context.params.messageId, idempotencyKey: body.idempotencyKey, actorUserId: access.user.id });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Manual email retry failed.";
    const status = /not found/i.test(message) ? 404 : /only FAILED/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
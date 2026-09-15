import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { ManualEmailSendService } from "@/modules/email-automation/application/manual-send-service";
import type { EmailAddress } from "@/modules/email-automation/domain/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function list(value: unknown): EmailAddress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.email !== "string") return [];
    return [{ email: row.email, ...(typeof row.name === "string" ? { name: row.name } : {}) }];
  });
}

export async function POST(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.templateId !== "string" || typeof body.idempotencyKey !== "string") {
      return NextResponse.json({ error: "templateId and idempotencyKey are required." }, { status: 400 });
    }
    const reply = body.replyTo && typeof body.replyTo === "object" ? body.replyTo as Record<string, unknown> : null;
    const result = await new ManualEmailSendService().send({
      workspaceId: access.workspaceId,
      templateId: body.templateId,
      templateVersionId: typeof body.templateVersionId === "string" ? body.templateVersionId : null,
      manualSenderIdentityId: typeof body.senderIdentityId === "string" ? body.senderIdentityId : null,
      to: list(body.to), cc: list(body.cc), bcc: list(body.bcc),
      ...(reply && typeof reply.email === "string" ? { replyTo: { email: reply.email, ...(typeof reply.name === "string" ? { name: reply.name } : {}) } } : {}),
      variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables) ? body.variables as Record<string, string | null | undefined> : {},
      idempotencyKey: body.idempotencyKey,
      actorUserId: access.user.id,
      subjectOverride: typeof body.subjectOverride === "string" ? body.subjectOverride : null,
      htmlOverride: typeof body.htmlOverride === "string" ? body.htmlOverride : null,
      textOverride: typeof body.textOverride === "string" ? body.textOverride : null,
      providerThreadId: typeof body.providerThreadId === "string" ? body.providerThreadId : null,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Manual email could not be processed.";
    const status = /not found/i.test(message) ? 404 : /idempotency|changed|concurrent/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

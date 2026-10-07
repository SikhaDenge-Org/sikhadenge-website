import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailTemplateRuntime } from "@/modules/email-automation/infrastructure/template-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { templateId: string } };

export async function POST(request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.status !== "string") {
      return NextResponse.json({ error: "status is required." }, { status: 400 });
    }
    const runtime = buildEmailTemplateRuntime();
    const template = await runtime.service.transition({
      workspaceId: access.workspaceId,
      templateId: context.params.templateId,
      toStatus: body.status,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    const message = error instanceof Error ? error.message : "Email template status could not be changed.";
    const status = /not found/i.test(message) ? 404 : /changed|concurrent/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

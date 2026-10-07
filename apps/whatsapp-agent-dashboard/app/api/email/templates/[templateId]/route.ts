import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailTemplateRuntime } from "@/modules/email-automation/infrastructure/template-runtime";
import type { EmailTemplateDocument } from "@/modules/email-automation/templates/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: { templateId: string } };

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EmailDashboardAccessError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = /not found/i.test(message) ? 404 : /changed|concurrent/i.test(message) ? 409 : 400;
  return NextResponse.json({ error: message || fallback }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const runtime = buildEmailTemplateRuntime();
    const template = await runtime.service.get({ workspaceId: access.workspaceId, templateId: context.params.templateId });
    return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Email template could not be loaded.");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const body = (await request.json()) as Record<string, unknown>;
    if (!Number.isInteger(body.expectedCurrentVersion) || !body.document) {
      return NextResponse.json({ error: "expectedCurrentVersion and document are required." }, { status: 400 });
    }
    const runtime = buildEmailTemplateRuntime();
    const template = await runtime.service.createDraftVersion({
      workspaceId: access.workspaceId,
      templateId: context.params.templateId,
      expectedCurrentVersion: body.expectedCurrentVersion as number,
      document: body.document as EmailTemplateDocument,
      defaultSenderIdentityId: typeof body.defaultSenderIdentityId === "string" ? body.defaultSenderIdentityId : null,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Email template draft could not be updated.");
  }
}

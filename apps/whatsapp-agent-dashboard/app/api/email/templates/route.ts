import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { buildEmailTemplateRuntime } from "@/modules/email-automation/infrastructure/template-runtime";
import type { EmailTemplateDocument } from "@/modules/email-automation/templates/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof EmailDashboardAccessError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = /unique constraint|already exists/i.test(message) ? 409 : 400;
  return NextResponse.json({ error: message || fallback }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const access = await requireEmailManagerAccess();
    const runtime = buildEmailTemplateRuntime();
    const templates = await runtime.service.list(access.workspaceId);
    return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Email templates could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.name !== "string" || typeof body.category !== "string" || !body.document) {
      return NextResponse.json({ error: "name, category and document are required." }, { status: 400 });
    }
    const runtime = buildEmailTemplateRuntime();
    const template = await runtime.service.create({
      workspaceId: access.workspaceId,
      name: body.name,
      category: body.category,
      document: body.document as EmailTemplateDocument,
      defaultSenderIdentityId: typeof body.defaultSenderIdentityId === "string" ? body.defaultSenderIdentityId : null,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ template }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Email template could not be created.");
  }
}

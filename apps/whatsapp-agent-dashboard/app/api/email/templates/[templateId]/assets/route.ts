import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { EmailTemplateAssetService } from "@/modules/email-automation/application/template-asset-service";
import type { EmailAssetKind } from "@/modules/email-automation/infrastructure/email-template-asset-storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { templateId: string } };
const KINDS = new Set<EmailAssetKind>(["INLINE_IMAGE", "ATTACHMENT", "DOCUMENT"]);
export async function POST(request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    const expectedCurrentVersion = Number(form.get("expectedCurrentVersion"));
    const imageBlockId = form.get("imageBlockId");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required." }, { status: 400 });
    if (typeof kind !== "string" || !KINDS.has(kind as EmailAssetKind)) return NextResponse.json({ error: "A valid email asset kind is required." }, { status: 400 });
    if (!Number.isInteger(expectedCurrentVersion) || expectedCurrentVersion < 1) return NextResponse.json({ error: "expectedCurrentVersion must be a positive integer." }, { status: 400 });
    const template = await new EmailTemplateAssetService().upload({
      workspaceId: access.workspaceId,
      templateId: context.params.templateId,
      expectedCurrentVersion,
      kind: kind as EmailAssetKind,
      file,
      imageBlockId: typeof imageBlockId === "string" ? imageBlockId : null,
      actorUserId: access.user.id,
    });
    return NextResponse.json({ template }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const message = error instanceof Error ? error.message : "Email asset upload failed.";
    const status = /changed|concurrent/i.test(message) ? 409 : /not found/i.test(message) ? 404 : 422;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
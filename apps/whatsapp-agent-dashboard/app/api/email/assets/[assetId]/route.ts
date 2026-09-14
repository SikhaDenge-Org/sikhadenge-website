import { NextResponse } from "next/server";
import { EmailDashboardAccessError, requireEmailManagerAccess } from "@/modules/email-automation/application/dashboard-access";
import { EmailTemplateAssetService } from "@/modules/email-automation/application/template-asset-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { assetId: string } };
export async function GET(_request: Request, context: Context) {
  try {
    const access = await requireEmailManagerAccess();
    const result = await new EmailTemplateAssetService().read({ workspaceId: access.workspaceId, assetId: context.params.assetId });
    return new NextResponse(new Uint8Array(result.data), { headers: {
      "Content-Type": result.asset.mimeType,
      "Content-Length": String(result.data.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(result.asset.fileName)}`,
      "Cache-Control": "private, max-age=300, no-transform",
      "X-Content-Type-Options": "nosniff",
    }});
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Email asset could not be loaded." }, { status: 404 });
  }
}
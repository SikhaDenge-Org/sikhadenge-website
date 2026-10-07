import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { uploadTemplateSampleToMeta } from "../../../../../lib/templates/template-media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!MANAGE_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart upload." }, { status: 400 });
  }

  const file = formData.get("file");
  const headerType = formData.get("headerType");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A sample media file is required." }, { status: 400 });
  }
  if (typeof headerType !== "string") {
    return NextResponse.json({ error: "Header type is required." }, { status: 400 });
  }

  try {
    const sample = await uploadTemplateSampleToMeta({
      file,
      requestedFormat: headerType,
    });
    return NextResponse.json(
      { sample },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Template sample upload failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

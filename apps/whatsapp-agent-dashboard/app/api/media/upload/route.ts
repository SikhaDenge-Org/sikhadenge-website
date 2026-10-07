import { DashboardRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import {
  dashboardMediaUrl,
  saveMediaUpload,
  supportedMediaDescription,
} from "../../../../lib/media/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
  DashboardRole.COUNSELOR,
]);

export async function POST(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Insufficient permission." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: `A file is required. Allowed: ${supportedMediaDescription()}.` },
      { status: 400 },
    );
  }

  try {
    const asset = await saveMediaUpload(file);
    return NextResponse.json(
      {
        asset: {
          id: asset.id,
          name: asset.originalName,
          mimeType: asset.mimeType,
          kind: asset.kind,
          size: asset.size,
          createdAt: asset.createdAt,
          previewUrl: dashboardMediaUrl(asset.id),
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media upload failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

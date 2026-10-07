import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { readMediaAsset } from "../../../../lib/media/media-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: { assetId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const { asset, data } = await readMediaAsset(context.params.assetId);
    const disposition = asset.kind === "document" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.size),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(
          asset.originalName,
        )}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media asset not found." }, { status: 404 });
  }
}

import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import { listInboxConversations } from "../../../lib/inbox/conversation-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  const conversations = await listInboxConversations(limit);

  return NextResponse.json(
    { conversations },
    { headers: { "Cache-Control": "no-store" } },
  );
}

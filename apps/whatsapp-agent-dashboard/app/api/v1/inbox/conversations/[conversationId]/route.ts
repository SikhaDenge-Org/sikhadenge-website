import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { getLegacyUnifiedInboxConversation } from "@/modules/inbox/infrastructure/legacy-whatsapp-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { conversationId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const conversationId = params.conversationId.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "Conversation ID is required." }, { status: 400 });
  }
  const conversation = await getLegacyUnifiedInboxConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  return NextResponse.json(
    { schemaVersion: 1, source: "LEGACY_OMNICHANNEL_ADAPTER", conversation },
    { headers: { "Cache-Control": "no-store" } },
  );
}

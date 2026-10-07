import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../lib/auth/session";
import {
  listInboxConversations,
} from "../../../lib/inbox/conversation-repository";
import {
  normalizeInboxConversationScope,
  parseInboxConversationLimit,
} from "../../../lib/inbox/conversation-read-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const scope = normalizeInboxConversationScope(
    url.searchParams.get("scope"),
  );
  const limit = parseInboxConversationLimit(
    url.searchParams.get("limit"),
  );

  const conversations = await listInboxConversations(
    limit,
    scope,
  );

  return NextResponse.json(
    {
      conversations,
      scope,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

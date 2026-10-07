import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { isChannelType } from "@/modules/channels/core/contracts/channel";
import type { UnifiedInboxStatus } from "@/modules/inbox/application/read-model";
import { listLegacyUnifiedInbox } from "@/modules/inbox/infrastructure/legacy-whatsapp-read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set<UnifiedInboxStatus>(["OPEN", "PENDING", "CLOSED", "ARCHIVED"]);

export async function GET(request: Request) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const url = new URL(request.url);
  const rawChannel = url.searchParams.get("channel")?.trim().toUpperCase();
  if (rawChannel && !isChannelType(rawChannel)) {
    return NextResponse.json({ error: "Unsupported channel filter." }, { status: 400 });
  }
  const rawStatus = url.searchParams.get("status")?.trim().toUpperCase() as UnifiedInboxStatus | undefined;
  if (rawStatus && !STATUSES.has(rawStatus)) {
    return NextResponse.json({ error: "Unsupported status filter." }, { status: 400 });
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50;
  const unreadOnly = url.searchParams.get("unread") === "true";
  const assignedActorId = url.searchParams.get("assignedActorId")?.trim() || undefined;

  try {
    const conversations = await listLegacyUnifiedInbox({
      channel: rawChannel && isChannelType(rawChannel) ? rawChannel : undefined,
      status: rawStatus,
      unreadOnly,
      assignedActorId,
      limit,
    });
    return NextResponse.json(
      {
        schemaVersion: 1,
        source: "LEGACY_OMNICHANNEL_ADAPTER",
        conversations,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unified Inbox query failed." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

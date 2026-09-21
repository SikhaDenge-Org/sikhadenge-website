import {
  DashboardRole,
  MessageActor,
  MessageDirection,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  processInboundAgentLifecycle,
} from "../../../../../lib/agent/live-agent-service";
import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { prisma } from "../../../../../lib/db/prisma";

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

  let payload: { messageId?: unknown; conversationId?: unknown };
  try {
    payload = (await request.json()) as {
      messageId?: unknown;
      conversationId?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const suppliedMessageId =
    typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const conversationId =
    typeof payload.conversationId === "string"
      ? payload.conversationId.trim()
      : "";

  let messageId = suppliedMessageId;
  if (!messageId && conversationId) {
    const latestInbound = await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId,
        direction: MessageDirection.INBOUND,
        actor: MessageActor.CUSTOMER,
      },
      orderBy: { messageTimestamp: "desc" },
      select: { id: true },
    });
    messageId = latestInbound?.id ?? "";
  }

  if (!messageId) {
    return NextResponse.json(
      { error: "messageId or a conversation with an inbound message is required." },
      { status: 400 },
    );
  }

  const result = await processInboundAgentLifecycle({ messageId });
  return NextResponse.json(
    { supervisedRun: true, result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

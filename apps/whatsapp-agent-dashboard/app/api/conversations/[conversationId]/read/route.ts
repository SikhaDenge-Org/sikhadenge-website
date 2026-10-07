import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../../lib/auth/session";
import { prisma } from "../../../../../lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: { conversationId: string } },
) {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { id: context.params.conversationId },
    select: { id: true, unreadCount: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const conversation = await prisma.whatsAppConversation.update({
    where: { id: existing.id },
    data: { unreadCount: 0 },
    select: { id: true, unreadCount: true },
  });

  if (existing.unreadCount > 0) {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "CONVERSATION_MARKED_READ",
        entityType: "WhatsAppConversation",
        entityId: existing.id,
        before: { unreadCount: existing.unreadCount },
        after: { unreadCount: 0 },
      },
    });
  }

  return NextResponse.json(
    { conversation },
    { headers: { "Cache-Control": "no-store" } },
  );
}

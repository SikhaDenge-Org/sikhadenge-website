import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/db/prisma";
import { authenticateDeveloperApi } from "../../../../lib/integrations/developer-api-auth";
import { getOutboundMode } from "../../../../lib/meta/outbound-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authenticateDeveloperApi(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [contacts, openConversations, leads, approvedTemplates, queuedMessages] =
    await prisma.$transaction([
      prisma.whatsAppContact.count(),
      prisma.whatsAppConversation.count({ where: { status: { in: ["OPEN", "WAITING"] } } }),
      prisma.lead.count(),
      prisma.whatsAppTemplate.count({ where: { status: "APPROVED" } }),
      prisma.whatsAppMessage.count({ where: { status: "QUEUED" } }),
    ]);

  return NextResponse.json(
    {
      service: "sikhadenge-whatsapp-agent",
      status: "ok",
      outboundMode: getOutboundMode(),
      counts: { contacts, openConversations, leads, approvedTemplates, queuedMessages },
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

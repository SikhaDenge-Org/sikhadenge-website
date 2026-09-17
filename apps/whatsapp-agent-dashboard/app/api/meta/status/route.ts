import { NextResponse } from "next/server";

import { getCurrentDashboardUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db/prisma";
import { getOutboundMode } from "../../../../lib/meta/outbound-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

export async function GET() {
  const user = await getCurrentDashboardUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const latestInbound = await prisma.webhookEvent.findFirst({
    where: { eventType: "message", processingError: null },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });

  const phoneNumberIdConfigured = configured("WHATSAPP_PHONE_NUMBER_ID");
  const credentialsConfigured =
    phoneNumberIdConfigured &&
    configured("WHATSAPP_BUSINESS_ACCOUNT_ID") &&
    configured("WHATSAPP_ACCESS_TOKEN") &&
    configured("WHATSAPP_APP_SECRET") &&
    configured("WHATSAPP_VERIFY_TOKEN");

  return NextResponse.json(
    {
      connected: credentialsConfigured && Boolean(latestInbound),
      outboundMode: getOutboundMode(),
      latestInboundAt: latestInbound?.receivedAt.toISOString() ?? null,
      phoneNumberIdConfigured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

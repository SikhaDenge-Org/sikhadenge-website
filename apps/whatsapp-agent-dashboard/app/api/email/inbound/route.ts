import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { listEmailInboxThreads } from "@/modules/email-automation/inbound/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || "50");
    const threads = await listEmailInboxThreads({ workspaceId: access.workspaceId, limit });
    return NextResponse.json(
      {
        threads,
        guards: {
          inboundSyncEnabled: process.env.EMAIL_INBOUND_SYNC_ENABLED === "true",
          gmailPubSubTopicConfigured: Boolean(process.env.GOOGLE_GMAIL_PUBSUB_TOPIC?.trim()),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email inbox could not be loaded." },
      { status: 500 },
    );
  }
}

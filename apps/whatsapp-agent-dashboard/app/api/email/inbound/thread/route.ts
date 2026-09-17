import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import { getEmailInboxThread } from "@/modules/email-automation/inbound/inbox-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider")?.trim() || "";
    const connectionId = url.searchParams.get("connectionId")?.trim() || null;
    const threadId = url.searchParams.get("threadId")?.trim() || "";
    const threadKind = url.searchParams.get("threadKind") === "MESSAGE" ? "MESSAGE" : "THREAD";
    if (!provider || !threadId) {
      return NextResponse.json({ error: "provider and threadId are required." }, { status: 400 });
    }
    const thread = await getEmailInboxThread({
      workspaceId: access.workspaceId,
      provider,
      connectionId,
      threadId,
      threadKind,
    });
    if (!thread) return NextResponse.json({ error: "Email thread not found." }, { status: 404 });
    return NextResponse.json(thread, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email thread could not be loaded." },
      { status: 500 },
    );
  }
}

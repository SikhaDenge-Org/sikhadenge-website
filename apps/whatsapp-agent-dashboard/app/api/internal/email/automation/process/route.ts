import { NextResponse } from "next/server";

import { isEmailAutomationSchedulerAuthorized } from "@/modules/email-automation/automation/scheduler-auth";
import { getEmailAutomationSchedulerHealth, processEmailAutomationScheduler } from "@/modules/email-automation/automation/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  return isEmailAutomationSchedulerAuthorized(request.headers.get("authorization"));
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await getEmailAutomationSchedulerHealth(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email automation scheduler health failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await processEmailAutomationScheduler({
      workspaceLimit: typeof body.workspaceLimit === "number" ? body.workspaceLimit : 20,
      perWorkspaceLimit: typeof body.perWorkspaceLimit === "number" ? body.perWorkspaceLimit : 20,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email automation scheduler failed." },
      { status: 500 },
    );
  }
}
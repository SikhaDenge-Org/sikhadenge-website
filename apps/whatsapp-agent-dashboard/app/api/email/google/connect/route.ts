import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import {
  buildEmailE1Runtime,
  emailOAuthRedirectUri,
} from "@/modules/email-automation/infrastructure/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const access = await requireEmailManagerAccess();
    const runtime = buildEmailE1Runtime();
    const oauth = await runtime.service.startOAuth({
      workspaceId: access.workspaceId,
      provider: "GOOGLE_GMAIL",
      redirectUri: emailOAuthRedirectUri(),
    });

    return NextResponse.json(
      {
        provider: oauth.provider,
        authorizationUrl: oauth.authorizationUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Gmail connection is not configured for OAuth yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

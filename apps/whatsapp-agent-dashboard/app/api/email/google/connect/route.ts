import { NextResponse } from "next/server";

import {
  EmailDashboardAccessError,
  requireEmailManagerAccess,
} from "@/modules/email-automation/application/dashboard-access";
import {
  buildEmailE1Runtime,
  emailOAuthRedirectUri,
} from "@/modules/email-automation/infrastructure/runtime";
import { GMAIL_INBOUND_SCOPES } from "@/modules/email-automation/providers/gmail/oauth-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await requireEmailManagerAccess();
    const payload = (await request.json().catch(() => ({}))) as { enableInbound?: unknown };
    const enableInbound = payload.enableInbound === true;
    const runtime = buildEmailE1Runtime();
    const oauth = await runtime.service.startOAuth({
      workspaceId: access.workspaceId,
      provider: "GOOGLE_GMAIL",
      redirectUri: emailOAuthRedirectUri(),
    });

    const authorizationUrl = new URL(oauth.authorizationUrl);
    if (enableInbound) {
      const scopes = new Set(
        (authorizationUrl.searchParams.get("scope") ?? "")
          .split(/\s+/u)
          .map((scope) => scope.trim())
          .filter(Boolean),
      );
      for (const scope of GMAIL_INBOUND_SCOPES) scopes.add(scope);
      authorizationUrl.searchParams.set("scope", [...scopes].join(" "));
      authorizationUrl.searchParams.set("include_granted_scopes", "true");
      authorizationUrl.searchParams.set("prompt", "consent");
    }

    return NextResponse.json(
      {
        provider: oauth.provider,
        authorizationUrl: authorizationUrl.toString(),
        scopeUpgrade: enableInbound ? "GMAIL_INBOUND_READ" : null,
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

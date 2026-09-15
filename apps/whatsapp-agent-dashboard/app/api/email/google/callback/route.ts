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

function emailPage(request: Request, params: Record<string, string>): URL {
  const target = new URL("/email", request.url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      emailPage(request, { email: "oauth_denied", reason: providerError }),
    );
  }

  const code = requestUrl.searchParams.get("code")?.trim();
  const state = requestUrl.searchParams.get("state")?.trim();
  if (!code || !state) {
    return NextResponse.redirect(
      emailPage(request, { email: "oauth_failed", reason: "missing_callback_parameters" }),
    );
  }

  try {
    const access = await requireEmailManagerAccess();
    const runtime = buildEmailE1Runtime();
    const result = await runtime.service.completeOAuth({
      workspaceId: access.workspaceId,
      provider: "GOOGLE_GMAIL",
      redirectUri: emailOAuthRedirectUri(),
      code,
      state,
    });

    return NextResponse.redirect(
      emailPage(request, {
        email: "connected",
        connection: result.connection.id,
        senders: String(result.senders.length),
      }),
    );
  } catch (error) {
    if (error instanceof EmailDashboardAccessError) {
      return NextResponse.redirect(
        emailPage(request, { email: "oauth_failed", reason: error.code.toLowerCase() }),
      );
    }
    return NextResponse.redirect(
      emailPage(request, { email: "oauth_failed", reason: "connection_verification_failed" }),
    );
  }
}

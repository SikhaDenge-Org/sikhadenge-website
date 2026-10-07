import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getOutboundMode } from "@/lib/meta/outbound-client";
import { authenticatePublicApiKey } from "@/modules/saas/application/public-api-key-service";
import { buildWorkspaceBillingProjection } from "@/modules/saas/application/workspace-billing";
import { prismaPublicApiKeyRepository } from "@/modules/saas/infrastructure/prisma-public-api-key-repository";
import { prismaSaasBillingRepository } from "@/modules/saas/infrastructure/prisma-saas-billing-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: Request): string {
  const header = request.headers.get("authorization")?.trim() || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function denialStatus(reason: string): number {
  if (reason === "rate-limit-exceeded") return 429;
  if (
    reason === "tenant-scope-mismatch" ||
    reason === "scope-denied" ||
    reason === "public-api-disabled" ||
    reason === "plan-limit-exceeded"
  ) return 403;
  return 401;
}

export async function GET(request: Request) {
  const workspaceId = request.headers.get("x-workspace-id")?.trim() || "";
  if (!workspaceId) {
    return NextResponse.json({ error: "x-workspace-id is required." }, { status: 400 });
  }

  const secret = bearer(request);
  if (!secret) {
    return NextResponse.json({ error: "Bearer API key is required." }, { status: 401 });
  }

  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  try {
    const projection = await buildWorkspaceBillingProjection(prismaSaasBillingRepository, {
      activeWorkspaceId: workspaceId,
      workspaceId,
    });

    const auth = await authenticatePublicApiKey(prismaPublicApiKeyRepository, {
      secret,
      activeWorkspaceId: workspaceId,
      resourceWorkspaceId: workspaceId,
      requiredScope: "analytics.read",
      limits: projection.plan.limits,
      projectedUsage: projection.usage,
      windowLimit: Math.max(1, Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE) || 120),
      windowMs: 60_000,
      requestId,
      method: "GET",
      path: "/api/v1/status",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: request.headers.get("user-agent"),
    });

    if (!auth.allowed) {
      return NextResponse.json(
        { error: "Public API access denied.", reason: auth.reason, requestId },
        { status: denialStatus(auth.reason), headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        service: "sikhadenge-whatsapp-agent",
        status: "ok",
        workspaceId,
        outboundMode: getOutboundMode(),
        plan: {
          key: projection.plan.key,
          status: projection.subscriptionStatus,
          limits: projection.plan.limits,
        },
        usage: projection.usage,
        billingPeriod: projection.period,
        apiKey: {
          id: auth.apiKey.id,
          prefix: auth.apiKey.prefix,
          remainingInWindow: auth.remainingInWindow,
        },
        requestId,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Workspace SaaS state is unavailable.", requestId },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}


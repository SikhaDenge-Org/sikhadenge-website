import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/db/prisma";

export const runtime = "nodejs";

const RESET_WINDOW_MINUTES = 15;
const MAX_RESET_REQUESTS = 4;
const MIN_RESPONSE_MS = 320;
const ACTION = "AUTH_PASSWORD_RESET_REQUESTED";
const GENERIC_MESSAGE =
  "If this email belongs to an active SikhaDenge account, a secure reset request has been recorded. Contact your workspace administrator to complete the password reset.";

function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";
}

function resetKey(email: string): string {
  return createHash("sha256")
    .update(`engageos-password-reset:${email || "invalid"}`)
    .digest("hex");
}

async function genericResponse(startedAt: number) {
  const remaining = Math.max(0, MIN_RESPONSE_MS - (Date.now() - startedAt));
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

  return NextResponse.json(
    { ok: true, message: GENERIC_MESSAGE },
    {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const ipAddress = getRequestIp(request);
  const userAgent = request.headers.get("user-agent");

  let payload: { email?: unknown } = {};
  try {
    payload = (await request.json()) as { email?: unknown };
  } catch {
    payload = {};
  }

  const email = normalizeEmail(payload.email);
  const entityKey = resetKey(email);
  const windowStart = new Date(Date.now() - RESET_WINDOW_MINUTES * 60 * 1000);

  const recentRequests = await prisma.auditLog.count({
    where: {
      action: ACTION,
      createdAt: { gte: windowStart },
      OR: [
        { entityId: entityKey },
        ...(ipAddress ? [{ ipAddress }] : []),
      ],
    },
  });

  if (recentRequests >= MAX_RESET_REQUESTS) {
    return genericResponse(startedAt);
  }

  // Always perform the account lookup and always return the same public response.
  // This avoids exposing whether an email is registered.
  const lookupEmail = email || `invalid-${entityKey.slice(0, 16)}@invalid.local`;
  const user = await prisma.dashboardUser.findUnique({
    where: { email: lookupEmail },
    select: { id: true, isActive: true },
  });

  const activeUserId = user?.isActive ? user.id : null;

  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: ACTION,
      entityType: activeUserId ? "DashboardUser" : "PasswordResetRequest",
      entityId: activeUserId ?? entityKey,
      ipAddress,
      userAgent,
      after: {
        requestKey: entityKey,
        accountMatched: Boolean(activeUserId),
        deliveryMode: "ADMIN_ASSISTED",
      },
    },
  });

  return genericResponse(startedAt);
}

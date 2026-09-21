import { NextResponse } from "next/server";

import {
  LOGIN_WINDOW_MINUTES,
  MAX_LOGIN_ATTEMPTS,
} from "../../../../lib/auth/constants";
import { verifyPassword } from "../../../../lib/auth/password";
import { createDashboardSession } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db/prisma";

export const runtime = "nodejs";

function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  const ipAddress = getRequestIp(request);
  const userAgent = request.headers.get("user-agent");

  let payload: { email?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password || email.length > 254 || password.length > 256) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  const windowStart = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      succeeded: false,
      createdAt: { gte: windowStart },
      OR: [
        { email },
        ...(ipAddress ? [{ ipAddress }] : []),
      ],
    },
  });

  if (recentFailures >= MAX_LOGIN_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Try again after 15 minutes." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await prisma.dashboardUser.findUnique({ where: { email } });
  const validPassword = user?.isActive
    ? await verifyPassword(password, user.passwordHash)
    : false;

  await prisma.loginAttempt.create({
    data: { email, ipAddress, succeeded: Boolean(validPassword) },
  });

  if (!user || !validPassword || !user.isActive) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  await prisma.$transaction([
    prisma.dashboardUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "AUTH_LOGIN_SUCCESS",
        entityType: "DashboardUser",
        entityId: user.id,
        ipAddress,
        userAgent,
      },
    }),
  ]);

  await createDashboardSession(user.id, { ipAddress, userAgent });

  return NextResponse.json(
    { ok: true, redirectTo: "/inbox" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

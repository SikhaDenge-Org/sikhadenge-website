import { createHash, randomBytes } from "node:crypto";
import type { DashboardRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "../db/prisma";
import { getSessionDurationMs, SESSION_COOKIE_NAME } from "./constants";

export type DashboardIdentity = {
  id: string;
  name: string;
  email: string;
  role: DashboardRole;
};

type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDashboardSession(
  userId: string,
  context: SessionContext = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + getSessionDurationMs());

  await prisma.dashboardSession.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    },
  });

  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentDashboardUser(): Promise<DashboardIdentity | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.dashboardSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.user.isActive
  ) {
    return null;
  }

  if (Date.now() - session.lastSeenAt.getTime() >= 30_000) {
    await prisma.dashboardSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

export async function requireDashboardUser(
  allowedRoles?: DashboardRole[],
): Promise<DashboardIdentity> {
  const user = await getCurrentDashboardUser();
  if (!user) redirect("/login");

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect("/inbox?error=forbidden");
  }

  return user;
}

export async function destroyCurrentDashboardSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.dashboardSession.updateMany({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  cookies().delete(SESSION_COOKIE_NAME);
}

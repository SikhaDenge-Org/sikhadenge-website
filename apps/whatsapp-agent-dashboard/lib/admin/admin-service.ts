import { DashboardRole, Prisma } from "@prisma/client";

import { hashPassword } from "../auth/password";
import { prisma } from "../db/prisma";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function clean(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximum)
    : "";
}

function roleValue(value: unknown): DashboardRole {
  const role = clean(value, 30).toUpperCase() as DashboardRole;
  if (!Object.values(DashboardRole).includes(role)) throw new Error("Dashboard role is invalid.");
  return role;
}

function booleanEnvironment(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on", "enabled", "live"].includes(value)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  return fallback;
}

export async function getAdminOverview() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const [users, sessions, loginAttempts, auditLogs] = await Promise.all([
    prisma.dashboardUser.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            sessions: true,
            assignedConversations: true,
            assignedLeads: true,
          },
        },
      },
    }),
    prisma.dashboardSession.findMany({
      where: { expiresAt: { gt: now } },
      orderBy: { lastSeenAt: "desc" },
      take: 200,
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
        revokedAt: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.loginAttempt.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { email: true, ipAddress: true, succeeded: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);

  const activeSessions = sessions.filter((session) => !session.revokedAt);
  const failedLogins24h = loginAttempts.filter(
    (attempt) => !attempt.succeeded && attempt.createdAt >= oneDayAgo,
  ).length;
  const distinctFailureIps = new Set(
    loginAttempts.filter((attempt) => !attempt.succeeded && attempt.ipAddress).map((attempt) => attempt.ipAddress),
  ).size;

  return {
    users,
    sessions,
    loginAttempts: loginAttempts.slice(0, 100),
    auditLogs,
    metrics: {
      users: users.length,
      activeUsers: users.filter((user) => user.isActive).length,
      admins: users.filter((user) => user.role === DashboardRole.ADMIN && user.isActive).length,
      activeSessions: activeSessions.length,
      failedLogins24h,
      distinctFailureIps,
    },
    controls: {
      outboundLive: process.env.WHATSAPP_OUTBOUND_MODE?.trim().toLowerCase() === "live",
      agentKillSwitch: booleanEnvironment("AGENT_KILL_SWITCH", false),
      agentAutoReplyEnabled: booleanEnvironment("AGENT_AUTO_REPLY_ENABLED", false),
      automationRuntimeEnabled: booleanEnvironment("AUTOMATION_RUNTIME_ENABLED", false),
      automationActionsEnabled: booleanEnvironment("AUTOMATION_ACTIONS_ENABLED", false),
      integrationWritesEnabled: booleanEnvironment("INTEGRATION_EXTERNAL_WRITES_ENABLED", false),
      campaignDispatchEnabled: booleanEnvironment("WHATSAPP_CAMPAIGNS_ENABLED", false),
      sessionCookieSecure: process.env.NODE_ENV === "production",
      secretsExposed: false,
    },
    generatedAt: now.toISOString(),
  };
}

export async function createDashboardUser(input: {
  name: unknown;
  email: unknown;
  password: unknown;
  role: unknown;
  actorId: string;
}) {
  const name = clean(input.name, 120);
  const email = clean(input.email, 200).toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const role = roleValue(input.role);
  if (name.length < 2) throw new Error("User name is required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("User email is invalid.");
  const passwordHash = await hashPassword(password);
  const existing = await prisma.dashboardUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error("A dashboard user with this email already exists.");

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.dashboardUser.create({
      data: { name, email, passwordHash, role, isActive: true },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "DASHBOARD_USER_CREATED",
        entityType: "DashboardUser",
        entityId: user.id,
        after: toJson({ email, role, isActive: true, passwordStoredAsHash: true }),
      },
    });
    return user;
  });
}

export async function updateDashboardUser(input: {
  userId: string;
  role?: unknown;
  isActive?: unknown;
  newPassword?: unknown;
  actorId: string;
}) {
  const target = await prisma.dashboardUser.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!target) throw new Error("Dashboard user not found.");
  const data: Prisma.DashboardUserUpdateInput = {};
  if (input.role !== undefined) data.role = roleValue(input.role);
  if (input.isActive !== undefined) {
    if (input.userId === input.actorId && input.isActive === false) {
      throw new Error("You cannot deactivate your own account.");
    }
    data.isActive = input.isActive === true;
  }
  if (typeof input.newPassword === "string" && input.newPassword.trim()) {
    data.passwordHash = await hashPassword(input.newPassword);
  }
  if (Object.keys(data).length === 0) throw new Error("No user update was provided.");

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.dashboardUser.update({
      where: { id: target.id },
      data,
      select: { id: true, name: true, email: true, role: true, isActive: true, updatedAt: true },
    });
    if (data.isActive === false || data.passwordHash) {
      await transaction.dashboardSession.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "DASHBOARD_USER_UPDATED",
        entityType: "DashboardUser",
        entityId: target.id,
        before: toJson({ role: target.role, isActive: target.isActive }),
        after: toJson({ role: user.role, isActive: user.isActive, passwordChanged: Boolean(data.passwordHash) }),
      },
    });
    return user;
  });
}

export async function revokeDashboardSessions(input: {
  userId: unknown;
  actorId: string;
}) {
  const userId = clean(input.userId, 100);
  const target = await prisma.dashboardUser.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!target) throw new Error("Dashboard user not found.");
  const result = await prisma.$transaction(async (transaction) => {
    const revoked = await transaction.dashboardSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "DASHBOARD_SESSIONS_REVOKED",
        entityType: "DashboardUser",
        entityId: userId,
        after: toJson({ email: target.email, revokedSessions: revoked.count }),
      },
    });
    return revoked.count;
  });
  return { revokedSessions: result };
}

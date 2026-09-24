import { DashboardRole } from "@prisma/client";

import type { DashboardIdentity } from "../auth/session";
import { prisma } from "../db/prisma";

export const INTERNAL_CANARY_WORKSPACE_ID = "engagews_default";
export const INTERNAL_CANARY_CONFIRMATION = "SEND_EXACTLY_ONE_INTERNAL_WHATSAPP_CANARY";

export type CanaryAuthorizationContext = {
  userId: string;
  dashboardRole: DashboardRole;
  workspaceId: string;
  workspaceRole: string | null;
  workspaceMembershipActive: boolean;
  workspaceActive: boolean;
  canAuthorizeInternalCanary: boolean;
};

export function evaluateCanaryAuthorization(input: {
  dashboardRole: DashboardRole;
  workspaceRole: string | null;
  workspaceMembershipActive: boolean;
  workspaceActive: boolean;
}): boolean {
  return (
    input.dashboardRole === DashboardRole.ADMIN &&
    input.workspaceRole === "ADMIN" &&
    input.workspaceMembershipActive &&
    input.workspaceActive
  );
}

export async function getCanaryAuthorizationContext(
  user: DashboardIdentity,
): Promise<CanaryAuthorizationContext> {
  const membership = await prisma.engageWorkspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: INTERNAL_CANARY_WORKSPACE_ID,
        userId: user.id,
      },
    },
    select: {
      role: true,
      isActive: true,
      workspace: {
        select: { isActive: true },
      },
    },
  });

  const workspaceRole = membership?.role ?? null;
  const workspaceMembershipActive = membership?.isActive ?? false;
  const workspaceActive = membership?.workspace.isActive ?? false;

  return {
    userId: user.id,
    dashboardRole: user.role,
    workspaceId: INTERNAL_CANARY_WORKSPACE_ID,
    workspaceRole,
    workspaceMembershipActive,
    workspaceActive,
    canAuthorizeInternalCanary: evaluateCanaryAuthorization({
      dashboardRole: user.role,
      workspaceRole,
      workspaceMembershipActive,
      workspaceActive,
    }),
  };
}

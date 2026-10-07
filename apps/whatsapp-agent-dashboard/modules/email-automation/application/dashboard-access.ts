import { DashboardRole } from "@prisma/client";

import { getCurrentDashboardUser } from "@/lib/auth/session";
import { loadPersistedWorkspaceSecurityContext } from "@/modules/auth/infrastructure/prisma-authorization";

export type EmailDashboardAccess = {
  user: {
    id: string;
    name: string;
    email: string;
    role: DashboardRole;
  };
  workspaceId: string;
  workspaceSlug: string;
};

export class EmailDashboardAccessError extends Error {
  readonly code: "UNAUTHORIZED" | "FORBIDDEN" | "WORKSPACE_NOT_CONFIGURED";
  readonly status: 401 | 403 | 503;

  constructor(
    code: EmailDashboardAccessError["code"],
    message: string,
    status: EmailDashboardAccessError["status"],
  ) {
    super(message);
    this.name = "EmailDashboardAccessError";
    this.code = code;
    this.status = status;
  }
}

const MANAGER_ROLES = new Set<DashboardRole>([
  DashboardRole.ADMIN,
  DashboardRole.MANAGER,
]);

export async function requireEmailManagerAccess(): Promise<EmailDashboardAccess> {
  const user = await getCurrentDashboardUser();
  if (!user) {
    throw new EmailDashboardAccessError("UNAUTHORIZED", "Unauthorized.", 401);
  }
  if (!MANAGER_ROLES.has(user.role)) {
    throw new EmailDashboardAccessError(
      "FORBIDDEN",
      "Email connections require an Admin or Manager role.",
      403,
    );
  }

  const security = await loadPersistedWorkspaceSecurityContext(user.id);
  if (!security) {
    throw new EmailDashboardAccessError(
      "WORKSPACE_NOT_CONFIGURED",
      "No active EngageOS workspace membership is configured for this user.",
      503,
    );
  }

  return {
    user,
    workspaceId: security.workspace.id,
    workspaceSlug: security.workspace.slug,
  };
}

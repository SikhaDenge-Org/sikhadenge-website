import type {
  WorkspaceActorId,
  WorkspaceContext,
  WorkspaceId,
} from "@/modules/workspaces/domain/workspace";
import { assertWorkspaceAccess } from "@/modules/workspaces/domain/workspace";

export type WorkspaceRole =
  | "ADMIN"
  | "MANAGER"
  | "COUNSELOR"
  | "ANALYST"
  | "VIEWER";

export type Permission =
  | "workspace.read"
  | "workspace.manage"
  | "members.read"
  | "members.manage"
  | "channels.read"
  | "channels.manage"
  | "inbox.read"
  | "inbox.reply"
  | "inbox.assign"
  | "customers.read"
  | "customers.manage"
  | "automations.read"
  | "automations.manage"
  | "automations.publish"
  | "campaigns.read"
  | "campaigns.manage"
  | "campaigns.launch"
  | "ai.use"
  | "ai.manage"
  | "analytics.read"
  | "audit.read"
  | "security.manage";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "workspace.read",
  "workspace.manage",
  "members.read",
  "members.manage",
  "channels.read",
  "channels.manage",
  "inbox.read",
  "inbox.reply",
  "inbox.assign",
  "customers.read",
  "customers.manage",
  "automations.read",
  "automations.manage",
  "automations.publish",
  "campaigns.read",
  "campaigns.manage",
  "campaigns.launch",
  "ai.use",
  "ai.manage",
  "analytics.read",
  "audit.read",
  "security.manage",
];

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  "ADMIN",
  "MANAGER",
  "COUNSELOR",
  "ANALYST",
  "VIEWER",
];

export const ROLE_PERMISSIONS: Readonly<
  Record<WorkspaceRole, readonly Permission[]>
> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    "workspace.read",
    "members.read",
    "channels.read",
    "inbox.read",
    "inbox.reply",
    "inbox.assign",
    "customers.read",
    "customers.manage",
    "automations.read",
    "automations.manage",
    "automations.publish",
    "campaigns.read",
    "campaigns.manage",
    "campaigns.launch",
    "ai.use",
    "analytics.read",
    "audit.read",
  ],
  COUNSELOR: [
    "workspace.read",
    "channels.read",
    "inbox.read",
    "inbox.reply",
    "customers.read",
    "customers.manage",
    "automations.read",
    "campaigns.read",
    "ai.use",
  ],
  ANALYST: [
    "workspace.read",
    "channels.read",
    "inbox.read",
    "customers.read",
    "automations.read",
    "campaigns.read",
    "analytics.read",
    "audit.read",
  ],
  VIEWER: [
    "workspace.read",
    "channels.read",
    "inbox.read",
    "customers.read",
    "automations.read",
    "campaigns.read",
    "analytics.read",
  ],
};

export type WorkspaceMembership = {
  workspaceId: WorkspaceId;
  userId: WorkspaceActorId;
  role: WorkspaceRole;
  isActive: boolean;
  grantedPermissions?: readonly Permission[];
};

export class AuthorizationError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "MEMBERSHIP_INACTIVE";

  constructor(
    code: AuthorizationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole);
}

export function isPermission(value: string): value is Permission {
  return ALL_PERMISSIONS.includes(value as Permission);
}

export function hasPermission(
  membership: WorkspaceMembership,
  permission: Permission,
): boolean {
  return (
    membership.isActive &&
    (ROLE_PERMISSIONS[membership.role].includes(permission) ||
      membership.grantedPermissions?.includes(permission) === true)
  );
}

export function assertPermission(
  context: WorkspaceContext,
  membership: WorkspaceMembership | null | undefined,
  permission: Permission,
): void {
  if (!context.actorId || !membership) {
    throw new AuthorizationError(
      "UNAUTHENTICATED",
      "An authenticated workspace membership is required.",
    );
  }

  assertWorkspaceAccess(context, membership);

  if (membership.userId !== context.actorId) {
    throw new AuthorizationError(
      "FORBIDDEN",
      "The active actor does not match the workspace membership.",
    );
  }

  if (!membership.isActive) {
    throw new AuthorizationError(
      "MEMBERSHIP_INACTIVE",
      "The workspace membership is inactive.",
    );
  }

  if (!hasPermission(membership, permission)) {
    throw new AuthorizationError(
      "FORBIDDEN",
      `Permission denied: ${permission}.`,
    );
  }
}

import {
  assertPermission,
  isPermission,
  isWorkspaceRole,
  type Permission,
  type WorkspaceMembership,
} from "@/modules/auth/domain/permissions";
import {
  workspaceActorId,
  workspaceId,
  type WorkspaceContext,
} from "@/modules/workspaces/domain/workspace";
import { prisma } from "@/lib/db/prisma";

export const ENGAGEOS_SECURITY_MASTER_ENV =
  "ENGAGEOS_SECURITY_PERSISTENCE_ENABLED";

export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

export const SECURITY_FEATURE_FLAGS = {
  routePermissions: "engageos.route_permissions",
  outboundPolicy: "engageos.outbound_policy",
  webhookReplay: "engageos.webhook_replay",
} as const;

export type SecurityFeatureFlag =
  (typeof SECURITY_FEATURE_FLAGS)[keyof typeof SECURITY_FEATURE_FLAGS];

export type PersistedWorkspaceSecurityContext = {
  context: WorkspaceContext;
  membership: WorkspaceMembership;
  workspace: {
    id: string;
    slug: string;
  };
  featureFlags: Readonly<Record<SecurityFeatureFlag, boolean>>;
};

export type DashboardAuthorizationResolution = {
  mode: "LEGACY" | "ENGAGEOS";
  securityContext: PersistedWorkspaceSecurityContext | null;
};

export class SecurityPersistenceConfigurationError extends Error {
  readonly code = "SECURITY_PERSISTENCE_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "SecurityPersistenceConfigurationError";
  }
}

export function isSecurityPersistenceMasterEnabled(
  env: EnvironmentMap = process.env,
): boolean {
  return env[ENGAGEOS_SECURITY_MASTER_ENV]?.trim().toLowerCase() === "true";
}

function emptyFeatureFlags(): Record<SecurityFeatureFlag, boolean> {
  return {
    [SECURITY_FEATURE_FLAGS.routePermissions]: false,
    [SECURITY_FEATURE_FLAGS.outboundPolicy]: false,
    [SECURITY_FEATURE_FLAGS.webhookReplay]: false,
  };
}

export async function loadPersistedWorkspaceSecurityContext(
  userId: string,
): Promise<PersistedWorkspaceSecurityContext | null> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return null;

  const record = await prisma.engageWorkspaceMembership.findFirst({
    where: {
      userId: normalizedUserId,
      isActive: true,
      workspace: { isActive: true },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      userId: true,
      role: true,
      isActive: true,
      permissions: {
        select: { permission: true },
      },
      workspace: {
        select: {
          id: true,
          slug: true,
          featureFlags: {
            where: {
              key: { in: Object.values(SECURITY_FEATURE_FLAGS) },
            },
            select: {
              key: true,
              enabled: true,
            },
          },
        },
      },
    },
  });

  if (!record) return null;
  if (!isWorkspaceRole(record.role)) {
    throw new SecurityPersistenceConfigurationError(
      `Unsupported persisted workspace role: ${record.role}.`,
    );
  }

  const flags = emptyFeatureFlags();
  for (const flag of record.workspace.featureFlags) {
    if (
      Object.values(SECURITY_FEATURE_FLAGS).includes(
        flag.key as SecurityFeatureFlag,
      )
    ) {
      flags[flag.key as SecurityFeatureFlag] = flag.enabled;
    }
  }

  const grantedPermissions = record.permissions
    .map((grant) => grant.permission)
    .filter(isPermission);
  const activeWorkspaceId = workspaceId(record.workspace.id);
  const activeActorId = workspaceActorId(record.userId);

  return {
    context: {
      workspaceId: activeWorkspaceId,
      actorId: activeActorId,
    },
    membership: {
      workspaceId: activeWorkspaceId,
      userId: activeActorId,
      role: record.role,
      isActive: record.isActive,
      grantedPermissions,
    },
    workspace: {
      id: record.workspace.id,
      slug: record.workspace.slug,
    },
    featureFlags: Object.freeze(flags),
  };
}

export async function resolveDashboardAuthorization(input: {
  userId: string;
  permission: Permission;
  env?: EnvironmentMap;
}): Promise<DashboardAuthorizationResolution> {
  if (!isSecurityPersistenceMasterEnabled(input.env)) {
    return { mode: "LEGACY", securityContext: null };
  }

  const securityContext = await loadPersistedWorkspaceSecurityContext(input.userId);
  if (!securityContext) {
    throw new SecurityPersistenceConfigurationError(
      "No active EngageOS workspace membership exists for the dashboard user.",
    );
  }

  if (!securityContext.featureFlags[SECURITY_FEATURE_FLAGS.routePermissions]) {
    return { mode: "LEGACY", securityContext };
  }

  assertPermission(
    securityContext.context,
    securityContext.membership,
    input.permission,
  );

  return { mode: "ENGAGEOS", securityContext };
}

export type TenantPlanLimits = {
  maxSeats: number;
  maxConnections: number;
  maxMonthlyOutbound: number;
  publicApiEnabled: boolean;
  whiteLabelEnabled: boolean;
};

export type TenantUsage = {
  seats: number;
  connections: number;
  monthlyOutbound: number;
};

export type TenantPlanKey =
  | "internal"
  | "starter"
  | "growth"
  | "enterprise";

export type BillingCadence =
  | "MONTHLY";

export type TenantPlanDefinition = {
  key: TenantPlanKey;
  displayName: string;
  billingCadence: BillingCadence;
  limits: TenantPlanLimits;
};

export const TENANT_PLAN_CATALOG:
  Record<
    TenantPlanKey,
    TenantPlanDefinition
  > = {
    internal: {
      key: "internal",
      displayName: "Internal",
      billingCadence: "MONTHLY",
      limits: {
        maxSeats: 1000,
        maxConnections: 100,
        maxMonthlyOutbound: 1_000_000,
        publicApiEnabled: true,
        whiteLabelEnabled: true,
      },
    },

    starter: {
      key: "starter",
      displayName: "Starter",
      billingCadence: "MONTHLY",
      limits: {
        maxSeats: 3,
        maxConnections: 2,
        maxMonthlyOutbound: 5_000,
        publicApiEnabled: false,
        whiteLabelEnabled: false,
      },
    },

    growth: {
      key: "growth",
      displayName: "Growth",
      billingCadence: "MONTHLY",
      limits: {
        maxSeats: 10,
        maxConnections: 5,
        maxMonthlyOutbound: 25_000,
        publicApiEnabled: true,
        whiteLabelEnabled: false,
      },
    },

    enterprise: {
      key: "enterprise",
      displayName: "Enterprise",
      billingCadence: "MONTHLY",
      limits: {
        maxSeats: 100,
        maxConnections: 50,
        maxMonthlyOutbound: 250_000,
        publicApiEnabled: true,
        whiteLabelEnabled: true,
      },
    },
  };

export type PlanLimitKey =
  keyof Pick<
    TenantPlanLimits,
    | "maxSeats"
    | "maxConnections"
    | "maxMonthlyOutbound"
  >;

function assertNonNegativeInteger(
  value: number,
  label: string,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${label} must be a non-negative integer.`,
    );
  }
}

export function isTenantPlanKey(
  value: string,
): value is TenantPlanKey {
  return Object.prototype
    .hasOwnProperty.call(
      TENANT_PLAN_CATALOG,
      value,
    );
}

export function getTenantPlanDefinition(
  planKey: string,
): TenantPlanDefinition {
  const normalized =
    planKey.trim().toLowerCase();

  if (
    !isTenantPlanKey(
      normalized,
    )
  ) {
    throw new Error(
      `Unknown tenant plan: ${planKey}`,
    );
  }

  const definition =
    TENANT_PLAN_CATALOG[
      normalized
    ];

  return {
    ...definition,

    limits: {
      ...definition.limits,
    },
  };
}

export function assertUsageWithinPlan(
  limits: TenantPlanLimits,
  usage: TenantUsage,
): void {
  assertNonNegativeInteger(
    limits.maxSeats,
    "Seat limit",
  );

  assertNonNegativeInteger(
    limits.maxConnections,
    "Connection limit",
  );

  assertNonNegativeInteger(
    limits.maxMonthlyOutbound,
    "Monthly outbound limit",
  );

  assertNonNegativeInteger(
    usage.seats,
    "Seat usage",
  );

  assertNonNegativeInteger(
    usage.connections,
    "Connection usage",
  );

  assertNonNegativeInteger(
    usage.monthlyOutbound,
    "Monthly outbound usage",
  );

  if (
    usage.seats >
    limits.maxSeats
  ) {
    throw new Error(
      "Seat limit exceeded.",
    );
  }

  if (
    usage.connections >
    limits.maxConnections
  ) {
    throw new Error(
      "Connection limit exceeded.",
    );
  }

  if (
    usage.monthlyOutbound >
    limits.maxMonthlyOutbound
  ) {
    throw new Error(
      "Monthly outbound limit exceeded.",
    );
  }
}

export function assertTenantScope(
  activeWorkspaceId: string,
  resourceWorkspaceId: string,
): void {
  if (
    !activeWorkspaceId.trim() ||
    !resourceWorkspaceId.trim()
  ) {
    throw new Error(
      "Workspace scope is required.",
    );
  }

  if (
    activeWorkspaceId !==
    resourceWorkspaceId
  ) {
    throw new Error(
      "Cross-tenant access denied.",
    );
  }
}

export type PublicApiScope =
  | "conversations.read"
  | "contacts.read"
  | "contacts.write"
  | "messages.send"
  | "analytics.read"
  | "automations.trigger";

export function apiKeyAllows(
  grantedScopes:
    readonly PublicApiScope[],
  requiredScope:
    PublicApiScope,
): boolean {
  return grantedScopes.includes(
    requiredScope,
  );
}

import {
  assertTenantScope,
  assertUsageWithinPlan,
  getTenantPlanDefinition,
  type TenantPlanDefinition,
  type TenantUsage,
} from "@/modules/saas/domain/tenant-plan";

export const OUTBOUND_USAGE_METRIC =
  "messages.outbound" as const;

export type WorkspaceUsageMetric =
  typeof OUTBOUND_USAGE_METRIC;

export type UsageMetadata =
  Record<
    string,
    string | number | boolean
  >;

export type WorkspaceSaasState = {
  workspaceId: string;
  planKey: string;
  status: string;
  effectiveAt: Date;
  expiresAt: Date | null;
};

export type WorkspaceUsageEventRecord = {
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  metric: string;
  quantity: number;
  occurredAt: Date;
  metadata: unknown;
  createdAt: Date;
};

export type BillingPeriod = {
  start: Date;
  end: Date;
};

export type WorkspaceBillingProjection = {
  workspaceId: string;
  plan: TenantPlanDefinition;
  subscriptionStatus: string;
  period: BillingPeriod;
  usage: TenantUsage;

  providerAction:
    "NONE";
};

export type UsageReconciliation = {
  authoritativeTotal: number;
  projectedTotal: number;
  delta: number;
  matches: boolean;
};

export interface SaasBillingRepository {
  getSubscriptionState(
    workspaceId: string,
  ): Promise<
    WorkspaceSaasState | null
  >;

  countActiveSeats(
    workspaceId: string,
  ): Promise<number>;

  countConnections(
    workspaceId: string,
  ): Promise<number>;

  sumUsage(
    input: {
      workspaceId: string;
      metric:
        WorkspaceUsageMetric;
      start: Date;
      end: Date;
    },
  ): Promise<number>;

  recordUsageEvent(
    input: {
      workspaceId: string;
      idempotencyKey: string;
      metric:
        WorkspaceUsageMetric;
      quantity: number;
      occurredAt: Date;
      metadata?:
        UsageMetadata | null;
    },
  ): Promise<{
    created: boolean;
    event:
      WorkspaceUsageEventRecord;
  }>;
}

function requireText(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${field} is required.`,
    );
  }

  return normalized;
}

function assertValidDate(
  value: Date,
  field: string,
): void {
  if (
    !Number.isFinite(
      value.getTime(),
    )
  ) {
    throw new Error(
      `${field} is invalid.`,
    );
  }
}

function daysInUtcMonth(
  year: number,
  month: number,
): number {
  return new Date(
    Date.UTC(
      year,
      month + 1,
      0,
    ),
  ).getUTCDate();
}

function addUtcMonthsClamped(
  anchor: Date,
  offset: number,
): Date {
  const absoluteMonth =
    anchor.getUTCFullYear() *
      12 +
    anchor.getUTCMonth() +
    offset;

  const year =
    Math.floor(
      absoluteMonth / 12,
    );

  const month =
    absoluteMonth -
    year * 12;

  const day =
    Math.min(
      anchor.getUTCDate(),
      daysInUtcMonth(
        year,
        month,
      ),
    );

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

export function resolveBillingPeriod(
  input: {
    effectiveAt: Date;
    at: Date;
    expiresAt?: Date | null;
  },
): BillingPeriod {
  assertValidDate(
    input.effectiveAt,
    "effectiveAt",
  );

  assertValidDate(
    input.at,
    "at",
  );

  if (
    input.expiresAt
  ) {
    assertValidDate(
      input.expiresAt,
      "expiresAt",
    );
  }

  if (
    input.at.getTime() <
    input.effectiveAt.getTime()
  ) {
    throw new Error(
      "Billing period begins before subscription effective time.",
    );
  }

  if (
    input.expiresAt &&
    input.at.getTime() >=
      input.expiresAt.getTime()
  ) {
    throw new Error(
      "Workspace subscription has expired.",
    );
  }

  let offset =
    (
      input.at.getUTCFullYear() -
      input.effectiveAt
        .getUTCFullYear()
    ) * 12 +
    (
      input.at.getUTCMonth() -
      input.effectiveAt
        .getUTCMonth()
    );

  let start =
    addUtcMonthsClamped(
      input.effectiveAt,
      offset,
    );

  if (
    start.getTime() >
    input.at.getTime()
  ) {
    offset -= 1;

    start =
      addUtcMonthsClamped(
        input.effectiveAt,
        offset,
      );
  }

  const naturalEnd =
    addUtcMonthsClamped(
      input.effectiveAt,
      offset + 1,
    );

  const end =
    input.expiresAt &&
    input.expiresAt.getTime() <
      naturalEnd.getTime()
      ? new Date(
          input.expiresAt,
        )
      : naturalEnd;

  if (
    end.getTime() <=
    start.getTime()
  ) {
    throw new Error(
      "Billing period is invalid.",
    );
  }

  return {
    start,
    end,
  };
}

function assertSubscriptionActive(
  state:
    WorkspaceSaasState,
  at: Date,
): void {
  const status =
    state.status
      .trim()
      .toUpperCase();

  if (
    ![
      "ACTIVE",
      "TRIALING",
      "INTERNAL",
    ].includes(status)
  ) {
    throw new Error(
      "Workspace subscription is not active.",
    );
  }

  if (
    state.expiresAt &&
    at.getTime() >=
      state.expiresAt.getTime()
  ) {
    throw new Error(
      "Workspace subscription has expired.",
    );
  }
}

export function reconcileUsageTotals(
  authoritativeTotal: number,
  projectedTotal: number,
): UsageReconciliation {
  for (
    const [
      value,
      label,
    ] of [
      [
        authoritativeTotal,
        "Authoritative usage total",
      ],
      [
        projectedTotal,
        "Projected usage total",
      ],
    ] as const
  ) {
    if (
      !Number.isInteger(value) ||
      value < 0
    ) {
      throw new Error(
        `${label} must be a non-negative integer.`,
      );
    }
  }

  const delta =
    authoritativeTotal -
    projectedTotal;

  return {
    authoritativeTotal,
    projectedTotal,
    delta,
    matches:
      delta === 0,
  };
}

export async function recordOutboundUsage(
  repository:
    SaasBillingRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    idempotencyKey: string;
    quantity: number;
    occurredAt: Date;
    metadata?:
      UsageMetadata | null;
  },
) {
  const activeWorkspaceId =
    requireText(
      input.activeWorkspaceId,
      "activeWorkspaceId",
    );

  const workspaceId =
    requireText(
      input.workspaceId,
      "workspaceId",
    );

  assertTenantScope(
    activeWorkspaceId,
    workspaceId,
  );

  const idempotencyKey =
    requireText(
      input.idempotencyKey,
      "idempotencyKey",
    );

  if (
    !Number.isInteger(
      input.quantity,
    ) ||
    input.quantity <= 0
  ) {
    throw new Error(
      "Usage quantity must be a positive integer.",
    );
  }

  assertValidDate(
    input.occurredAt,
    "occurredAt",
  );

  return repository
    .recordUsageEvent({
      workspaceId,
      idempotencyKey,

      metric:
        OUTBOUND_USAGE_METRIC,

      quantity:
        input.quantity,

      occurredAt:
        input.occurredAt,

      metadata:
        input.metadata
        ?? null,
    });
}

export async function buildWorkspaceBillingProjection(
  repository:
    SaasBillingRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    at?: Date;
  },
): Promise<
  WorkspaceBillingProjection
> {
  const activeWorkspaceId =
    requireText(
      input.activeWorkspaceId,
      "activeWorkspaceId",
    );

  const workspaceId =
    requireText(
      input.workspaceId,
      "workspaceId",
    );

  assertTenantScope(
    activeWorkspaceId,
    workspaceId,
  );

  const at =
    input.at ??
    new Date();

  assertValidDate(
    at,
    "at",
  );

  const state =
    await repository
      .getSubscriptionState(
        workspaceId,
      );

  if (!state) {
    throw new Error(
      "Workspace SaaS state is missing.",
    );
  }

  assertTenantScope(
    workspaceId,
    state.workspaceId,
  );

  assertSubscriptionActive(
    state,
    at,
  );

  const plan =
    getTenantPlanDefinition(
      state.planKey,
    );

  const period =
    resolveBillingPeriod({
      effectiveAt:
        state.effectiveAt,

      expiresAt:
        state.expiresAt,

      at,
    });

  const [
    seats,
    connections,
    monthlyOutbound,
  ] = await Promise.all([
    repository
      .countActiveSeats(
        workspaceId,
      ),

    repository
      .countConnections(
        workspaceId,
      ),

    repository
      .sumUsage({
        workspaceId,

        metric:
          OUTBOUND_USAGE_METRIC,

        start:
          period.start,

        end:
          period.end,
      }),
  ]);

  const usage:
    TenantUsage = {
      seats,
      connections,
      monthlyOutbound,
    };

  return {
    workspaceId,
    plan,
    subscriptionStatus:
      state.status,

    period,
    usage,

    providerAction:
      "NONE",
  };
}

export async function authorizeWorkspacePlan(
  repository:
    SaasBillingRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    at?: Date;
  },
): Promise<
  WorkspaceBillingProjection
> {
  const projection =
    await buildWorkspaceBillingProjection(
      repository,
      input,
    );

  assertUsageWithinPlan(
    projection.plan.limits,
    projection.usage,
  );

  return projection;
}

export async function reconcileWorkspaceBilling(
  repository:
    SaasBillingRepository,
  input: {
    activeWorkspaceId: string;
    workspaceId: string;
    projectedMonthlyOutbound:
      number;
    at?: Date;
  },
): Promise<{
  projection:
    WorkspaceBillingProjection;
  reconciliation:
    UsageReconciliation;
}> {
  const projection =
    await buildWorkspaceBillingProjection(
      repository,
      input,
    );

  const reconciliation =
    reconcileUsageTotals(
      projection
        .usage
        .monthlyOutbound,

      input
        .projectedMonthlyOutbound,
    );

  return {
    projection,
    reconciliation,
  };
}

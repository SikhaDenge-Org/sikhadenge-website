import assert from "node:assert/strict";
import fs from "node:fs";

import {
  authorizeWorkspacePlan,
  buildWorkspaceBillingProjection,
  OUTBOUND_USAGE_METRIC,
  reconcileUsageTotals,
  reconcileWorkspaceBilling,
  recordOutboundUsage,
  resolveBillingPeriod,
  type SaasBillingRepository,
  type WorkspaceSaasState,
  type WorkspaceUsageEventRecord,
} from "../modules/saas/application/workspace-billing";

import {
  getTenantPlanDefinition,
} from "../modules/saas/domain/tenant-plan";

class MemoryRepository
  implements SaasBillingRepository {

  state:
    WorkspaceSaasState | null = {
      workspaceId:
        "workspace-a",

      planKey:
        "growth",

      status:
        "ACTIVE",

      effectiveAt:
        new Date(
          "2026-01-31T00:00:00.000Z",
        ),

      expiresAt: null,
    };

  seats = 4;
  connections = 2;

  events:
    WorkspaceUsageEventRecord[] = [];

  private sequence = 0;

  async getSubscriptionState(
    workspaceId: string,
  ) {
    if (
      !this.state ||
      this.state.workspaceId !==
        workspaceId
    ) {
      return null;
    }

    return {
      ...this.state,
    };
  }

  async countActiveSeats(
    workspaceId: string,
  ) {
    assert.equal(
      workspaceId,
      "workspace-a",
    );

    return this.seats;
  }

  async countConnections(
    workspaceId: string,
  ) {
    assert.equal(
      workspaceId,
      "workspace-a",
    );

    return this.connections;
  }

  async sumUsage(
    input: {
      workspaceId: string;
      metric:
        typeof OUTBOUND_USAGE_METRIC;
      start: Date;
      end: Date;
    },
  ) {
    return this.events
      .filter(
        (event) =>
          event.workspaceId ===
            input.workspaceId &&
          event.metric ===
            input.metric &&
          event.occurredAt >=
            input.start &&
          event.occurredAt <
            input.end,
      )
      .reduce(
        (
          total,
          event,
        ) =>
          total +
          event.quantity,

        0,
      );
  }

  async recordUsageEvent(
    input: {
      workspaceId: string;
      idempotencyKey: string;
      metric:
        typeof OUTBOUND_USAGE_METRIC;
      quantity: number;
      occurredAt: Date;
      metadata?:
        Record<
          string,
          string | number | boolean
        > | null;
    },
  ) {
    const existing =
      this.events.find(
        (event) =>
          event.workspaceId ===
            input.workspaceId &&
          event.idempotencyKey ===
            input.idempotencyKey,
      );

    if (existing) {
      const samePayload =
        existing.metric ===
          input.metric &&
        existing.quantity ===
          input.quantity &&
        existing.occurredAt
          .getTime() ===
          input.occurredAt
            .getTime();

      if (!samePayload) {
        throw new Error(
          "Usage idempotency key was reused with different payload.",
        );
      }

      return {
        created: false,
        event:
          existing,
      };
    }

    this.sequence += 1;

    const event:
      WorkspaceUsageEventRecord = {
        id:
          `usage-${this.sequence}`,

        workspaceId:
          input.workspaceId,

        idempotencyKey:
          input.idempotencyKey,

        metric:
          input.metric,

        quantity:
          input.quantity,

        occurredAt:
          input.occurredAt,

        metadata:
          input.metadata
          ?? null,

        createdAt:
          input.occurredAt,
      };

    this.events.push(event);

    return {
      created: true,
      event,
    };
  }
}

async function main() {
  const repository =
    new MemoryRepository();

  const growth =
    getTenantPlanDefinition(
      "growth",
    );

  assert.equal(
    growth.key,
    "growth",
  );

  assert.equal(
    growth.billingCadence,
    "MONTHLY",
  );

  assert.equal(
    growth.limits.maxSeats,
    10,
  );

  assert.throws(
    () =>
      getTenantPlanDefinition(
        "mystery",
      ),

    /Unknown tenant plan/,
  );

  // Jan-31 monthly anchor clamps correctly
  // to Feb-28 and then returns to Mar-31.
  const febPeriod =
    resolveBillingPeriod({
      effectiveAt:
        new Date(
          "2026-01-31T00:00:00.000Z",
        ),

      at:
        new Date(
          "2026-02-15T00:00:00.000Z",
        ),
    });

  assert.equal(
    febPeriod.start.toISOString(),
    "2026-01-31T00:00:00.000Z",
  );

  assert.equal(
    febPeriod.end.toISOString(),
    "2026-02-28T00:00:00.000Z",
  );

  const marchPeriod =
    resolveBillingPeriod({
      effectiveAt:
        new Date(
          "2026-01-31T00:00:00.000Z",
        ),

      at:
        new Date(
          "2026-03-15T00:00:00.000Z",
        ),
    });

  assert.equal(
    marchPeriod.start.toISOString(),
    "2026-02-28T00:00:00.000Z",
  );

  assert.equal(
    marchPeriod.end.toISOString(),
    "2026-03-31T00:00:00.000Z",
  );

  const eventOne =
    await recordOutboundUsage(
      repository,
      {
        activeWorkspaceId:
          "workspace-a",

        workspaceId:
          "workspace-a",

        idempotencyKey:
          "msg-100",

        quantity: 100,

        occurredAt:
          new Date(
            "2026-03-01T10:00:00.000Z",
          ),

        metadata: {
          source:
            "unit-test",
        },
      },
    );

  assert.equal(
    eventOne.created,
    true,
  );

  const duplicate =
    await recordOutboundUsage(
      repository,
      {
        activeWorkspaceId:
          "workspace-a",

        workspaceId:
          "workspace-a",

        idempotencyKey:
          "msg-100",

        quantity: 100,

        occurredAt:
          new Date(
            "2026-03-01T10:00:00.000Z",
          ),
      },
    );

  assert.equal(
    duplicate.created,
    false,
  );

  await assert.rejects(
    () =>
      recordOutboundUsage(
        repository,
        {
          activeWorkspaceId:
            "workspace-a",

          workspaceId:
            "workspace-a",

          idempotencyKey:
            "msg-100",

          quantity: 101,

          occurredAt:
            new Date(
              "2026-03-01T10:00:00.000Z",
            ),
        },
      ),

    /reused with different payload/,
  );

  await recordOutboundUsage(
    repository,
    {
      activeWorkspaceId:
        "workspace-a",

      workspaceId:
        "workspace-a",

      idempotencyKey:
        "msg-50",

      quantity: 50,

      occurredAt:
        new Date(
          "2026-03-10T10:00:00.000Z",
        ),
    },
  );

  const projection =
    await authorizeWorkspacePlan(
      repository,
      {
        activeWorkspaceId:
          "workspace-a",

        workspaceId:
          "workspace-a",

        at:
          new Date(
            "2026-03-15T00:00:00.000Z",
          ),
      },
    );

  assert.deepEqual(
    projection.usage,
    {
      seats: 4,
      connections: 2,
      monthlyOutbound: 150,
    },
  );

  assert.equal(
    projection.plan.key,
    "growth",
  );

  assert.equal(
    projection.providerAction,
    "NONE",
  );

  assert.equal(
    projection.period.start
      .toISOString(),
    "2026-02-28T00:00:00.000Z",
  );

  assert.equal(
    projection.period.end
      .toISOString(),
    "2026-03-31T00:00:00.000Z",
  );

  const reconciliation =
    await reconcileWorkspaceBilling(
      repository,
      {
        activeWorkspaceId:
          "workspace-a",

        workspaceId:
          "workspace-a",

        projectedMonthlyOutbound:
          150,

        at:
          new Date(
            "2026-03-15T00:00:00.000Z",
          ),
      },
    );

  assert.equal(
    reconciliation
      .reconciliation
      .matches,
    true,
  );

  assert.equal(
    reconciliation
      .reconciliation
      .delta,
    0,
  );

  assert.deepEqual(
    reconcileUsageTotals(
      150,
      149,
    ),
    {
      authoritativeTotal: 150,
      projectedTotal: 149,
      delta: 1,
      matches: false,
    },
  );

  await assert.rejects(
    () =>
      buildWorkspaceBillingProjection(
        repository,
        {
          activeWorkspaceId:
            "workspace-b",

          workspaceId:
            "workspace-a",

          at:
            new Date(
              "2026-03-15T00:00:00.000Z",
            ),
        },
      ),

    /Cross-tenant access denied/,
  );

  repository.state = {
    ...repository.state!,
    planKey:
      "starter",
  };

  repository.seats = 4;

  await assert.rejects(
    () =>
      authorizeWorkspacePlan(
        repository,
        {
          activeWorkspaceId:
            "workspace-a",

          workspaceId:
            "workspace-a",

          at:
            new Date(
              "2026-03-15T00:00:00.000Z",
            ),
        },
      ),

    /Seat limit exceeded/,
  );

  repository.state = {
    ...repository.state!,
    planKey:
      "growth",
    status:
      "CANCELED",
  };

  await assert.rejects(
    () =>
      buildWorkspaceBillingProjection(
        repository,
        {
          activeWorkspaceId:
            "workspace-a",

          workspaceId:
            "workspace-a",

          at:
            new Date(
              "2026-03-15T00:00:00.000Z",
            ),
        },
      ),

    /subscription is not active/,
  );

  repository.state = {
    ...repository.state!,
    status:
      "ACTIVE",
    planKey:
      "mystery",
  };

  await assert.rejects(
    () =>
      buildWorkspaceBillingProjection(
        repository,
        {
          activeWorkspaceId:
            "workspace-a",

          workspaceId:
            "workspace-a",

          at:
            new Date(
              "2026-03-15T00:00:00.000Z",
            ),
        },
      ),

    /Unknown tenant plan/,
  );

  const adapter =
    fs.readFileSync(
      "modules/saas/infrastructure/prisma-saas-billing-repository.ts",
      "utf8",
    );

  assert.match(
    adapter,
    /engageWorkspaceMembership/,
  );

  assert.match(
    adapter,
    /engageChannelConnection/,
  );

  assert.match(
    adapter,
    /engageWorkspaceUsageEvent/,
  );

  assert.match(
    adapter,
    /_sum/,
  );

  assert.match(
    adapter,
    /P2002/,
  );

  const service =
    fs.readFileSync(
      "modules/saas/application/workspace-billing.ts",
      "utf8",
    );

  assert.doesNotMatch(
    service,
    /stripe|razorpay|paypal/i,
  );

  assert.doesNotMatch(
    adapter,
    /stripe|razorpay|paypal/i,
  );

  console.log(
    "EngageOS Phase 16C billing runtime: PASS",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

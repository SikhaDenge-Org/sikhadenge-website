import {
  Prisma,
  type EngageWorkspaceSaasState,
  type EngageWorkspaceUsageEvent,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/db/prisma";

import type {
  SaasBillingRepository,
  WorkspaceSaasState,
  WorkspaceUsageEventRecord,
} from "@/modules/saas/application/workspace-billing";

function mapSaasState(
  row:
    EngageWorkspaceSaasState,
): WorkspaceSaasState {
  return {
    workspaceId:
      row.workspaceId,

    planKey:
      row.planKey,

    status:
      row.status,

    effectiveAt:
      row.effectiveAt,

    expiresAt:
      row.expiresAt,
  };
}

function mapUsageEvent(
  row:
    EngageWorkspaceUsageEvent,
): WorkspaceUsageEventRecord {
  return {
    id:
      row.id,

    workspaceId:
      row.workspaceId,

    idempotencyKey:
      row.idempotencyKey,

    metric:
      row.metric,

    quantity:
      row.quantity,

    occurredAt:
      row.occurredAt,

    metadata:
      row.metadata,

    createdAt:
      row.createdAt,
  };
}

export const prismaSaasBillingRepository:
  SaasBillingRepository = {

  async getSubscriptionState(
    workspaceId,
  ) {
    const row =
      await prisma
        .engageWorkspaceSaasState
        .findUnique({
          where: {
            workspaceId,
          },
        });

    return row
      ? mapSaasState(row)
      : null;
  },

  async countActiveSeats(
    workspaceId,
  ) {
    return prisma
      .engageWorkspaceMembership
      .count({
        where: {
          workspaceId,
          isActive: true,
        },
      });
  },

  async countConnections(
    workspaceId,
  ) {
    // All persisted workspace connections
    // consume plan capacity, including pending
    // connections. This fails closed instead
    // of allowing unbounded pre-activation rows.
    return prisma
      .engageChannelConnection
      .count({
        where: {
          workspaceId,
        },
      });
  },

  async sumUsage(
    input,
  ) {
    const aggregate =
      await prisma
        .engageWorkspaceUsageEvent
        .aggregate({
          where: {
            workspaceId:
              input.workspaceId,

            metric:
              input.metric,

            occurredAt: {
              gte:
                input.start,

              lt:
                input.end,
            },
          },

          _sum: {
            quantity: true,
          },
        });

    return (
      aggregate
        ._sum
        .quantity ??
      0
    );
  },

  async recordUsageEvent(
    input,
  ) {
    try {
      const created =
        await prisma
          .engageWorkspaceUsageEvent
          .create({
            data: {
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

              ...(input.metadata
                ? {
                    metadata:
                      input.metadata as
                        Prisma.InputJsonObject,
                  }
                : {}),
            },
          });

      return {
        created: true,
        event:
          mapUsageEvent(
            created,
          ),
      };
    } catch (error) {
      if (
        !(
          error instanceof
          Prisma.PrismaClientKnownRequestError
        ) ||
        error.code !== "P2002"
      ) {
        throw error;
      }

      const existing =
        await prisma
          .engageWorkspaceUsageEvent
          .findUnique({
            where: {
              workspaceId_idempotencyKey: {
                workspaceId:
                  input.workspaceId,

                idempotencyKey:
                  input.idempotencyKey,
              },
            },
          });

      if (!existing) {
        throw new Error(
          "Usage idempotency conflict could not be resolved.",
        );
      }

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
          mapUsageEvent(
            existing,
          ),
      };
    }
  },
};

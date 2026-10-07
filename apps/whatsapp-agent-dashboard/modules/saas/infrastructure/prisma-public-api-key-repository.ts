import {
  Prisma,
  type EngagePublicApiKey,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/db/prisma";

import {
  PUBLIC_API_SCOPES,
  type DeveloperDecisionWrite,
  type FixedWindowConsumeInput,
  type PublicApiKeyRepository,
  type SafeMetadata,
  type SecurityAuditWrite,
  type StoredPublicApiKey,
} from "@/modules/saas/application/public-api-key-service";

import type {
  PublicApiScope,
} from "@/modules/saas/domain/tenant-plan";

function parseScopes(
  value: Prisma.JsonValue,
): PublicApiScope[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Stored API-key scopes are invalid.",
    );
  }

  const allowed =
    new Set<string>(
      PUBLIC_API_SCOPES,
    );

  const result:
    PublicApiScope[] = [];

  for (const item of value) {
    if (
      typeof item !== "string" ||
      !allowed.has(item)
    ) {
      throw new Error(
        "Stored API-key scope is invalid.",
      );
    }

    result.push(
      item as PublicApiScope,
    );
  }

  if (result.length === 0) {
    throw new Error(
      "Stored API-key scope set is empty.",
    );
  }

  return [
    ...new Set(result),
  ];
}

function mapKey(
  row: EngagePublicApiKey,
): StoredPublicApiKey {
  return {
    id: row.id,
    workspaceId:
      row.workspaceId,
    name:
      row.name,
    prefix:
      row.prefix,
    sha256:
      row.sha256,
    scopes:
      parseScopes(
        row.scopes,
      ),
    revokedAt:
      row.revokedAt,
    expiresAt:
      row.expiresAt,
    lastUsedAt:
      row.lastUsedAt,
    createdAt:
      row.createdAt,
    updatedAt:
      row.updatedAt,
  };
}

function metadataValue(
  metadata:
    SafeMetadata |
    null |
    undefined,
):
  Prisma.InputJsonObject |
  undefined {
  if (!metadata) {
    return undefined;
  }

  return metadata as
    Prisma.InputJsonObject;
}

function auditData(
  audit:
    SecurityAuditWrite,
):
  Prisma.EngageSecurityAuditEventUncheckedCreateInput {
  const data:
    Prisma.EngageSecurityAuditEventUncheckedCreateInput = {
      workspaceId:
        audit.workspaceId,

      actorId:
        audit.actorId
        ?? null,

      action:
        audit.action,

      outcome:
        audit.outcome,

      entityType:
        audit.entityType,

      entityId:
        audit.entityId
        ?? null,

      reasonCode:
        audit.reasonCode
        ?? null,

      requestId:
        audit.requestId
        ?? null,

      correlationId:
        audit.correlationId
        ?? null,

      occurredAt:
        audit.occurredAt,
    };

  const metadata =
    metadataValue(
      audit.metadata,
    );

  if (metadata) {
    data.metadata =
      metadata;
  }

  return data;
}

async function writeAudit(
  tx:
    Prisma.TransactionClient,
  audit:
    SecurityAuditWrite,
): Promise<void> {
  await tx
    .engageSecurityAuditEvent
    .create({
      data:
        auditData(audit),
    });
}

function developerLogData(
  input:
    DeveloperDecisionWrite,
):
  Prisma.EngageDeveloperRequestLogUncheckedCreateInput {
  return {
    workspaceId:
      input.workspaceId,

    apiKeyWorkspaceId:
      input.apiKeyId
        ? input.workspaceId
        : null,

    apiKeyId:
      input.apiKeyId
      ?? null,

    requestId:
      input.requestId,

    method:
      input.method,

    path:
      input.path,

    statusCode:
      input.statusCode,

    rateLimitDecision:
      input.rateLimitDecision,

    ipHash:
      input.ipHash
      ?? null,

    userAgentHash:
      input.userAgentHash
      ?? null,

    metadata: {
      allowed:
        input.allowed,

      reasonCode:
        input.reasonCode,

      requiredScope:
        input.requiredScope,
    },

    occurredAt:
      input.occurredAt,
  };
}

function authenticationAudit(
  input:
    DeveloperDecisionWrite,
): SecurityAuditWrite {
  return {
    workspaceId:
      input.workspaceId,

    action:
      "public-api.authenticate",

    actorId:
      input.apiKeyId
      ?? null,

    entityType:
      "PUBLIC_API_KEY",

    entityId:
      input.apiKeyId
      ?? null,

    outcome:
      input.allowed
        ? "ALLOWED"
        : "DENIED",

    reasonCode:
      input.reasonCode,

    requestId:
      input.requestId,

    correlationId:
      input.requestId,

    metadata: {
      method:
        input.method,

      path:
        input.path,

      statusCode:
        input.statusCode,

      requiredScope:
        input.requiredScope,

      rateLimitDecision:
        input.rateLimitDecision,
    },

    occurredAt:
      input.occurredAt,
  };
}

async function writeDecision(
  tx:
    Prisma.TransactionClient,
  input:
    DeveloperDecisionWrite,
): Promise<void> {
  await tx
    .engageDeveloperRequestLog
    .create({
      data:
        developerLogData(
          input,
        ),
    });

  await writeAudit(
    tx,
    authenticationAudit(
      input,
    ),
  );
}

export const prismaPublicApiKeyRepository:
  PublicApiKeyRepository = {

  async createApiKey(
    input,
    audit,
  ) {
    return prisma.$transaction(
      async (tx) => {
        const row =
          await tx
            .engagePublicApiKey
            .create({
              data: {
                workspaceId:
                  input.workspaceId,

                name:
                  input.name,

                prefix:
                  input.prefix,

                sha256:
                  input.sha256,

                scopes: [
                  ...input.scopes,
                ],

                expiresAt:
                  input.expiresAt,

                createdAt:
                  input.createdAt,
              },
            });

        await writeAudit(
          tx,
          {
            ...audit,
            entityId:
              row.id,
          },
        );

        return mapKey(row);
      },
    );
  },

  async listApiKeys(
    workspaceId,
  ) {
    const rows =
      await prisma
        .engagePublicApiKey
        .findMany({
          where: {
            workspaceId,
          },

          orderBy: {
            createdAt:
              "desc",
          },
        });

    return rows.map(mapKey);
  },

  async findApiKeyBySha256(
    sha256,
  ) {
    const row =
      await prisma
        .engagePublicApiKey
        .findUnique({
          where: {
            sha256,
          },
        });

    return row
      ? mapKey(row)
      : null;
  },

  async revokeApiKey(
    input,
    audit,
  ) {
    return prisma.$transaction(
      async (tx) => {
        const existing =
          await tx
            .engagePublicApiKey
            .findFirst({
              where: {
                id:
                  input.keyId,

                workspaceId:
                  input.workspaceId,
              },
            });

        if (!existing) {
          return null;
        }

        const row =
          existing.revokedAt
            ? existing
            : await tx
                .engagePublicApiKey
                .update({
                  where: {
                    id:
                      existing.id,
                  },

                  data: {
                    revokedAt:
                      input.revokedAt,
                  },
                });

        await writeAudit(
          tx,
          {
            ...audit,
            entityId:
              row.id,
          },
        );

        return mapKey(row);
      },
    );
  },

  async recordDeniedDecision(
    input,
  ) {
    await prisma.$transaction(
      async (tx) => {
        await writeDecision(
          tx,
          input,
        );
      },
    );
  },

  async consumeFixedWindow(
    input:
      FixedWindowConsumeInput,
  ) {
    if (
      !Number.isInteger(
        input.windowLimit,
      ) ||
      input.windowLimit < 1
    ) {
      throw new Error(
        "Rate-limit value is invalid.",
      );
    }

    return prisma.$transaction(
      async (tx) => {
        const lockKey =
          [
            "engageos",
            "public-api",
            input.workspaceId,
            input.apiKeyId,
            input.windowStart
              .getTime(),
          ].join(":");

        await tx.$queryRaw`
          SELECT
            pg_advisory_xact_lock(
              hashtextextended(
                ${lockKey},
                0
              )
            )
        `;

        const used =
          await tx
            .engageDeveloperRequestLog
            .count({
              where: {
                workspaceId:
                  input.workspaceId,

                apiKeyWorkspaceId:
                  input.workspaceId,

                apiKeyId:
                  input.apiKeyId,

                rateLimitDecision:
                  "ALLOWED",

                occurredAt: {
                  gte:
                    input.windowStart,

                  lt:
                    input.windowEnd,
                },
              },
            });

        if (
          used >=
          input.windowLimit
        ) {
          await writeDecision(
            tx,
            {
              workspaceId:
                input.workspaceId,

              apiKeyId:
                input.apiKeyId,

              requestId:
                input.requestId,

              method:
                input.method,

              path:
                input.path,

              statusCode: 429,

              rateLimitDecision:
                "DENIED_RATE_LIMIT",

              ipHash:
                input.ipHash
                ?? null,

              userAgentHash:
                input.userAgentHash
                ?? null,

              allowed: false,

              reasonCode:
                "RATE_LIMIT_EXCEEDED",

              requiredScope:
                input.requiredScope,

              occurredAt:
                input.occurredAt,
            },
          );

          return {
            allowed: false,
            remainingInWindow: 0,
          };
        }

        await writeDecision(
          tx,
          {
            workspaceId:
              input.workspaceId,

            apiKeyId:
              input.apiKeyId,

            requestId:
              input.requestId,

            method:
              input.method,

            path:
              input.path,

            statusCode: 200,

            rateLimitDecision:
              "ALLOWED",

            ipHash:
              input.ipHash
              ?? null,

            userAgentHash:
              input.userAgentHash
              ?? null,

            allowed: true,

            reasonCode:
              "AUTHORIZED",

            requiredScope:
              input.requiredScope,

            occurredAt:
              input.occurredAt,
          },
        );

        await tx
          .engagePublicApiKey
          .updateMany({
            where: {
              id:
                input.apiKeyId,

              workspaceId:
                input.workspaceId,

              revokedAt: null,
            },

            data: {
              lastUsedAt:
                input.occurredAt,
            },
          });

        return {
          allowed: true,

          remainingInWindow:
            Math.max(
              0,
              input.windowLimit -
                used -
                1,
            ),
        };
      },
    );
  },
};

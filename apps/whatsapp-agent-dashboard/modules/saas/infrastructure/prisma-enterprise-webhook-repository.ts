import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/db/prisma";
import type {
  EnterpriseWebhookRepository,
  OutboundWebhookStatus,
  SafeWebhookMetadata,
  StoredOutboundWebhookEndpoint,
  WebhookSecurityAuditWrite,
} from "@/modules/saas/application/enterprise-webhook-service";
import {
  WEBHOOK_SECRET_ALGORITHM,
} from "@/modules/saas/infrastructure/webhook-secret-crypto";

type WebhookRow = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  events: Prisma.JsonValue;
  status: string;
  algorithm: string;
  keyVersion: string;
  initializationVector: string;
  authenticationTag: string;
  ciphertext: string;
  pausedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseStatus(
  value: string,
): OutboundWebhookStatus {
  if (
    value !== "ACTIVE" &&
    value !== "PAUSED" &&
    value !== "REVOKED"
  ) {
    throw new Error(
      "Stored webhook endpoint status is invalid.",
    );
  }

  return value;
}

function parseEvents(
  value: Prisma.JsonValue,
): string[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (event) =>
        typeof event !== "string",
    )
  ) {
    throw new Error(
      "Stored webhook events are invalid.",
    );
  }

  return value as string[];
}

function mapRow(
  row: WebhookRow,
): StoredOutboundWebhookEndpoint {
  if (
    row.algorithm !==
      WEBHOOK_SECRET_ALGORITHM
  ) {
    throw new Error(
      "Stored webhook encryption algorithm is invalid.",
    );
  }

  return {
    id:
      row.id,
    workspaceId:
      row.workspaceId,
    name:
      row.name,
    url:
      row.url,
    events:
      parseEvents(row.events),
    status:
      parseStatus(row.status),
    keyVersion:
      row.keyVersion,
    pausedAt:
      row.pausedAt,
    revokedAt:
      row.revokedAt,
    createdAt:
      row.createdAt,
    updatedAt:
      row.updatedAt,
    encryptedSecret: {
      algorithm:
        WEBHOOK_SECRET_ALGORITHM,
      keyVersion:
        row.keyVersion,
      initializationVector:
        row.initializationVector,
      authenticationTag:
        row.authenticationTag,
      ciphertext:
        row.ciphertext,
    },
  };
}

function jsonMetadata(
  metadata:
    SafeWebhookMetadata |
    undefined,
): Prisma.InputJsonObject | undefined {
  return metadata
    ? metadata as Prisma.InputJsonObject
    : undefined;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  audit: WebhookSecurityAuditWrite,
  entityId: string,
): Promise<void> {
  const data:
    Prisma.EngageSecurityAuditEventUncheckedCreateInput = {
      workspaceId:
        audit.workspaceId,
      actorId:
        audit.actorId ?? null,
      action:
        audit.action,
      outcome:
        audit.outcome,
      entityType:
        "OUTBOUND_WEBHOOK_ENDPOINT",
      entityId,
      reasonCode:
        audit.reasonCode ?? null,
      requestId:
        audit.requestId ?? null,
      correlationId:
        audit.requestId ?? null,
      occurredAt:
        audit.occurredAt,
    };

  const metadata =
    jsonMetadata(
      audit.metadata,
    );

  if (metadata) {
    data.metadata = metadata;
  }

  await tx
    .engageSecurityAuditEvent
    .create({ data });
}

async function selectOne(
  client:
    Prisma.TransactionClient |
    typeof prisma,
  workspaceId: string,
  endpointId: string,
): Promise<WebhookRow | null> {
  const rows =
    await client.$queryRaw<WebhookRow[]>(
      Prisma.sql`
        SELECT
          "id",
          "workspaceId",
          "name",
          "url",
          "events",
          "status",
          "algorithm",
          "keyVersion",
          "initializationVector",
          "authenticationTag",
          "ciphertext",
          "pausedAt",
          "revokedAt",
          "createdAt",
          "updatedAt"
        FROM "EngageOutboundWebhookEndpoint"
        WHERE
          "workspaceId" = ${workspaceId}
          AND "id" = ${endpointId}
        LIMIT 1
      `,
    );

  return rows[0] ?? null;
}

export const prismaEnterpriseWebhookRepository:
  EnterpriseWebhookRepository = {

  async createEndpoint(
    input,
    audit,
  ) {
    return prisma.$transaction(
      async (tx) => {
        const events =
          JSON.stringify(input.events);

        await tx.$executeRaw(
          Prisma.sql`
            INSERT INTO "EngageOutboundWebhookEndpoint" (
              "id",
              "workspaceId",
              "name",
              "url",
              "events",
              "status",
              "algorithm",
              "keyVersion",
              "initializationVector",
              "authenticationTag",
              "ciphertext",
              "createdAt",
              "updatedAt"
            ) VALUES (
              ${input.id},
              ${input.workspaceId},
              ${input.name},
              ${input.url},
              CAST(${events} AS jsonb),
              'ACTIVE',
              ${input.encryptedSecret.algorithm},
              ${input.encryptedSecret.keyVersion},
              ${input.encryptedSecret.initializationVector},
              ${input.encryptedSecret.authenticationTag},
              ${input.encryptedSecret.ciphertext},
              ${input.createdAt},
              ${input.createdAt}
            )
          `,
        );

        const row =
          await selectOne(
            tx,
            input.workspaceId,
            input.id,
          );

        if (!row) {
          throw new Error(
            "Webhook endpoint persistence failed.",
          );
        }

        await writeAudit(
          tx,
          audit,
          row.id,
        );

        return mapRow(row);
      },
    );
  },

  async listEndpoints(
    workspaceId,
  ) {
    const rows =
      await prisma.$queryRaw<WebhookRow[]>(
        Prisma.sql`
          SELECT
            "id",
            "workspaceId",
            "name",
            "url",
            "events",
            "status",
            "algorithm",
            "keyVersion",
            "initializationVector",
            "authenticationTag",
            "ciphertext",
            "pausedAt",
            "revokedAt",
            "createdAt",
            "updatedAt"
          FROM "EngageOutboundWebhookEndpoint"
          WHERE "workspaceId" = ${workspaceId}
          ORDER BY "createdAt" DESC
        `,
      );

    return rows.map(mapRow);
  },

  async findEndpoint(
    workspaceId,
    endpointId,
  ) {
    const row =
      await selectOne(
        prisma,
        workspaceId,
        endpointId,
      );

    return row
      ? mapRow(row)
      : null;
  },

  async setEndpointStatus(
    input,
    audit,
  ) {
    return prisma.$transaction(
      async (tx) => {
        const existing =
          await selectOne(
            tx,
            input.workspaceId,
            input.endpointId,
          );

        if (!existing) {
          return null;
        }

        if (
          existing.status === "REVOKED" &&
          input.status !== "REVOKED"
        ) {
          throw new Error(
            "Revoked webhook endpoints cannot be reactivated.",
          );
        }

        await tx.$executeRaw(
          Prisma.sql`
            UPDATE "EngageOutboundWebhookEndpoint"
            SET
              "status" = ${input.status},
              "pausedAt" = CASE
                WHEN ${input.status} = 'PAUSED'
                THEN ${input.changedAt}
                ELSE "pausedAt"
              END,
              "revokedAt" = CASE
                WHEN ${input.status} = 'REVOKED'
                THEN ${input.changedAt}
                ELSE "revokedAt"
              END,
              "updatedAt" = ${input.changedAt}
            WHERE
              "workspaceId" = ${input.workspaceId}
              AND "id" = ${input.endpointId}
          `,
        );

        const row =
          await selectOne(
            tx,
            input.workspaceId,
            input.endpointId,
          );

        if (!row) {
          throw new Error(
            "Webhook endpoint state update failed.",
          );
        }

        await writeAudit(
          tx,
          audit,
          row.id,
        );

        return mapRow(row);
      },
    );
  },

  async recordDeveloperLog(
    input,
  ) {
    await prisma
      .engageDeveloperRequestLog
      .create({
        data: {
          workspaceId:
            input.workspaceId,
          apiKeyWorkspaceId:
            null,
          apiKeyId:
            null,
          requestId:
            input.requestId,
          method:
            input.method,
          path:
            input.path,
          statusCode:
            input.statusCode,
          rateLimitDecision:
            input.decision,
          metadata: {
            endpointId:
              input.endpointId ?? null,
            ...(input.metadata ?? {}),
          },
          occurredAt:
            input.occurredAt,
        },
      });
  },
};

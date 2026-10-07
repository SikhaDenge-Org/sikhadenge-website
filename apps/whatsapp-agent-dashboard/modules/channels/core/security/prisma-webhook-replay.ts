import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import {
  channelConnectionId,
  type ChannelType,
} from "@/modules/channels/core/contracts/channel";
import {
  isSecurityPersistenceMasterEnabled,
  SECURITY_FEATURE_FLAGS,
  type EnvironmentMap,
} from "@/modules/auth/infrastructure/prisma-authorization";
import { webhookReplayKey } from "@/modules/channels/core/security/webhook-security";
import { prisma } from "@/lib/db/prisma";

export type WebhookReplayReservation = {
  enforced: boolean;
  duplicate: boolean;
  reservationId?: string;
  replayKey?: string;
};

export class WebhookReplayConfigurationError extends Error {
  readonly code = "WEBHOOK_REPLAY_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "WebhookReplayConfigurationError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function deriveWebhookExternalEventId(rawBody: string): string {
  return `payload-sha256:${sha256(rawBody)}`;
}

async function resolveReplayConnection(channel: ChannelType): Promise<{
  id: string;
  workspaceId: string;
} | null> {
  const enabledWorkspaces = await prisma.engageWorkspace.findMany({
    where: {
      isActive: true,
      featureFlags: {
        some: {
          key: SECURITY_FEATURE_FLAGS.webhookReplay,
          enabled: true,
        },
      },
    },
    select: {
      id: true,
      connections: {
        where: {
          channel,
          status: { in: ["CONNECTED", "DEGRADED"] },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 2,
        select: {
          id: true,
          workspaceId: true,
        },
      },
    },
    take: 2,
  });

  if (enabledWorkspaces.length === 0) return null;

  const candidates = enabledWorkspaces.flatMap(
    (workspace) => workspace.connections,
  );
  if (candidates.length === 0) {
    throw new WebhookReplayConfigurationError(
      `Replay protection is enabled but no active ${channel} connection is configured.`,
    );
  }
  if (enabledWorkspaces.length > 1 || candidates.length > 1) {
    throw new WebhookReplayConfigurationError(
      `Replay protection requires one unambiguous active ${channel} connection.`,
    );
  }

  return candidates[0] ?? null;
}

export async function reservePersistedWebhookReplay(input: {
  channel: ChannelType;
  rawBody: string;
  signatureHeader?: string | null;
  externalEventId?: string | null;
  now?: Date;
  ttlSeconds?: number;
  env?: EnvironmentMap;
}): Promise<WebhookReplayReservation> {
  if (!isSecurityPersistenceMasterEnabled(input.env)) {
    return { enforced: false, duplicate: false };
  }

  const connection = await resolveReplayConnection(input.channel);
  if (!connection) {
    return { enforced: false, duplicate: false };
  }

  const now = input.now ?? new Date();
  const ttlSeconds = Math.max(60, input.ttlSeconds ?? 86_400);
  const externalEventId =
    input.externalEventId?.trim() || deriveWebhookExternalEventId(input.rawBody);
  const replayKey = webhookReplayKey({
    connectionId: channelConnectionId(connection.id),
    externalEventId,
  });

  try {
    const reservation = await prisma.engageWebhookReplayRecord.create({
      data: {
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        replayKey,
        signatureDigest: sha256(input.signatureHeader || input.rawBody),
        receivedAt: now,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1_000),
      },
      select: { id: true },
    });

    return {
      enforced: true,
      duplicate: false,
      reservationId: reservation.id,
      replayKey,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { enforced: true, duplicate: true, replayKey };
    }
    throw error;
  }
}

export async function releasePersistedWebhookReplay(
  reservation: WebhookReplayReservation,
): Promise<void> {
  if (!reservation.enforced || !reservation.reservationId) return;

  await prisma.engageWebhookReplayRecord.deleteMany({
    where: { id: reservation.reservationId },
  });
}

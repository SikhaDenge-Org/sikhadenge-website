import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type {
  EmailConnection,
  EmailConnectionStatus,
  EmailProvider,
} from "../domain/contracts";
import type { EmailConnectionRepository } from "./repositories";

const EMAIL_PROVIDER_KEY = "emailProvider";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function providerFromCapabilities(value: unknown): EmailProvider {
  const provider = asRecord(value)[EMAIL_PROVIDER_KEY];
  if (provider === "GOOGLE_GMAIL") return provider;
  if (provider === "MICROSOFT_365") return provider;
  if (provider === "BREVO") return provider;
  if (provider === "AMAZON_SES") return provider;
  if (provider === "RESEND") return provider;
  return "GOOGLE_GMAIL";
}

function status(value: string): EmailConnectionStatus {
  switch (value) {
    case "PENDING":
    case "CONNECTED":
    case "DEGRADED":
    case "EXPIRED":
    case "REVOKED":
    case "DISCONNECTED":
      return value;
    default:
      throw new Error(`Persisted email connection status ${value} is invalid.`);
  }
}

function capabilitiesFor(connection: EmailConnection): Prisma.InputJsonValue {
  return {
    WEBHOOK_VERIFY: false,
    INBOUND_MESSAGE: false,
    OUTBOUND_TEXT: true,
    OUTBOUND_MEDIA: true,
    DELIVERY_STATUS: true,
    READ_STATUS: false,
    COMMENT_EVENTS: false,
    PUBLIC_COMMENT_REPLY: false,
    PRIVATE_COMMENT_REPLY: false,
    STORY_REPLY: false,
    MENTION_EVENTS: false,
    [EMAIL_PROVIDER_KEY]: connection.provider,
  };
}

function mapConnection(record: {
  id: string;
  workspaceId: string;
  externalAccountId: string;
  displayName: string | null;
  status: string;
  capabilities: unknown;
  createdAt: Date;
  updatedAt: Date;
}): EmailConnection {
  const parsedStatus = status(record.status);
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    provider: providerFromCapabilities(record.capabilities),
    displayName: record.displayName ?? record.externalAccountId,
    externalAccountId: record.externalAccountId,
    status: parsedStatus,
    connectedAt: parsedStatus === "PENDING" ? null : record.createdAt,
    lastVerifiedAt: parsedStatus === "CONNECTED" ? record.updatedAt : null,
    revokedAt: parsedStatus === "REVOKED" ? record.updatedAt : null,
  };
}

export class PrismaEmailConnectionRepository implements EmailConnectionRepository {
  async getById(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<EmailConnection | null> {
    const record = await prisma.engageChannelConnection.findFirst({
      where: {
        id: input.connectionId,
        workspaceId: input.workspaceId,
        channel: "EMAIL",
      },
    });
    return record ? mapConnection(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<readonly EmailConnection[]> {
    const records = await prisma.engageChannelConnection.findMany({
      where: { workspaceId, channel: "EMAIL" },
      orderBy: { createdAt: "asc" },
    });
    return records.map(mapConnection);
  }

  async save(connection: EmailConnection): Promise<void> {
    const externalAccountId = connection.externalAccountId?.trim();
    if (!externalAccountId) {
      throw new Error("Email connection cannot be persisted without an external account id.");
    }

    await prisma.engageChannelConnection.upsert({
      where: { id: connection.id },
      create: {
        id: connection.id,
        workspaceId: connection.workspaceId,
        channel: "EMAIL",
        externalAccountId,
        displayName: connection.displayName,
        status: connection.status,
        capabilities: capabilitiesFor(connection),
      },
      update: {
        workspaceId: connection.workspaceId,
        channel: "EMAIL",
        externalAccountId,
        displayName: connection.displayName,
        status: connection.status,
        capabilities: capabilitiesFor(connection),
      },
    });
  }
}

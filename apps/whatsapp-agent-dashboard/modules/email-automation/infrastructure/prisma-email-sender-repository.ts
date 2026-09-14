import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import type {
  EmailProvider,
  EmailSenderIdentity,
  EmailSenderVerificationStatus,
} from "../domain/contracts";
import type { EmailSenderRepository } from "./repositories";

const EMAIL_METADATA_KEY = "emailAutomation";
const EMAIL_METADATA_VERSION = 1;

type StoredSender = {
  id: string;
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  replyToEmail: string | null;
  externalSenderId: string | null;
  verificationStatus: EmailSenderVerificationStatus;
  isProviderDefault: boolean;
  isWorkspaceDefault: boolean;
  isActive: boolean;
  dailyLimit: number | null;
};

type StoredEmailMetadata = {
  version: number;
  senderIdentities: StoredSender[];
};

type ConnectionRecord = {
  id: string;
  workspaceId: string;
  capabilities: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isProvider(value: unknown): value is EmailProvider {
  return (
    value === "GOOGLE_GMAIL" ||
    value === "MICROSOFT_365" ||
    value === "BREVO" ||
    value === "AMAZON_SES" ||
    value === "RESEND"
  );
}

function isVerificationStatus(value: unknown): value is EmailSenderVerificationStatus {
  return (
    value === "PENDING" ||
    value === "VERIFIED" ||
    value === "FAILED" ||
    value === "REVOKED"
  );
}

function storedSenders(value: unknown): StoredSender[] {
  const metadata = asRecord(asRecord(value)[EMAIL_METADATA_KEY]);
  if (metadata.version !== EMAIL_METADATA_VERSION || !Array.isArray(metadata.senderIdentities)) {
    return [];
  }

  return metadata.senderIdentities.flatMap((raw) => {
    const sender = asRecord(raw);
    if (
      typeof sender.id !== "string" ||
      !isProvider(sender.provider) ||
      typeof sender.fromName !== "string" ||
      typeof sender.fromEmail !== "string" ||
      !isVerificationStatus(sender.verificationStatus) ||
      typeof sender.isProviderDefault !== "boolean" ||
      typeof sender.isWorkspaceDefault !== "boolean" ||
      typeof sender.isActive !== "boolean"
    ) {
      return [];
    }

    return [
      {
        id: sender.id,
        provider: sender.provider,
        fromName: sender.fromName,
        fromEmail: sender.fromEmail,
        replyToEmail:
          typeof sender.replyToEmail === "string" ? sender.replyToEmail : null,
        externalSenderId:
          typeof sender.externalSenderId === "string" ? sender.externalSenderId : null,
        verificationStatus: sender.verificationStatus,
        isProviderDefault: sender.isProviderDefault,
        isWorkspaceDefault: sender.isWorkspaceDefault,
        isActive: sender.isActive,
        dailyLimit:
          typeof sender.dailyLimit === "number" ? sender.dailyLimit : null,
      },
    ];
  });
}

function toDomain(
  record: ConnectionRecord,
  sender: StoredSender,
): EmailSenderIdentity {
  return {
    ...sender,
    workspaceId: record.workspaceId,
    connectionId: record.id,
  };
}

function toStored(sender: EmailSenderIdentity): StoredSender {
  return {
    id: sender.id,
    provider: sender.provider,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    replyToEmail: sender.replyToEmail,
    externalSenderId: sender.externalSenderId,
    verificationStatus: sender.verificationStatus,
    isProviderDefault: sender.isProviderDefault,
    isWorkspaceDefault: sender.isWorkspaceDefault,
    isActive: sender.isActive,
    dailyLimit: sender.dailyLimit,
  };
}

function usable(sender: EmailSenderIdentity): boolean {
  return sender.isActive && sender.verificationStatus === "VERIFIED";
}

function withSenderMetadata(
  capabilities: unknown,
  senders: readonly EmailSenderIdentity[],
): Prisma.InputJsonValue {
  const root = { ...asRecord(capabilities) };
  root[EMAIL_METADATA_KEY] = {
    version: EMAIL_METADATA_VERSION,
    senderIdentities: senders.map(toStored),
  };
  return root as Prisma.InputJsonValue;
}

export class PrismaEmailSenderRepository implements EmailSenderRepository {
  async listByWorkspace(workspaceId: string): Promise<readonly EmailSenderIdentity[]> {
    const connections = await prisma.engageChannelConnection.findMany({
      where: { workspaceId, channel: "EMAIL" },
      select: { id: true, workspaceId: true, capabilities: true },
      orderBy: { createdAt: "asc" },
    });
    return connections.flatMap((record) =>
      storedSenders(record.capabilities).map((sender) => toDomain(record, sender)),
    );
  }

  async listByConnection(input: {
    workspaceId: string;
    connectionId: string;
  }): Promise<readonly EmailSenderIdentity[]> {
    const record = await prisma.engageChannelConnection.findFirst({
      where: {
        id: input.connectionId,
        workspaceId: input.workspaceId,
        channel: "EMAIL",
      },
      select: { id: true, workspaceId: true, capabilities: true },
    });
    if (!record) return [];
    return storedSenders(record.capabilities).map((sender) => toDomain(record, sender));
  }

  async replaceConnectionSenders(input: {
    workspaceId: string;
    connectionId: string;
    senders: readonly EmailSenderIdentity[];
  }): Promise<readonly EmailSenderIdentity[]> {
    if (
      input.senders.some(
        (sender) =>
          sender.workspaceId !== input.workspaceId ||
          sender.connectionId !== input.connectionId,
      )
    ) {
      throw new Error("Email sender discovery returned an identity for the wrong workspace or connection.");
    }

    const connections = await prisma.engageChannelConnection.findMany({
      where: { workspaceId: input.workspaceId, channel: "EMAIL" },
      select: { id: true, workspaceId: true, capabilities: true },
      orderBy: { createdAt: "asc" },
    });
    const current = connections.find((item) => item.id === input.connectionId);
    if (!current) throw new Error("Email connection not found for sender persistence.");

    const allExisting = connections.flatMap((record) =>
      storedSenders(record.capabilities).map((sender) => toDomain(record, sender)),
    );
    const existingDefault = allExisting.find(
      (sender) => sender.isWorkspaceDefault && usable(sender),
    );

    let desiredDefaultId: string | null = null;
    if (
      existingDefault &&
      (existingDefault.connectionId !== input.connectionId ||
        input.senders.some((sender) => sender.id === existingDefault.id && usable(sender)))
    ) {
      desiredDefaultId = existingDefault.id;
    } else {
      const replacement =
        input.senders.find((sender) => sender.isProviderDefault && usable(sender)) ??
        input.senders.find(usable) ??
        allExisting.find(
          (sender) => sender.connectionId !== input.connectionId && usable(sender),
        );
      desiredDefaultId = replacement?.id ?? null;
    }

    const normalized = input.senders.map((sender) => ({
      ...sender,
      isWorkspaceDefault: sender.id === desiredDefaultId,
    }));

    const updates: Prisma.PrismaPromise<unknown>[] = [
      prisma.engageChannelConnection.update({
        where: { id: current.id },
        data: { capabilities: withSenderMetadata(current.capabilities, normalized) },
      }),
    ];

    if (
      desiredDefaultId &&
      !normalized.some((sender) => sender.id === desiredDefaultId)
    ) {
      const targetRecord = connections.find((record) =>
        storedSenders(record.capabilities).some((sender) => sender.id === desiredDefaultId),
      );
      if (targetRecord) {
        const targetSenders = storedSenders(targetRecord.capabilities).map((sender) =>
          toDomain(targetRecord, sender),
        );
        updates.push(
          prisma.engageChannelConnection.update({
            where: { id: targetRecord.id },
            data: {
              capabilities: withSenderMetadata(
                targetRecord.capabilities,
                targetSenders.map((sender) => ({
                  ...sender,
                  isWorkspaceDefault: sender.id === desiredDefaultId,
                })),
              ),
            },
          }),
        );
      }
    }

    await prisma.$transaction(updates);
    return normalized;
  }

  async setWorkspaceDefault(input: {
    workspaceId: string;
    senderIdentityId: string;
  }): Promise<void> {
    const connections = await prisma.engageChannelConnection.findMany({
      where: { workspaceId: input.workspaceId, channel: "EMAIL" },
      select: { id: true, workspaceId: true, capabilities: true },
    });
    const allSenders = connections.flatMap((record) =>
      storedSenders(record.capabilities).map((sender) => toDomain(record, sender)),
    );
    const target = allSenders.find((sender) => sender.id === input.senderIdentityId);
    if (!target) throw new Error("Email sender does not exist in this workspace.");
    if (!usable(target)) {
      throw new Error("Only a verified active email sender can be the workspace default.");
    }

    await prisma.$transaction(
      connections.map((record) => {
        const senders = storedSenders(record.capabilities).map((sender) =>
          toDomain(record, sender),
        );
        return prisma.engageChannelConnection.update({
          where: { id: record.id },
          data: {
            capabilities: withSenderMetadata(
              record.capabilities,
              senders.map((sender) => ({
                ...sender,
                isWorkspaceDefault: sender.id === input.senderIdentityId,
              })),
            ),
          },
        });
      }),
    );
  }
}

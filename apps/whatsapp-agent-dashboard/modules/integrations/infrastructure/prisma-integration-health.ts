import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  deriveIntegrationStatus,
  type IntegrationEvidence,
  type IntegrationStatus,
} from "@/modules/integrations/domain/integration-health";

export type MetaIntegrationProvider =
  | "META_WHATSAPP"
  | "META_INSTAGRAM"
  | "META_MESSENGER";

export type PersistedIntegrationHealth = {
  provider: MetaIntegrationProvider;
  channel: "WHATSAPP" | "INSTAGRAM" | "MESSENGER";
  externalAccountId: string;
  status: IntegrationStatus;
  evidence: IntegrationEvidence;
  updatedAt: Date;
};

const WORKSPACE_SLUG = "sikhadenge-default";
const SCHEMA_VERSION = 1;

function providerChannel(provider: MetaIntegrationProvider) {
  if (provider === "META_WHATSAPP") return "WHATSAPP" as const;
  if (provider === "META_INSTAGRAM") return "INSTAGRAM" as const;
  return "MESSENGER" as const;
}

function channelProvider(channel: string): MetaIntegrationProvider | null {
  if (channel === "WHATSAPP") return "META_WHATSAPP";
  if (channel === "INSTAGRAM") return "META_INSTAGRAM";
  if (channel === "MESSENGER") return "META_MESSENGER";
  return null;
}

function object(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

function date(value: Prisma.JsonValue | undefined): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function evidenceFromCapabilities(value: Prisma.JsonValue): IntegrationEvidence {
  const root = object(value);
  const evidence = object(root.evidence);
  return {
    apiVerifiedAt: date(evidence.apiVerifiedAt),
    webhookRequired: evidence.webhookRequired !== false,
    webhookVerifiedAt: date(evidence.webhookVerifiedAt),
    permissionsVerified: evidence.permissionsVerified === true,
    tokenExpiresAt: date(evidence.tokenExpiresAt),
    revokedAt: date(evidence.revokedAt),
    disconnectedAt: date(evidence.disconnectedAt),
  };
}

function capabilitiesJson(evidence: IntegrationEvidence): Prisma.InputJsonObject {
  return {
    schemaVersion: SCHEMA_VERSION,
    evidence: {
      apiVerifiedAt: evidence.apiVerifiedAt?.toISOString() ?? null,
      webhookRequired: evidence.webhookRequired,
      webhookVerifiedAt: evidence.webhookVerifiedAt?.toISOString() ?? null,
      permissionsVerified: evidence.permissionsVerified,
      tokenExpiresAt: evidence.tokenExpiresAt?.toISOString() ?? null,
      revokedAt: evidence.revokedAt?.toISOString() ?? null,
      disconnectedAt: evidence.disconnectedAt?.toISOString() ?? null,
    },
  };
}

async function workspaceId(): Promise<string> {
  const workspace = await prisma.engageWorkspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, isActive: true },
  });
  if (!workspace?.isActive) throw new Error("Default EngageOS workspace is unavailable.");
  return workspace.id;
}

async function mergeEvidence(input: {
  channel: "WHATSAPP" | "INSTAGRAM" | "MESSENGER";
  externalAccountId: string;
  apiVerifiedAt?: Date;
  webhookVerifiedAt?: Date;
  permissionsVerified?: boolean;
}) {
  const wsId = await workspaceId();
  const accountId = input.externalAccountId.trim();
  if (!accountId) throw new Error("Integration external account ID is required.");

  const existing = await prisma.engageChannelConnection.findUnique({
    where: {
      workspaceId_channel_externalAccountId: {
        workspaceId: wsId,
        channel: input.channel,
        externalAccountId: accountId,
      },
    },
  });
  const current = existing
    ? evidenceFromCapabilities(existing.capabilities)
    : { webhookRequired: true, permissionsVerified: false } satisfies IntegrationEvidence;
  const evidence: IntegrationEvidence = {
    ...current,
    apiVerifiedAt: input.apiVerifiedAt ?? current.apiVerifiedAt,
    webhookVerifiedAt: input.webhookVerifiedAt ?? current.webhookVerifiedAt,
    permissionsVerified: input.permissionsVerified ?? current.permissionsVerified,
  };
  const status = deriveIntegrationStatus(evidence);

  const row = await prisma.engageChannelConnection.upsert({
    where: {
      workspaceId_channel_externalAccountId: {
        workspaceId: wsId,
        channel: input.channel,
        externalAccountId: accountId,
      },
    },
    create: {
      workspaceId: wsId,
      channel: input.channel,
      externalAccountId: accountId,
      displayName: input.channel,
      status,
      capabilities: capabilitiesJson(evidence),
    },
    update: {
      status,
      capabilities: capabilitiesJson(evidence),
    },
  });
  return { row, evidence, status };
}

export async function persistMetaApiVerification(input: {
  provider: MetaIntegrationProvider;
  verified: boolean;
  checkedAt: Date;
  externalAccountId: string | null;
}) {
  if (!input.verified || !input.externalAccountId) return null;
  const merged = await mergeEvidence({
    channel: providerChannel(input.provider),
    externalAccountId: input.externalAccountId,
    apiVerifiedAt: input.checkedAt,
  });
  return merged.status;
}

export async function recordMetaWebhookEvidence(input: {
  channel: "WHATSAPP" | "INSTAGRAM" | "MESSENGER";
  externalAccountId: string;
  verifiedAt?: Date;
}) {
  return mergeEvidence({
    channel: input.channel,
    externalAccountId: input.externalAccountId,
    webhookVerifiedAt: input.verifiedAt ?? new Date(),
  });
}

export async function recordMetaPermissionEvidence(input: {
  channel: "WHATSAPP" | "INSTAGRAM" | "MESSENGER";
  externalAccountId: string;
  verifiedAt?: Date;
}) {
  return mergeEvidence({
    channel: input.channel,
    externalAccountId: input.externalAccountId,
    permissionsVerified: true,
  });
}

export async function listPersistedIntegrationHealth(): Promise<PersistedIntegrationHealth[]> {
  const wsId = await workspaceId();
  const rows = await prisma.engageChannelConnection.findMany({
    where: { workspaceId: wsId, channel: { in: ["WHATSAPP", "INSTAGRAM", "MESSENGER"] } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.flatMap((row) => {
    const provider = channelProvider(row.channel);
    if (!provider) return [];
    const evidence = evidenceFromCapabilities(row.capabilities);
    return [{
      provider,
      channel: row.channel as PersistedIntegrationHealth["channel"],
      externalAccountId: row.externalAccountId,
      status: deriveIntegrationStatus(evidence),
      evidence,
      updatedAt: row.updatedAt,
    }];
  });
}

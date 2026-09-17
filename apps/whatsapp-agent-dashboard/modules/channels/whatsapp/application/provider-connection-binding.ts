import type { Prisma } from "@prisma/client";

import {
  buildLegacyWhatsAppIdentityMapping,
  mergeLegacyWhatsAppMappingMetadata,
  readLegacyWhatsAppMappingMetadata,
} from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

export const DEFAULT_ENGAGE_WORKSPACE_ID = "engagews_default";

export type WhatsAppProviderBindingInput = {
  workspaceId?: string;
  contactId: string;
  waId: string;
  phoneNumberId: string | null;
  metadata: Prisma.JsonValue | null;
};

function sameMapping(
  left: ReturnType<typeof readLegacyWhatsAppMappingMetadata>,
  right: ReturnType<typeof buildLegacyWhatsAppIdentityMapping>,
): boolean {
  return Boolean(
    left &&
      left.schemaVersion === right.schemaVersion &&
      left.workspaceId === right.workspaceId &&
      left.channel === right.channel &&
      left.connectionId === right.connectionId &&
      left.legacyContactId === right.legacyContactId &&
      left.externalUserId === right.externalUserId &&
      left.customerRef === right.customerRef &&
      left.identityRef === right.identityRef,
  );
}

export async function resolveActiveWhatsAppConnectionId(
  transaction: Pick<Prisma.TransactionClient, "engageChannelConnection">,
  input: { workspaceId?: string; phoneNumberId: string | null },
): Promise<string | null> {
  const phoneNumberId = input.phoneNumberId?.trim() || "";
  if (!phoneNumberId) return null;

  const workspaceId = input.workspaceId?.trim() || DEFAULT_ENGAGE_WORKSPACE_ID;
  const connection = await transaction.engageChannelConnection.findFirst({
    where: {
      workspaceId,
      channel: "WHATSAPP",
      externalAccountId: phoneNumberId,
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    select: { id: true },
  });
  return connection?.id ?? null;
}

export async function syncLegacyWhatsAppIdentityMappingForInbound(
  transaction: Pick<Prisma.TransactionClient, "engageChannelConnection" | "whatsAppContact">,
  input: WhatsAppProviderBindingInput,
): Promise<{ updated: boolean; connectionId: string | null }> {
  const workspaceId = input.workspaceId?.trim() || DEFAULT_ENGAGE_WORKSPACE_ID;
  const connectionId = await resolveActiveWhatsAppConnectionId(transaction, {
    workspaceId,
    phoneNumberId: input.phoneNumberId,
  });
  if (!connectionId) return { updated: false, connectionId: null };

  const mapping = buildLegacyWhatsAppIdentityMapping({
    workspaceId,
    connectionId,
    legacyContactId: input.contactId,
    waId: input.waId,
  });
  const existing = readLegacyWhatsAppMappingMetadata(input.metadata);
  if (sameMapping(existing, mapping)) {
    return { updated: false, connectionId };
  }

  await transaction.whatsAppContact.update({
    where: { id: input.contactId },
    data: {
      metadata: mergeLegacyWhatsAppMappingMetadata(input.metadata, mapping) as Prisma.InputJsonValue,
    },
  });
  return { updated: true, connectionId };
}

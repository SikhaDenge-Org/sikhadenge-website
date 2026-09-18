import { prisma } from "@/lib/db/prisma";
import {
  buildLegacyWhatsAppIdentityMapping,
  readLegacyWhatsAppMappingMetadata,
} from "@/modules/channels/whatsapp/application/legacy-identity-mapping";
import { DEFAULT_ENGAGE_WORKSPACE_ID } from "@/modules/channels/whatsapp/application/provider-connection-binding";

function phoneNumberId() {
  const value =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!value) throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  return value;
}

function whatsappSourceWhere() {
  return {
    OR: [
      { source: null },
      { source: { notIn: ["instagram", "messenger"] } },
    ],
  };
}

async function main() {
  const phoneId = phoneNumberId();
  const connections = await prisma.engageChannelConnection.findMany({
    where: {
      workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
      channel: "WHATSAPP",
      externalAccountId: phoneId,
    },
    select: { id: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const connected = connections.filter((item) => item.status === "CONNECTED");
  const degraded = connections.filter((item) => item.status === "DEGRADED");
  const activeConnection = connected[0] ?? degraded[0] ?? null;

  const contacts = await prisma.whatsAppContact.findMany({
    where: { conversations: { some: whatsappSourceWhere() } },
    select: { id: true, waId: true, metadata: true },
  });

  let missingMappings = 0;
  let connectionMismatch = 0;
  let externalUserMismatch = 0;
  let canonicalRefMismatch = 0;

  for (const contact of contacts) {
    const mapping = readLegacyWhatsAppMappingMetadata(contact.metadata);
    if (!mapping || !activeConnection) {
      missingMappings += 1;
      continue;
    }
    if (
      mapping.workspaceId !== DEFAULT_ENGAGE_WORKSPACE_ID ||
      mapping.connectionId !== activeConnection.id
    ) {
      connectionMismatch += 1;
    }
    if (mapping.externalUserId !== contact.waId) {
      externalUserMismatch += 1;
    }
    const expected = buildLegacyWhatsAppIdentityMapping({
      workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
      connectionId: activeConnection.id,
      legacyContactId: contact.id,
      waId: contact.waId,
    });
    if (
      mapping.customerRef !== expected.customerRef ||
      mapping.identityRef !== expected.identityRef
    ) {
      canonicalRefMismatch += 1;
    }
  }

  const parityPassed =
    connections.length === 1 &&
    connected.length === 1 &&
    degraded.length === 0 &&
    missingMappings === 0 &&
    connectionMismatch === 0 &&
    externalUserMismatch === 0 &&
    canonicalRefMismatch === 0;

  const report = {
    workspaceId: DEFAULT_ENGAGE_WORKSPACE_ID,
    phoneNumberIdConfigured: true,
    providerConnectionsFound: connections.length,
    connectedConnections: connected.length,
    degradedConnections: degraded.length,
    activeConnectionId: activeConnection?.id ?? null,
    contactsScanned: contacts.length,
    missingMappings,
    connectionMismatch,
    externalUserMismatch,
    canonicalRefMismatch,
    mutationPerformed: false,
    externalWhatsAppWriteSent: false,
    parityPassed,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!parityPassed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("WhatsApp provider parity monitor failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


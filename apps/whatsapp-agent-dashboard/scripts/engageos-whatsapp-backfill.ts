import { prisma } from "@/lib/db/prisma";
import {
  buildLegacyWhatsAppIdentityMapping,
  readLegacyWhatsAppMappingMetadata,
} from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

const WORKSPACE_ID = "engagews_default";

function whatsappSourceWhere() {
  return {
    OR: [
      { source: null },
      { source: { notIn: ["instagram", "messenger"] } },
    ],
  };
}

function phoneNumberId(): string {
  const value =
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!value) throw new Error("WHATSAPP_PHONE_NUMBER_ID is required for the backfill plan.");
  return value;
}

async function main() {
  const connectionId = `whatsapp:${phoneNumberId()}`;
  const contacts = await prisma.whatsAppContact.findMany({
    where: { conversations: { some: whatsappSourceWhere() } },
    orderBy: { id: "asc" },
    select: { id: true, waId: true, metadata: true },
  });

  const mappings = contacts.map((contact) => {
    const mapping = buildLegacyWhatsAppIdentityMapping({
      workspaceId: WORKSPACE_ID,
      connectionId,
      legacyContactId: contact.id,
      waId: contact.waId,
    });
    const existing = readLegacyWhatsAppMappingMetadata(contact.metadata);
    return {
      legacyContactId: contact.id,
      existingCustomerRef: existing?.customerRef ?? null,
      mapping,
      needsWrite:
        !existing ||
        existing.customerRef !== mapping.customerRef ||
        existing.identityRef !== mapping.identityRef ||
        existing.connectionId !== mapping.connectionId ||
        existing.externalUserId !== mapping.externalUserId,
    };
  });

  const conversations = await prisma.whatsAppConversation.count({ where: whatsappSourceWhere() });
  const messages = await prisma.whatsAppMessage.count({
    where: { conversation: whatsappSourceWhere() },
  });

  console.log(
    JSON.stringify(
      {
        mode: "DRY_RUN_ONLY",
        workspaceId: WORKSPACE_ID,
        connectionId,
        contacts: contacts.length,
        conversations,
        messages,
        mappingsNeeded: mappings.filter((item) => item.needsWrite).length,
        mappings,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("WhatsApp identity backfill planning failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

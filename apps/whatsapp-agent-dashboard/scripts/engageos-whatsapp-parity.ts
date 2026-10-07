import { prisma } from "@/lib/db/prisma";
import { readLegacyWhatsAppMappingMetadata } from "@/modules/channels/whatsapp/application/legacy-identity-mapping";

function whatsappSourceWhere() {
  return {
    OR: [
      { source: null },
      { source: { notIn: ["instagram", "messenger"] } },
    ],
  };
}

async function main() {
  const contacts = await prisma.whatsAppContact.findMany({
    where: { conversations: { some: whatsappSourceWhere() } },
    select: { id: true, metadata: true },
  });
  const conversations = await prisma.whatsAppConversation.findMany({
    where: whatsappSourceWhere(),
    select: { id: true, contactId: true },
  });
  const messageCount = await prisma.whatsAppMessage.count({
    where: { conversation: whatsappSourceWhere() },
  });

  const missingMappings = contacts
    .filter((contact) => !readLegacyWhatsAppMappingMetadata(contact.metadata))
    .map((contact) => contact.id);
  const knownContactIds = new Set(contacts.map((contact) => contact.id));
  const orphanConversationIds = conversations
    .filter((conversation) => !knownContactIds.has(conversation.contactId))
    .map((conversation) => conversation.id);

  const customerRefs = contacts
    .map((contact) => readLegacyWhatsAppMappingMetadata(contact.metadata)?.customerRef)
    .filter((value): value is string => Boolean(value));
  const duplicateCustomerRefs = customerRefs.filter(
    (value, index) => customerRefs.indexOf(value) !== index,
  );

  const report = {
    contacts: contacts.length,
    conversations: conversations.length,
    messages: messageCount,
    mappedContacts: contacts.length - missingMappings.length,
    missingMappings,
    orphanConversationIds,
    duplicateCustomerRefs: [...new Set(duplicateCustomerRefs)],
    parityPassed:
      missingMappings.length === 0 &&
      orphanConversationIds.length === 0 &&
      duplicateCustomerRefs.length === 0,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.parityPassed) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("WhatsApp migration parity check failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

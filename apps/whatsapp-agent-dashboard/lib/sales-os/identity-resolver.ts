import { prisma } from "../db/prisma";

export interface ResolvedContext {
  contactId: string;
  conversationId: string;
  leadId?: string | null;
  agentMode: "AI" | "HUMAN";
  isOptedOut: boolean;
}

export async function resolveWhatsAppContext(params: {
  phone: string;
  displayName?: string | null;
}): Promise<ResolvedContext> {
  const cleanPhone = params.phone.replace(/\D/g, "");

  let contact = await prisma.whatsappContact.findFirst({
    where: {
      OR: [
        { phone: cleanPhone },
        { waId: cleanPhone },
        { phone: { endsWith: cleanPhone.slice(-10) } }
      ]
    },
    include: {
      lead: true,
      conversations: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!contact) {
    contact = await prisma.whatsappContact.create({
      data: {
        waId: cleanPhone,
        phone: cleanPhone,
        displayName: params.displayName || null,
        consentStatus: "UNKNOWN"
      },
      include: {
        lead: true,
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });
  }

  let conversation = contact.conversations[0];
  if (!conversation) {
    conversation = await prisma.whatsappConversation.create({
      data: {
        contactId: contact.id,
        status: "OPEN",
        agentMode: "AI",
        unreadCount: 0
      }
    });
  }

  return {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId: contact.lead?.id || null,
    agentMode: (conversation.agentMode as "AI" | "HUMAN") || "AI",
    isOptedOut: !!contact.optedOutAt || contact.consentStatus === "REVOKED"
  };
}

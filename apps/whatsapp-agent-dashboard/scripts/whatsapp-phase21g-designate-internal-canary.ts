import { prisma } from "@/lib/db/prisma";

const WORKSPACE_ID = "engagews_default";
const REQUIRED_CONFIRMATION = "DESIGNATE_INTERNAL_CANARY";
const TAG_NAME = "CANARY_INTERNAL_TEST";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function main() {
  const waId = clean(process.env.PHASE21G_CANARY_WA_ID, 64);
  const verifiedWaId = clean(process.env.PHASE21G_VERIFIED_CANARY_WA_ID, 64);
  const confirmation = clean(process.env.PHASE21G_CONFIRM, 64);
  if (!waId || !/^\d{6,20}$/.test(waId)) throw new Error("PHASE21G_CANARY_WA_ID must be an exact numeric WhatsApp ID.");
  if (!verifiedWaId || !/^\d{6,20}$/.test(verifiedWaId)) throw new Error("Verified internal canary ownership is not configured.");
  if (waId !== verifiedWaId) throw new Error("Requested canary does not match the independently verified internal WhatsApp ID.");
  if (confirmation !== REQUIRED_CONFIRMATION) throw new Error("Explicit canary designation confirmation is missing.");

  const contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
    select: {
      id: true,
      metadata: true,
      consentStatus: true,
      optedOutAt: true,
      conversations: {
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          status: true,
          agentMode: true,
          source: true,
          serviceWindowExpiresAt: true,
        },
      },
    },
  });
  if (!contact) throw new Error("Exact WhatsApp contact was not found.");

  const metadata = rec(contact.metadata);
  const engageos = rec(metadata.engageos);
  const identity = rec(engageos.whatsappIdentity);
  const workspaceId = clean(identity.workspaceId, 100);
  const connectionId = clean(identity.connectionId, 100);
  if (workspaceId !== WORKSPACE_ID) throw new Error("Contact is not bound to the production WhatsApp workspace.");
  if (!connectionId) throw new Error("Contact has no bound WhatsApp connection.");

  const connection = await prisma.engageChannelConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, workspaceId: true, channel: true, status: true },
  });
  if (!connection || connection.workspaceId !== WORKSPACE_ID || connection.channel !== "WHATSAPP") {
    throw new Error("Contact connection is not the expected workspace WhatsApp connection.");
  }
  if (!["CONNECTED", "DEGRADED"].includes(connection.status)) {
    throw new Error("Contact WhatsApp connection is not operational.");
  }

  const existingConversation =
    contact.conversations.find((conversation) => {
      const source = conversation.source?.trim().toLowerCase() || "whatsapp";
      return source === "whatsapp";
    }) ?? null;

  const existingDistinctCanary = await prisma.whatsAppContact.findFirst({
    where: {
      id: { not: contact.id },
      metadata: {
        path: ["engageos", "canary", "designated"],
        equals: true,
      },
    },
    select: { id: true },
  });
  if (existingDistinctCanary) {
    throw new Error("A different production WhatsApp canary is already designated.");
  }

  const existingDistinctCanaryTag = await prisma.conversationTagLink.findFirst({
    where: {
      tag: { name: TAG_NAME },
      conversation: { contactId: { not: contact.id } },
    },
    select: { conversationId: true },
  });
  if (existingDistinctCanaryTag) {
    throw new Error("A different production WhatsApp contact already owns the canary tag.");
  }

  const membership = await prisma.engageWorkspaceMembership.findFirst({
    where: {
      workspaceId: WORKSPACE_ID,
      isActive: true,
      role: { in: ["ADMIN", "MANAGER", "COUNSELOR"] },
      user: { isActive: true },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { userId: true, role: true },
  });
  if (!membership) throw new Error("No authorized active workspace operator exists for canary designation audit.");

  const priorCanary = rec(engageos.canary);
  const updatedMetadata = {
    ...metadata,
    engageos: {
      ...engageos,
      canary: {
        ...priorCanary,
        designated: true,
        kind: "INTERNAL_TEST",
        designatedAt: new Date().toISOString(),
        designationSource: "PHASE21G_EXACT_WA_ID",
      },
    },
  };

  const transactionResult = await prisma.$transaction(async (tx) => {
    const conversation = existingConversation ?? await tx.whatsAppConversation.create({
      data: {
        contactId: contact.id,
        source: "whatsapp",
      },
      select: {
        id: true,
        status: true,
        agentMode: true,
        source: true,
        serviceWindowExpiresAt: true,
      },
    });

    const tag = await tx.conversationTag.upsert({
      where: { name: TAG_NAME },
      update: {},
      create: { name: TAG_NAME },
    });

    await tx.whatsAppContact.update({
      where: { id: contact.id },
      data: { metadata: updatedMetadata },
    });

    await tx.conversationTagLink.upsert({
      where: {
        conversationId_tagId: {
          conversationId: conversation.id,
          tagId: tag.id,
        },
      },
      update: {},
      create: {
        conversationId: conversation.id,
        tagId: tag.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: membership.userId,
        action: "WHATSAPP_INTERNAL_CANARY_DESIGNATED",
        entityType: "WhatsAppContact",
        entityId: contact.id,
        after: {
          workspaceId: WORKSPACE_ID,
          connectionStatus: connection.status,
          tag: TAG_NAME,
          consentStatus: contact.consentStatus,
          optedOut: Boolean(contact.optedOutAt),
          conversationCreated: !existingConversation,
          serviceWindowOpen: Boolean(
            conversation.serviceWindowExpiresAt &&
            conversation.serviceWindowExpiresAt.getTime() > Date.now(),
          ),
          outboundMessagesQueued: false,
          externalWriteSent: false,
        },
      },
    });

    return {
      conversation,
      conversationCreated: !existingConversation,
    };
  });

  const conversation = transactionResult.conversation;
  const conversationCreated = transactionResult.conversationCreated;

  if (conversationCreated) {
    const provisionedMessageCount = await prisma.whatsAppMessage.count({
      where: { conversationId: conversation.id },
    });
    if (provisionedMessageCount !== 0) {
      throw new Error("Provisioned canary conversation must not contain any messages.");
    }
  }

  const verified = await prisma.whatsAppContact.findUnique({
    where: { id: contact.id },
    select: {
      metadata: true,
      conversations: {
        where: { id: conversation.id },
        select: {
          tags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  const verifiedCanary = rec(rec(rec(verified?.metadata).engageos).canary);
  const tagNames = verified?.conversations[0]?.tags.map((row) => row.tag.name) ?? [];
  if (verifiedCanary.designated !== true || !tagNames.includes(TAG_NAME)) {
    throw new Error("Canary designation verification failed.");
  }

  process.stdout.write(JSON.stringify({
    mode: "PHASE21G_EXPLICIT_CANARY_DESIGNATION",
    workspaceVerified: true,
    verifiedOwnershipSource: true,
    authorizedWorkspaceOperatorAvailable: true,
    connectionVerified: true,
    contactFound: true,
    conversationFound: true,
    conversationCreated,
    conversationSource: "whatsapp",
    serviceWindowProvisioned: false,
    canaryMetadataMarked: true,
    canaryTagLinked: true,
    consentStatus: contact.consentStatus,
    optedOut: Boolean(contact.optedOutAt),
    serviceWindowOpen: Boolean(
      conversation.serviceWindowExpiresAt &&
      conversation.serviceWindowExpiresAt.getTime() > Date.now(),
    ),
    outboundMessagesQueued: false,
    externalWhatsAppWriteSent: false,
    runtimeFlagsMutated: false,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Phase21G canary designation failed.") + "\n");
  process.exitCode = 1;
});

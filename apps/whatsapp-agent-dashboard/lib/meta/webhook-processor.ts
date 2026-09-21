import {
  AgentMode,
  ConversationStatus,
  LeadStage,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { sha256Hex } from "./signature";
import {
  normalizeWhatsAppWebhook,
  type NormalizedInboundMessage,
  type NormalizedMessageStatus,
  type NormalizedWhatsAppEvent,
} from "./webhook-normalizer";

const MESSAGE_TYPE_MAP: Record<string, MessageType> = {
  text: MessageType.TEXT,
  image: MessageType.IMAGE,
  sticker: MessageType.IMAGE,
  video: MessageType.VIDEO,
  audio: MessageType.AUDIO,
  document: MessageType.DOCUMENT,
  location: MessageType.LOCATION,
  interactive: MessageType.INTERACTIVE,
  reaction: MessageType.REACTION,
};

const STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
};

const STATUS_RANK: Record<MessageStatus, number> = {
  [MessageStatus.RECEIVED]: 0,
  [MessageStatus.QUEUED]: 1,
  [MessageStatus.SENT]: 2,
  [MessageStatus.DELIVERED]: 3,
  [MessageStatus.READ]: 4,
  [MessageStatus.FAILED]: 5,
};

export type WebhookProcessingResult = {
  accepted: number;
  duplicates: number;
  messages: number;
  statuses: number;
  ignored: number;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function unixTimestamp(value: string): Date {
  const seconds = Number(value);
  const date = new Date(seconds * 1_000);
  return Number.isFinite(seconds) && !Number.isNaN(date.getTime()) ? date : new Date();
}

function e164Phone(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}

function messageType(value: string): MessageType {
  return MESSAGE_TYPE_MAP[value] ?? MessageType.UNSUPPORTED;
}

function compactError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown webhook processing error.";
  return message.slice(0, 1_000);
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function reserveWebhookEvent(event: NormalizedWhatsAppEvent): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey: event.eventKey,
        eventType: event.kind,
        payload: toJsonValue(event),
        attemptCount: 1,
      },
    });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

async function selectOrCreateConversation(
  transaction: Prisma.TransactionClient,
  contactId: string,
  inboundAt: Date,
): Promise<{ id: string; lastMessageAt: Date | null }> {
  const existingLead = await transaction.lead.findUnique({
    where: { contactId },
    select: { conversationId: true },
  });

  if (existingLead) {
    return transaction.whatsAppConversation.update({
      where: { id: existingLead.conversationId },
      data: {
        status: ConversationStatus.OPEN,
        serviceWindowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1_000),
      },
      select: { id: true, lastMessageAt: true },
    });
  }

  const existingConversation = await transaction.whatsAppConversation.findFirst({
    where: {
      contactId,
      status: { in: [ConversationStatus.OPEN, ConversationStatus.WAITING] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, lastMessageAt: true },
  });

  const conversation = existingConversation
    ? await transaction.whatsAppConversation.update({
        where: { id: existingConversation.id },
        data: {
          status: ConversationStatus.OPEN,
          serviceWindowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1_000),
        },
        select: { id: true, lastMessageAt: true },
      })
    : await transaction.whatsAppConversation.create({
        data: {
          contactId,
          status: ConversationStatus.OPEN,
          agentMode: AgentMode.AI,
          serviceWindowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1_000),
        },
        select: { id: true, lastMessageAt: true },
      });

  await transaction.lead.create({
    data: {
      contactId,
      conversationId: conversation.id,
      stage: LeadStage.NEW,
    },
  });

  return conversation;
}

async function processInboundMessage(
  transaction: Prisma.TransactionClient,
  event: NormalizedInboundMessage,
): Promise<void> {
  const alreadyStored = await transaction.whatsAppMessage.findUnique({
    where: { metaMessageId: event.message.id },
    select: { id: true },
  });
  if (alreadyStored) return;

  const contact = await transaction.whatsAppContact.upsert({
    where: { waId: event.waId },
    create: {
      waId: event.waId,
      phone: e164Phone(event.waId),
      profileName: event.profileName,
    },
    update: event.profileName ? { profileName: event.profileName } : {},
    select: { id: true },
  });

  const inboundAt = unixTimestamp(event.message.timestamp);
  const conversation = await selectOrCreateConversation(
    transaction,
    contact.id,
    inboundAt,
  );

  await transaction.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      metaMessageId: event.message.id,
      direction: MessageDirection.INBOUND,
      actor: MessageActor.CUSTOMER,
      type: messageType(event.message.type),
      status: MessageStatus.RECEIVED,
      text: event.message.text,
      mediaId: event.message.mediaId,
      mimeType: event.message.mimeType,
      filename: event.message.filename,
      rawPayload: toJsonValue(event.message.raw),
      messageTimestamp: inboundAt,
    },
  });

  const effectiveLastMessageAt =
    conversation.lastMessageAt && conversation.lastMessageAt > inboundAt
      ? conversation.lastMessageAt
      : inboundAt;

  await transaction.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      unreadCount: { increment: 1 },
      lastMessageAt: effectiveLastMessageAt,
      status: ConversationStatus.OPEN,
      serviceWindowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1_000),
    },
  });
}

async function processMessageStatus(
  transaction: Prisma.TransactionClient,
  event: NormalizedMessageStatus,
): Promise<void> {
  const nextStatus = STATUS_MAP[event.status.value];
  if (!nextStatus) return;

  const message = await transaction.whatsAppMessage.findUnique({
    where: { metaMessageId: event.status.messageId },
    select: { id: true, status: true },
  });
  if (!message) return;

  const statusAt = unixTimestamp(event.status.timestamp);
  await transaction.whatsAppMessageStatusEvent.create({
    data: {
      messageId: message.id,
      status: nextStatus,
      metaTimestamp: statusAt,
      rawPayload: toJsonValue(event.status.raw),
    },
  });

  if (STATUS_RANK[nextStatus] >= STATUS_RANK[message.status]) {
    await transaction.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: nextStatus,
        failureCode:
          nextStatus === MessageStatus.FAILED ? event.status.errorCode : null,
        failureReason:
          nextStatus === MessageStatus.FAILED ? event.status.errorMessage : null,
      },
    });
  }
}

async function processReservedEvent(event: NormalizedWhatsAppEvent): Promise<void> {
  try {
    await prisma.$transaction(async (transaction) => {
      if (event.kind === "message") {
        await processInboundMessage(transaction, event);
      } else {
        await processMessageStatus(transaction, event);
      }

      await transaction.webhookEvent.update({
        where: { eventKey: event.eventKey },
        data: {
          processedAt: new Date(),
          processingError: null,
        },
      });
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { eventKey: event.eventKey },
      data: {
        processingError: compactError(error),
      },
    });
    throw error;
  }
}

async function storeIgnoredEnvelope(payload: unknown, rawBody: string): Promise<boolean> {
  const eventKey = `envelope:${sha256Hex(rawBody)}`;
  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey,
        eventType: "ignored_envelope",
        payload: toJsonValue(payload),
        attemptCount: 1,
        processedAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

export async function processWhatsAppWebhook(
  payload: unknown,
  rawBody: string,
): Promise<WebhookProcessingResult> {
  const events = normalizeWhatsAppWebhook(payload);
  const result: WebhookProcessingResult = {
    accepted: 0,
    duplicates: 0,
    messages: 0,
    statuses: 0,
    ignored: 0,
  };

  if (events.length === 0) {
    const stored = await storeIgnoredEnvelope(payload, rawBody);
    result.ignored = stored ? 1 : 0;
    result.duplicates = stored ? 0 : 1;
    return result;
  }

  for (const event of events) {
    const reserved = await reserveWebhookEvent(event);
    if (!reserved) {
      result.duplicates += 1;
      continue;
    }

    await processReservedEvent(event);
    result.accepted += 1;
    if (event.kind === "message") result.messages += 1;
    if (event.kind === "status") result.statuses += 1;
  }

  return result;
}

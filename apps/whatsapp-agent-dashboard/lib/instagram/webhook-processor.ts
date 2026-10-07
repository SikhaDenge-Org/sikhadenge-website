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
import { sha256Hex } from "../meta/signature";

export type InstagramWebhookProcessingResult = {
  accepted: number;
  duplicates: number;
  messages: number;
  statuses: number;
  ignored: number;
};

type JsonRecord = Record<string, unknown>;

type InstagramMessagingEvent = {
  senderId: string;
  recipientId: string;
  timestamp: Date;
  messageId: string | null;
  text: string | null;
  messageType: MessageType;
  mediaUrl: string | null;
  readMessageId: string | null;
  isEcho: boolean;
  raw: JsonRecord;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestampValue(value: unknown): Date {
  const milliseconds = typeof value === "number" ? value : Number(value);
  const parsed = new Date(milliseconds);
  return Number.isFinite(milliseconds) && !Number.isNaN(parsed.getTime())
    ? parsed
    : new Date();
}

function attachmentType(value: unknown): MessageType {
  const type = stringValue(value)?.toLowerCase();
  if (type === "image" || type === "sticker") return MessageType.IMAGE;
  if (type === "video" || type === "ig_reel" || type === "reel") {
    return MessageType.VIDEO;
  }
  if (type === "audio") return MessageType.AUDIO;
  if (type === "file") return MessageType.DOCUMENT;
  return MessageType.UNSUPPORTED;
}

function parseMessagingEvents(payload: unknown): InstagramMessagingEvent[] {
  const root = asRecord(payload);
  if (root.object !== "instagram") return [];

  const events: InstagramMessagingEvent[] = [];
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entryValue of entries) {
    const entry = asRecord(entryValue);
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const itemValue of messaging) {
      const item = asRecord(itemValue);
      const senderId = stringValue(asRecord(item.sender).id);
      const recipientId = stringValue(asRecord(item.recipient).id);
      if (!senderId || !recipientId) continue;

      const message = asRecord(item.message);
      const postback = asRecord(item.postback);
      const read = asRecord(item.read);
      const attachments = Array.isArray(message.attachments)
        ? message.attachments
        : [];
      const firstAttachment = asRecord(attachments[0]);
      const attachmentPayload = asRecord(firstAttachment.payload);
      const postbackTitle = stringValue(postback.title);
      const messageId = stringValue(message.mid) || stringValue(postback.mid);
      const messageText = stringValue(message.text) || postbackTitle;

      events.push({
        senderId,
        recipientId,
        timestamp: timestampValue(item.timestamp),
        messageId,
        text:
          messageText ||
          (attachments.length > 0 ? "[Instagram attachment]" : null),
        messageType: postbackTitle
          ? MessageType.INTERACTIVE
          : attachments.length > 0
            ? attachmentType(firstAttachment.type)
            : MessageType.TEXT,
        mediaUrl: stringValue(attachmentPayload.url),
        readMessageId: stringValue(read.mid),
        isEcho: message.is_echo === true,
        raw: item,
      });
    }
  }

  return events;
}

async function selectOrCreateInstagramConversation(
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
        source: "instagram",
        status: ConversationStatus.OPEN,
        serviceWindowExpiresAt: new Date(
          inboundAt.getTime() + 24 * 60 * 60 * 1_000,
        ),
      },
      select: { id: true, lastMessageAt: true },
    });
  }

  const existingConversation = await transaction.whatsAppConversation.findFirst({
    where: {
      contactId,
      source: "instagram",
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
          serviceWindowExpiresAt: new Date(
            inboundAt.getTime() + 24 * 60 * 60 * 1_000,
          ),
        },
        select: { id: true, lastMessageAt: true },
      })
    : await transaction.whatsAppConversation.create({
        data: {
          contactId,
          source: "instagram",
          status: ConversationStatus.OPEN,
          agentMode: AgentMode.HUMAN,
          serviceWindowExpiresAt: new Date(
            inboundAt.getTime() + 24 * 60 * 60 * 1_000,
          ),
          humanTakeoverAt: inboundAt,
          humanTakeoverReason: "Instagram conversation awaiting a counselor.",
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
  event: InstagramMessagingEvent,
): Promise<boolean> {
  if (event.isEcho || !event.messageId || !event.text) return false;

  const existing = await transaction.whatsAppMessage.findUnique({
    where: { metaMessageId: event.messageId },
    select: { id: true },
  });
  if (existing) return false;

  const syntheticId = `instagram:${event.senderId}`;
  const profileName = `Instagram • ${event.senderId.slice(-6)}`;
  const contact = await transaction.whatsAppContact.upsert({
    where: { waId: syntheticId },
    create: {
      waId: syntheticId,
      phone: syntheticId,
      profileName,
      metadata: toJsonValue({
        channel: "instagram",
        instagramScopedId: event.senderId,
        instagramAccountId: event.recipientId,
      }),
    },
    update: {
      metadata: toJsonValue({
        channel: "instagram",
        instagramScopedId: event.senderId,
        instagramAccountId: event.recipientId,
      }),
    },
    select: { id: true },
  });

  const conversation = await selectOrCreateInstagramConversation(
    transaction,
    contact.id,
    event.timestamp,
  );

  await transaction.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      metaMessageId: event.messageId,
      direction: MessageDirection.INBOUND,
      actor: MessageActor.CUSTOMER,
      type: event.messageType,
      status: MessageStatus.RECEIVED,
      text: event.text,
      mediaUrl: event.mediaUrl,
      rawPayload: toJsonValue({ channel: "instagram", event: event.raw }),
      messageTimestamp: event.timestamp,
    },
  });

  const effectiveLastMessageAt =
    conversation.lastMessageAt && conversation.lastMessageAt > event.timestamp
      ? conversation.lastMessageAt
      : event.timestamp;

  await transaction.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      source: "instagram",
      unreadCount: { increment: 1 },
      lastMessageAt: effectiveLastMessageAt,
      status: ConversationStatus.OPEN,
      serviceWindowExpiresAt: new Date(
        event.timestamp.getTime() + 24 * 60 * 60 * 1_000,
      ),
    },
  });

  return true;
}

async function processReadStatus(
  transaction: Prisma.TransactionClient,
  event: InstagramMessagingEvent,
): Promise<boolean> {
  if (!event.readMessageId) return false;

  const message = await transaction.whatsAppMessage.findUnique({
    where: { metaMessageId: event.readMessageId },
    select: { id: true, status: true },
  });
  if (!message || message.status === MessageStatus.READ) return false;

  await transaction.whatsAppMessage.update({
    where: { id: message.id },
    data: { status: MessageStatus.READ },
  });
  await transaction.whatsAppMessageStatusEvent.create({
    data: {
      messageId: message.id,
      status: MessageStatus.READ,
      metaTimestamp: event.timestamp,
      rawPayload: toJsonValue({ channel: "instagram", event: event.raw }),
    },
  });
  return true;
}

export async function processInstagramWebhook(
  payload: unknown,
  rawBody: string,
): Promise<InstagramWebhookProcessingResult> {
  const eventKey = `instagram:${sha256Hex(rawBody)}`;

  try {
    await prisma.webhookEvent.create({
      data: {
        eventKey,
        eventType: "instagram.raw",
        payload: toJsonValue(payload),
        attemptCount: 1,
      },
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return {
        accepted: 0,
        duplicates: 1,
        messages: 0,
        statuses: 0,
        ignored: 0,
      };
    }
    throw error;
  }

  const events = parseMessagingEvents(payload);
  let messages = 0;
  let statuses = 0;
  let ignored = 0;

  try {
    await prisma.$transaction(async (transaction) => {
      for (const event of events) {
        if (await processInboundMessage(transaction, event)) {
          messages += 1;
          continue;
        }
        if (await processReadStatus(transaction, event)) {
          statuses += 1;
          continue;
        }
        ignored += 1;
      }

      await transaction.webhookEvent.update({
        where: { eventKey },
        data: {
          processedAt: new Date(),
          processingError: null,
        },
      });
    });
  } catch (error) {
    const detail = (
      error instanceof Error ? error.message : "Instagram webhook processing failed."
    ).slice(0, 1_000);
    await prisma.webhookEvent.update({
      where: { eventKey },
      data: {
        processingError: detail,
        attemptCount: { increment: 1 },
      },
    });
    throw error;
  }

  return {
    accepted: 1,
    duplicates: 0,
    messages,
    statuses,
    ignored,
  };
}

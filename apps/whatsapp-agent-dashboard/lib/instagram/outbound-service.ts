import {
  ConversationStatus,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { sha256Hex } from "../meta/signature";
import { evaluateOutboundPolicy } from "../outbound/policy";
import type { OutboundContent } from "../outbound/types";
import { assertInstagramControlledOutboundAllowed } from "./outbound-policy-gate";
import {
  getInstagramOutboundMode,
  sendInstagramTextMessage,
} from "./api-client";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function sendInstagramConversationMessage(input: {
  conversationId: string;
  actor: MessageActor;
  sentById: string | null;
  content: OutboundContent;
  idempotencyKey: string;
}) {
  if (input.content.kind !== "text") {
    throw new Error("Instagram inbox currently supports text replies only.");
  }

  const text = input.content.text.trim().slice(0, 4_096);
  const replyToMetaMessageId =
    input.content.replyToMetaMessageId?.trim().slice(0, 300) || null;
  const now = new Date();
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      source: true,
      status: true,
      agentMode: true,
      serviceWindowExpiresAt: true,
      contact: {
        select: {
          id: true,
          waId: true,
          consentStatus: true,
          metadata: true,
        },
      },
    },
  });
  if (!conversation) throw new Error("Conversation not found.");
  if (conversation.source?.trim().toLowerCase() !== "instagram") {
    throw new Error("Conversation is not an Instagram conversation.");
  }

  const metadata = asRecord(conversation.contact.metadata);
  const instagramScopedId =
    stringValue(metadata.instagramScopedId) ||
    (conversation.contact.waId.startsWith("instagram:")
      ? conversation.contact.waId.slice("instagram:".length)
      : null);
  if (!instagramScopedId) {
    throw new Error("Instagram recipient ID is missing from the contact record.");
  }

  await assertInstagramControlledOutboundAllowed({
    conversationAccountId: stringValue(metadata.instagramAccountId),
  });

  const policy = evaluateOutboundPolicy({
    context: {
      actor: input.actor,
      agentMode: conversation.agentMode,
      conversationStatus: conversation.status,
      consentStatus: conversation.contact.consentStatus,
      serviceWindowExpiresAt: conversation.serviceWindowExpiresAt,
      templateStatus: null,
    },
    content: input.content,
    now,
  });
  if (!policy.allowed) {
    throw new Error(policy.reason ?? "Instagram outbound message is not allowed.");
  }

  const eventKey = `outbound:instagram:${sha256Hex(
    `${conversation.id}:${input.idempotencyKey.trim()}`,
  )}`;

  let queued:
    | {
        duplicate: false;
        message: {
          id: string;
          status: MessageStatus;
          type: MessageType;
          messageTimestamp: Date;
        };
      }
    | { duplicate: true; message: null };

  try {
    queued = await prisma.$transaction(async (transaction) => {
      await transaction.webhookEvent.create({
        data: {
          eventKey,
          eventType: "instagram.outbound_queue",
          payload: toJson({
            conversationId: conversation.id,
            recipientId: instagramScopedId,
            idempotencyKey: input.idempotencyKey,
            kind: "text",
          }),
          attemptCount: 1,
        },
      });

      const message = await transaction.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          sentById: input.sentById,
          direction: MessageDirection.OUTBOUND,
          actor: input.actor,
          type: MessageType.TEXT,
          status: MessageStatus.QUEUED,
          text,
          replyToMetaMessageId,
          rawPayload: toJson({
            channel: "instagram",
            outbound: {
              idempotencyKey: input.idempotencyKey,
              instagramScopedId,
              serviceWindowOpen: policy.serviceWindowOpen,
              queuedAt: now.toISOString(),
            },
          }),
          messageTimestamp: now,
        },
        select: {
          id: true,
          status: true,
          type: true,
          messageTimestamp: true,
        },
      });

      await transaction.webhookEvent.update({
        where: { eventKey },
        data: { processedAt: new Date() },
      });

      return { duplicate: false as const, message };
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    queued = { duplicate: true, message: null };
  }

  if (queued.duplicate || !queued.message) {
    return {
      queued: false,
      duplicate: true,
      message: null,
      outboundSent: false,
      dispatchStatus: null,
      dispatchMode: getInstagramOutboundMode(),
      dispatchError: null,
    };
  }

  const mode = getInstagramOutboundMode();
  try {
    const sent = await sendInstagramTextMessage({
      recipientId: instagramScopedId,
      text,
    });
    const sentAt = new Date();

    await prisma.$transaction([
      prisma.whatsAppMessage.update({
        where: { id: queued.message.id },
        data: {
          metaMessageId: sent.metaMessageId,
          status: MessageStatus.SENT,
          failureCode: null,
          failureReason: null,
          rawPayload: toJson({
            channel: "instagram",
            outbound: {
              idempotencyKey: input.idempotencyKey,
              instagramScopedId,
              recipientId: sent.recipientId,
              sentAt: sentAt.toISOString(),
              metaAcceptedStatus: sent.statusCode,
            },
          }),
        },
      }),
      prisma.whatsAppMessageStatusEvent.create({
        data: {
          messageId: queued.message.id,
          status: MessageStatus.SENT,
          metaTimestamp: sentAt,
          rawPayload: toJson({ source: "instagram_send_response" }),
        },
      }),
      prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.WAITING,
          lastMessageAt: sentAt,
        },
      }),
    ]);

    return {
      queued: true,
      duplicate: false,
      message: { ...queued.message, status: MessageStatus.SENT },
      outboundSent: true,
      dispatchStatus: "SENT" as const,
      dispatchMode: mode,
      dispatchError: null,
    };
  } catch (error) {
    const reason = (
      error instanceof Error ? error.message : "Instagram delivery failed."
    ).slice(0, 1_000);
    const failedAt = new Date();

    await prisma.$transaction([
      prisma.whatsAppMessage.update({
        where: { id: queued.message.id },
        data: {
          status: MessageStatus.FAILED,
          failureCode: "INSTAGRAM_SEND_FAILED",
          failureReason: reason,
        },
      }),
      prisma.whatsAppMessageStatusEvent.create({
        data: {
          messageId: queued.message.id,
          status: MessageStatus.FAILED,
          metaTimestamp: failedAt,
          rawPayload: toJson({ source: "instagram_send_error", reason }),
        },
      }),
    ]);

    return {
      queued: true,
      duplicate: false,
      message: { ...queued.message, status: MessageStatus.FAILED },
      outboundSent: false,
      dispatchStatus: "FAILED" as const,
      dispatchMode: mode,
      dispatchError: reason,
    };
  }
}

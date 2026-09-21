import {
  ConversationStatus,
  MessageActor,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  dashboardMediaUrl,
  loadMediaAsset,
  readMediaAsset,
} from "../media/media-storage";
import {
  getOutboundMode,
  isRetriableMetaError,
  sendMetaWhatsAppMessage,
  uploadMetaWhatsAppMedia,
} from "../meta/outbound-client";
import { sha256Hex } from "../meta/signature";
import { evaluateOutboundPolicy } from "./policy";
import type {
  DispatchResult,
  OutboundContent,
  OutboundMediaType,
  PreparedMetaMessage,
  QueueOutboundInput,
} from "./types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function compact(value: string, maximum: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maximum);
}

function normalizeRecipient(waId: string): string {
  return waId.replace(/^\+/, "").replace(/\D/g, "");
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function outboundMetadata(value: Prisma.JsonValue | null): Record<string, unknown> {
  const root = asRecord(value);
  return root.outbound && typeof root.outbound === "object" && !Array.isArray(root.outbound)
    ? (root.outbound as Record<string, unknown>)
    : {};
}

function isMediaMessageType(type: MessageType): boolean {
  return (
    type === MessageType.IMAGE ||
    type === MessageType.DOCUMENT ||
    type === MessageType.VIDEO ||
    type === MessageType.AUDIO
  );
}

function mediaTypeFromMessageType(type: MessageType): OutboundMediaType {
  if (type === MessageType.IMAGE) return "image";
  if (type === MessageType.DOCUMENT) return "document";
  if (type === MessageType.VIDEO) return "video";
  if (type === MessageType.AUDIO) return "audio";
  throw new Error("Queued message is not a supported media type.");
}

function withContext(
  payload: PreparedMetaMessage,
  replyToMetaMessageId: string | null,
): PreparedMetaMessage {
  return replyToMetaMessageId
    ? { ...payload, context: { message_id: replyToMetaMessageId } }
    : payload;
}

function preparedPayload(input: {
  waId: string;
  type: MessageType;
  text: string | null;
  filename: string | null;
  replyToMetaMessageId: string | null;
  template: {
    name: string;
    language: string;
  } | null;
  components: unknown[];
  metaMediaId: string | null;
}): PreparedMetaMessage {
  const base = {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: normalizeRecipient(input.waId),
  };

  if (input.type === MessageType.TEMPLATE) {
    if (!input.template) throw new Error("Approved WhatsApp template is missing.");
    return {
      ...base,
      type: "template",
      template: {
        name: input.template.name,
        language: { code: input.template.language },
        ...(input.components.length > 0
          ? { components: input.components }
          : {}),
      },
    };
  }

  if (isMediaMessageType(input.type)) {
    if (!input.metaMediaId) throw new Error("Meta media ID is missing.");
    const caption = input.text?.trim() || undefined;
    const mediaType = mediaTypeFromMessageType(input.type);

    if (mediaType === "image") {
      return withContext(
        { ...base, type: "image", image: { id: input.metaMediaId, ...(caption ? { caption } : {}) } },
        input.replyToMetaMessageId,
      );
    }
    if (mediaType === "document") {
      return withContext(
        {
          ...base,
          type: "document",
          document: {
            id: input.metaMediaId,
            ...(caption ? { caption } : {}),
            ...(input.filename ? { filename: input.filename } : {}),
          },
        },
        input.replyToMetaMessageId,
      );
    }
    if (mediaType === "video") {
      return withContext(
        { ...base, type: "video", video: { id: input.metaMediaId, ...(caption ? { caption } : {}) } },
        input.replyToMetaMessageId,
      );
    }
    return withContext(
      { ...base, type: "audio", audio: { id: input.metaMediaId } },
      input.replyToMetaMessageId,
    );
  }

  if (!input.text) throw new Error("Outbound text is missing.");
  return withContext(
    {
      ...base,
      type: "text",
      text: {
        preview_url: false,
        body: input.text,
      },
    },
    input.replyToMetaMessageId,
  );
}

export async function queueOutboundMessage(input: QueueOutboundInput) {
  const now = input.now ?? new Date();
  const idempotencyKey = compact(input.idempotencyKey, 200);
  if (!idempotencyKey) throw new Error("Outbound idempotency key is required.");

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: input.conversationId },
    select: {
      id: true,
      status: true,
      agentMode: true,
      serviceWindowExpiresAt: true,
      contact: {
        select: {
          id: true,
          waId: true,
          consentStatus: true,
        },
      },
    },
  });
  if (!conversation) throw new Error("Conversation not found.");

  const template =
    input.content.kind === "template"
      ? await prisma.whatsAppTemplate.findUnique({
          where: { id: input.content.templateId },
          select: {
            id: true,
            name: true,
            language: true,
            status: true,
          },
        })
      : null;
  if (input.content.kind === "template" && !template) {
    throw new Error("WhatsApp template not found.");
  }

  const mediaAsset =
    input.content.kind === "media"
      ? await loadMediaAsset(input.content.assetId)
      : null;
  if (
    input.content.kind === "media" &&
    mediaAsset &&
    mediaAsset.kind !== input.content.mediaType
  ) {
    throw new Error("Selected media type does not match the uploaded file.");
  }

  const policy = evaluateOutboundPolicy({
    context: {
      actor: input.actor,
      agentMode: conversation.agentMode,
      conversationStatus: conversation.status,
      consentStatus: conversation.contact.consentStatus,
      serviceWindowExpiresAt: conversation.serviceWindowExpiresAt,
      templateStatus: template?.status ?? null,
    },
    content: input.content,
    now,
  });
  if (!policy.allowed) {
    throw new Error(policy.reason ?? "Outbound message is not allowed.");
  }

  const eventKey = `outbound:${sha256Hex(
    `${conversation.id}:${idempotencyKey}`,
  )}`;

  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.webhookEvent.create({
        data: {
          eventKey,
          eventType: "outbound_queue",
          payload: toJson({
            conversationId: conversation.id,
            idempotencyKey,
            kind: input.content.kind,
            assetId: input.content.kind === "media" ? input.content.assetId : null,
          }),
          attemptCount: 1,
        },
      });

      const text =
        input.content.kind === "text"
          ? input.content.text.trim().slice(0, 4_096)
          : input.content.kind === "media"
            ? input.content.caption?.trim().slice(0, 1_024) || null
            : null;
      const replyToMetaMessageId =
        input.content.kind === "text" || input.content.kind === "media"
          ? input.content.replyToMetaMessageId?.trim().slice(0, 300) || null
          : null;
      const message = await transaction.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          sentById: input.sentById ?? null,
          direction: MessageDirection.OUTBOUND,
          actor: input.actor,
          type: policy.messageType,
          status: MessageStatus.QUEUED,
          text,
          mediaUrl: mediaAsset ? dashboardMediaUrl(mediaAsset.id) : null,
          mimeType: mediaAsset?.mimeType ?? null,
          filename:
            input.content.kind === "media"
              ? compact(input.content.filename || mediaAsset?.originalName || "attachment", 180)
              : null,
          replyToMetaMessageId,
          rawPayload: toJson({
            outbound: {
              idempotencyKey,
              kind: input.content.kind,
              templateId: template?.id ?? null,
              templateName: template?.name ?? null,
              language: template?.language ?? null,
              components:
                input.content.kind === "template"
                  ? input.content.components ?? []
                  : [],
              assetId: input.content.kind === "media" ? input.content.assetId : null,
              mediaType:
                input.content.kind === "media" ? input.content.mediaType : null,
              serviceWindowOpen: policy.serviceWindowOpen,
              queuedAt: now.toISOString(),
              attemptCount: 0,
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

      return {
        queued: true,
        duplicate: false,
        outboundSent: false,
        message,
      };
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return {
        queued: false,
        duplicate: true,
        outboundSent: false,
        message: null,
      };
    }
    throw error;
  }
}

export async function dispatchOutboundMessage(
  messageId: string,
): Promise<DispatchResult> {
  const message = await prisma.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      status: true,
      type: true,
      text: true,
      mediaId: true,
      mimeType: true,
      filename: true,
      replyToMetaMessageId: true,
      rawPayload: true,
      conversation: {
        select: {
          id: true,
          contact: { select: { waId: true } },
        },
      },
    },
  });
  if (!message) throw new Error("Queued outbound message not found.");
  if (message.status !== MessageStatus.QUEUED) {
    throw new Error(`Outbound message is ${message.status}, not QUEUED.`);
  }

  const metadata = outboundMetadata(message.rawPayload);
  const templateId =
    typeof metadata.templateId === "string" ? metadata.templateId : null;
  const components = Array.isArray(metadata.components)
    ? metadata.components
    : [];
  const template = templateId
    ? await prisma.whatsAppTemplate.findUnique({
        where: { id: templateId },
        select: { name: true, language: true },
      })
    : null;
  const mode = getOutboundMode();

  let metaMediaId =
    message.mediaId ||
    (typeof metadata.metaMediaId === "string" ? metadata.metaMediaId : null);
  const assetId = typeof metadata.assetId === "string" ? metadata.assetId : null;
  if (isMediaMessageType(message.type) && !metaMediaId) {
    if (!assetId) throw new Error("Queued media asset ID is missing.");
    if (mode === "live") {
      const { asset, data } = await readMediaAsset(assetId);
      const uploaded = await uploadMetaWhatsAppMedia({
        data,
        mimeType: asset.mimeType,
        filename: message.filename || asset.originalName,
      });
      metaMediaId = uploaded.mediaId;
    } else {
      metaMediaId = `preview_${assetId.slice(0, 16)}`;
    }
  }

  const payload = preparedPayload({
    waId: message.conversation.contact.waId,
    type: message.type,
    text: message.text,
    filename: message.filename,
    replyToMetaMessageId: message.replyToMetaMessageId,
    template,
    components,
    metaMediaId,
  });

  if (mode !== "live") {
    return {
      messageId: message.id,
      mode,
      outboundSent: false,
      metaMessageId: null,
      status: "QUEUED",
      retriable: false,
      reason:
        mode === "dry_run"
          ? "DRY_RUN_ONLY"
          : "OUTBOUND_LIVE_SENDING_DISABLED",
      preparedPayload: payload,
    };
  }

  const previousAttempts =
    typeof metadata.attemptCount === "number" && Number.isFinite(metadata.attemptCount)
      ? Math.max(0, Math.floor(metadata.attemptCount))
      : 0;

  try {
    const sent = await sendMetaWhatsAppMessage(payload);
    const sentAt = new Date();
    await prisma.$transaction([
      prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          metaMessageId: sent.metaMessageId,
          mediaId: isMediaMessageType(message.type) ? metaMediaId : message.mediaId,
          status: MessageStatus.SENT,
          failureCode: null,
          failureReason: null,
          rawPayload: toJson({
            ...asRecord(message.rawPayload),
            outbound: {
              ...metadata,
              metaMediaId: isMediaMessageType(message.type) ? metaMediaId : null,
              attemptCount: previousAttempts + 1,
              lastAttemptAt: sentAt.toISOString(),
              metaAcceptedStatus: sent.statusCode,
            },
          }),
        },
      }),
      prisma.whatsAppMessageStatusEvent.create({
        data: {
          messageId: message.id,
          status: MessageStatus.SENT,
          metaTimestamp: sentAt,
          rawPayload: toJson({ source: "meta_send_response" }),
        },
      }),
      prisma.whatsAppConversation.update({
        where: { id: message.conversation.id },
        data: {
          status: ConversationStatus.WAITING,
          lastMessageAt: sentAt,
        },
      }),
    ]);

    return {
      messageId: message.id,
      mode,
      outboundSent: true,
      metaMessageId: sent.metaMessageId,
      status: "SENT",
      retriable: false,
      reason: null,
    };
  } catch (error) {
    const reason = (error instanceof Error ? error.message : "Meta send failed.").slice(
      0,
      1_000,
    );
    const retriable = isRetriableMetaError(error) && previousAttempts < 4;
    const nextStatus = retriable ? MessageStatus.QUEUED : MessageStatus.FAILED;

    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        mediaId: isMediaMessageType(message.type) ? metaMediaId : message.mediaId,
        status: nextStatus,
        failureCode: retriable ? "RETRIABLE_META_ERROR" : "META_SEND_FAILED",
        failureReason: reason,
        rawPayload: toJson({
          ...asRecord(message.rawPayload),
          outbound: {
            ...metadata,
            metaMediaId: isMediaMessageType(message.type) ? metaMediaId : null,
            attemptCount: previousAttempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: reason,
          },
        }),
      },
    });

    if (!retriable) {
      await prisma.whatsAppMessageStatusEvent.create({
        data: {
          messageId: message.id,
          status: MessageStatus.FAILED,
          metaTimestamp: new Date(),
          rawPayload: toJson({ source: "meta_send_error", reason }),
        },
      });
    }

    return {
      messageId: message.id,
      mode,
      outboundSent: false,
      metaMessageId: null,
      status: retriable ? "QUEUED" : "FAILED",
      retriable,
      reason,
    };
  }
}

export async function dispatchQueuedOutboundBatch(limit = 10) {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const queued = await prisma.whatsAppMessage.findMany({
    where: {
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.QUEUED,
    },
    orderBy: { createdAt: "asc" },
    take: safeLimit,
    select: { id: true },
  });

  const results: DispatchResult[] = [];
  for (const message of queued) {
    results.push(await dispatchOutboundMessage(message.id));
    if (getOutboundMode() !== "live") break;
  }

  return {
    mode: getOutboundMode(),
    inspected: queued.length,
    processed: results.length,
    sent: results.filter((result) => result.outboundSent).length,
    results,
  };
}

export function counselorTextContent(text: string): OutboundContent {
  return { kind: "text", text };
}

export const OUTBOUND_ACTORS = {
  ai: MessageActor.AI,
  counselor: MessageActor.COUNSELOR,
} as const;

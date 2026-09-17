import type { MessageActor, MessageType } from "@prisma/client";

export type OutboundMode = "disabled" | "dry_run" | "live";
export type OutboundMediaType = "image" | "document" | "video" | "audio";

export type OutboundTextRequest = {
  kind: "text";
  text: string;
  replyToMetaMessageId?: string | null;
};

export type OutboundTemplateRequest = {
  kind: "template";
  templateId: string;
  components?: unknown[];
};

export type OutboundMediaRequest = {
  kind: "media";
  assetId: string;
  mediaType: OutboundMediaType;
  caption?: string | null;
  filename?: string | null;
  replyToMetaMessageId?: string | null;
};

export type OutboundContent =
  | OutboundTextRequest
  | OutboundTemplateRequest
  | OutboundMediaRequest;

export type QueueOutboundInput = {
  conversationId: string;
  actor: MessageActor;
  sentById?: string | null;
  content: OutboundContent;
  idempotencyKey: string;
  now?: Date;
};

export type OutboundPolicyDecision = {
  allowed: boolean;
  reason: string | null;
  messageType: MessageType;
  serviceWindowOpen: boolean;
};

export type PreparedMetaMessage = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text" | "template" | OutboundMediaType;
  text?: {
    preview_url: boolean;
    body: string;
  };
  template?: {
    name: string;
    language: { code: string };
    components?: unknown[];
  };
  image?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  video?: { id: string; caption?: string };
  audio?: { id: string };
  context?: {
    message_id: string;
  };
};

export type DispatchResult = {
  messageId: string;
  mode: OutboundMode;
  outboundSent: boolean;
  metaMessageId: string | null;
  status: "QUEUED" | "SENT" | "FAILED";
  retriable: boolean;
  reason: string | null;
  preparedPayload?: PreparedMetaMessage;
};

import { prisma } from "@/lib/db/prisma";
import type { ChannelType } from "@/modules/channels/core/contracts/channel";
import type {
  UnifiedInboxConversationDetail,
  UnifiedInboxConversationSummary,
  UnifiedInboxListFilter,
} from "@/modules/inbox/application/read-model";
import { assertUnifiedInboxFilter } from "@/modules/inbox/application/read-model";

const WORKSPACE_ID = "engagews_default";

function optional(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function conversationStatus(value: string): UnifiedInboxConversationSummary["status"] {
  if (value === "WAITING") return "PENDING";
  if (value === "CLOSED") return "CLOSED";
  if (value === "SPAM") return "ARCHIVED";
  return "OPEN";
}

function agentMode(value: string): UnifiedInboxConversationSummary["agentMode"] {
  if (value === "HUMAN") return "HUMAN";
  if (value === "PAUSED") return "PAUSED";
  if (value === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  return "AI";
}

function messageActor(value: string): "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM" {
  if (value === "AI") return "AI";
  if (value === "COUNSELOR") return "HUMAN";
  if (value === "SYSTEM") return "SYSTEM";
  return "CUSTOMER";
}

export function legacyChannelFromSource(source?: string | null): ChannelType {
  const normalized = source?.trim().toLowerCase();
  if (normalized === "instagram") return "INSTAGRAM";
  if (normalized === "messenger") return "MESSENGER";
  return "WHATSAPP";
}

export function legacyConnectionId(input: {
  channel: ChannelType;
  whatsappPhoneNumberId?: string;
  instagramAccountId?: string;
  messengerPageId?: string;
}): string {
  const externalId =
    input.channel === "INSTAGRAM"
      ? input.instagramAccountId?.trim()
      : input.channel === "MESSENGER"
        ? input.messengerPageId?.trim()
        : input.whatsappPhoneNumberId?.trim();
  return `${input.channel.toLowerCase()}:${externalId || "legacy"}`;
}

export function mapLegacyConversationSummary(input: {
  id: string;
  status: string;
  agentMode: string;
  unreadCount: number;
  source: string | null;
  lastMessageAt: Date | null;
  contact: {
    id: string;
    displayName: string | null;
    profileName: string | null;
    phone: string;
    email: string | null;
    city: string | null;
  };
  assignedTo: { id: string; name: string } | null;
  lead: {
    stage: string;
    temperature: string;
    score: number;
    interestedCourse: string | null;
    nextFollowUpAt: Date | null;
  } | null;
  messages: Array<{
    text: string | null;
    type: string;
    direction: string;
    messageTimestamp: Date;
  }>;
}, identifiers: {
  whatsappPhoneNumberId?: string;
  instagramAccountId?: string;
  messengerPageId?: string;
} = {}): UnifiedInboxConversationSummary {
  const channel = legacyChannelFromSource(input.source);
  const latest = input.messages[0];
  return {
    id: input.id,
    workspaceId: WORKSPACE_ID,
    connectionId: legacyConnectionId({ channel, ...identifiers }),
    channel,
    externalConversationId: input.id,
    contact: {
      id: input.contact.id,
      displayName: input.contact.displayName || input.contact.profileName || input.contact.phone,
      phone: input.contact.phone,
      email: optional(input.contact.email),
      city: optional(input.contact.city),
    },
    status: conversationStatus(input.status),
    agentMode: agentMode(input.agentMode),
    unreadCount: input.unreadCount,
    source: optional(input.source),
    lastInteractionAt: input.lastMessageAt?.toISOString(),
    lastMessage: latest
      ? {
          text: optional(latest.text),
          kind: latest.type,
          direction: latest.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
          occurredAt: latest.messageTimestamp.toISOString(),
        }
      : undefined,
    assignee: input.assignedTo ?? undefined,
    lead: input.lead
      ? {
          stage: input.lead.stage,
          temperature: input.lead.temperature,
          score: input.lead.score,
          interestedCourse: optional(input.lead.interestedCourse),
          nextFollowUpAt: input.lead.nextFollowUpAt?.toISOString(),
        }
      : undefined,
  };
}

function runtimeIdentifiers() {
  return {
    whatsappPhoneNumberId:
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
      process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim(),
    instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID?.trim(),
    messengerPageId: process.env.MESSENGER_PAGE_ID?.trim(),
  };
}

function sourceWhere(channel: ChannelType | undefined) {
  if (channel === "INSTAGRAM") return { source: { equals: "instagram", mode: "insensitive" as const } };
  if (channel === "MESSENGER") return { source: { equals: "messenger", mode: "insensitive" as const } };
  if (channel === "WHATSAPP") {
    return {
      OR: [
        { source: null },
        { source: { notIn: ["instagram", "messenger"] } },
      ],
    };
  }
  if (channel) return { id: "__engageos_no_legacy_rows_for_channel__" };
  return {};
}

export async function listLegacyUnifiedInbox(
  filter: UnifiedInboxListFilter,
): Promise<UnifiedInboxConversationSummary[]> {
  assertUnifiedInboxFilter(filter);

  const rows = await prisma.whatsAppConversation.findMany({
    where: {
      ...sourceWhere(filter.channel),
      ...(filter.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
      ...(filter.assignedActorId ? { assignedToId: filter.assignedActorId } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: filter.limit,
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      lead: {
        select: {
          stage: true,
          temperature: true,
          score: true,
          interestedCourse: true,
          nextFollowUpAt: true,
        },
      },
      messages: {
        orderBy: { messageTimestamp: "desc" },
        take: 1,
        select: {
          text: true,
          type: true,
          direction: true,
          messageTimestamp: true,
        },
      },
    },
  });

  const identifiers = runtimeIdentifiers();
  return rows
    .map((row) => mapLegacyConversationSummary(row, identifiers))
    .filter((row) => !filter.status || row.status === filter.status);
}

export async function getLegacyUnifiedInboxConversation(
  conversationId: string,
): Promise<UnifiedInboxConversationDetail | null> {
  const row = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      lead: {
        select: {
          stage: true,
          temperature: true,
          score: true,
          interestedCourse: true,
          nextFollowUpAt: true,
        },
      },
      messages: {
        orderBy: { messageTimestamp: "asc" },
        take: 200,
        select: {
          id: true,
          metaMessageId: true,
          direction: true,
          actor: true,
          type: true,
          status: true,
          text: true,
          mediaUrl: true,
          mimeType: true,
          filename: true,
          aiConfidence: true,
          messageTimestamp: true,
        },
      },
      tags: { include: { tag: true } },
    },
  });
  if (!row) return null;

  const latest = row.messages.at(-1);
  const summary = mapLegacyConversationSummary(
    {
      ...row,
      messages: latest
        ? [{
            text: latest.text,
            type: latest.type,
            direction: latest.direction,
            messageTimestamp: latest.messageTimestamp,
          }]
        : [],
    },
    runtimeIdentifiers(),
  );

  return {
    ...summary,
    campaign: optional(row.campaign),
    currentIntent: optional(row.currentIntent),
    detectedLanguage: optional(row.detectedLanguage),
    aiConfidence: row.aiConfidence ?? undefined,
    aiSummary: optional(row.aiSummary),
    serviceWindowExpiresAt: row.serviceWindowExpiresAt?.toISOString(),
    messages: row.messages.map((message) => ({
      id: message.id,
      channel: summary.channel,
      direction: message.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
      actor: messageActor(message.actor),
      kind: message.type,
      status: message.status,
      text: optional(message.text),
      media:
        message.mediaUrl || message.mimeType || message.filename
          ? {
              url: optional(message.mediaUrl),
              mimeType: optional(message.mimeType),
              fileName: optional(message.filename),
            }
          : undefined,
      externalMessageId: optional(message.metaMessageId),
      aiConfidence: message.aiConfidence ?? undefined,
      occurredAt: message.messageTimestamp.toISOString(),
    })),
    tags: row.tags.map(({ tag }) => ({
      id: tag.id,
      name: tag.name,
      color: optional(tag.color),
    })),
  };
}

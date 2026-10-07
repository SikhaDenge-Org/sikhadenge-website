import type { ChannelType } from "@/modules/channels/core/contracts/channel";

export type UnifiedInboxStatus = "OPEN" | "PENDING" | "CLOSED" | "ARCHIVED";
export type UnifiedInboxAgentMode = "AI" | "HUMAN" | "PAUSED" | "REVIEW_REQUIRED";

export type UnifiedInboxContact = {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  city?: string;
};

export type UnifiedInboxMessagePreview = {
  text?: string;
  kind: string;
  direction: "INBOUND" | "OUTBOUND";
  occurredAt: string;
};

export type UnifiedInboxConversationSummary = {
  id: string;
  workspaceId: string;
  connectionId: string;
  channel: ChannelType;
  externalConversationId?: string;
  contact: UnifiedInboxContact;
  status: UnifiedInboxStatus;
  agentMode: UnifiedInboxAgentMode;
  unreadCount: number;
  source?: string;
  lastInteractionAt?: string;
  lastMessage?: UnifiedInboxMessagePreview;
  assignee?: { id: string; name: string };
  lead?: {
    stage: string;
    temperature: string;
    score: number;
    interestedCourse?: string;
    nextFollowUpAt?: string;
  };
};

export type UnifiedInboxMessage = {
  id: string;
  channel: ChannelType;
  direction: "INBOUND" | "OUTBOUND";
  actor: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM";
  kind: string;
  status: string;
  text?: string;
  media?: {
    url?: string;
    mimeType?: string;
    fileName?: string;
  };
  externalMessageId?: string;
  aiConfidence?: number;
  occurredAt: string;
};

export type UnifiedInboxConversationDetail = UnifiedInboxConversationSummary & {
  campaign?: string;
  currentIntent?: string;
  detectedLanguage?: string;
  aiConfidence?: number;
  aiSummary?: string;
  serviceWindowExpiresAt?: string;
  messages: UnifiedInboxMessage[];
  tags: Array<{ id: string; name: string; color?: string }>;
};

export type UnifiedInboxListFilter = {
  channel?: ChannelType;
  status?: UnifiedInboxStatus;
  unreadOnly?: boolean;
  assignedActorId?: string;
  limit: number;
};

export function assertUnifiedInboxFilter(filter: UnifiedInboxListFilter): void {
  if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 100) {
    throw new Error("Unified Inbox limit must be an integer between 1 and 100.");
  }
}

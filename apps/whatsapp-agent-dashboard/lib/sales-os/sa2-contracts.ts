export type IdentityLinkStatus = "UNLINKED" | "LINKED" | "CONFLICT_BLOCKED";

export type LinkDecisionType = 
  | "AUTO_LINKED"
  | "AUTO_UNLINKED"
  | "CONFLICT_BLOCKED"
  | "CANDIDATE_REJECTED"
  | "MANUAL_LINKED"
  | "MANUAL_UNLINKED";

export type ConsentPurpose = "SALES" | "WORKSHOP" | "MARKETING" | "SERVICE" | "PAYMENT";
export type ConsentStatus = "GRANTED" | "REVOKED" | "EXPIRED";
export type SuppressionScope = "GLOBAL" | "CHANNEL_WHATSAPP";

export interface WhatsAppParticipantState {
  id: string;
  phoneNumber: string;
  phoneHash: string;
  displayName?: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface WhatsAppConversationState {
  id: string;
  participantId: string;
  leadId?: string | null;
  linkStatus: IdentityLinkStatus;
  status: "ACTIVE" | "ARCHIVED" | "BLOCKED";
  isHumanTakeover: boolean;
  assignedCounsellorId?: string | null;
  lastInboundAt?: Date | null;
  lastOutboundAt?: Date | null;
}

export interface WhatsAppConsentRecord {
  participantId: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  source: string;
  evidence?: Record<string, unknown> | null;
  capturedAt: Date;
  revokedAt?: Date | null;
}

export interface WhatsAppSuppressionRecord {
  phoneNumber: string;
  phoneHash: string;
  scope: SuppressionScope;
  reason: string;
  source: "INBOUND_STOP" | "MANUAL_REQUEST" | "COMPLAINT_GATE";
  suppressedAt: Date;
  releasedAt?: Date | null;
}

export function isOptOutKeyword(text: string): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();

  // 1. Direct standard keywords
  if (/^(stop|unsubscribe|cancel|quit|end|roko)$/i.test(normalized)) {
    return true;
  }

  // 2. Conversational English & Hinglish opt-out patterns
  const conversationalPatterns = [
    /\b(stop|unsubscribe|cancel)\b/i,
    /(message|msg|text)\s*mat\s*(karo|bhejo|kariye|send)/i,
    /mat\s*(bhejo|karo|kariye)\s*(message|msg|text)?/i,
    /(band\s+karo|roko|chup\s+raho|pareshan\s+mat\s+karo|disturb\s+mat\s+karo)/i,
    /(don\'t|dont)\s*(text|message|contact|send)/i,
    /opt\s*-?\s*out/i
  ];

  return conversationalPatterns.some((pattern) => pattern.test(normalized));
}

export type SupportedLanguage = "hi" | "hinglish" | "en" | "unknown";

export type ConversationMode = "AI" | "HUMAN" | "PAUSED";

export type LeadTemperature = "HOT" | "WARM" | "COLD" | "UNQUALIFIED";

export type MessageDirection = "INBOUND" | "OUTBOUND";

export type MessageStatus =
  | "RECEIVED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export type AgentIntent =
  | "GREETING"
  | "COURSE_DISCOVERY"
  | "COURSE_DETAILS"
  | "FEES"
  | "DEMO_BOOKING"
  | "ADMISSION"
  | "PAYMENT_SUPPORT"
  | "CERTIFICATE"
  | "CLASS_SCHEDULE"
  | "REFUND_OR_COMPLAINT"
  | "HUMAN_REQUEST"
  | "OPT_OUT"
  | "UNSUPPORTED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ContactSnapshot {
  id: string;
  phoneE164: string;
  displayName?: string;
  language: SupportedLanguage;
  optedOut: boolean;
  lastInboundAt?: Date;
}

export interface LeadSnapshot {
  id?: string;
  status?: string;
  temperature?: LeadTemperature;
  score?: number;
  interestedCourse?: string;
  occupation?: string;
  city?: string;
  joiningTimeline?: string;
  assignedCounselorId?: string;
}

export interface ConversationSnapshot {
  id: string;
  mode: ConversationMode;
  summary?: string;
  lastMessages: Array<{
    direction: MessageDirection;
    text: string;
    createdAt: Date;
  }>;
}

export interface KnowledgeReference {
  id: string;
  title: string;
  version: number;
  sourceType: "COURSE" | "FAQ" | "POLICY" | "OFFER" | "SCHEDULE";
}

export interface AgentDecisionInput {
  messageId: string;
  inboundText: string;
  contact: ContactSnapshot;
  lead?: LeadSnapshot;
  conversation: ConversationSnapshot;
  knowledge: KnowledgeReference[];
}

export interface AgentAction {
  type:
    | "SEND_REPLY"
    | "ASK_QUESTION"
    | "UPDATE_LEAD"
    | "ASSIGN_COUNSELOR"
    | "PAUSE_AI"
    | "MARK_OPT_OUT"
    | "NO_ACTION";
  payload?: Record<string, unknown>;
}

export interface AgentDecision {
  intent: AgentIntent;
  language: SupportedLanguage;
  risk: RiskLevel;
  confidence: number;
  conciseDecisionSummary: string;
  knowledgeReferences: KnowledgeReference[];
  draftReply?: string;
  actions: AgentAction[];
  requiresHumanReview: boolean;
  reviewReason?: string;
}

export interface LearningCandidate {
  id: string;
  conversationId: string;
  sourceMessageId: string;
  category:
    | "COUNSELOR_CORRECTION"
    | "SUCCESSFUL_REPLY"
    | "MISSING_KNOWLEDGE"
    | "FAILED_REPLY";
  proposedQuestion: string;
  proposedAnswer: string;
  evidence: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
}

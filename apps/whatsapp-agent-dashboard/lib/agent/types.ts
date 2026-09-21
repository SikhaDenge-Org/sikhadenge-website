export const AGENT_LANGUAGES = ["hi", "en", "hinglish"] as const;

export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export const AGENT_INTENTS = [
  "GREETING",
  "COURSE_DISCOVERY",
  "COURSE_DETAILS",
  "FEES",
  "BATCH_SCHEDULE",
  "DEMO_CLASS",
  "ELIGIBILITY",
  "CERTIFICATE",
  "PAYMENT_SUPPORT",
  "ENROLLMENT",
  "COUNSELOR_REQUEST",
  "REFUND_OR_COMPLAINT",
  "OPT_OUT",
  "OUT_OF_SCOPE",
  "UNKNOWN",
] as const;

export type AgentIntent = (typeof AGENT_INTENTS)[number];

export const HANDOFF_REASONS = [
  "CUSTOMER_REQUESTED_HUMAN",
  "LOW_CONFIDENCE",
  "MISSING_APPROVED_KNOWLEDGE",
  "PAYMENT_OR_ACCOUNT_RISK",
  "REFUND_OR_COMPLAINT",
  "PROMPT_INJECTION",
  "UNSUPPORTED_MEDIA",
  "POLICY_RESTRICTION",
  "AGENT_UNAVAILABLE",
] as const;

export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type AgentHistoryMessage = {
  role: "customer" | "assistant" | "counselor";
  text: string;
  createdAt: string;
};

export type AgentContactContext = {
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  language?: string | null;
  consentStatus?: string | null;
};

export type AgentLeadContext = {
  stage?: string | null;
  temperature?: string | null;
  score?: number | null;
  occupation?: string | null;
  experienceLevel?: string | null;
  goal?: string | null;
  interestedCourse?: string | null;
  joiningTimeline?: string | null;
  classAvailability?: string | null;
  feeUnderstood?: boolean | null;
  counselorRequested?: boolean | null;
};

export type AgentKnowledgeReference = {
  chunkId: string;
  documentId: string;
  title: string;
  heading: string | null;
  content: string;
  score: number;
};

export type AgentInput = {
  conversationId?: string | null;
  customerMessage: string;
  languageHint?: string | null;
  conversationSummary?: string | null;
  history?: AgentHistoryMessage[];
  contact?: AgentContactContext | null;
  lead?: AgentLeadContext | null;
};

export type AgentSafetyResult = {
  safe: boolean;
  promptInjectionDetected: boolean;
  sensitiveDataDetected: boolean;
  blockedReason: string | null;
};

export type AgentLeadUpdates = {
  occupation?: string;
  experienceLevel?: string;
  goal?: string;
  interestedCourse?: string;
  joiningTimeline?: string;
  classAvailability?: string;
  feeUnderstood?: boolean;
  counselorRequested?: boolean;
};

export type AgentTelemetry = {
  source: "rule" | "fallback" | "model";
  totalLatencyMs: number;
  modelLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  fallbackModelUsed: boolean;
  requestId: string | null;
};

export type AgentDecision = {
  shouldReply: boolean;
  reply: string;
  language: AgentLanguage;
  intent: AgentIntent;
  confidence: number;
  decisionSummary: string;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
  nextQuestion: string | null;
  leadUpdates: AgentLeadUpdates;
  knowledgeReferences: Array<
    Omit<AgentKnowledgeReference, "content">
  >;
  safety: AgentSafetyResult;
  model: string | null;
  telemetry?: AgentTelemetry;
};

export type RuleClassification = {
  language: AgentLanguage;
  intent: AgentIntent;
  confidence: number;
  requiresHuman: boolean;
  handoffReason: HandoffReason | null;
};

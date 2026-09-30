export const VOICE_LEAD_STAGES = [
  "NEW",
  "DISCOVERY",
  "QUALIFIED",
  "COUNSELOR_ASSIGNED",
  "DEMO_BOOKED",
  "PAYMENT_PENDING",
  "ENROLLED",
  "NURTURE",
  "CLOSED",
] as const;

export type VoiceLeadStage = (typeof VOICE_LEAD_STAGES)[number];

export const VOICE_AGENT_ROLES = [
  "COMPLIANCE_TRIAGE",
  "QUALIFICATION",
  "PROGRAM_DISCOVERY",
  "APPOINTMENT_BOOKING",
  "OBJECTION_AND_FEE",
  "CONVERSION",
  "HUMAN_TRANSFER",
  "NURTURE_REACTIVATION",
] as const;

export type VoiceAgentRole = (typeof VOICE_AGENT_ROLES)[number];

export const VOICE_CALL_STATES = [
  "ELIGIBILITY_BLOCKED",
  "QUEUED",
  "DIALING",
  "RINGING",
  "CONNECTED",
  "AI_ACTIVE",
  "AI_HANDOFF",
  "HUMAN_TRANSFER_PENDING",
  "HUMAN_ACTIVE",
  "COMPLETED",
  "NO_ANSWER",
  "BUSY",
  "VOICEMAIL",
  "FAILED",
  "CANCELLED",
  "OPTED_OUT",
  "SUPPRESSED",
] as const;

export type VoiceCallState = (typeof VOICE_CALL_STATES)[number];

export const VOICE_BUSINESS_OUTCOMES = [
  "UNKNOWN",
  "QUALIFIED",
  "UNQUALIFIED",
  "NOT_INTERESTED",
  "CALLBACK_REQUESTED",
  "DEMO_BOOKED",
  "PAYMENT_INTENT",
  "HUMAN_TRANSFERRED",
  "ENROLLED",
  "OPTED_OUT",
  "WRONG_NUMBER",
] as const;

export type VoiceBusinessOutcome =
  (typeof VOICE_BUSINESS_OUTCOMES)[number];

export const VOICE_PROVIDER_CAPABILITIES = [
  "OUTBOUND_CALL",
  "LIVE_TRANSCRIPT",
  "POST_CALL_TRANSCRIPT",
  "POST_CALL_ANALYSIS",
  "AI_AGENT_HANDOFF",
  "HUMAN_PHONE_TRANSFER",
  "HUMAN_SIP_TRANSFER",
  "WARM_TRANSFER",
  "VOICEMAIL_DETECTION",
  "CALL_RECORDING",
  "CUSTOM_TELEPHONY",
] as const;

export type VoiceProviderCapability =
  (typeof VOICE_PROVIDER_CAPABILITIES)[number];

export type VoiceProviderCapabilities = Readonly<
  Partial<Record<VoiceProviderCapability, boolean>>
>;

export type VoiceConsentState = "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";

export type VoiceEligibilityInput = {
  consentState: VoiceConsentState;
  suppressed: boolean;
  workspaceKillSwitchActive: boolean;
  voiceKillSwitchActive: boolean;
  runtimeEnabled: boolean;
  externalWritesAllowed: boolean;
  providerHealthy: boolean;
  withinAllowedCallingWindow: boolean;
  phonePresent: boolean;
};

export type VoiceEligibilityDecision = {
  allowed: boolean;
  reasons: string[];
};

export const VOICE_STAGE_AGENT_MAP: Readonly<
  Record<VoiceLeadStage, readonly VoiceAgentRole[]>
> = {
  NEW: ["COMPLIANCE_TRIAGE", "QUALIFICATION"],
  DISCOVERY: ["QUALIFICATION", "PROGRAM_DISCOVERY"],
  QUALIFIED: ["PROGRAM_DISCOVERY", "APPOINTMENT_BOOKING"],
  COUNSELOR_ASSIGNED: ["HUMAN_TRANSFER"],
  DEMO_BOOKED: ["OBJECTION_AND_FEE", "CONVERSION"],
  PAYMENT_PENDING: ["CONVERSION", "HUMAN_TRANSFER"],
  ENROLLED: [],
  NURTURE: ["NURTURE_REACTIVATION"],
  CLOSED: [],
};

const VOICE_STAGE_TRANSITIONS: Readonly<
  Record<VoiceLeadStage, readonly VoiceLeadStage[]>
> = {
  NEW: ["DISCOVERY", "QUALIFIED", "NURTURE", "CLOSED"],
  DISCOVERY: ["QUALIFIED", "NURTURE", "CLOSED"],
  QUALIFIED: ["COUNSELOR_ASSIGNED", "DEMO_BOOKED", "NURTURE", "CLOSED"],
  COUNSELOR_ASSIGNED: ["DEMO_BOOKED", "PAYMENT_PENDING", "NURTURE", "CLOSED"],
  DEMO_BOOKED: ["PAYMENT_PENDING", "ENROLLED", "NURTURE", "CLOSED"],
  PAYMENT_PENDING: ["ENROLLED", "NURTURE", "CLOSED"],
  ENROLLED: ["CLOSED"],
  NURTURE: ["DISCOVERY", "QUALIFIED", "CLOSED"],
  CLOSED: [],
};

export function isAllowedVoiceLeadTransition(
  from: VoiceLeadStage,
  to: VoiceLeadStage,
): boolean {
  return from === to || VOICE_STAGE_TRANSITIONS[from].includes(to);
}

export function evaluateVoiceEligibility(
  input: VoiceEligibilityInput,
): VoiceEligibilityDecision {
  const reasons: string[] = [];

  if (input.consentState !== "OPTED_IN") reasons.push("VOICE_CONSENT_REQUIRED");
  if (input.suppressed) reasons.push("CUSTOMER_SUPPRESSED");
  if (input.workspaceKillSwitchActive) reasons.push("WORKSPACE_KILL_SWITCH_ACTIVE");
  if (input.voiceKillSwitchActive) reasons.push("VOICE_KILL_SWITCH_ACTIVE");
  if (!input.runtimeEnabled) reasons.push("VOICE_RUNTIME_DISABLED");
  if (!input.externalWritesAllowed) reasons.push("EXTERNAL_WRITES_NOT_APPROVED");
  if (!input.providerHealthy) reasons.push("VOICE_PROVIDER_UNHEALTHY");
  if (!input.withinAllowedCallingWindow) reasons.push("OUTSIDE_CALLING_WINDOW");
  if (!input.phonePresent) reasons.push("PHONE_REQUIRED");

  return { allowed: reasons.length === 0, reasons };
}

export type VoiceCallStartRequest = {
  workspaceId: string;
  callId: string;
  leadId: string;
  contactId: string;
  toPhone: string;
  agentVersionId: string;
  agentRole: VoiceAgentRole;
  leadStage: VoiceLeadStage;
  idempotencyKey: string;
  metadata?: Readonly<Record<string, string>>;
};

export type VoiceCallStartResult = {
  providerCallId: string;
  state: VoiceCallState;
};

export type VoiceHumanTransferRequest = {
  workspaceId: string;
  callId: string;
  providerCallId: string;
  destination: string;
  mode: "PHONE" | "SIP";
  warm: boolean;
  contextSummary: string;
};

export type NormalizedVoiceProviderEvent = {
  eventKey: string;
  workspaceId: string;
  provider: string;
  providerCallId: string;
  callId?: string;
  state: VoiceCallState;
  occurredAt: string;
  transcriptText?: string;
  businessOutcome?: VoiceBusinessOutcome;
  rawPayload?: unknown;
};

export interface VoiceProviderAdapter {
  readonly provider: string;
  readonly capabilities: VoiceProviderCapabilities;

  startOutboundCall(
    request: VoiceCallStartRequest,
  ): Promise<VoiceCallStartResult>;

  transferToVoiceAgent(
    providerCallId: string,
    targetAgentVersionId: string,
    contextSummary: string,
  ): Promise<void>;

  transferToHuman(request: VoiceHumanTransferRequest): Promise<void>;

  cancelCall(providerCallId: string): Promise<void>;

  normalizeWebhook(payload: unknown): NormalizedVoiceProviderEvent[];

  verifyWebhook(input: {
    rawBody: string;
    headers: Readonly<Record<string, string | undefined>>;
    receivedAt: Date;
  }): Promise<boolean>;
}

export function hasVoiceCapability(
  capabilities: VoiceProviderCapabilities,
  capability: VoiceProviderCapability,
): boolean {
  return capabilities[capability] === true;
}

export function agentRolesForStage(
  stage: VoiceLeadStage,
): readonly VoiceAgentRole[] {
  return VOICE_STAGE_AGENT_MAP[stage];
}

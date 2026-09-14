export type LeadEmailTriggerInput = {
  workspaceId: string;
  leadId: string;
  contactId: string;
  contactEmail: string | null;
  automationFlowId: string;
  templateId: string;
  senderIdentityId?: string | null;
};

export type LeadEmailTriggerDecision = {
  eligible: boolean;
  reason: string;
  idempotencyKey: string;
};

function normalizeEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase() || "";
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function evaluateLeadEmailTrigger(input: LeadEmailTriggerInput): LeadEmailTriggerDecision {
  const email = normalizeEmail(input.contactEmail);
  const idempotencyKey = [
    "email",
    "new-lead",
    input.workspaceId,
    input.automationFlowId,
    input.leadId,
    input.templateId,
  ].join(":");

  if (!email) {
    return {
      eligible: false,
      reason: "Lead does not have a valid deliverable email address.",
      idempotencyKey,
    };
  }

  return {
    eligible: true,
    reason: "Lead has a valid email address and can proceed to consent, sender and template checks.",
    idempotencyKey,
  };
}

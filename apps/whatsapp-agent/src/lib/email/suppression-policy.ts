export type EmailSuppressionInput = {
  globalSuppressed: boolean;
  emailSuppressed: boolean;
  bounced: boolean;
  complained: boolean;
  consentStatus?: string | null;
  transactional: boolean;
};

export type EmailSuppressionDecision = {
  allowed: boolean;
  reason: string;
};

export function evaluateEmailSuppression(input: EmailSuppressionInput): EmailSuppressionDecision {
  if (input.globalSuppressed) return { allowed: false, reason: "Contact is globally suppressed." };
  if (input.emailSuppressed) return { allowed: false, reason: "Contact is suppressed from email." };
  if (input.complained) return { allowed: false, reason: "Recipient previously complained about email." };
  if (input.bounced) return { allowed: false, reason: "Recipient has a hard-bounce suppression." };

  if (!input.transactional && input.consentStatus !== "OPTED_IN") {
    return { allowed: false, reason: "Marketing email requires explicit opt-in." };
  }

  return { allowed: true, reason: input.transactional ? "Transactional email is eligible." : "Marketing opt-in is valid." };
}
